export const AGENT_EXECUTION_LEVELS = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];

export const AGENT_EXECUTION_TARGETS = [
  'codex',
  'claude_code',
  'cursor',
  'hermes',
  'openclaw',
  'github_issue',
  'manual_handoff',
];

export const AGENT_EXECUTION_TARGET_LABELS = {
  codex: 'Codex',
  claude_code: 'Claude Code',
  cursor: 'Cursor',
  hermes: 'Hermes',
  openclaw: 'OpenClaw',
  github_issue: 'GitHub Issue',
  manual_handoff: 'Manual Handoff',
};

export const AGENT_DISPATCH_MODES = ['manual_confirmed', 'policy_gated', 'disabled'];
export const NETWORK_POLICIES = ['blocked', 'approved_only', 'restricted'];
export const PACKAGE_INSTALL_POLICIES = ['disabled', 'allow_lockfile_only', 'allow_approved'];
export const SECRET_POLICIES = ['no_secrets', 'approved_refs_only', 'production_forbidden'];
export const PROMOTION_GATE_TYPES = ['sandbox', 'test', 'review', 'staging', 'production'];
export const DEFAULT_EVIDENCE_ITEMS = ['diff', 'test_report', 'preview_url', 'risk_summary', 'cost_report', 'rollback_note'];

function snakeOrCamel(obj, snakeKey, camelKey, fallback = undefined) {
  if (!obj || typeof obj !== 'object') return fallback;
  if (obj[snakeKey] !== undefined) return obj[snakeKey];
  if (obj[camelKey] !== undefined) return obj[camelKey];
  return fallback;
}

function asList(value, fallback = []) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
  return [...fallback];
}

function boolValue(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

export function normalizeAgentExecutionLevel(value, fallback = 'L0') {
  const normalized = String(value || fallback).trim().toUpperCase();
  return AGENT_EXECUTION_LEVELS.includes(normalized) ? normalized : fallback;
}

export function agentExecutionLevelNumber(value) {
  return Number(normalizeAgentExecutionLevel(value).slice(1));
}

export function normalizeAgentExecutionTarget(value, fallback = 'manual_handoff') {
  const normalized = String(value || fallback).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return AGENT_EXECUTION_TARGETS.includes(normalized) ? normalized : fallback;
}

export function normalizeDispatchMode(value, fallback = 'disabled') {
  const normalized = String(value || fallback).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return AGENT_DISPATCH_MODES.includes(normalized) ? normalized : fallback;
}

export function normalizeNetworkPolicy(value, fallback = 'blocked') {
  const normalized = String(value || fallback).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return NETWORK_POLICIES.includes(normalized) ? normalized : fallback;
}

export function normalizePackageInstallPolicy(value, fallback = 'disabled') {
  const normalized = String(value || fallback).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return PACKAGE_INSTALL_POLICIES.includes(normalized) ? normalized : fallback;
}

export function normalizeSecretPolicy(value, fallback = 'production_forbidden') {
  const normalized = String(value || fallback).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return SECRET_POLICIES.includes(normalized) ? normalized : fallback;
}

export function normalizePromotionGateType(value, fallback = 'review') {
  const normalized = String(value || fallback).trim().toLowerCase().replace(/[\s-]+/g, '_');
  return PROMOTION_GATE_TYPES.includes(normalized) ? normalized : fallback;
}

export function nodeIdOf(node = {}) {
  return node.id || node.node_id || node.nodeId || '';
}

export function readAgentExecutionPlan(node = {}) {
  return node.agent_execution_plan || node.agentExecutionPlan || null;
}

export function readSandboxExecutionContract(node = {}) {
  return node.sandbox_execution_contract || node.sandboxExecutionContract || null;
}

export function readPromotionGate(node = {}) {
  return node.promotion_gate || node.promotionGate || null;
}

export function readExecutionEvidenceTemplate(node = {}) {
  return node.execution_evidence_template || node.executionEvidenceTemplate || null;
}

export function createDefaultAgentExecutionPlan(node = {}, overrides = {}) {
  const nodeId = snakeOrCamel(overrides, 'node_id', 'nodeId', nodeIdOf(node));
  const level = normalizeAgentExecutionLevel(snakeOrCamel(overrides, 'execution_level', 'executionLevel', 'L0'));
  const enabled = boolValue(snakeOrCamel(overrides, 'enabled', 'enabled', false), false);
  const target = normalizeAgentExecutionTarget(snakeOrCamel(overrides, 'execution_target', 'executionTarget', 'manual_handoff'));
  const dispatchMode = normalizeDispatchMode(snakeOrCamel(overrides, 'dispatch_mode', 'dispatchMode', enabled ? 'manual_confirmed' : 'disabled'));
  return {
    node_id: nodeId,
    enabled,
    execution_level: level,
    execution_target: target,
    dispatch_mode: dispatchMode,
    sandbox_execution_contract_id: snakeOrCamel(overrides, 'sandbox_execution_contract_id', 'sandboxExecutionContractId', null),
    status: snakeOrCamel(overrides, 'status', 'status', 'draft'),
    contract_version: numberValue(snakeOrCamel(overrides, 'contract_version', 'contractVersion', 0), 0),
  };
}

export function createDefaultSandboxExecutionContract(node = {}, overrides = {}) {
  const nodeId = snakeOrCamel(overrides, 'node_id', 'nodeId', nodeIdOf(node));
  const id = snakeOrCamel(overrides, 'id', 'id', `contract-${nodeId || 'node'}`);
  const repoScope = snakeOrCamel(overrides, 'repo_scope', 'repoScope', {});
  const runtimeScope = snakeOrCamel(overrides, 'runtime_scope', 'runtimeScope', {});
  const secretScope = snakeOrCamel(overrides, 'secret_scope', 'secretScope', {});
  const costBudget = snakeOrCamel(overrides, 'cost_budget', 'costBudget', {});
  const acceptanceTests = snakeOrCamel(overrides, 'acceptance_tests', 'acceptanceTests', {});
  const outputRequired = snakeOrCamel(overrides, 'output_required', 'outputRequired', {});
  const promotionPolicy = snakeOrCamel(overrides, 'promotion_policy', 'promotionPolicy', {});
  const failureHandling = snakeOrCamel(overrides, 'failure_handling', 'failureHandling', {});

  return {
    id,
    node_id: nodeId,
    version: numberValue(snakeOrCamel(overrides, 'version', 'version', 1), 1),
    execution_target: normalizeAgentExecutionTarget(snakeOrCamel(overrides, 'execution_target', 'executionTarget', 'codex'), 'codex'),
    repo_scope: {
      repository: snakeOrCamel(repoScope, 'repository', 'repository', ''),
      base_branch: snakeOrCamel(repoScope, 'base_branch', 'baseBranch', 'main'),
      working_branch: snakeOrCamel(repoScope, 'working_branch', 'workingBranch', nodeId ? `agent/${nodeId}` : 'agent/work'),
      allowed_paths: asList(snakeOrCamel(repoScope, 'allowed_paths', 'allowedPaths', [])),
      forbidden_paths: asList(snakeOrCamel(repoScope, 'forbidden_paths', 'forbiddenPaths', [])),
    },
    runtime_scope: {
      allowed_commands: asList(snakeOrCamel(runtimeScope, 'allowed_commands', 'allowedCommands', [])),
      network_policy: normalizeNetworkPolicy(snakeOrCamel(runtimeScope, 'network_policy', 'networkPolicy', 'blocked')),
      external_network_approved: boolValue(snakeOrCamel(runtimeScope, 'external_network_approved', 'externalNetworkApproved', false), false),
      package_install_policy: normalizePackageInstallPolicy(snakeOrCamel(runtimeScope, 'package_install_policy', 'packageInstallPolicy', 'disabled')),
      max_runtime_minutes: numberValue(snakeOrCamel(runtimeScope, 'max_runtime_minutes', 'maxRuntimeMinutes', 30), 30),
    },
    secret_scope: {
      policy: normalizeSecretPolicy(snakeOrCamel(secretScope, 'policy', 'policy', 'production_forbidden')),
      allowed_secret_refs: asList(snakeOrCamel(secretScope, 'allowed_secret_refs', 'allowedSecretRefs', [])),
    },
    cost_budget: {
      amount: numberValue(snakeOrCamel(costBudget, 'amount', 'amount', 0), 0),
      currency: snakeOrCamel(costBudget, 'currency', 'currency', 'USD'),
    },
    acceptance_tests: {
      required: asList(snakeOrCamel(acceptanceTests, 'required', 'required', [])),
      optional: asList(snakeOrCamel(acceptanceTests, 'optional', 'optional', [])),
    },
    output_required: {
      evidence: asList(snakeOrCamel(outputRequired, 'evidence', 'evidence', DEFAULT_EVIDENCE_ITEMS)),
    },
    review_gate: snakeOrCamel(overrides, 'review_gate', 'reviewGate', node.review_gate?.id || node.reviewGate?.id || null),
    promotion_policy: {
      promotion_gates: asList(snakeOrCamel(promotionPolicy, 'promotion_gates', 'promotionGates', ['sandbox', 'review'])),
      target_environment: snakeOrCamel(promotionPolicy, 'target_environment', 'targetEnvironment', 'sandbox'),
      human_approval_required: boolValue(snakeOrCamel(promotionPolicy, 'human_approval_required', 'humanApprovalRequired', true), true),
      agent_can_update_formal_workflow: boolValue(snakeOrCamel(promotionPolicy, 'agent_can_update_formal_workflow', 'agentCanUpdateFormalWorkflow', false), false),
      production_auto_deploy_allowed: boolValue(snakeOrCamel(promotionPolicy, 'production_auto_deploy_allowed', 'productionAutoDeployAllowed', false), false),
      block_on_forbidden_paths: boolValue(snakeOrCamel(promotionPolicy, 'block_on_forbidden_paths', 'blockOnForbiddenPaths', true), true),
    },
    failure_handling: {
      on_failure: snakeOrCamel(failureHandling, 'on_failure', 'onFailure', 'stop_and_report'),
      rollback_required: boolValue(snakeOrCamel(failureHandling, 'rollback_required', 'rollbackRequired', true), true),
    },
    status: snakeOrCamel(overrides, 'status', 'status', 'draft'),
  };
}

export function createDefaultPromotionGate(node = {}, overrides = {}) {
  const nodeId = snakeOrCamel(overrides, 'node_id', 'nodeId', nodeIdOf(node));
  const gateType = normalizePromotionGateType(snakeOrCamel(overrides, 'gate_type', 'gateType', 'review'));
  return {
    id: snakeOrCamel(overrides, 'id', 'id', `promotion-${gateType}-${nodeId || 'node'}`),
    node_id: nodeId,
    gate_type: gateType,
    required_checks: asList(snakeOrCamel(overrides, 'required_checks', 'requiredChecks', gateType === 'production' ? ['human_approval', 'required_tests', 'rollback_plan'] : ['human_approval'])),
    human_approval_required: boolValue(snakeOrCamel(overrides, 'human_approval_required', 'humanApprovalRequired', true), true),
    agent_auto_promote_allowed: boolValue(snakeOrCamel(overrides, 'agent_auto_promote_allowed', 'agentAutoPromoteAllowed', false), false),
    status: snakeOrCamel(overrides, 'status', 'status', 'draft'),
  };
}

export function createDefaultExecutionEvidenceTemplate(node = {}, overrides = {}) {
  const nodeId = snakeOrCamel(overrides, 'node_id', 'nodeId', nodeIdOf(node));
  return {
    id: snakeOrCamel(overrides, 'id', 'id', `evidence-${nodeId || 'node'}`),
    node_id: nodeId,
    required_items: asList(snakeOrCamel(overrides, 'required_items', 'requiredItems', DEFAULT_EVIDENCE_ITEMS)),
    status: snakeOrCamel(overrides, 'status', 'status', 'draft'),
  };
}

export function normalizeAgenticNode(node = {}, overrides = {}) {
  const existingPlan = readAgentExecutionPlan(node);
  const existingContract = readSandboxExecutionContract(node);
  const existingGate = readPromotionGate(node);
  const existingEvidence = readExecutionEvidenceTemplate(node);
  const plan = createDefaultAgentExecutionPlan(node, { ...(existingPlan || {}), ...(overrides.agent_execution_plan || overrides.agentExecutionPlan || {}) });
  const contractOverride = overrides.sandbox_execution_contract || overrides.sandboxExecutionContract;
  const contract = existingContract || contractOverride
    ? createDefaultSandboxExecutionContract(node, { ...(existingContract || {}), ...(contractOverride || {}) })
    : null;
  if (contract && !plan.sandbox_execution_contract_id) plan.sandbox_execution_contract_id = contract.id;
  if (contract) plan.contract_version = contract.version || plan.contract_version || 1;

  const next = { ...node, agent_execution_plan: plan };
  if (contract) next.sandbox_execution_contract = contract;
  if (existingGate || overrides.promotion_gate || overrides.promotionGate) {
    next.promotion_gate = createDefaultPromotionGate(node, { ...(existingGate || {}), ...(overrides.promotion_gate || overrides.promotionGate || {}) });
  }
  if (existingEvidence || overrides.execution_evidence_template || overrides.executionEvidenceTemplate) {
    next.execution_evidence_template = createDefaultExecutionEvidenceTemplate(node, { ...(existingEvidence || {}), ...(overrides.execution_evidence_template || overrides.executionEvidenceTemplate || {}) });
  }
  return next;
}

export function deriveAgenticWorkflowObjects(workflow = {}) {
  const nodes = workflow.nodes || [];
  return {
    agent_execution_plans: nodes.map((node) => readAgentExecutionPlan(node)).filter(Boolean),
    sandbox_execution_contracts: nodes.map((node) => readSandboxExecutionContract(node)).filter(Boolean),
    promotion_gates: nodes.map((node) => readPromotionGate(node)).filter(Boolean),
    execution_evidence_templates: nodes.map((node) => readExecutionEvidenceTemplate(node)).filter(Boolean),
  };
}
