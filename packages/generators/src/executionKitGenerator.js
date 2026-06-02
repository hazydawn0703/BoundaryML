function lines(items = []) {
  return items.map((item) => `- ${item}`).join('\n');
}

function yamlScalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(String(value));
}

function toYaml(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return '[]';
    return value.map((item) => {
      if (item && typeof item === 'object') {
        const nested = toYaml(item, indent + 2);
        return `${pad}- ${nested.startsWith(' ') ? `\n${nested}` : nested}`;
      }
      return `${pad}- ${yamlScalar(item)}`;
    }).join('\n');
  }
  if (value && typeof value === 'object') {
    return Object.entries(value).map(([key, item]) => {
      if (Array.isArray(item) || (item && typeof item === 'object')) {
        return `${pad}${key}:\n${toYaml(item, indent + 2)}`;
      }
      return `${pad}${key}: ${yamlScalar(item)}`;
    }).join('\n');
  }
  return `${pad}${yamlScalar(value)}`;
}

function getArtifactTemplates(assets) {
  return assets.artifactTemplates || assets.artifact_templates || [];
}

function validationSummary(validationResults) {
  const errors = validationResults.filter((item) => item.level === 'error');
  const warnings = validationResults.filter((item) => item.level === 'warning');
  const suggestions = validationResults.filter((item) => item.level === 'suggestion');
  const blocking = errors.filter((item) => item.blockingFinal);
  return { errors: errors.length, warnings: warnings.length, suggestions: suggestions.length, blocking_final: blocking.length };
}

function buildWorkflowSpec(workflow) {
  return {
    workflow_version: workflow.version,
    status: workflow.status,
    phases: workflow.phases.map((phase) => ({ id: phase.id, name: phase.name, status: phase.status || 'draft' })),
    nodes: workflow.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      phase_id: node.phaseId || node.phase_id,
      execution_mode: node.executionMode || node.execution_mode,
      risk_level: node.riskLevel || node.risk_level,
      human_owner_role: node.humanOwnerRole || node.human_owner_role,
      review_gate: node.reviewGate?.name || node.review_gate?.name || null,
      inputs: node.inputs || [],
      outputs: node.outputs || [],
    })),
    edges: (workflow.edges || []).map((edge) => ({
      id: edge.id,
      from_node_id: edge.from || edge.from_node_id,
      to_node_id: edge.to || edge.to_node_id,
      dependency_type: edge.dependency_type || edge.dependencyType || 'sequential_dependency',
      required_outputs: edge.required_outputs || [],
      gate_id: edge.gate_id || null,
    })),
  };
}

export function generateExecutionKit(workflow, assets, validationResults, options = {}) {
  const summary = validationSummary(validationResults || []);
  const kitType = options.kit_type || options.kitType || 'draft';
  const hasBlockingError = summary.blocking_final > 0;
  const workflowSpec = buildWorkflowSpec(workflow);
  const taskList = workflow.nodes.map((node, index) => `${index + 1}. ${node.name} (${node.humanOwnerRole || node.human_owner_role})`).join('\n');
  const promptPack = (assets.prompts || []).map((prompt) => `## ${prompt.name}\n\nStatus: ${prompt.status || 'draft'}\n\n${prompt.content || ''}`).join('\n\n');
  const reviewChecklist = (assets.checklists || []).map((item) => `## ${item.name}\nReviewer: ${item.reviewerRole || item.reviewer_role || 'n/a'}\n${lines(item.items || [])}`).join('\n\n');
  const artifactTemplates = getArtifactTemplates(assets).map((item) => `## ${item.name}\n\nFormat: ${item.format || 'markdown'}\n\n${item.content || ''}`).join('\n\n');
  const responsibilityMap = workflow.nodes.map((node) => `- ${node.name}: ${node.humanOwnerRole || node.human_owner_role} (${node.executionMode || node.execution_mode})`).join('\n');
  const riskReport = [
    `# Risk Report`,
    `Errors: ${summary.errors}`,
    `Warnings: ${summary.warnings}`,
    `Blocking Final: ${summary.blocking_final}`,
    '',
    ...workflow.nodes.filter((node) => (node.riskLevel || node.risk_level) === 'high').map((node) => `- ${node.name}: gate=${node.reviewGate?.name || node.review_gate?.name || 'missing'}`),
  ].join('\n');

  return {
    id: `kit-${Date.now()}`,
    kit_type: kitType,
    status: hasBlockingError ? 'draft_only' : (kitType === 'final' ? 'final_ready' : 'draft_ready'),
    canExportFinal: !hasBlockingError,
    generatedAt: new Date().toISOString(),
    snapshotVersion: workflow.version,
    workflow_snapshot_version: workflow.version,
    blockingErrors: summary.blocking_final,
    validation_summary: summary,
    files: {
      'workflow_spec.yaml': toYaml(workflowSpec),
      'task_list.md': taskList,
      'prompt_pack.md': promptPack,
      'review_checklists.md': reviewChecklist,
      'artifact_templates.md': artifactTemplates,
      'responsibility_map.md': responsibilityMap,
      'risk_report.md': riskReport,
    },
  };
}
