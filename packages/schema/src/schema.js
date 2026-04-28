const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:/;

export const SCHEMA_VERSION = 'boundaryml-schema-v2';

export const ENTITY_SCHEMAS = {
  project: {
    required: ['id', 'workspace_id', 'name', 'type', 'goal', 'risk_level', 'setup_mode', 'workflow', 'context_pack', 'assets'],
  },
  context_pack: {
    required: ['team_roles', 'approval_process', 'tool_stack', 'risk_constraints', 'historical_process_materials'],
  },
  workflow: {
    required: ['id', 'workspace_id', 'version', 'status', 'phases', 'nodes', 'edges', 'updated_at'],
  },
  phase: {
    required: ['id', 'name', 'order'],
  },
  node: {
    required: ['id', 'phase_id', 'name', 'goal', 'execution_mode', 'risk_level', 'status', 'inputs', 'outputs'],
  },
  edge: {
    required: ['id', 'from', 'to'],
  },
  review_gate: {
    required: ['id', 'name', 'reviewer_role', 'criteria', 'pass_condition', 'reject_condition', 'allow_ai_revision', 'required'],
  },
  prompt_asset: {
    required: ['id', 'node_id', 'phase_id', 'name', 'status', 'content', 'updated_at'],
  },
  checklist_asset: {
    required: ['id', 'node_id', 'phase_id', 'name', 'status', 'items', 'updated_at'],
  },
  workflow_diff: {
    required: ['id', 'project_id', 'workflow_id', 'request', 'changes', 'warnings', 'created_at'],
  },
  execution_kit: {
    required: ['id', 'project_id', 'status', 'workflow_snapshot_version', 'generated_at', 'files'],
  },
  generation_job: {
    required: ['id', 'workspace_id', 'project_id', 'job_type', 'status', 'created_at', 'updated_at'],
  },
};

const ALLOWED_JOB_STATUS = new Set(['queued', 'running', 'succeeded', 'failed']);

export function toSnakeCaseKeys(input) {
  if (Array.isArray(input)) return input.map((item) => toSnakeCaseKeys(item));
  if (!input || typeof input !== 'object') return input;

  return Object.entries(input).reduce((acc, [key, value]) => {
    const snake = key
      .replace(/([A-Z])/g, '_$1')
      .replace(/-/g, '_')
      .toLowerCase();
    acc[snake] = toSnakeCaseKeys(value);
    return acc;
  }, {});
}

function validateRequiredFields(type, data) {
  const schema = ENTITY_SCHEMAS[type];
  if (!schema) return [`Unknown schema type: ${type}`];

  return schema.required
    .filter((field) => !(field in data))
    .map((field) => `${type}.${field} is required`);
}

function validateCoreTypes(type, data) {
  const errors = [];
  if ('id' in data && typeof data.id !== 'string') errors.push(`${type}.id must be string`);
  if ('workspace_id' in data && typeof data.workspace_id !== 'string') errors.push(`${type}.workspace_id must be string`);
  if ('created_at' in data && typeof data.created_at === 'string' && !ISO_DATE_REGEX.test(data.created_at)) errors.push(`${type}.created_at must be ISO timestamp`);
  if ('updated_at' in data && typeof data.updated_at === 'string' && !ISO_DATE_REGEX.test(data.updated_at)) errors.push(`${type}.updated_at must be ISO timestamp`);

  if (type === 'generation_job' && data.status && !ALLOWED_JOB_STATUS.has(data.status)) {
    errors.push('generation_job.status must be one of queued|running|succeeded|failed');
  }

  if (type === 'workflow' && typeof data.version !== 'number') {
    errors.push('workflow.version must be number');
  }

  return errors;
}

export function validateSchema(type, payload) {
  const normalized = toSnakeCaseKeys(payload);
  const errors = [
    ...validateRequiredFields(type, normalized),
    ...validateCoreTypes(type, normalized),
  ];

  return {
    ok: errors.length === 0,
    errors,
    normalized,
  };
}

export const validateProject = (payload) => validateSchema('project', payload);
export const validateContextPack = (payload) => validateSchema('context_pack', payload);
export const validateWorkflow = (payload) => validateSchema('workflow', payload);
export const validatePhase = (payload) => validateSchema('phase', payload);
export const validateNode = (payload) => validateSchema('node', payload);
export const validateEdge = (payload) => validateSchema('edge', payload);
export const validateReviewGate = (payload) => validateSchema('review_gate', payload);
export const validatePromptAsset = (payload) => validateSchema('prompt_asset', payload);
export const validateChecklistAsset = (payload) => validateSchema('checklist_asset', payload);
export const validateWorkflowDiff = (payload) => validateSchema('workflow_diff', payload);
export const validateExecutionKit = (payload) => validateSchema('execution_kit', payload);
export const validateGenerationJob = (payload) => validateSchema('generation_job', payload);
