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
    asset_type: 'checklist',
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

export function generateChecklist(reviewGate, node, options = {}) {
  const gate = reviewGate || read(node, 'review_gate', 'reviewGate', {});
  const criteria = gate?.criteria || ['Validate quality and risk controls'];
  return {
    id: `checklist-${read(node, 'id', 'id')}`,
    nodeId: read(node, 'id', 'id'),
    phaseId: read(node, 'phase_id', 'phaseId'),
    name: `Checklist: ${read(node, 'name', 'name', 'Node')}`,
    status: read(node, 'checklist_status', 'checklistStatus', 'draft'),
    reviewerRole: gate?.reviewer_role || gate?.reviewerRole || read(node, 'human_owner_role', 'humanOwnerRole'),
    items: [
      `Confirm goal of ${read(node, 'name', 'name', 'Node')} is met`,
      ...criteria,
      `Verify pass condition: ${gate?.pass_condition || gate?.passCondition || 'manual approval required'}`,
    ],
    generated_from: buildGeneratedFrom(node, options),
    updatedAt: new Date().toISOString(),
  };
}
