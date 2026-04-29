import { createExampleProject } from '../packages/core/src/sampleProject.js';
import { validateWorkflow } from '../packages/rules/src/validationEngine.js';
import { generateExecutionKit } from '../packages/generators/src/executionKitGenerator.js';
import { generateWorkflowDraft } from '../packages/generators/src/workflowGenerator.js';
import { generateWorkflowDiff, applyWorkflowDiff } from '../packages/core/src/diff.js';
import { validateBoundaryMLProjectSpec } from '../packages/schema/src/schema.js';
import { readFileSync, rmSync } from 'node:fs';
import { FileStorage } from '../packages/storage/src/fileStorage.js';
import { spawn } from 'node:child_process';

function assert(condition, message) {
  if (!condition) {
    console.error(`❌ ${message}`);
    process.exit(1);
  }
}

async function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(baseUrl) {
  for (let i = 0; i < 20; i += 1) {
    try {
      const res = await fetch(`${baseUrl}/health`);
      if (res.ok) return;
    } catch {}
    await delay(200);
  }
  throw new Error('server health check timeout');
}

async function jsonFetch(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const payload = await response.json();
  return { response, payload };
}

async function runServerSmokeTest() {
  rmSync('.tmp-server-storage', { recursive: true, force: true });
  const env = { ...process.env, STORAGE_MODE: 'file', STORAGE_DIR: '.tmp-server-storage', PORT: '8791' };
  const baseUrl = 'http://localhost:8791';

  const startServer = () => spawn('node', ['apps/server/src/server.js'], { env, stdio: 'ignore' });

  let server = startServer();
  await waitForHealth(baseUrl);

  const createRes = await jsonFetch(`${baseUrl}/api/projects`, {
    method: 'POST',
    body: JSON.stringify({ name: 'Persistence Smoke Project', goal: 'persist me' }),
  });
  assert(createRes.payload.ok, 'POST /api/projects should succeed');
  const created = createRes.payload.data;
  assert(Boolean(created.id), 'created project should contain id');
  assert(Boolean(created.workspace_id), 'created project should contain workspace_id');
  assert(Boolean(created.created_by), 'created project should contain created_by');
  const initialHistoryLength = (created.workflow_history || []).length;

  const workflowGenerateRes = await jsonFetch(`${baseUrl}/api/projects/${created.id}/workflow/generate`, { method: 'POST' });
  assert(workflowGenerateRes.payload.ok, 'workflow generate should succeed');
  const workflowJobId = workflowGenerateRes.payload.data.job_id;
  assert(Boolean(workflowJobId), 'workflow generate should return job_id');

  const workflowJobRes = await jsonFetch(`${baseUrl}/api/projects/${created.id}/jobs/${workflowJobId}`);
  assert(workflowJobRes.payload.ok, 'GET job for workflow generate should succeed');
  assert(Boolean(workflowJobRes.payload.data.workspace_id), 'job should include workspace_id');
  assert(Boolean(workflowJobRes.payload.data.created_by), 'job should include created_by');
  const afterWorkflowGenerate = await jsonFetch(`${baseUrl}/api/projects/${created.id}`);
  const afterWorkflowGenerateHistoryLength = (afterWorkflowGenerate.payload.data.workflow_history || []).length;
  assert(afterWorkflowGenerateHistoryLength > initialHistoryLength, 'workflow generate should append workflow snapshot');

  const diffGenerateRes = await jsonFetch(`${baseUrl}/api/projects/${created.id}/diffs/generate`, {
    method: 'POST',
    body: JSON.stringify({ request: 'add testing nodes before launch' }),
  });
  assert(diffGenerateRes.payload.ok, 'diff generate should succeed');

  const projectAfterDiff = await jsonFetch(`${baseUrl}/api/projects/${created.id}`);
  const diffId = projectAfterDiff.payload.data.last_diff?.id;
  assert(Boolean(diffId), 'diff generate should persist last_diff id');

  const diffApplyRes = await jsonFetch(`${baseUrl}/api/projects/${created.id}/diffs/${diffId}/apply`, { method: 'POST' });
  assert(diffApplyRes.payload.ok, 'diff apply should succeed');
  const afterDiffApply = await jsonFetch(`${baseUrl}/api/projects/${created.id}`);
  const afterDiffApplyHistoryLength = (afterDiffApply.payload.data.workflow_history || []).length;
  assert(afterDiffApplyHistoryLength > afterWorkflowGenerateHistoryLength, 'diff apply should append workflow snapshot');

  const kitGenerateRes = await jsonFetch(`${baseUrl}/api/projects/${created.id}/execution-kits/generate`, { method: 'POST' });
  assert(kitGenerateRes.payload.ok, 'execution kit generate should succeed');

  server.kill('SIGTERM');
  await delay(300);

  server = startServer();
  await waitForHealth(baseUrl);

  const afterRestart = await jsonFetch(`${baseUrl}/api/projects/${created.id}`);
  assert(afterRestart.payload.ok, 'project should be readable after restart');
  assert(afterRestart.payload.data.workspace_id === 'local_default', 'persisted project workspace_id should remain');
  assert(Boolean(afterRestart.payload.data.created_by), 'persisted project should include created_by');

  server.kill('SIGTERM');
  await delay(200);
}

async function main() {
  const project = createExampleProject();
  const exampleFile = JSON.parse(readFileSync(new URL('../examples/ai-saas-feature-mvp.json', import.meta.url), 'utf-8'));
  const specValidation = validateBoundaryMLProjectSpec(exampleFile);
  assert(specValidation.ok, `example BoundaryML spec validation failed: ${specValidation.errors.join(', ')}`);

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
  rmSync(tempStorageDir, { recursive: true, force: true });
  const fsStorage = new FileStorage(tempStorageDir);
  const scopedProject = { ...project, workspace_id: 'check_workspace' };
  fsStorage.saveProject('check_workspace', scopedProject);
  const reloaded = new FileStorage(tempStorageDir).getProject('check_workspace', scopedProject.id);
  assert(Boolean(reloaded), 'file storage should persist project across instances');

  await runServerSmokeTest();

  console.log('✅ checks passed');
}

main();
