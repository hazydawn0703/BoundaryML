import { EXECUTION_MODES } from '../../schema/src/constants.js';

function read(node, snakeKey, camelKey, fallback = undefined) {
  return node?.[snakeKey] ?? node?.[camelKey] ?? fallback;
}

function buildGeneratedFrom(node, options = {}) {
  const workflow = options.workflow || {};
  const contextPack = options.contextPack || options.context_pack || {};
  const plan = read(node, 'agent_execution_plan', 'agentExecutionPlan', {});
  const contract = read(node, 'sandbox_execution_contract', 'sandboxExecutionContract', {});
  return {
    type: 'node_contract',
    asset_type: 'prompt',
    node_id: read(node, 'id', 'id'),
    phase_id: read(node, 'phase_id', 'phaseId', null),
    workflow_id: workflow.id || read(node, 'workflow_id', 'workflowId', null),
    workflow_version: workflow.version ?? read(node, 'workflow_version', 'workflowVersion', null),
    context_pack_version: contextPack.version ?? read(node, 'context_pack_version', 'contextPackVersion', null),
    sandbox_execution_contract_id: contract.id || plan.sandbox_execution_contract_id || plan.sandboxExecutionContractId || null,
    contract_version: contract.version || plan.contract_version || plan.contractVersion || 0,
    generated_at: new Date().toISOString(),
  };
}

export function generatePrompt(node, options = {}) {
  const executionMode = read(node, 'execution_mode', 'executionMode');
  if (!EXECUTION_MODES[executionMode]?.ai) return null;
  const artifactContract = read(node, 'artifact_contract', 'artifactContract', {});
  const inputs = read(node, 'inputs', 'inputs', []);
  const acceptanceCriteria = artifactContract.acceptance_criteria || artifactContract.acceptanceCriteria || ['Meets node contract'];
  const outputFormat = artifactContract.output_format || artifactContract.outputFormat || 'markdown';

  const markdown = `# Role\n${read(node, 'ai_role', 'aiRole', 'AI Assistant') || 'AI Assistant'}\n\n# Objective\n${read(node, 'goal', 'goal', '')}\n\n# Context Required\n${inputs.map((item) => `- ${item}`).join('\n')}\n\n# Input Materials\n- Context Pack\n- Upstream artifacts\n\n# Output Format\n${outputFormat || 'Structured markdown'}\n\n# Constraints\n- Follow boundary rules\n- Escalate ambiguity\n\n# Acceptance Criteria\n${acceptanceCriteria.map((item) => `- ${item}`).join('\n')}\n\n# Failure Handling\n- Report blockers\n- Request human review`;

  return {
    id: `prompt-${read(node, 'id', 'id')}`,
    nodeId: read(node, 'id', 'id'),
    phaseId: read(node, 'phase_id', 'phaseId'),
    name: `Prompt: ${read(node, 'name', 'name', 'Node')}`,
    model: options.model || options.modelName || 'mock-planning-model',
    status: read(node, 'prompt_status', 'promptStatus', 'draft'),
    outputFormat,
    acceptanceCriteria,
    generated_from: buildGeneratedFrom(node, options),
    content: markdown,
    updatedAt: new Date().toISOString(),
  };
}
