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

  return {
    ...assets,
    prompts: (assets.prompts || []).map((asset) => (
      affectedNodeIds.includes(asset.node_id || asset.nodeId)
        ? { ...asset, status: 'outdated', outdated_reason: 'Node contract changed' }
        : asset
    )),
    checklists: (assets.checklists || []).map((asset) => (
      affectedNodeIds.includes(asset.node_id || asset.nodeId)
        ? { ...asset, status: 'outdated', outdated_reason: 'Node contract changed' }
        : asset
    )),
    artifact_templates: assets.artifact_templates || assets.artifactTemplates || [],
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

  selected.forEach((change) => {
    const field = change.field;
    if ((change.target_type || change.targetType) === 'node') {
      const nodeId = change.target_id || change.targetId;
      const node = (next.nodes || []).find((item) => item.id === nodeId || item.node_id === nodeId);
      if (node && field && (change.after !== undefined)) {
        node[field] = change.after;
      }
      if (!node && field === 'node' && change.after) {
        next.nodes = [...(next.nodes || []), change.after];
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
