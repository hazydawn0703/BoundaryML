import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createExampleProject } from '../../../packages/core/src/sampleProject.js';
import { createWorkflowFromTemplate, applyWorkflowPatch, applyDiff, createWorkflowSnapshot, markAffectedAssetsOutdated, normalizeWorkflowSpec } from '../../../packages/core/src/engine.js';
import { generateWorkflowDraft } from '../../../packages/generators/src/workflowGenerator.js';
import { generatePrompt } from '../../../packages/generators/src/promptGenerator.js';
import { generateChecklist } from '../../../packages/generators/src/checklistGenerator.js';
import { generateWorkflowDiff } from '../../../packages/core/src/diff.js';
import { generateExecutionKit } from '../../../packages/generators/src/executionKitGenerator.js';
import { exportExecutionKit } from '../../../packages/exporter/src/executionKitExporter.js';
import { loadAiSaasFeatureMvpSpec } from '../../../packages/examples/src/aiSaasFeatureMvp.js';
import { validateWorkflow as validateRulesWorkflow } from '../../../packages/rules/src/validationEngine.js';
import { validateProject, validateWorkflow, validateBoundaryMLProjectSpec, validateGenerationJob } from '../../../packages/schema/src/schema.js';
import { MemoryStorage } from '../../../packages/storage/src/memoryStorage.js';
import { FileStorage } from '../../../packages/storage/src/fileStorage.js';
import { getModelStatus, runModel } from './llmAccess.js';

const port = Number(process.env.BOUNDARYML_SERVER_PORT || process.env.PORT || 8787);
const runtimeMode = 'local_server';
const storageAdapter = process.env.BOUNDARYML_STORAGE_ADAPTER || (process.env.STORAGE_MODE === 'file' ? 'file' : 'memory');
const dataDir = process.env.BOUNDARYML_DATA_DIR || process.env.STORAGE_DIR || './data';
const storage = storageAdapter === 'file' ? new FileStorage(dataDir) : new MemoryStorage();
const jobs = new Map();
const modelCalls = [];

function makeContext() {
  return {
    user_id: 'local_user', workspace_id: 'local_default', mode: runtimeMode,
    source: 'server_default', roles: [], request_id: `req_${randomUUID()}`,
  };
}

function respond(res, statusCode, body) {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function ok(res, ctx, data, statusCode = 200) {
  respond(res, statusCode, { ok: true, data, meta: { requestId: ctx.request_id, generatedAt: new Date().toISOString() } });
}

function fail(res, ctx, statusCode, code, message, details = []) {
  respond(res, statusCode, { ok: false, error: { code, message, details }, meta: { requestId: ctx.request_id } });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf-8')); } catch { return null; }
}

function seedIfEmpty(ctx) {
  const existing = storage.listProjects(ctx.workspace_id);
  if (existing.length) return;
  const spec = loadAiSaasFeatureMvpSpec();
  const p = structuredClone(spec.project);
  p.workspace_id = ctx.workspace_id;
  p.created_by = ctx.user_id;
  p.updated_by = ctx.user_id;
  p.assets = spec.assets;
  p.workflow = spec.workflow;
  p.context_pack = spec.context_pack;
  p.boundaryml_version = spec.boundaryml_version;
  p.schema_version = 'boundaryml-schema-v0.1';
  p.workflow_history = [createWorkflowSnapshot(p, p.context_pack, p.workflow, p.assets, spec.validation || [])];
  p.deleted_at = null;
  storage.saveProject(ctx.workspace_id, p);
}

function listScopedProjects(ctx) { return storage.listProjects(ctx.workspace_id).filter((p) => !p.deleted_at); }
function getProject(ctx, projectId) { const p = storage.getProject(ctx.workspace_id, projectId); return (p && !p.deleted_at) ? p : null; }

function writeOwnership(ctx, obj, isCreate = false) {
  const now = new Date().toISOString();
  return { ...obj, workspace_id: ctx.workspace_id, created_by: isCreate ? ctx.user_id : (obj.created_by || ctx.user_id), updated_by: ctx.user_id, created_at: isCreate ? now : (obj.created_at || now), updated_at: now, boundaryml_version: obj.boundaryml_version || 'v0.1', schema_version: obj.schema_version || 'boundaryml-schema-v0.1' };
}

function createJob(ctx, projectId, type) {
  const now = new Date().toISOString();
  const job = { id: `job_${randomUUID()}`, type, status: 'queued', project_id: projectId, workspace_id: ctx.workspace_id, created_by: ctx.user_id, created_at: now, updated_at: now, output_ref: null };
  const v = validateGenerationJob(job);
  if (!v.ok) throw new Error(v.errors.join('; '));
  jobs.set(job.id, job);
  return job;
}

function runJob(job, fn) {
  job.status = 'running';
  job.updated_at = new Date().toISOString();
  try { job.output_ref = fn(); job.status = 'succeeded'; } catch (e) { job.status = 'failed'; job.error = { code: 'JOB_FAILED', message: e.message }; }
  job.updated_at = new Date().toISOString();
}

const server = createServer(async (req, res) => {
  const ctx = makeContext();
  seedIfEmpty(ctx);
  const method = req.method || 'GET';
  const url = new URL(req.url || '/', `http://localhost:${port}`);
  const path = url.pathname;

  if (method === 'GET' && path === '/api/health') return ok(res, ctx, { status: 'ok', mode: runtimeMode, version: '0.1.0', storage: storageAdapter });

  if (method === 'GET' && path === '/api/projects') return ok(res, ctx, listScopedProjects(ctx).map((p) => ({ id: p.id, name: p.name, workspace_id: p.workspace_id, updated_at: p.updated_at })));
  if (method === 'POST' && path === '/api/projects') {
    const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
    const base = createExampleProject();
    const project = writeOwnership(ctx, { ...base, id: body.id || `project_${Date.now()}`, name: body.name || base.name, goal: body.goal || base.goal, context_pack: base.contextPack, deleted_at: null }, true);
    const v = validateProject(project); if (!v.ok) return fail(res, ctx, 400, 'SCHEMA_INVALID', 'Project invalid', v.errors);
    project.workflow = normalizeWorkflowSpec({ workflow: project.workflow }).workflow;
    project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    project.workflow_history = [createWorkflowSnapshot(project, project.context_pack, project.workflow, project.assets, project.validation)];
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, project, 201);
  }

  const pRoute = path.match(/^\/api\/projects\/([^/]+)$/);
  if (pRoute) {
    const project = getProject(ctx, pRoute[1]);
    if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    if (method === 'GET') return ok(res, ctx, project);
    if (method === 'PATCH') {
      const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
      const next = writeOwnership(ctx, { ...project, ...body }, false);
      storage.saveProject(ctx.workspace_id, next); return ok(res, ctx, next);
    }
    if (method === 'DELETE') { project.deleted_at = new Date().toISOString(); project.updated_by = ctx.user_id; project.updated_at = new Date().toISOString(); storage.saveProject(ctx.workspace_id, project); return ok(res, ctx, { deleted: true, project_id: project.id, mode: 'soft_delete' }); }
  }

  const cpRoute = path.match(/^\/api\/projects\/([^/]+)\/context-pack$/);
  if (cpRoute) {
    const project = getProject(ctx, cpRoute[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    if (method === 'GET') return ok(res, ctx, project.context_pack || project.contextPack || {});
    if (method === 'PUT') {
      const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
      project.context_pack = { ...(project.context_pack || {}), ...body, updated_at: new Date().toISOString(), version: ((project.context_pack?.version) || 0) + 1 };
      project.updated_by = ctx.user_id; project.updated_at = new Date().toISOString(); storage.saveProject(ctx.workspace_id, project); return ok(res, ctx, project.context_pack);
    }
  }

  const cpSumm = path.match(/^\/api\/projects\/([^/]+)\/context-pack\/summarize$/);
  if (method === 'POST' && cpSumm) {
    const project = getProject(ctx, cpSumm[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const job = createJob(ctx, project.id, 'context_pack_summarize');
    runJob(job, () => { project.context_pack.summary = { recognized_roles: project.context_pack.team_roles || [], risk_warnings: ['mock_summary_warning'] }; storage.saveProject(ctx.workspace_id, project); return { type: 'context_pack', id: project.id }; });
    return ok(res, ctx, { job_id: job.id, status: job.status, output_ref: job.output_ref });
  }
  const cpImpact = path.match(/^\/api\/projects\/([^/]+)\/context-pack\/refresh-impact$/);
  if (method === 'POST' && cpImpact) return ok(res, ctx, { affected_nodes: [], affected_assets: [], note: 'skeleton' });

  const wfRoute = path.match(/^\/api\/projects\/([^/]+)\/workflow$/);
  if (wfRoute) {
    const project = getProject(ctx, wfRoute[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    if (method === 'GET') return ok(res, ctx, project.workflow);
    if (method === 'PATCH') {
      const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
      const merged = applyWorkflowPatch(project.workflow, body);
      const schema = validateWorkflow(merged); if (!schema.ok) return fail(res, ctx, 400, 'WORKFLOW_SCHEMA_INVALID', 'Workflow schema invalid', schema.errors);
      const validation = validateRulesWorkflow(merged, project.assets, { forGeneration: false, modelConfig: {} });
      project.workflow = merged; project.validation = validation; project.workflow_history.push(createWorkflowSnapshot(project, project.context_pack, merged, project.assets, validation));
      storage.saveProject(ctx.workspace_id, project);
      return ok(res, ctx, { workflow: merged, validation_results: validation });
    }
  }

  const wfGen = path.match(/^\/api\/projects\/([^/]+)\/workflow\/generate$/);
  if (method === 'POST' && wfGen) {
    const project = getProject(ctx, wfGen[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const job = createJob(ctx, project.id, 'workflow_generate');
    runJob(job, () => {
      const drafted = generateWorkflowDraft(project, project.context_pack || {});
      const workflow = createWorkflowFromTemplate(project, project.context_pack, drafted.workflow);
      const schema = validateWorkflow(workflow); if (!schema.ok) throw new Error(schema.errors.join('; '));
      const validation = validateRulesWorkflow(workflow, project.assets, { forGeneration: true, modelConfig: null });
      project.workflow = workflow;
      project.validation = validation;
      const specCheck = validateBoundaryMLProjectSpec({ boundaryml_version: 'v0.1', project, context_pack: project.context_pack, workflow, assets: project.assets, validation, execution_kits: project.execution_kits || [] });
      if (!specCheck.ok) throw new Error(specCheck.errors.join('; '));
      project.workflow_history.push(createWorkflowSnapshot(project, project.context_pack, workflow, project.assets, validation));
      storage.saveProject(ctx.workspace_id, project);
      return { type: 'workflow', id: workflow.id };
    });
    return ok(res, ctx, { job_id: job.id, status: job.status, workflow: project.workflow, validation_results: project.validation });
  }

  const wfValidate = path.match(/^\/api\/projects\/([^/]+)\/workflow\/validate$/);
  if (method === 'POST' && wfValidate) {
    const project = getProject(ctx, wfValidate[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    project.validation = validation; storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { validation_results: validation });
  }

  const wfFinal = path.match(/^\/api\/projects\/([^/]+)\/workflow\/mark-final$/);
  if (method === 'POST' && wfFinal) {
    const project = getProject(ctx, wfFinal[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    if (validation.some((v) => v.level === 'error' && v.blockingFinal)) return fail(res, ctx, 400, 'WORKFLOW_BLOCKING_ERRORS', 'Workflow has blocking errors', validation.filter((v) => v.level === 'error'));
    project.workflow.status = 'final'; project.validation = validation; storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { workflow_version: project.workflow.version, validation_summary: { errors: 0, warnings: validation.filter((v) => v.level === 'warning').length } });
  }

  const nodeGet = path.match(/^\/api\/projects\/([^/]+)\/nodes\/([^/]+)$/);
  if (nodeGet) {
    const project = getProject(ctx, nodeGet[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const node = project.workflow.nodes.find((n) => n.id === nodeGet[2]); if (!node) return fail(res, ctx, 404, 'NODE_NOT_FOUND', 'Node not found');
    if (method === 'GET') return ok(res, ctx, node);
    if (method === 'PATCH') {
      const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
      const idx = project.workflow.nodes.findIndex((n) => n.id === node.id);
      project.workflow.nodes[idx] = { ...node, ...body };
      project.workflow = applyWorkflowPatch(project.workflow, { nodes: project.workflow.nodes });
      project.assets = markAffectedAssetsOutdated([{ target_type: 'node', target_id: node.id }], project.assets);
      project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
      project.workflow_history.push(createWorkflowSnapshot(project, project.context_pack, project.workflow, project.assets, project.validation));
      storage.saveProject(ctx.workspace_id, project);
      return ok(res, ctx, { node: project.workflow.nodes[idx], workflow_summary: { version: project.workflow.version }, validation_results: project.validation });
    }
  }

  const nodePrompt = path.match(/^\/api\/projects\/([^/]+)\/nodes\/([^/]+)\/generate-prompt$/);
  if (method === 'POST' && nodePrompt) {
    const project = getProject(ctx, nodePrompt[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const node = project.workflow.nodes.find((n) => n.id === nodePrompt[2]); if (!node) return fail(res, ctx, 404, 'NODE_NOT_FOUND', 'Node not found');
    if (node.executionMode === 'human_only') return fail(res, ctx, 400, 'HUMAN_ONLY_NO_PROMPT', 'Human only node cannot generate AI prompt');
    const job = createJob(ctx, project.id, 'generate_prompt');
    runJob(job, () => {
      const prompt = generatePrompt(node);
      project.assets.prompts = project.assets.prompts.filter((p) => p.nodeId !== node.id).concat(prompt);
      project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: true, modelConfig: null });
      storage.saveProject(ctx.workspace_id, project);
      return { type: 'prompt', id: prompt.id };
    });
    return ok(res, ctx, { job_id: job.id, status: job.status });
  }

  const nodeChecklist = path.match(/^\/api\/projects\/([^/]+)\/nodes\/([^/]+)\/generate-checklist$/);
  if (method === 'POST' && nodeChecklist) {
    const project = getProject(ctx, nodeChecklist[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const node = project.workflow.nodes.find((n) => n.id === nodeChecklist[2]); if (!node) return fail(res, ctx, 404, 'NODE_NOT_FOUND', 'Node not found');
    const job = createJob(ctx, project.id, 'generate_checklist');
    runJob(job, () => {
      const checklist = generateChecklist(node.reviewGate, node);
      project.assets.checklists = project.assets.checklists.filter((c) => c.nodeId !== node.id).concat(checklist);
      storage.saveProject(ctx.workspace_id, project);
      return { type: 'checklist', id: checklist.id };
    });
    return ok(res, ctx, { job_id: job.id, status: job.status });
  }

  const diffGenerate = path.match(/^\/api\/projects\/([^/]+)\/diffs\/generate$/);
  if (method === 'POST' && diffGenerate) {
    const project = getProject(ctx, diffGenerate[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
    const job = createJob(ctx, project.id, 'generate_diff');
    runJob(job, () => { project.last_diff = generateWorkflowDiff(body.request || 'default', project.workflow, project.assets); storage.saveProject(ctx.workspace_id, project); return { type: 'diff', id: project.last_diff.id }; });
    return ok(res, ctx, { job_id: job.id, diff: project.last_diff });
  }

  const diffGet = path.match(/^\/api\/projects\/([^/]+)\/diffs\/([^/]+)$/);
  if (method === 'GET' && diffGet) {
    const project = getProject(ctx, diffGet[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    if (!project.last_diff || project.last_diff.id !== diffGet[2]) return fail(res, ctx, 404, 'DIFF_NOT_FOUND', 'Diff not found');
    return ok(res, ctx, project.last_diff);
  }

  const diffApply = path.match(/^\/api\/projects\/([^/]+)\/diffs\/([^/]+)\/apply$/);
  if (method === 'POST' && diffApply) {
    const project = getProject(ctx, diffApply[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const diff = project.last_diff; if (!diff || diff.id !== diffApply[2]) return fail(res, ctx, 404, 'DIFF_NOT_FOUND', 'Diff not found');
    project.workflow = applyDiff(project.workflow, diff, diff.changes.filter((c) => c.selected).map((c) => c.id));
    project.assets = markAffectedAssetsOutdated(diff.changes, project.assets);
    project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    project.workflow_history.push(createWorkflowSnapshot(project, project.context_pack, project.workflow, project.assets, project.validation));
    diff.status = 'applied';
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { workflow: project.workflow, validation_results: project.validation });
  }

  const diffReject = path.match(/^\/api\/projects\/([^/]+)\/diffs\/([^/]+)\/reject$/);
  if (method === 'POST' && diffReject) {
    const project = getProject(ctx, diffReject[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    if (!project.last_diff || project.last_diff.id !== diffReject[2]) return fail(res, ctx, 404, 'DIFF_NOT_FOUND', 'Diff not found');
    project.last_diff.status = 'rejected'; storage.saveProject(ctx.workspace_id, project); return ok(res, ctx, { diff_id: project.last_diff.id, status: 'rejected' });
  }

  const assetsRoute = path.match(/^\/api\/projects\/([^/]+)\/assets$/);
  if (method === 'GET' && assetsRoute) {
    const project = getProject(ctx, assetsRoute[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    return ok(res, ctx, project.assets);
  }

  const assetRoute = path.match(/^\/api\/projects\/([^/]+)\/assets\/([^/]+)$/);
  if (assetRoute) {
    const project = getProject(ctx, assetRoute[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const all = [...project.assets.prompts, ...project.assets.checklists, ...(project.assets.artifact_templates || project.assets.artifactTemplates || [])];
    const asset = all.find((a) => a.id === assetRoute[2]); if (!asset) return fail(res, ctx, 404, 'ASSET_NOT_FOUND', 'Asset not found');
    if (method === 'GET') return ok(res, ctx, asset);
    if (method === 'PATCH') {
      const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
      for (const key of ['prompts', 'checklists', 'artifactTemplates']) {
        const arr = project.assets[key] || [];
        const idx = arr.findIndex((a) => a.id === asset.id);
        if (idx >= 0) { arr[idx] = { ...arr[idx], ...body, manually_edited: true, updated_at: new Date().toISOString() }; project.assets[key] = arr; break; }
      }
      storage.saveProject(ctx.workspace_id, project); return ok(res, ctx, { updated: true });
    }
  }

  const assetRegen = path.match(/^\/api\/projects\/([^/]+)\/assets\/([^/]+)\/regenerate$/);
  if (method === 'POST' && assetRegen) {
    const project = getProject(ctx, assetRegen[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const prompt = project.assets.prompts.find((p) => p.id === assetRegen[2]);
    if (prompt?.manually_edited) return fail(res, ctx, 400, 'ASSET_MANUAL_EDIT_WARNING', 'Prompt was manually edited, confirm before regenerate');
    return ok(res, ctx, { regenerated: true, warning: null });
  }

  const kitPreview = path.match(/^\/api\/projects\/([^/]+)\/execution-kits\/preview$/);
  if (method === 'POST' && kitPreview) {
    const project = getProject(ctx, kitPreview[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const job = createJob(ctx, project.id, 'execution_kit_preview');
    runJob(job, () => ({ type: 'execution_kit_preview', id: `preview_${project.id}` }));
    const preview = exportExecutionKit(generateExecutionKit(project.workflow, project.assets, project.validation || []));
    return ok(res, ctx, { job_id: job.id, preview });
  }

  const kitGenerate = path.match(/^\/api\/projects\/([^/]+)\/execution-kits\/generate$/);
  if (method === 'POST' && kitGenerate) {
    const project = getProject(ctx, kitGenerate[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const job = createJob(ctx, project.id, 'execution_kit_generate');
    runJob(job, () => {
      const kit = generateExecutionKit(project.workflow, project.assets, project.validation || []);
      const rec = { id: `kit_${Date.now()}`, project_id: project.id, workspace_id: project.workspace_id, created_by: ctx.user_id, updated_by: ctx.user_id, workflow_snapshot_version: project.workflow.version, status: 'draft_only', files: kit.files, generated_at: new Date().toISOString() };
      project.execution_kits = (project.execution_kits || []).concat(rec);
      storage.saveProject(ctx.workspace_id, project);
      return { type: 'execution_kit', id: rec.id };
    });
    return ok(res, ctx, { job_id: job.id, status: job.status, output_ref: job.output_ref });
  }

  const kitGet = path.match(/^\/api\/projects\/([^/]+)\/execution-kits\/([^/]+)$/);
  if (method === 'GET' && kitGet) {
    const project = getProject(ctx, kitGet[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const kit = (project.execution_kits || []).find((k) => k.id === kitGet[2]); if (!kit) return fail(res, ctx, 404, 'KIT_NOT_FOUND', 'Kit not found');
    return ok(res, ctx, kit);
  }

  const kitDl = path.match(/^\/api\/projects\/([^/]+)\/execution-kits\/([^/]+)\/download$/);
  if (method === 'GET' && kitDl) {
    const project = getProject(ctx, kitDl[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const kit = (project.execution_kits || []).find((k) => k.id === kitDl[2]); if (!kit) return fail(res, ctx, 404, 'KIT_NOT_FOUND', 'Kit not found');
    return ok(res, ctx, { filename: `${kit.id}.json`, content: JSON.stringify(kit, null, 2) });
  }

  if (method === 'GET' && path === '/api/model/status') return ok(res, ctx, getModelStatus());
  if (method === 'POST' && path === '/api/model/test') {
    const result = await runModel('test', { ping: true });
    modelCalls.unshift({ id: `call_${Date.now()}`, workspace_id: ctx.workspace_id, created_by: ctx.user_id, created_at: new Date().toISOString(), summary: result.output.summary });
    return ok(res, ctx, { mode: getModelStatus().using_mock ? 'mock' : 'real', result: result.output });
  }
  if (method === 'GET' && path === '/api/model/calls') return ok(res, ctx, modelCalls.slice(0, 50));

  const jobsList = path.match(/^\/api\/projects\/([^/]+)\/jobs$/);
  if (method === 'GET' && jobsList) {
    const project = getProject(ctx, jobsList[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    return ok(res, ctx, Array.from(jobs.values()).filter((j) => j.project_id === project.id && j.workspace_id === ctx.workspace_id));
  }
  const jobsGet = path.match(/^\/api\/projects\/([^/]+)\/jobs\/([^/]+)$/);
  if (method === 'GET' && jobsGet) {
    const project = getProject(ctx, jobsGet[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const job = jobs.get(jobsGet[2]);
    if (!job || job.project_id !== project.id || job.workspace_id !== ctx.workspace_id) return fail(res, ctx, 404, 'JOB_NOT_FOUND', 'Job not found');
    return ok(res, ctx, job);
  }

  return fail(res, ctx, 404, 'ROUTE_NOT_FOUND', `${method} ${path} not found`);
});

server.listen(port, () => {
  console.log(`BoundaryML Server listening on http://localhost:${port}`);
});
