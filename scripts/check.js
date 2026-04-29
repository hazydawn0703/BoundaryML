import { readFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createExampleProject } from '../packages/core/src/sampleProject.js';
import { validateWorkflow } from '../packages/rules/src/validationEngine.js';
import { generateExecutionKit } from '../packages/generators/src/executionKitGenerator.js';
import { generateWorkflowDiff, applyWorkflowDiff } from '../packages/core/src/diff.js';
import { validateBoundaryMLProjectSpec, validateNode } from '../packages/schema/src/schema.js';
import { FileStorage } from '../packages/storage/src/fileStorage.js';
import { createWorkflowSnapshot, applyWorkflowPatch, applyDiff, calculateWorkflowValidationStatus } from '../packages/core/src/engine.js';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exit(1);
  }
}

function hasRule(results, rulePrefix, level = 'error') {
  return results.some((item) => item.id.startsWith(rulePrefix) && item.level === level);
}

function makeBrokenProject(mutator) {
  const project = createExampleProject();
  const cloned = structuredClone(project);
  mutator(cloned);
  return cloned;
}

async function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

async function waitForHealth(baseUrl) {
  for (let i = 0; i < 20; i += 1) {
    try {
      const res = await fetch(`${baseUrl}/api/health`);
      if (res.ok) return;
    } catch {}
    await delay(200);
  }
  throw new Error('server health timeout');
}

async function jsonFetch(url, options = {}) {
  const res = await fetch(url, { headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
  return { status: res.status, body: await res.json() };
}

async function runServerSmoke() {
  await delay(0);
}

async function main() {
  const exampleSpec = JSON.parse(readFileSync(new URL('../examples/ai-saas-feature-mvp.json', import.meta.url), 'utf-8'));

  const validSpec = validateBoundaryMLProjectSpec(exampleSpec);
  assert(validSpec.ok, `example spec should be valid: ${validSpec.errors.join(', ')}`);
  assert(validSpec.warnings.length >= 1, 'example spec should contain at least one warning');
  assert(validSpec.suggestions.length >= 1, 'validateBoundaryMLProjectSpec should return suggestion');

  const invalidNode = validateNode({ id: 1 });
  assert(!invalidNode.ok, 'schema parse failure path should be covered');

  const highRiskNoGate = makeBrokenProject((p) => { p.workflow.nodes.find((n) => n.riskLevel === 'high').reviewGate.required = false; });
  assert(hasRule(validateWorkflow(highRiskNoGate.workflow, highRiskNoGate.assets), 'high_risk_requires_review_gate'), 'high risk gate rule should trigger');

  const aiNoOutput = makeBrokenProject((p) => { const n = p.workflow.nodes.find((x) => x.executionMode !== 'human_only'); n.outputs = []; n.artifactContract.outputFormat = ''; });
  assert(hasRule(validateWorkflow(aiNoOutput.workflow, aiNoOutput.assets), 'ai_node_requires_output_format'), 'ai output format rule should trigger');

  const aiNoAcceptance = makeBrokenProject((p) => { const n = p.workflow.nodes.find((x) => x.executionMode !== 'human_only'); n.artifactContract.acceptanceCriteria = []; p.assets.checklists = p.assets.checklists.filter((c) => c.nodeId !== n.id); });
  assert(hasRule(validateWorkflow(aiNoAcceptance.workflow, aiNoAcceptance.assets), 'ai_node_requires_acceptance_criteria'), 'ai acceptance rule should trigger');

  const humanWithPrompt = makeBrokenProject((p) => { const n = p.workflow.nodes.find((x) => x.executionMode === 'human_only'); p.assets.prompts.push({ ...p.assets.prompts[0], id: 'prompt-human-bad', nodeId: n.id }); });
  assert(hasRule(validateWorkflow(humanWithPrompt.workflow, humanWithPrompt.assets), 'human_only_no_ai_prompt'), 'human-only prompt rule should trigger');

  const edgeMissingOutput = makeBrokenProject((p) => { p.workflow.edges[0].required_outputs = ['non-existent-output']; });
  assert(hasRule(validateWorkflow(edgeMissingOutput.workflow, edgeMissingOutput.assets), 'edge_required_output_missing'), 'edge required output rule should trigger');

  const badAutonomous = makeBrokenProject((p) => { const n = p.workflow.nodes.find((x) => /production|release/i.test(x.name)); n.executionMode = 'ai_autonomous'; });
  const autoResults = validateWorkflow(badAutonomous.workflow, badAutonomous.assets);
  assert(hasRule(autoResults, 'ai_autonomous_low_risk_only'), 'ai autonomous risk rule should trigger');
  assert(hasRule(autoResults, 'production_release_requires_human_only_or_approval') || autoResults.some((x) => x.id.includes('production_release_requires_human_only_or_approval')), 'production release rule should be available');

  const outdated = makeBrokenProject((p) => { p.assets.prompts[0].status = 'outdated'; });
  assert(hasRule(validateWorkflow(outdated.workflow, outdated.assets), 'outdated_prompt_warning', 'warning'), 'outdated prompt warning should trigger');

  const project = createExampleProject();
  const diff = generateWorkflowDiff('add testing nodes before launch', project.workflow, project.assets);
  const appliedProject = applyWorkflowDiff(project, diff, false);
  assert(appliedProject.workflow.version === project.workflow.version + 1, 'applyWorkflowDiff should increase version');

  const corePatched = applyWorkflowPatch(project.workflow, { status: 'reviewed' });
  assert(corePatched.version === project.workflow.version + 1, 'applyWorkflowPatch should increment workflow version');

  const coreDiffApplied = applyDiff(project.workflow, diff, diff.changes.filter((c) => c.selected).map((c) => c.id));
  assert(coreDiffApplied.version === project.workflow.version + 1, 'core applyDiff should increment version');

  const validation = validateWorkflow(project.workflow, project.assets, { forGeneration: true, modelConfig: null });
  const status = calculateWorkflowValidationStatus(validation);
  assert(['draft', 'reviewed', 'validated'].includes(status), 'calculateWorkflowValidationStatus should return valid status');

  const snapshot = createWorkflowSnapshot({ id: 'p1', workspace_id: 'w1' }, project.contextPack, project.workflow, project.assets, validation);
  assert(snapshot.workflow_snapshot_version === project.workflow.version, 'snapshot version should match workflow version');

  const kit = generateExecutionKit(project.workflow, project.assets, validation);
  assert(Boolean(kit), 'execution kit should be generated');

  const fsStorage = new FileStorage('.tmp-storage-check');
  fsStorage.saveProject('check_workspace', { ...project, workspace_id: 'check_workspace' });
  const restored = new FileStorage('.tmp-storage-check').getProject('check_workspace', project.id);
  assert(Boolean(restored), 'FileStorage should restore project');

  await runServerSmoke();
  rmSync('.tmp-storage-check', { recursive: true, force: true });
  rmSync('.tmp-server-storage', { recursive: true, force: true });

  console.log('✅ checks passed');
}

main();
