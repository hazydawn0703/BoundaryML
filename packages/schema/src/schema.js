import { JOB_STATUS, VALIDATION_LEVEL } from './constants.js';

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:/;

export const SCHEMA_VERSION = 'boundaryml-schema-v0.1';

export const ENTITY_SCHEMAS = {
  project: { required: ['id', 'workspace_id', 'name', 'type', 'goal', 'risk_level', 'setup_mode'] },
  context_pack: { required: ['team_roles', 'approval_process', 'tool_stack', 'risk_constraints', 'historical_process_materials'] },
  workflow: { required: ['id', 'workspace_id', 'version', 'status', 'phases', 'nodes', 'edges', 'updated_at'] },
  phase: { required: ['id', 'name', 'order'] },
  node: { required: ['id', 'phase_id', 'name', 'goal', 'execution_mode', 'risk_level', 'status', 'inputs', 'outputs'] },
  edge: { required: ['id', 'from', 'to'] },
  review_gate: { required: ['id', 'name', 'reviewer_role', 'criteria', 'pass_condition', 'reject_condition', 'allow_ai_revision', 'required'] },
  artifact_contract: { required: ['id', 'format', 'output_format', 'acceptance_criteria'] },
  prompt_asset: { required: ['id', 'node_id', 'phase_id', 'name', 'status', 'content', 'updated_at'] },
  checklist_asset: { required: ['id', 'node_id', 'phase_id', 'name', 'status', 'items', 'updated_at'] },
  artifact_template: { required: ['id', 'node_id', 'name', 'content', 'status'] },
  workflow_diff: { required: ['id', 'project_id', 'workflow_id', 'request', 'changes', 'warnings', 'created_at'] },
  diff_change: { required: ['id', 'type', 'target_type', 'target_id', 'field', 'reason', 'impact', 'selected'] },
  validation_result: { required: ['id', 'level', 'target_type', 'target_id', 'title', 'message'] },
  execution_kit: { required: ['id', 'project_id', 'status', 'workflow_snapshot_version', 'generated_at', 'files'] },
  workflow_snapshot: { required: ['workflow_snapshot_version', 'captured_at', 'workflow'] },
  generation_job: { required: ['id', 'workspace_id', 'created_by', 'project_id', 'job_type', 'status', 'created_at', 'updated_at'] },
  model_call_log: { required: ['id', 'workspace_id', 'model', 'purpose', 'status', 'created_at'] },
  template: { required: ['id', 'name', 'template_type', 'version', 'content'] },
};

const ALLOWED_JOB_STATUS = new Set(Object.values(JOB_STATUS));
const ALLOWED_VALIDATION_LEVEL = new Set(Object.values(VALIDATION_LEVEL));

export function toSnakeCaseKeys(input) {
  if (Array.isArray(input)) return input.map((item) => toSnakeCaseKeys(item));
  if (!input || typeof input !== 'object') return input;

  return Object.entries(input).reduce((acc, [key, value]) => {
    const snake = key.replace(/([A-Z])/g, '_$1').replace(/-/g, '_').toLowerCase();
    acc[snake] = toSnakeCaseKeys(value);
    return acc;
  }, {});
}

function validateRequiredFields(type, data) {
  const schema = ENTITY_SCHEMAS[type];
  if (!schema) return [`Unknown schema type: ${type}`];
  return schema.required.filter((field) => !(field in data)).map((field) => `${type}.${field} is required`);
}

function validateCoreTypes(type, data) {
  const errors = [];
  if ('id' in data && typeof data.id !== 'string') errors.push(`${type}.id must be string`);
  if ('workspace_id' in data && typeof data.workspace_id !== 'string') errors.push(`${type}.workspace_id must be string`);
  if ('created_at' in data && typeof data.created_at === 'string' && !ISO_DATE_REGEX.test(data.created_at)) errors.push(`${type}.created_at must be ISO timestamp`);
  if ('updated_at' in data && typeof data.updated_at === 'string' && !ISO_DATE_REGEX.test(data.updated_at)) errors.push(`${type}.updated_at must be ISO timestamp`);
  if (type === 'generation_job' && data.status && !ALLOWED_JOB_STATUS.has(data.status)) errors.push('generation_job.status invalid');
  if (type === 'validation_result' && data.level && !ALLOWED_VALIDATION_LEVEL.has(data.level)) errors.push('validation_result.level invalid');
  if (type === 'workflow' && typeof data.version !== 'number') errors.push('workflow.version must be number');
  return errors;
}

export function validateSchema(type, payload) {
  const normalized = toSnakeCaseKeys(payload);
  const errors = [...validateRequiredFields(type, normalized), ...validateCoreTypes(type, normalized)];
  return { ok: errors.length === 0, errors, normalized };
}

export const validateProject = (payload) => validateSchema('project', payload);
export const validateContextPack = (payload) => validateSchema('context_pack', payload);
export const validateWorkflow = (payload) => validateSchema('workflow', payload);
export const validatePhase = (payload) => validateSchema('phase', payload);
export const validateNode = (payload) => validateSchema('node', payload);
export const validateEdge = (payload) => validateSchema('edge', payload);
export const validateReviewGate = (payload) => validateSchema('review_gate', payload);
export const validateArtifactContract = (payload) => validateSchema('artifact_contract', payload);
export const validatePromptAsset = (payload) => validateSchema('prompt_asset', payload);
export const validateChecklistAsset = (payload) => validateSchema('checklist_asset', payload);
export const validateArtifactTemplate = (payload) => validateSchema('artifact_template', payload);
export const validateWorkflowDiff = (payload) => validateSchema('workflow_diff', payload);
export const validateDiffChange = (payload) => validateSchema('diff_change', payload);
export const validateValidationResult = (payload) => validateSchema('validation_result', payload);
export const validateExecutionKit = (payload) => validateSchema('execution_kit', payload);
export const validateWorkflowSnapshot = (payload) => validateSchema('workflow_snapshot', payload);
export const validateGenerationJob = (payload) => validateSchema('generation_job', payload);
export const validateModelCallLog = (payload) => validateSchema('model_call_log', payload);
export const validateTemplate = (payload) => validateSchema('template', payload);

export function validateAssets(assets) {
  const normalized = toSnakeCaseKeys(assets);
  const errors = [];
  if (!Array.isArray(normalized.prompts)) errors.push('assets.prompts must be array');
  if (!Array.isArray(normalized.checklists)) errors.push('assets.checklists must be array');
  if (!Array.isArray(normalized.artifact_templates)) errors.push('assets.artifact_templates must be array');

  (normalized.prompts || []).forEach((item, index) => {
    const result = validatePromptAsset(item);
    errors.push(...result.errors.map((err) => `assets.prompts[${index}]: ${err}`));
  });
  (normalized.checklists || []).forEach((item, index) => {
    const result = validateChecklistAsset(item);
    errors.push(...result.errors.map((err) => `assets.checklists[${index}]: ${err}`));
  });
  (normalized.artifact_templates || []).forEach((item, index) => {
    const result = validateArtifactTemplate(item);
    errors.push(...result.errors.map((err) => `assets.artifact_templates[${index}]: ${err}`));
  });

  return { ok: errors.length === 0, errors, normalized };
}

export function validateBoundaryMLProjectSpec(payload) {
  const normalized = toSnakeCaseKeys(payload);
  const errors = [];
  const warnings = [];
  const suggestions = [];

  const requiredTopLevel = ['boundaryml_version', 'project', 'context_pack', 'workflow', 'assets', 'validation', 'execution_kits'];
  requiredTopLevel.forEach((field) => {
    if (!(field in normalized)) errors.push(`spec.${field} is required`);
  });

  if (normalized.project) errors.push(...validateProject(normalized.project).errors.map((e) => `project: ${e}`));
  if (normalized.context_pack) errors.push(...validateContextPack(normalized.context_pack).errors.map((e) => `context_pack: ${e}`));

  if (normalized.workflow) {
    errors.push(...validateWorkflow(normalized.workflow).errors.map((e) => `workflow: ${e}`));
    (normalized.workflow.phases || []).forEach((phase, i) => errors.push(...validatePhase(phase).errors.map((e) => `workflow.phases[${i}]: ${e}`)));
    (normalized.workflow.nodes || []).forEach((node, i) => errors.push(...validateNode(node).errors.map((e) => `workflow.nodes[${i}]: ${e}`)));
    (normalized.workflow.edges || []).forEach((edge, i) => errors.push(...validateEdge(edge).errors.map((e) => `workflow.edges[${i}]: ${e}`)));
  }

  if (normalized.assets) {
    errors.push(...validateAssets(normalized.assets).errors);
    const outdatedPromptCount = (normalized.assets.prompts || []).filter((p) => p.status === 'outdated').length;
    if (outdatedPromptCount > 0) warnings.push(`assets contain ${outdatedPromptCount} outdated prompt(s)`);
  }

  if (!Array.isArray(normalized.validation)) {
    errors.push('validation must be array');
  } else {
    normalized.validation.forEach((item, i) => {
      const result = validateValidationResult(item);
      errors.push(...result.errors.map((e) => `validation[${i}]: ${e}`));
    });
    if (!normalized.validation.some((item) => item.level === 'warning')) {
      suggestions.push('validation should include at least one warning in MVP example');
    }
  }

  if (!Array.isArray(normalized.execution_kits)) {
    errors.push('execution_kits must be array');
  } else {
    normalized.execution_kits.forEach((item, i) => {
      const result = validateExecutionKit(item);
      errors.push(...result.errors.map((e) => `execution_kits[${i}]: ${e}`));
    });
    if (normalized.execution_kits.length === 0) warnings.push('execution_kits is empty (allowed for draft example)');
  }

  suggestions.push('Use server-side boundary rules to recompute validation before final export');

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    suggestions,
    normalized,
  };
}
