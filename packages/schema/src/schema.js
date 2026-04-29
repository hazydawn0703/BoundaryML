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
    required: ['id', 'workspace_id', 'created_by', 'project_id', 'job_type', 'status', 'created_at', 'updated_at'],
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

export function validateBoundaryMLProjectSpec(payload) {
  const normalized = toSnakeCaseKeys(payload);
  const errors = [];

  const requiredTopLevel = [
    'boundaryml_version',
    'project',
    'context_pack',
    'workflow',
    'assets',
    'validation',
    'execution_kits',
  ];

  requiredTopLevel.forEach((field) => {
    if (!(field in normalized)) errors.push(`spec.${field} is required`);
  });

  if (normalized.project) {
    const projectResult = validateProject(normalized.project);
    errors.push(...projectResult.errors.map((item) => `project: ${item}`));
  }

  if (normalized.context_pack) {
    const contextResult = validateContextPack(normalized.context_pack);
    errors.push(...contextResult.errors.map((item) => `context_pack: ${item}`));
  }

  if (normalized.workflow) {
    const workflowResult = validateWorkflow(normalized.workflow);
    errors.push(...workflowResult.errors.map((item) => `workflow: ${item}`));

    if (!Array.isArray(normalized.workflow.phases)) {
      errors.push('workflow.phases must be array');
    } else {
      normalized.workflow.phases.forEach((phase, index) => {
        const phaseResult = validatePhase(phase);
        errors.push(...phaseResult.errors.map((item) => `workflow.phases[${index}]: ${item}`));
      });
    }

    if (!Array.isArray(normalized.workflow.nodes)) {
      errors.push('workflow.nodes must be array');
    } else {
      normalized.workflow.nodes.forEach((node, index) => {
        const nodeResult = validateNode(node);
        errors.push(...nodeResult.errors.map((item) => `workflow.nodes[${index}]: ${item}`));
      });
    }

    if (!Array.isArray(normalized.workflow.edges)) {
      errors.push('workflow.edges must be array');
    } else {
      normalized.workflow.edges.forEach((edge, index) => {
        const edgeResult = validateEdge(edge);
        errors.push(...edgeResult.errors.map((item) => `workflow.edges[${index}]: ${item}`));
      });
    }
  }

  if (!normalized.assets || typeof normalized.assets !== 'object') {
    errors.push('assets must be object');
  } else {
    if (!Array.isArray(normalized.assets.prompts)) errors.push('assets.prompts must be array');
    if (!Array.isArray(normalized.assets.checklists)) errors.push('assets.checklists must be array');
    if (!Array.isArray(normalized.assets.artifact_templates)) errors.push('assets.artifact_templates must be array');

    (normalized.assets.prompts || []).forEach((prompt, index) => {
      const promptResult = validatePromptAsset(prompt);
      errors.push(...promptResult.errors.map((item) => `assets.prompts[${index}]: ${item}`));
    });

    (normalized.assets.checklists || []).forEach((checklist, index) => {
      const checklistResult = validateChecklistAsset(checklist);
      errors.push(...checklistResult.errors.map((item) => `assets.checklists[${index}]: ${item}`));
    });
  }

  if (!Array.isArray(normalized.validation)) errors.push('validation must be array');
  if (!Array.isArray(normalized.execution_kits)) errors.push('execution_kits must be array');

  (normalized.execution_kits || []).forEach((kit, index) => {
    const kitResult = validateExecutionKit(kit);
    errors.push(...kitResult.errors.map((item) => `execution_kits[${index}]: ${item}`));
  });

  return {
    ok: errors.length === 0,
    errors,
    normalized,
  };
}
