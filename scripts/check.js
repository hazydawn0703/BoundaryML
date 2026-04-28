import { createExampleProject } from '../packages/core/src/sampleProject.js';
import { validateWorkflow } from '../packages/rules/src/validationEngine.js';
import { generateExecutionKit } from '../packages/generators/src/executionKitGenerator.js';
import { generateWorkflowDraft } from '../packages/generators/src/workflowGenerator.js';
import { generateWorkflowDiff, applyWorkflowDiff } from '../packages/core/src/diff.js';
import { validateProject as validateProjectSchema } from '../packages/schema/src/schema.js';
import { readFileSync } from 'node:fs';
import { FileStorage } from '../packages/storage/src/fileStorage.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exit(1);
  }
}

const project = createExampleProject();
const exampleFile = JSON.parse(readFileSync(new URL('../examples/ai-saas-feature-mvp.json', import.meta.url), 'utf-8'));
const schemaValidation = validateProjectSchema(exampleFile);
assert(schemaValidation.ok, `example schema validation failed: ${schemaValidation.errors.join(', ')}`);

assert(project.workflow.nodes.length >= 12, 'example workflow should contain at least 12 nodes');
assert(project.workflow.phases.length === 6, 'example workflow should contain 6 phases');
assert(new Set(project.workflow.nodes.map((n) => n.executionMode)).size >= 4, 'workflow should contain at least 4 execution modes');
assert(project.assets.prompts.every((prompt) => project.workflow.nodes.find((n) => n.id === prompt.nodeId)?.executionMode !== 'human_only'), 'human-only nodes should not have prompts');
assert(project.workflow.nodes.filter((n) => n.riskLevel === 'high').every((n) => n.reviewGate?.required), 'high risk nodes must have required review gates');

const contextual = generateWorkflowDraft({
  name: 'test',
  type: 'AI Feature',
  setupMode: 'org_aware',
  sensitiveAreas: ['Customer Data', 'Production Release'],
}, {
  teamRoles: ['Security Owner', 'Release Manager'],
  approvalProcess: ['Security Review', 'Release Approval'],
});

assert(contextual.workflow.nodes.some((n) => n.reviewGate?.name.toLowerCase().includes('security')), 'customer data context should add security review gate');

const diff = generateWorkflowDiff('add testing nodes before launch', project.workflow, project.assets);
const applied = applyWorkflowDiff(project, diff, false);
assert(applied.workflow.version === project.workflow.version + 1, 'apply diff should increase workflow version');

const changedNodeIds = diff.changes.filter((c) => c.targetType === 'node').map((c) => c.targetId);
const promptsNeedingUpdate = project.assets.prompts.filter((p) => changedNodeIds.includes(p.nodeId));
if (promptsNeedingUpdate.length) {
  assert(applied.assets.prompts.some((p) => changedNodeIds.includes(p.nodeId) && p.status === 'outdated'), 'apply diff should mark related prompts outdated');
}


const forcedDiff = {
  id: 'diff-force',
  request: 'force change',
  changes: [{
    id: 'force-node-change',
    type: 'updated',
    targetType: 'node',
    targetId: 'node-3',
    field: 'executionMode',
    before: 'ai_draft_human_review',
    after: 'ai_execute_human_approval',
    reason: 'force',
    impact: 'test',
    selected: true,
  }],
  warnings: [],
  createdAt: new Date().toISOString(),
};
const forcedApplied = applyWorkflowDiff(project, forcedDiff, true);
assert(forcedApplied.assets.prompts.some((p) => p.nodeId === 'node-3' && p.status === 'outdated'), 'apply diff should mark related prompts outdated');

const goodValidation = validateWorkflow(project.workflow, project.assets);
const goodKit = generateExecutionKit(project.workflow, project.assets, goodValidation);
assert(goodKit.snapshotVersion === project.workflow.version, 'execution kit should store workflow snapshot version');

const broken = structuredClone(project);
broken.workflow.nodes.find((n) => n.riskLevel === 'high').reviewGate.required = false;
const badValidation = validateWorkflow(broken.workflow, broken.assets);
const badKit = generateExecutionKit(broken.workflow, broken.assets, badValidation);
assert(!badKit.canExportFinal, 'blocking errors should disable final kit export');

const tempStorageDir = '.tmp-storage-check';
const fsStorage = new FileStorage(tempStorageDir);
const scopedProject = { ...project, workspace_id: 'check_workspace' };
fsStorage.saveProject('check_workspace', scopedProject);
const reloaded = new FileStorage(tempStorageDir).getProject('check_workspace', scopedProject.id);
assert(Boolean(reloaded), 'file storage should persist project across instances');

console.log('✅ checks passed');
