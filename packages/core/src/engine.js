import { toSnakeCaseKeys } from '../../schema/src/schema.js';
import { validateWorkflow } from '../../rules/src/validationEngine.js';

export function incrementWorkflowVersion(workflow, changeSource = 'system') {
  return {
    ...workflow,
    version: (workflow.version || 0) + 1,
    updated_at: new Date().toISOString(),
    last_change_source: changeSource,
  };
}

export function createWorkflowSnapshot(project, contextPack, workflow, assets, validationResults) {
  return {
    id: `snapshot-${workflow.id}-v${workflow.version}`,
    workspace_id: project.workspace_id,
    project_id: project.id,
    context_pack: structuredClone(contextPack),
    workflow_snapshot_version: workflow.version,
    captured_at: new Date().toISOString(),
    workflow: structuredClone(workflow),
    assets: structuredClone(assets),
    validation: structuredClone(validationResults),
  };
}

export function markAffectedAssetsOutdated(changeSet, assets) {
  const affectedNodeIds = changeSet
    .filter((change) => change.target_type === 'node' || change.targetType === 'node')
    .map((change) => change.target_id || change.targetId);
  const markOutdated = (asset) => {
    if (!affectedNodeIds.includes(asset.node_id || asset.nodeId)) return asset;
    return {
      ...asset,
      status: 'outdated',
      outdated_reason: 'Node contract changed',
      outdatedReason: asset.outdatedReason || 'Node contract changed',
      generated_from: {
        ...(asset.generated_from || asset.generatedFrom || {}),
        stale: true,
        stale_reason: 'Node contract changed',
        stale_since_workflow_version: changeSet.find((change) => change.workflow_version || change.workflowVersion)?.workflow_version
          || changeSet.find((change) => change.workflow_version || change.workflowVersion)?.workflowVersion
          || null,
      },
    };
  };

  const artifactTemplates = (assets.artifact_templates || assets.artifactTemplates || []).map(markOutdated);
  return {
    ...assets,
    prompts: (assets.prompts || []).map(markOutdated),
    checklists: (assets.checklists || []).map(markOutdated),
    artifact_templates: artifactTemplates,
    artifactTemplates,
  };
}

export function applyWorkflowPatch(workflow, patch) {
  const merged = {
    ...workflow,
    ...patch,
  };
  return incrementWorkflowVersion(merged, 'workflow_patch');
}

export function applyDiff(workflow, diff, selectedChangeIds = []) {
  const selected = (diff.changes || []).filter((change) => selectedChangeIds.length === 0 || selectedChangeIds.includes(change.id));
  const next = structuredClone(workflow);
  const readTargetType = (change) => change.target_type || change.targetType;
  const readTargetId = (change) => change.target_id || change.targetId;
  const readField = (change) => change.field;
  const readId = (value) => value?.id || value?.phase_id || value?.node_id || value?.edge_id;
  const sameId = (value, id) => value?.id === id || value?.phase_id === id || value?.node_id === id || value?.edge_id === id;
  const normalizeNodeField = (field) => ({
    phaseId: 'phase_id',
    executionMode: 'execution_mode',
    riskLevel: 'risk_level',
    humanOwnerRole: 'human_owner_role',
    aiRole: 'ai_role',
    artifactContract: 'artifact_contract',
    reviewGate: 'review_gate',
    agentExecutionPlan: 'agent_execution_plan',
    sandboxExecutionContract: 'sandbox_execution_contract',
    promotionGate: 'promotion_gate',
    executionEvidenceTemplate: 'execution_evidence_template',
    promptStatus: 'prompt_status',
    checklistStatus: 'checklist_status',
  }[field] || field);
  const normalizeEdgeField = (field) => ({
    dependencyType: 'dependency_type',
    requiredOutputs: 'required_outputs',
    gateId: 'gate_id',
  }[field] || field);
  const removeNodeEdges = (nodeId) => {
    next.edges = (next.edges || []).filter((edge) => edge.from !== nodeId && edge.to !== nodeId);
  };

  selected.forEach((change) => {
    const targetType = readTargetType(change);
    const field = readField(change);
    const targetId = readTargetId(change);

    if (targetType === 'phase') {
      const phase = (next.phases || []).find((item) => sameId(item, targetId));
      if (change.type === 'deleted') {
        const hasNodes = (next.nodes || []).some((node) => (node.phase_id || node.phaseId) === targetId);
        if (!hasNodes) next.phases = (next.phases || []).filter((item) => !sameId(item, targetId));
        return;
      }
      if ((change.type === 'added' || field === 'phase') && change.after) {
        if (!phase) next.phases = [...(next.phases || []), change.after];
        return;
      }
      if (phase && field && change.after !== undefined) phase[field] = change.after;
    }

    if (targetType === 'node') {
      const nodeId = targetId;
      const node = (next.nodes || []).find((item) => item.id === nodeId || item.node_id === nodeId);
      if (change.type === 'deleted') {
        next.nodes = (next.nodes || []).filter((item) => !sameId(item, nodeId));
        removeNodeEdges(nodeId);
        return;
      }
      if (!node && (field === 'node' || change.type === 'added') && change.after) {
        next.nodes = [...(next.nodes || []), change.after];
        return;
      }
      if (node && field && (change.after !== undefined)) {
        node[normalizeNodeField(field)] = change.after;
        node.history = [...(node.history || []), { at: new Date().toISOString(), action: `Diff applied: ${change.reason || field}` }];
      }
    }

    if (targetType === 'edge') {
      const edge = (next.edges || []).find((item) => sameId(item, targetId));
      if (change.type === 'deleted') {
        next.edges = (next.edges || []).filter((item) => !sameId(item, targetId));
        return;
      }
      if ((change.type === 'added' || field === 'edge') && change.after) {
        if (!edge) next.edges = [...(next.edges || []), change.after];
        return;
      }
      if (edge && field && change.after !== undefined) {
        edge[normalizeEdgeField(field)] = change.after;
      }
    }
  });

  return incrementWorkflowVersion(next, 'diff_apply');
}

export function createWorkflowFromTemplate(project, contextPack, template) {
  const workflow = structuredClone(template.workflow || template);
  workflow.workspace_id = project.workspace_id;
  workflow.project_id = project.id;
  workflow.template_id = template.id || 'template-default';
  workflow.context_pack_version = contextPack?.version || 1;
  workflow.version = workflow.version || 1;
  workflow.updated_at = workflow.updated_at || new Date().toISOString();
  return workflow;
}

export function normalizeWorkflowSpec(raw) {
  const normalized = toSnakeCaseKeys(raw);
  normalized.workflow = normalized.workflow || {};
  normalized.workflow.phases = normalized.workflow.phases || [];
  normalized.workflow.nodes = normalized.workflow.nodes || [];
  normalized.workflow.edges = normalized.workflow.edges || [];
  return normalized;
}

export function calculateWorkflowValidationStatus(validationResults) {
  if (validationResults.some((item) => item.level === 'error' && item.blockingFinal)) return 'draft';
  if (validationResults.some((item) => item.level === 'warning')) return 'reviewed';
  if (validationResults.some((item) => item.level === 'suggestion')) return 'validated';
  return 'draft';
}

export function validateAndNormalizeSpec(rawSpec, assets) {
  const normalized = normalizeWorkflowSpec(rawSpec);
  const validation = validateWorkflow(normalized.workflow, assets || normalized.assets || { prompts: [], checklists: [] });
  return {
    normalized,
    validation,
    workflow_status: calculateWorkflowValidationStatus(validation),
  };
}
