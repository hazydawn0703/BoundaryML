import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { createExampleProject } from '../../../packages/core/src/sampleProject.js';
import { createWorkflowFromTemplate, applyWorkflowPatch, applyDiff, createWorkflowSnapshot, markAffectedAssetsOutdated, normalizeWorkflowSpec } from '../../../packages/core/src/engine.js';
import { getTemplateById, listPublicTemplates, selectTemplateForProject } from '../../../packages/core/src/templates.js';
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
import { getModelConfig, getModelStatus, runModel, updateModelConfig } from './llmAccess.js';
import { detectSchemaVersion, migrateObjectIfNeeded } from '../../../packages/schema/src/migrations.js';

const port = Number(process.env.BOUNDARYML_SERVER_PORT || process.env.PORT || 8787);
const runtimeMode = 'local_server';
const storageAdapter = process.env.BOUNDARYML_STORAGE_ADAPTER || process.env.STORAGE_MODE || 'file';
const dataDir = process.env.BOUNDARYML_DATA_DIR || process.env.STORAGE_DIR || './data';
if (storageAdapter === 'file') mkdirSync(dataDir, { recursive: true });
const storage = storageAdapter === 'file' ? new FileStorage(dataDir) : new MemoryStorage();
const ACTIVE_JOB_STATUS = new Set(['queued', 'running', 'succeeded']);
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
function validateSchemaCompatibility(obj) {
  const version = detectSchemaVersion(obj);
  if (!version) return;
  migrateObjectIfNeeded(obj);
}
function markKitsStaleIfNeeded(project, previousVersion) {
  if ((project.workflow?.version || 0) === previousVersion) return;
  project.execution_kits = (project.execution_kits || []).map((k) => (
    (k.status === 'generated' || k.status === 'exported') ? { ...k, status: 'stale', stale_since_workflow_version: project.workflow.version } : k
  ));
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
function ensureWorkflowHistory(project) {
  if (!Array.isArray(project.workflow_history_items)) project.workflow_history_items = [];
  if (!Array.isArray(project.workflow_snapshots)) project.workflow_snapshots = [];
  if (!Array.isArray(project.workflow_undo_snapshots)) project.workflow_undo_snapshots = [];
}

function createStoredWorkflowSnapshot(ctx, project, changeSource) {
  const snapshot = createWorkflowSnapshot(project, project.context_pack, project.workflow, project.assets, project.validation || []);
  return {
    id: `workflow_snapshot_v${project.workflow.version}_${randomUUID()}`,
    workspace_id: project.workspace_id,
    project_id: project.id,
    workflow_id: project.workflow.id,
    workflow_version: project.workflow.version,
    project_summary: { name: project.name, goal: project.goal },
    context_pack_version: project.context_pack?.version || 1,
    phases: snapshot.workflow.phases,
    nodes: snapshot.workflow.nodes,
    edges: snapshot.workflow.edges,
    asset_references: { prompts: (project.assets?.prompts || []).map((a) => a.id), checklists: (project.assets?.checklists || []).map((a) => a.id) },
    validation_results: snapshot.validation,
    created_at: new Date().toISOString(),
    created_by: ctx.user_id,
    change_source: changeSource,
  };
}

function recordUndoSnapshot(ctx, project, changeSource = 'workflow_edit') {
  ensureWorkflowHistory(project);
  project.workflow_undo_snapshots.push(createStoredWorkflowSnapshot(ctx, project, changeSource));
  project.workflow_undo_snapshots = project.workflow_undo_snapshots.slice(-50);
}

function recordWorkflowHistory(ctx, project, changeSource, summary, diffId = null) {
  ensureWorkflowHistory(project);
  const previousVersion = (project.workflow.version || 1) - 1;
  const snapshot = createStoredWorkflowSnapshot(ctx, project, changeSource);
  project.workflow_snapshots = project.workflow_snapshots.filter((s) => s.workflow_version !== project.workflow.version);
  project.workflow_snapshots.push(snapshot);
  project.workflow_history_items.push({
    id: `history_${randomUUID()}`,
    workspace_id: project.workspace_id,
    project_id: project.id,
    workflow_id: project.workflow.id,
    version: project.workflow.version,
    previous_version: previousVersion > 0 ? previousVersion : null,
    change_source: changeSource,
    summary,
    created_by: ctx.user_id,
    created_at: new Date().toISOString(),
    diff_id: diffId,
    snapshot_ref: snapshot.id,
  });
  project.workflow_history_items = project.workflow_history_items.slice(-10);
  const refs = new Set(project.workflow_history_items.map((item) => item.snapshot_ref));
  project.workflow_snapshots = project.workflow_snapshots.filter((snapshot) => refs.has(snapshot.id));
}
function rehydrateFromSnapshot(project, snapshot) {
  project.workflow = {
    ...project.workflow,
    id: snapshot.workflow_id,
    version: snapshot.workflow_version,
    phases: structuredClone(snapshot.phases || []),
    nodes: structuredClone(snapshot.nodes || []),
    edges: structuredClone(snapshot.edges || []),
    updated_at: new Date().toISOString(),
  };
}

function ensureJobStore(project) {
  if (!Array.isArray(project.generation_jobs)) project.generation_jobs = [];
}

function readIdempotencyKey(req) {
  const raw = req.headers['idempotency-key'];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function createJob(ctx, project, type, inputSnapshot, idempotencyKey = null, retryOf = null) {
  const now = new Date().toISOString();
  ensureJobStore(project);
  if (idempotencyKey) {
    const existing = project.generation_jobs.find((j) => j.type === type && j.idempotency_key === idempotencyKey && ACTIVE_JOB_STATUS.has(j.status));
    if (existing) return existing;
  }
  const job = {
    id: `job_${randomUUID()}`,
    workspace_id: ctx.workspace_id,
    project_id: project.id,
    type,
    status: 'queued',
    created_by: ctx.user_id,
    created_at: now,
    updated_at: now,
    input_snapshot: inputSnapshot || {},
    output_ref: null,
    error: null,
    progress: { stage: 'queued', message: 'Waiting to start generation.' },
    idempotency_key: idempotencyKey,
    retry_of: retryOf,
    cancel_requested: false,
  };
  const v = validateGenerationJob(job);
  if (!v.ok) throw new Error(v.errors.join('; '));
  project.generation_jobs.push(job);
  storage.saveProject(ctx.workspace_id, project);
  return job;
}

function setJobProgress(job, stage, message) {
  job.progress = { stage, message };
  job.updated_at = new Date().toISOString();
}

function runJob(ctx, project, job, fn) {
  if (job.status === 'cancelled') return;
  job.status = 'running';
  setJobProgress(job, 'preparing_input', 'Preparing generation input.');
  try {
    const outputRef = fn((stage, message) => setJobProgress(job, stage, message));
    if (job.cancel_requested) {
      job.status = 'cancelled';
      setJobProgress(job, 'failed', 'Cancelled before apply.');
    } else {
      job.output_ref = outputRef;
      job.status = 'succeeded';
      setJobProgress(job, 'completed', 'Generation completed.');
    }
  } catch (e) {
    job.status = 'failed';
    job.error = { code: 'JOB_FAILED', stage: job.progress?.stage || 'failed', retryable: true, message: e.message };
    setJobProgress(job, 'failed', e.message);
  }
  job.updated_at = new Date().toISOString();
  storage.saveProject(ctx.workspace_id, project);
}

const server = createServer(async (req, res) => {
  const ctx = makeContext();
  seedIfEmpty(ctx);
  const method = req.method || 'GET';
  const url = new URL(req.url || '/', `http://localhost:${port}`);
  const path = url.pathname;

  if (method === 'GET' && path === '/api/health') return ok(res, ctx, { status: 'ok', mode: runtimeMode, version: '0.1.0', storage: storageAdapter });

  if (method === 'GET' && path === '/api/templates') return ok(res, ctx, { templates: listPublicTemplates() });
  if (method === 'GET' && path.startsWith('/api/templates/')) {
    const template = getTemplateById(decodeURIComponent(path.split('/').pop()));
    if (!template) return fail(res, ctx, 404, 'TEMPLATE_NOT_FOUND', 'Template not found');
    return ok(res, ctx, template);
  }

  if (method === 'GET' && path === '/api/projects') return ok(res, ctx, listScopedProjects(ctx).map((p) => ({ id: p.id, name: p.name, workspace_id: p.workspace_id, updated_at: p.updated_at })));
  if (method === 'POST' && path === '/api/projects') {
    const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
    const base = createExampleProject();
    const selectedTemplate = selectTemplateForProject(body);
    const project = writeOwnership(ctx, { ...base, id: body.id || `project_${Date.now()}`, name: body.name || base.name, goal: body.goal || base.goal, type: body.project_type || body.type || base.type, project_type: body.project_type || body.type || base.type, created_from_template: selectedTemplate.id, template_version: selectedTemplate.version, context_pack: base.contextPack, deleted_at: null }, true);
    const v = validateProject(project); if (!v.ok) return fail(res, ctx, 400, 'SCHEMA_INVALID', 'Project invalid', v.errors);
    project.workflow = normalizeWorkflowSpec({ workflow: project.workflow }).workflow;
    project.workflow.version = 0;
    project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    ensureWorkflowHistory(project);
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
    const job = createJob(ctx, project, 'summarize_context_pack', { context_pack: structuredClone(project.context_pack || {}) }, readIdempotencyKey(req));
    runJob(ctx, project, job, (progress) => { progress('calling_model', 'Summarizing context pack'); project.context_pack.summary = { recognized_roles: project.context_pack.team_roles || [], risk_warnings: ['mock_summary_warning'] }; return { type: 'context_pack_summary', project_id: project.id }; });
    return ok(res, ctx, { job_id: job.id, status: job.status, output_ref: job.output_ref });
  }
  const cpImpact = path.match(/^\/api\/projects\/([^/]+)\/context-pack\/refresh-impact$/);
  if (method === 'POST' && cpImpact) {
    const project = getProject(ctx, cpImpact[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    recordUndoSnapshot(ctx, project, 'context_refresh');
    project.workflow = applyWorkflowPatch(project.workflow, { context_pack_version: project.context_pack?.version || 1 });
    project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { affected_nodes: [], affected_assets: [], note: 'skeleton', workflow_version: project.workflow.version });
  }

  const wfRoute = path.match(/^\/api\/projects\/([^/]+)\/workflow$/);
  if (wfRoute) {
    const project = getProject(ctx, wfRoute[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    if (method === 'GET') return ok(res, ctx, project.workflow);
    if (method === 'PATCH') {
      const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
      if (body.workflow_version && Number(body.workflow_version) !== Number(project.workflow.version)) return fail(res, ctx, 409, 'VERSION_CONFLICT', 'Workflow has been updated by another operation. Please refresh and try again.');
      const previousVersion = project.workflow.version;
      recordUndoSnapshot(ctx, project, 'workflow_patch');
      const merged = applyWorkflowPatch(project.workflow, body);
      const schema = validateWorkflow(merged); if (!schema.ok) return fail(res, ctx, 400, 'WORKFLOW_SCHEMA_INVALID', 'Workflow schema invalid', schema.errors);
      const validation = validateRulesWorkflow(merged, project.assets, { forGeneration: false, modelConfig: {} });
      project.workflow = merged; project.validation = validation;
      markKitsStaleIfNeeded(project, previousVersion);
      storage.saveProject(ctx.workspace_id, project);
      return ok(res, ctx, { workflow: merged, validation_results: validation });
    }
  }

  const wfGen = path.match(/^\/api\/projects\/([^/]+)\/workflow\/generate$/);
  if (method === 'POST' && wfGen) {
    const project = getProject(ctx, wfGen[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const job = createJob(ctx, project, 'generate_workflow_draft', { context_pack: structuredClone(project.context_pack || {}), workflow: structuredClone(project.workflow) }, readIdempotencyKey(req));
    runJob(ctx, project, job, (progress) => {
      progress('calling_model', 'Generating workflow draft');
      const drafted = generateWorkflowDraft(project, project.context_pack || {});
      progress('parsing_output', 'Parsing generated output');
      const workflow = createWorkflowFromTemplate(project, project.context_pack, drafted.workflow);
      const schema = validateWorkflow(workflow); if (!schema.ok) throw new Error(schema.errors.join('; '));
      progress('running_boundary_rules', 'Running boundary rules');
      const validation = validateRulesWorkflow(workflow, project.assets, { forGeneration: true, modelConfig: null });
      recordUndoSnapshot(ctx, project, 'model_generation');
      project.workflow = workflow;
      project.validation = validation;
      const specCheck = validateBoundaryMLProjectSpec({ boundaryml_version: 'v0.1', project, context_pack: project.context_pack, workflow, assets: project.assets, validation, execution_kits: project.execution_kits || [] });
      if (!specCheck.ok) throw new Error(specCheck.errors.join('; '));
      storage.saveProject(ctx.workspace_id, project);
      return { type: 'workflow', workflow_id: workflow.id, workflow_version: workflow.version };
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
    const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
    if (body.workflow_version && Number(body.workflow_version) !== Number(project.workflow.version)) return fail(res, ctx, 409, 'VERSION_CONFLICT', 'Workflow has been updated by another operation. Please refresh and try again.');
    const validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    if (validation.some((v) => v.level === 'error' && v.blockingFinal)) return fail(res, ctx, 400, 'WORKFLOW_BLOCKING_ERRORS', 'Workflow has blocking errors', validation.filter((v) => v.level === 'error'));
    const previousVersion = project.workflow.version;
    recordUndoSnapshot(ctx, project, 'mark_final');
    project.workflow = applyWorkflowPatch(project.workflow, { status: 'final' }); project.validation = validation;
    markKitsStaleIfNeeded(project, previousVersion);
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { workflow_version: project.workflow.version, validation_summary: { errors: 0, warnings: validation.filter((v) => v.level === 'warning').length } });
  }
  const wfRestore = path.match(/^\/api\/projects\/([^/]+)\/workflow\/restore$/);
  if (method === 'POST' && wfRestore) {
    const project = getProject(ctx, wfRestore[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    ensureWorkflowHistory(project);
    const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
    const version = Number(body.version);
    const source = project.workflow_snapshots.find((s) => s.workflow_version === version);
    if (!source) return fail(res, ctx, 404, 'WORKFLOW_VERSION_NOT_FOUND', 'Workflow version snapshot not found');
    const nextVersion = (project.workflow.version || 0) + 1;
    recordUndoSnapshot(ctx, project, 'restore_version');
    rehydrateFromSnapshot(project, { ...source, workflow_version: nextVersion });
    project.assets = markAffectedAssetsOutdated([{ target_type: 'workflow', target_id: project.workflow.id }], project.assets);
    project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { workflow: project.workflow, validation_results: project.validation });
  }

  const wfUndo = path.match(/^\/api\/projects\/([^/]+)\/workflow\/undo$/);
  if (method === 'POST' && wfUndo) {
    const project = getProject(ctx, wfUndo[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    ensureWorkflowHistory(project);
    if (project.workflow_undo_snapshots.length < 1) return fail(res, ctx, 400, 'UNDO_NOT_AVAILABLE', 'No undo snapshot available');
    const source = project.workflow_undo_snapshots.pop();
    if (!source) return fail(res, ctx, 404, 'UNDO_SNAPSHOT_NOT_FOUND', 'Undo snapshot not found');
    const nextVersion = (project.workflow.version || 0) + 1;
    rehydrateFromSnapshot(project, { ...source, workflow_version: nextVersion });
    project.assets = markAffectedAssetsOutdated([{ target_type: 'workflow', target_id: project.workflow.id }], project.assets);
    project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { workflow: project.workflow, validation_results: project.validation, undo_available: project.workflow_undo_snapshots.length > 0 });
  }

  const nodeGet = path.match(/^\/api\/projects\/([^/]+)\/nodes\/([^/]+)$/);
  if (nodeGet) {
    const project = getProject(ctx, nodeGet[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const node = project.workflow.nodes.find((n) => n.id === nodeGet[2]); if (!node) return fail(res, ctx, 404, 'NODE_NOT_FOUND', 'Node not found');
    if (method === 'GET') return ok(res, ctx, node);
    if (method === 'PATCH') {
      const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
      if (body.workflow_version && Number(body.workflow_version) !== Number(project.workflow.version)) return fail(res, ctx, 409, 'VERSION_CONFLICT', 'Workflow has been updated by another operation. Please refresh and try again.');
      const previousVersion = project.workflow.version;
      const idx = project.workflow.nodes.findIndex((n) => n.id === node.id);
      recordUndoSnapshot(ctx, project, 'node_patch');
      project.workflow.nodes[idx] = { ...node, ...body };
      project.workflow = applyWorkflowPatch(project.workflow, { nodes: project.workflow.nodes });
      project.assets = markAffectedAssetsOutdated([{ target_type: 'node', target_id: node.id }], project.assets);
      project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
      markKitsStaleIfNeeded(project, previousVersion);
      storage.saveProject(ctx.workspace_id, project);
      return ok(res, ctx, { node: project.workflow.nodes[idx], workflow_summary: { version: project.workflow.version }, validation_results: project.validation });
    }
  }

  const nodePrompt = path.match(/^\/api\/projects\/([^/]+)\/nodes\/([^/]+)\/generate-prompt$/);
  if (method === 'POST' && nodePrompt) {
    const project = getProject(ctx, nodePrompt[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const node = project.workflow.nodes.find((n) => n.id === nodePrompt[2]); if (!node) return fail(res, ctx, 404, 'NODE_NOT_FOUND', 'Node not found');
    if (node.executionMode === 'human_only') return fail(res, ctx, 400, 'HUMAN_ONLY_NO_PROMPT', 'Human only node cannot generate AI prompt');
    const job = createJob(ctx, project, 'generate_prompt', { node_id: node.id, node: structuredClone(node) }, readIdempotencyKey(req));
    runJob(ctx, project, job, (progress) => {
      progress('calling_model', 'Generating prompt');
      const prompt = generatePrompt(node);
      project.assets.prompts = project.assets.prompts.filter((p) => p.nodeId !== node.id).concat(prompt);
      project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: true, modelConfig: null });
      storage.saveProject(ctx.workspace_id, project);
      return { type: 'prompt_asset', asset_id: prompt.id };
    });
    return ok(res, ctx, { job_id: job.id, status: job.status });
  }

  const nodeChecklist = path.match(/^\/api\/projects\/([^/]+)\/nodes\/([^/]+)\/generate-checklist$/);
  if (method === 'POST' && nodeChecklist) {
    const project = getProject(ctx, nodeChecklist[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const node = project.workflow.nodes.find((n) => n.id === nodeChecklist[2]); if (!node) return fail(res, ctx, 404, 'NODE_NOT_FOUND', 'Node not found');
    const job = createJob(ctx, project, 'generate_checklist', { node_id: node.id, review_gate: structuredClone(node.reviewGate || {}) }, readIdempotencyKey(req));
    runJob(ctx, project, job, (progress) => {
      progress('calling_model', 'Generating checklist');
      const checklist = generateChecklist(node.reviewGate, node);
      project.assets.checklists = project.assets.checklists.filter((c) => c.nodeId !== node.id).concat(checklist);
      project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: true, modelConfig: null });
      storage.saveProject(ctx.workspace_id, project);
      return { type: 'checklist_asset', asset_id: checklist.id };
    });
    return ok(res, ctx, { job_id: job.id, status: job.status });
  }

  const diffGenerate = path.match(/^\/api\/projects\/([^/]+)\/diffs\/generate$/);
  if (method === 'POST' && diffGenerate) {
    const project = getProject(ctx, diffGenerate[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
    const requestText = body.request || 'default';
    const job = createJob(ctx, project, 'generate_workflow_diff', { request: requestText, workflow: structuredClone(project.workflow) }, readIdempotencyKey(req));
    let modelResult = null;
    try {
      modelResult = await runModel('workflow_diff', { request: requestText, workflow: project.workflow, assets: project.assets });
      modelCalls.unshift({ id: `call_${Date.now()}`, workspace_id: ctx.workspace_id, created_by: ctx.user_id, created_at: new Date().toISOString(), model: modelResult.model, purpose: 'workflow_diff', status: modelResult.status, summary: modelResult.output?.summary || `diff request: ${requestText}` });
    } catch (error) {
      modelCalls.unshift({ id: `call_${Date.now()}`, workspace_id: ctx.workspace_id, created_by: ctx.user_id, created_at: new Date().toISOString(), model: getModelStatus().diff_model, purpose: 'workflow_diff', status: 'failed', summary: error.message });
    }
    runJob(ctx, project, job, (progress) => {
      progress('calling_model', 'Generating workflow diff');
      const candidate = modelResult?.output?.diff || modelResult?.output;
      project.last_diff = candidate?.changes ? { ...candidate, id: candidate.id || `diff-${Date.now()}`, request: requestText, warnings: candidate.warnings || [], createdAt: candidate.createdAt || new Date().toISOString() } : generateWorkflowDiff(requestText, project.workflow, project.assets);
      project.last_diff.status = 'draft';
      return { type: 'workflow_diff', diff_id: project.last_diff.id };
    });
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { job_id: job.id, diff: project.last_diff, model_status: getModelStatus() });
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
    const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
    if (body.workflow_version && Number(body.workflow_version) !== Number(project.workflow.version)) return fail(res, ctx, 409, 'VERSION_CONFLICT', 'Workflow has been updated by another operation. Please refresh and try again.');
    const diff = project.last_diff; if (!diff || diff.id !== diffApply[2]) return fail(res, ctx, 404, 'DIFF_NOT_FOUND', 'Diff not found');
    const previousVersion = project.workflow.version;
    recordUndoSnapshot(ctx, project, 'ai_diff_apply');
    project.workflow = applyDiff(project.workflow, diff, body.selected_change_ids || diff.changes.filter((c) => c.selected).map((c) => c.id));
    project.assets = markAffectedAssetsOutdated(diff.changes, project.assets);
    project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    markKitsStaleIfNeeded(project, previousVersion);
    diff.previous_version = previousVersion;
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
  const diffRevert = path.match(/^\/api\/projects\/([^/]+)\/diffs\/([^/]+)\/revert$/);
  if (method === 'POST' && diffRevert) {
    const project = getProject(ctx, diffRevert[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const diff = project.last_diff; if (!diff || diff.id !== diffRevert[2]) return fail(res, ctx, 404, 'DIFF_NOT_FOUND', 'Diff not found');
    if (diff.status !== 'applied') return fail(res, ctx, 400, 'DIFF_NOT_APPLIED', 'Only applied diff can be reverted');
    ensureWorkflowHistory(project);
    const before = diff.previous_version;
    const source = project.workflow_undo_snapshots.find((s) => s.workflow_version === before) || project.workflow_snapshots.find((s) => s.workflow_version === before);
    if (!source) return fail(res, ctx, 404, 'REVERT_SNAPSHOT_NOT_FOUND', 'Pre-diff snapshot not found');
    const nextVersion = (project.workflow.version || 0) + 1;
    recordUndoSnapshot(ctx, project, 'revert_diff');
    rehydrateFromSnapshot(project, { ...source, workflow_version: nextVersion });
    project.assets = markAffectedAssetsOutdated(diff.changes || [], project.assets);
    project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    diff.status = 'reverted';
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { workflow: project.workflow, validation_results: project.validation, diff });
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
      for (const key of ['prompts', 'checklists', 'artifactTemplates', 'artifact_templates']) {
        const arr = project.assets[key] || [];
        const idx = arr.findIndex((a) => a.id === asset.id);
        if (idx >= 0) { arr[idx] = { ...arr[idx], ...body, manually_edited: true, updated_at: new Date().toISOString() }; project.assets[key] = arr; break; }
      }
      project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
      storage.saveProject(ctx.workspace_id, project); return ok(res, ctx, { updated: true, assets: project.assets, validation_results: project.validation });
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
    const body = await readJsonBody(req) || {};
    const validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    project.validation = validation;
    const job = createJob(ctx, project, 'generate_execution_kit_preview', { workflow: structuredClone(project.workflow), assets: structuredClone(project.assets), kit_type: body.kit_type || 'draft' }, readIdempotencyKey(req));
    runJob(ctx, project, job, (progress) => { progress('generating_files', 'Generating preview files'); return { type: 'execution_kit_preview', project_id: project.id }; });
    const preview = exportExecutionKit(generateExecutionKit(project.workflow, project.assets, validation, { kit_type: body.kit_type || 'draft' }));
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { job_id: job.id, preview, execution_kit: preview, validation_results: validation });
  }

  const kitGenerate = path.match(/^\/api\/projects\/([^/]+)\/execution-kits\/generate$/);
  if (method === 'POST' && kitGenerate) {
    const project = getProject(ctx, kitGenerate[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const body = await readJsonBody(req) || {};
    const validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    project.validation = validation;
    const kit = generateExecutionKit(project.workflow, project.assets, validation, { kit_type: body.kit_type || 'draft' });
    if ((body.kit_type || 'draft') === 'final' && !kit.canExportFinal) return fail(res, ctx, 400, 'FINAL_KIT_BLOCKED', 'Final Kit cannot be generated while blocking validation errors exist', kit.validation_summary);
    const job = createJob(ctx, project, 'generate_execution_kit', { workflow: structuredClone(project.workflow), assets: structuredClone(project.assets), kit_type: kit.kit_type }, readIdempotencyKey(req));
    runJob(ctx, project, job, (progress) => {
      progress('generating_files', 'Generating execution kit');
      if (!kit?.files || Object.keys(kit.files).length === 0) throw new Error('EXECUTION_KIT_GENERATION_FAILED');
      const rec = { id: `kit_${Date.now()}`, project_id: project.id, workspace_id: project.workspace_id, created_by: ctx.user_id, updated_by: ctx.user_id, workflow_snapshot_version: project.workflow.version, status: kit.kit_type === 'final' ? 'generated_final' : 'generated', kit_type: kit.kit_type, files: kit.files, validation_summary: kit.validation_summary, generated_at: new Date().toISOString(), input_snapshot: { workflow_version: project.workflow.version } };
      project.execution_kits = (project.execution_kits || []).concat(rec);
      return { type: 'execution_kit', kit_id: rec.id };
    });
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { job_id: job.id, status: job.status, output_ref: job.output_ref, kit: (project.execution_kits || []).at(-1), validation_results: validation });
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
    if (kit.status === 'failed' || kit.status === 'generating') return fail(res, ctx, 400, 'EXECUTION_KIT_GENERATION_FAILED', 'Execution kit is not downloadable in current status');
    return ok(res, ctx, { filename: `${kit.id}.json`, content: JSON.stringify(kit, null, 2), stale: kit.status === 'stale' });
  }

  if (method === 'GET' && path === '/api/model/status') return ok(res, ctx, getModelStatus());
  if (method === 'GET' && path === '/api/model/config') return ok(res, ctx, getModelConfig());
  if (method === 'PUT' && path === '/api/model/config') {
    const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
    return ok(res, ctx, { status: updateModelConfig(body), config: getModelConfig() });
  }
  if (method === 'POST' && path === '/api/model/test') {
    const status = getModelStatus();
    try {
      const result = await runModel('test', { ping: true });
      modelCalls.unshift({ id: `call_${Date.now()}`, workspace_id: ctx.workspace_id, created_by: ctx.user_id, created_at: new Date().toISOString(), model: result.model, purpose: 'test', status: result.status || 'succeeded', summary: result.output.summary });
      return ok(res, ctx, { status: result.status || 'succeeded', mode: status.using_mock ? 'mock' : 'real', result: result.output });
    } catch (error) {
      modelCalls.unshift({ id: `call_${Date.now()}`, workspace_id: ctx.workspace_id, created_by: ctx.user_id, created_at: new Date().toISOString(), model: status.default_model, purpose: 'test', status: 'failed', summary: error.message || 'Model test failed' });
      return ok(res, ctx, { status: 'failed', mode: status.using_mock ? 'mock' : 'real', error: error.message || 'Model test failed' });
    }
  }
  if (method === 'GET' && path === '/api/model/calls') return ok(res, ctx, modelCalls.slice(0, 50));

  const jobsList = path.match(/^\/api\/projects\/([^/]+)\/jobs$/);
  if (method === 'GET' && jobsList) {
    const project = getProject(ctx, jobsList[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    ensureJobStore(project);
    return ok(res, ctx, project.generation_jobs.filter((j) => j.workspace_id === ctx.workspace_id));
  }
  const wfHistory = path.match(/^\/api\/projects\/([^/]+)\/workflow\/history$/);
  if (method === 'POST' && wfHistory) {
    const project = getProject(ctx, wfHistory[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    ensureWorkflowHistory(project);
    const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
    if (body.workflow_version && Number(body.workflow_version) !== Number(project.workflow.version)) return fail(res, ctx, 409, 'VERSION_CONFLICT', 'Workflow has been updated by another operation. Please refresh and try again.');
    recordWorkflowHistory(ctx, project, 'manual_save', body.summary || `Saved workflow version ${project.workflow.version}.`, null);
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { history_item: project.workflow_history_items.at(-1), history: project.workflow_history_items });
  }
  if (method === 'GET' && wfHistory) {
    const project = getProject(ctx, wfHistory[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    ensureWorkflowHistory(project);
    return ok(res, ctx, project.workflow_history_items);
  }
  const wfVersion = path.match(/^\/api\/projects\/([^/]+)\/workflow\/versions\/([^/]+)$/);
  if (method === 'GET' && wfVersion) {
    const project = getProject(ctx, wfVersion[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    ensureWorkflowHistory(project);
    const version = Number(wfVersion[2]);
    const snap = project.workflow_snapshots.find((s) => s.workflow_version === version);
    if (!snap) return fail(res, ctx, 404, 'WORKFLOW_VERSION_NOT_FOUND', 'Workflow version snapshot not found');
    return ok(res, ctx, snap);
  }
  const jobsGet = path.match(/^\/api\/projects\/([^/]+)\/jobs\/([^/]+)$/);
  if (method === 'GET' && jobsGet) {
    const project = getProject(ctx, jobsGet[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    ensureJobStore(project);
    const job = project.generation_jobs.find((j) => j.id === jobsGet[2]);
    if (!job || job.project_id !== project.id || job.workspace_id !== ctx.workspace_id) return fail(res, ctx, 404, 'JOB_NOT_FOUND', 'Job not found');
    return ok(res, ctx, job);
  }
  const jobsRetry = path.match(/^\/api\/projects\/([^/]+)\/jobs\/([^/]+)\/retry$/);
  if (method === 'POST' && jobsRetry) {
    const project = getProject(ctx, jobsRetry[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    ensureJobStore(project);
    const original = project.generation_jobs.find((j) => j.id === jobsRetry[2]);
    if (!original) return fail(res, ctx, 404, 'JOB_NOT_FOUND', 'Job not found');
    if (!original.input_snapshot) return fail(res, ctx, 400, 'JOB_NOT_RETRYABLE', 'Job has no input snapshot');
    const retried = createJob(ctx, project, original.type, structuredClone(original.input_snapshot), null, original.id);
    runJob(ctx, project, retried, () => ({ type: 'retry_placeholder', source_job_id: original.id }));
    return ok(res, ctx, retried);
  }
  const jobsCancel = path.match(/^\/api\/projects\/([^/]+)\/jobs\/([^/]+)\/cancel$/);
  if (method === 'POST' && jobsCancel) {
    const project = getProject(ctx, jobsCancel[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    ensureJobStore(project);
    const job = project.generation_jobs.find((j) => j.id === jobsCancel[2]);
    if (!job) return fail(res, ctx, 404, 'JOB_NOT_FOUND', 'Job not found');
    if (job.status === 'succeeded') return fail(res, ctx, 409, 'JOB_ALREADY_COMPLETED', 'Job already succeeded');
    job.cancel_requested = true;
    job.status = 'cancelled';
    setJobProgress(job, 'failed', 'Cancel requested by user.');
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, job);
  }

  return fail(res, ctx, 404, 'ROUTE_NOT_FOUND', `${method} ${path} not found`);
});

server.listen(port, () => {
  console.log(`BoundaryML Server listening on http://localhost:${port}`);
});
