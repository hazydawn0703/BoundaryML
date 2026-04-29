import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createExampleProject } from '../../../packages/core/src/sampleProject.js';
import { validateWorkflow as validateRulesWorkflow } from '../../../packages/rules/src/validationEngine.js';
import { generateWorkflowDraft } from '../../../packages/generators/src/workflowGenerator.js';
import { generateWorkflowDiff, applyWorkflowDiff } from '../../../packages/core/src/diff.js';
import { generateExecutionKit } from '../../../packages/generators/src/executionKitGenerator.js';
import { MemoryStorage } from '../../../packages/storage/src/memoryStorage.js';
import { FileStorage } from '../../../packages/storage/src/fileStorage.js';
import { validateProject, validateWorkflow, validateGenerationJob } from '../../../packages/schema/src/schema.js';
import { getModelStatus } from './llmAccess.js';

const port = Number(process.env.PORT || 8787);
const runtimeMode = process.env.RUNTIME_MODE === 'local_demo' ? 'local_demo' : 'local_server';
const storage = process.env.STORAGE_MODE === 'file' ? new FileStorage(process.env.STORAGE_DIR || '.boundaryml-data') : new MemoryStorage();
const jobs = new Map();

function getRequestContext() {
  if (runtimeMode === 'local_demo') {
    return { user_id: 'demo_user', workspace_id: 'demo_workspace', runtime_mode: runtimeMode };
  }
  return { user_id: 'local_user', workspace_id: 'local_default', runtime_mode: runtimeMode };
}

function responseEnvelope(res, statusCode, payload) {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(payload));
}

function ok(res, data, meta = {}) {
  responseEnvelope(res, 200, { ok: true, data, error: null, meta });
}

function fail(res, statusCode, code, message, details = null) {
  responseEnvelope(res, statusCode, { ok: false, data: null, error: { code, message, details }, meta: {} });
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf-8'));
  } catch {
    return null;
  }
}

function ensureProject(ctx, project_id) {
  const project = storage.getProject(ctx.workspace_id, project_id);
  if (!project) return null;
  return project;
}

function attachServerFields(ctx, payload) {
  const now = new Date().toISOString();
  return {
    ...payload,
    workspace_id: ctx.workspace_id,
    created_by: payload.created_by || ctx.user_id,
    updated_by: ctx.user_id,
    created_at: payload.created_at || now,
    updated_at: now,
  };
}

function snapshotWorkflow(project) {
  project.workflow_history = project.workflow_history || [];
  project.workflow_history.push({
    workflow_snapshot_version: project.workflow.version,
    captured_at: new Date().toISOString(),
    workflow: structuredClone(project.workflow),
  });
}

function createJob(ctx, project_id, job_type) {
  const now = new Date().toISOString();
  const job = {
    id: `job_${randomUUID()}`,
    workspace_id: ctx.workspace_id,
    created_by: ctx.user_id,
    project_id,
    job_type,
    status: 'queued',
    output_ref: null,
    error: null,
    created_at: now,
    updated_at: now,
  };
  const validation = validateGenerationJob(job);
  if (!validation.ok) throw new Error(validation.errors.join('; '));
  jobs.set(job.id, job);
  return job;
}

function runJob(job, fn) {
  job.status = 'running';
  job.updated_at = new Date().toISOString();
  try {
    const outputRef = fn();
    job.status = 'succeeded';
    job.output_ref = outputRef;
  } catch (error) {
    job.status = 'failed';
    job.error = { code: 'JOB_FAILED', message: error.message };
  }
  job.updated_at = new Date().toISOString();
}

function createOrSeedProjects(ctx) {
  const projects = storage.listProjects(ctx.workspace_id);
  if (projects.length) return projects;
  const seeded = attachServerFields(ctx, createExampleProject());
  seeded.context_pack = seeded.contextPack;
  seeded.workflow_history = [];
  snapshotWorkflow(seeded);
  storage.saveProject(ctx.workspace_id, seeded);
  return [seeded];
}

const server = createServer(async (req, res) => {
  const ctx = getRequestContext();
  const method = req.method || 'GET';
  const url = new URL(req.url || '/', `http://localhost:${port}`);
  const path = url.pathname;

  if (method === 'GET' && path === '/health') {
    return ok(res, { service: 'boundaryml-server', runtime_mode: runtimeMode, storage_mode: process.env.STORAGE_MODE || 'memory' });
  }

  if (method === 'GET' && path === '/api/model/status') {
    return ok(res, getModelStatus());
  }

  if (method === 'GET' && path === '/api/projects') {
    return ok(res, createOrSeedProjects(ctx).map((p) => ({ id: p.id, name: p.name, workspace_id: p.workspace_id, updated_at: p.updated_at })));
  }

  if (method === 'POST' && path === '/api/projects') {
    const body = await readJsonBody(req);
    if (body === null) return fail(res, 400, 'INVALID_JSON', 'Request body is not valid JSON');

    const project = attachServerFields(ctx, {
      ...createExampleProject(),
      id: body.id || `project_${Date.now()}`,
      name: body.name || 'Untitled Project',
      goal: body.goal || 'N/A',
      context_pack: body.context_pack || { team_roles: [], approval_process: [], tool_stack: [], risk_constraints: [], historical_process_materials: '' },
      workflow_history: [],
    });
    const valid = validateProject(project);
    if (!valid.ok) return fail(res, 400, 'SCHEMA_INVALID', 'Project schema invalid', valid.errors);
    snapshotWorkflow(project);
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, project);
  }

  if (method === 'GET' && path === '/api/projects/example') {
    return ok(res, createOrSeedProjects(ctx)[0]);
  }

  const projectMatch = path.match(/^\/api\/projects\/([^/]+)$/);
  if (method === 'GET' && projectMatch) {
    const project = ensureProject(ctx, projectMatch[1]);
    if (!project) return fail(res, 404, 'NOT_FOUND', 'Project not found');
    return ok(res, project);
  }

  const contextGetMatch = path.match(/^\/api\/projects\/([^/]+)\/context-pack$/);
  if (method === 'GET' && contextGetMatch) {
    const project = ensureProject(ctx, contextGetMatch[1]);
    if (!project) return fail(res, 404, 'NOT_FOUND', 'Project not found');
    return ok(res, project.context_pack || project.contextPack || null);
  }

  if (method === 'PUT' && contextGetMatch) {
    const project = ensureProject(ctx, contextGetMatch[1]);
    if (!project) return fail(res, 404, 'NOT_FOUND', 'Project not found');
    const body = await readJsonBody(req);
    if (body === null) return fail(res, 400, 'INVALID_JSON', 'Request body is not valid JSON');
    project.context_pack = attachServerFields(ctx, { ...body, id: body.id || `ctx_${project.id}` });
    project.updated_by = ctx.user_id;
    project.updated_at = new Date().toISOString();
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, project.context_pack);
  }

  const summarizeMatch = path.match(/^\/api\/projects\/([^/]+)\/context-pack\/summarize$/);
  if (method === 'POST' && summarizeMatch) {
    const project = ensureProject(ctx, summarizeMatch[1]);
    if (!project) return fail(res, 404, 'NOT_FOUND', 'Project not found');
    const job = createJob(ctx, project.id, 'context_summarize');
    runJob(job, () => {
      const summary = {
        recognized_roles: project.context_pack?.team_roles || ['product_manager'],
        risk_warnings: (project.sensitiveAreas || []).map((item) => `check_${item.toLowerCase().replace(/\s+/g, '_')}`),
      };
      project.context_pack = { ...(project.context_pack || {}), summary };
      storage.saveProject(ctx.workspace_id, project);
      return { type: 'context_pack_summary', ref_id: `${project.id}:context_pack` };
    });
    return ok(res, { job_id: job.id, status: job.status, output_ref: job.output_ref, error: job.error });
  }

  const workflowMatch = path.match(/^\/api\/projects\/([^/]+)\/workflow$/);
  if (method === 'GET' && workflowMatch) {
    const project = ensureProject(ctx, workflowMatch[1]);
    if (!project) return fail(res, 404, 'NOT_FOUND', 'Project not found');
    return ok(res, project.workflow);
  }

  const workflowGenerateMatch = path.match(/^\/api\/projects\/([^/]+)\/workflow\/generate$/);
  if (method === 'POST' && workflowGenerateMatch) {
    const project = ensureProject(ctx, workflowGenerateMatch[1]);
    if (!project) return fail(res, 404, 'NOT_FOUND', 'Project not found');
    const job = createJob(ctx, project.id, 'workflow_generate');
    runJob(job, () => {
      const regenerated = generateWorkflowDraft(project, project.context_pack || {});
      project.workflow = regenerated.workflow;
      project.workflow.workspace_id = ctx.workspace_id;
      project.workflow.version = (project.workflow.version || 0) + 1;
      project.workflow.updated_at = new Date().toISOString();
      const valid = validateWorkflow(project.workflow);
      if (!valid.ok) throw new Error(`Workflow schema invalid: ${valid.errors.join(', ')}`);
      snapshotWorkflow(project);
      storage.saveProject(ctx.workspace_id, project);
      return { type: 'workflow', ref_id: project.workflow.id };
    });
    return ok(res, { job_id: job.id, status: job.status, output_ref: job.output_ref, error: job.error });
  }

  const workflowPatchMatch = path.match(/^\/api\/projects\/([^/]+)\/workflow$/);
  if (method === 'PATCH' && workflowPatchMatch) {
    const project = ensureProject(ctx, workflowPatchMatch[1]);
    if (!project) return fail(res, 404, 'NOT_FOUND', 'Project not found');
    const body = await readJsonBody(req);
    if (body === null) return fail(res, 400, 'INVALID_JSON', 'Request body is not valid JSON');
    project.workflow = {
      ...project.workflow,
      ...body,
      version: (project.workflow.version || 0) + 1,
      updated_at: new Date().toISOString(),
    };
    snapshotWorkflow(project);
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, project.workflow);
  }

  const workflowValidateMatch = path.match(/^\/api\/projects\/([^/]+)\/workflow\/validate$/);
  if (method === 'POST' && workflowValidateMatch) {
    const project = ensureProject(ctx, workflowValidateMatch[1]);
    if (!project) return fail(res, 404, 'NOT_FOUND', 'Project not found');
    return ok(res, validateRulesWorkflow(project.workflow, project.assets));
  }

  const diffGenerateMatch = path.match(/^\/api\/projects\/([^/]+)\/diffs\/generate$/);
  if (method === 'POST' && diffGenerateMatch) {
    const project = ensureProject(ctx, diffGenerateMatch[1]);
    if (!project) return fail(res, 404, 'NOT_FOUND', 'Project not found');
    const body = await readJsonBody(req);
    const job = createJob(ctx, project.id, 'diff_generate');
    runJob(job, () => {
      const diff = generateWorkflowDiff(body?.request || 'default', project.workflow, project.assets);
      project.last_diff = diff;
      storage.saveProject(ctx.workspace_id, project);
      return { type: 'workflow_diff', ref_id: diff.id };
    });
    return ok(res, { job_id: job.id, status: job.status, output_ref: job.output_ref, error: job.error });
  }

  const diffApplyMatch = path.match(/^\/api\/projects\/([^/]+)\/diffs\/([^/]+)\/apply$/);
  if (method === 'POST' && diffApplyMatch) {
    const project = ensureProject(ctx, diffApplyMatch[1]);
    if (!project) return fail(res, 404, 'NOT_FOUND', 'Project not found');
    const [, , diffId] = diffApplyMatch;
    if (!project.last_diff || project.last_diff.id !== diffId) return fail(res, 404, 'NOT_FOUND', 'Diff not found');
    const updated = applyWorkflowDiff(project, project.last_diff, false);
    updated.workflow.version = (project.workflow.version || 0) + 1;
    updated.workflow.updated_at = new Date().toISOString();
    snapshotWorkflow(updated);
    storage.saveProject(ctx.workspace_id, updated);
    return ok(res, updated.workflow);
  }

  const assetsMatch = path.match(/^\/api\/projects\/([^/]+)\/assets$/);
  if (method === 'GET' && assetsMatch) {
    const project = ensureProject(ctx, assetsMatch[1]);
    if (!project) return fail(res, 404, 'NOT_FOUND', 'Project not found');
    return ok(res, project.assets);
  }

  const kitPreviewMatch = path.match(/^\/api\/projects\/([^/]+)\/execution-kits\/preview$/);
  if (method === 'POST' && kitPreviewMatch) {
    const project = ensureProject(ctx, kitPreviewMatch[1]);
    if (!project) return fail(res, 404, 'NOT_FOUND', 'Project not found');
    const validation = validateRulesWorkflow(project.workflow, project.assets);
    const preview = generateExecutionKit(project.workflow, project.assets, validation);
    return ok(res, { ...preview, preview_only: true, workflow_snapshot_version: project.workflow.version });
  }

  const kitGenerateMatch = path.match(/^\/api\/projects\/([^/]+)\/execution-kits\/generate$/);
  if (method === 'POST' && kitGenerateMatch) {
    const project = ensureProject(ctx, kitGenerateMatch[1]);
    if (!project) return fail(res, 404, 'NOT_FOUND', 'Project not found');
    const job = createJob(ctx, project.id, 'execution_kit_generate');
    runJob(job, () => {
      const validation = validateRulesWorkflow(project.workflow, project.assets);
      const kit = generateExecutionKit(project.workflow, project.assets, validation);
      project.execution_kit = {
        ...kit,
        workflow_snapshot_version: project.workflow.version,
      };
      storage.saveProject(ctx.workspace_id, project);
      return { type: 'execution_kit', ref_id: project.execution_kit.id || `kit_${project.id}` };
    });
    return ok(res, { job_id: job.id, status: job.status, output_ref: job.output_ref, error: job.error });
  }

  const jobGetMatch = path.match(/^\/api\/projects\/([^/]+)\/jobs\/([^/]+)$/);
  if (method === 'GET' && jobGetMatch) {
    const [, projectId, jobId] = jobGetMatch;
    const project = ensureProject(ctx, projectId);
    if (!project) return fail(res, 404, 'NOT_FOUND', 'Project not found');
    const job = jobs.get(jobId);
    if (!job || job.project_id !== projectId || job.workspace_id !== ctx.workspace_id) {
      return fail(res, 404, 'NOT_FOUND', 'Job not found');
    }
    return ok(res, job);
  }

  return fail(res, 404, 'NOT_FOUND', `No route for ${method} ${path}`);
});

server.listen(port, () => {
  console.log(`BoundaryML Server listening on http://localhost:${port}`);
});
