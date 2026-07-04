import {
  AGENT_EXECUTION_TARGET_LABELS,
  deriveAgenticWorkflowObjects,
  readAgentExecutionPlan,
  readExecutionEvidenceTemplate,
  readPromotionGate,
  readSandboxExecutionContract,
} from '../../schema/src/agentic.js';

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

function nodeId(node) {
  return node.id || node.node_id;
}

function nodePhaseId(node) {
  return node.phaseId || node.phase_id;
}

function nodeOwner(node) {
  return node.humanOwnerRole || node.human_owner_role || 'n/a';
}

function nodeMode(node) {
  return node.executionMode || node.execution_mode || 'human_only';
}

function nodeRisk(node) {
  return node.riskLevel || node.risk_level || 'medium';
}

function contractVersion(contract) {
  return contract?.version || contract?.contract_version || contract?.contractVersion || 0;
}

function buildAgentTaskList(workflow) {
  return [
    '# Agent Task List',
    '',
    `Workflow version: ${workflow.version}`,
    '',
    ...(workflow.nodes || []).map((node, index) => {
      const plan = readAgentExecutionPlan(node);
      const contract = readSandboxExecutionContract(node);
      const target = plan?.execution_target || plan?.executionTarget || 'manual_handoff';
      const enabled = plan?.enabled === true ? 'enabled' : 'disabled';
      return [
        `## ${index + 1}. ${node.name}`,
        '',
        `- Node ID: ${nodeId(node)}`,
        `- Workflow version: ${workflow.version}`,
        `- Agent: ${enabled} ${plan?.execution_level || plan?.executionLevel || 'L0'} via ${AGENT_EXECUTION_TARGET_LABELS[target] || target}`,
        `- Contract: ${contract?.id || 'none'} v${contractVersion(contract)}`,
        `- Owner: ${nodeOwner(node)}`,
        `- Required inputs: ${(node.inputs || []).join(', ') || 'none'}`,
        `- Required outputs: ${(node.outputs || []).join(', ') || 'none'}`,
        `- Acceptance tests: ${contract?.acceptance_tests?.required?.join(', ') || 'not declared'}`,
        `- Evidence: ${readExecutionEvidenceTemplate(node)?.required_items?.join(', ') || contract?.output_required?.evidence?.join(', ') || 'not declared'}`,
      ].join('\n');
    }),
  ].join('\n');
}

function buildEvidenceTemplatesMarkdown(workflow) {
  const templates = (workflow.nodes || []).map((node) => ({ node, template: readExecutionEvidenceTemplate(node), contract: readSandboxExecutionContract(node) }))
    .filter(({ template, contract }) => template || contract);
  if (!templates.length) return '# Execution Evidence Templates\n\nNo Agent evidence templates are declared.';
  return [
    '# Execution Evidence Templates',
    '',
    ...templates.map(({ node, template, contract }) => [
      `## ${node.name}`,
      '',
      `- Node ID: ${nodeId(node)}`,
      `- Workflow version: ${workflow.version}`,
      `- Contract version: ${contractVersion(contract)}`,
      `- Required evidence: ${(template?.required_items || contract?.output_required?.evidence || []).join(', ') || 'none'}`,
    ].join('\n')),
  ].join('\n');
}

function buildBoundaryRulesReport(validationResults) {
  return [
    '# Boundary Rules Report',
    '',
    ...(validationResults || []).map((item) => [
      `## ${item.level || 'suggestion'}: ${item.title || item.id}`,
      '',
      `- Rule ID: ${item.id}`,
      `- Target: ${item.targetType || item.target_type || 'workflow'}:${item.targetId || item.target_id || ''}`,
      `- Blocking final: ${item.blockingFinal || item.blocking_final ? 'yes' : 'no'}`,
      `- Message: ${item.message || ''}`,
      item.suggestedAction || item.suggested_action ? `- Suggested action: ${item.suggestedAction || item.suggested_action}` : '',
    ].filter(Boolean).join('\n')),
  ].join('\n');
}

function buildWorkflowSpec(workflow) {
  const agenticObjects = deriveAgenticWorkflowObjects(workflow);
  return {
    workflow_version: workflow.version,
    status: workflow.status,
    agentic_development: {
      agent_execution_plans: agenticObjects.agent_execution_plans.length,
      sandbox_execution_contracts: agenticObjects.sandbox_execution_contracts.length,
      promotion_gates: agenticObjects.promotion_gates.length,
      execution_evidence_templates: agenticObjects.execution_evidence_templates.length,
    },
    phases: workflow.phases.map((phase) => ({ id: phase.id, name: phase.name, status: phase.status || 'draft' })),
    nodes: workflow.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      phase_id: node.phaseId || node.phase_id,
      execution_mode: node.executionMode || node.execution_mode,
      risk_level: node.riskLevel || node.risk_level,
      human_owner_role: node.humanOwnerRole || node.human_owner_role,
      review_gate: node.reviewGate?.name || node.review_gate?.name || null,
      agent_execution_plan: readAgentExecutionPlan(node),
      sandbox_execution_contract_id: readSandboxExecutionContract(node)?.id || null,
      promotion_gate_id: readPromotionGate(node)?.id || null,
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
  const agenticObjects = deriveAgenticWorkflowObjects(workflow);
  const taskList = buildAgentTaskList(workflow);
  const promptPack = (assets.prompts || []).map((prompt) => `## ${prompt.name}\n\nStatus: ${prompt.status || 'draft'}\n\n${prompt.content || ''}`).join('\n\n');
  const reviewChecklist = (assets.checklists || []).map((item) => `## ${item.name}\nReviewer: ${item.reviewerRole || item.reviewer_role || 'n/a'}\n${lines(item.items || [])}`).join('\n\n');
  const artifactTemplates = getArtifactTemplates(assets).map((item) => `## ${item.name}\n\nFormat: ${item.format || 'markdown'}\n\n${item.content || ''}`).join('\n\n');
  const responsibilityMap = workflow.nodes.map((node) => `- ${node.name}: ${nodeOwner(node)} (${nodeMode(node)})`).join('\n');
  const riskReport = [
    `# Risk Report`,
    `Errors: ${summary.errors}`,
    `Warnings: ${summary.warnings}`,
    `Blocking Final: ${summary.blocking_final}`,
    '',
    ...workflow.nodes.filter((node) => nodeRisk(node) === 'high').map((node) => `- ${node.name}: gate=${node.reviewGate?.name || node.review_gate?.name || 'missing'}`),
  ].join('\n');
  const workflowSnapshot = {
    workflow_id: workflow.id,
    workflow_version: workflow.version,
    captured_at: new Date().toISOString(),
    workflow,
    agentic_development: agenticObjects,
  };

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
      'workflow_snapshot.json': JSON.stringify(workflowSnapshot, null, 2),
      'agent_task_list.md': taskList,
      'sandbox_execution_contracts.yaml': toYaml(agenticObjects.sandbox_execution_contracts),
      'promotion_gates.yaml': toYaml(agenticObjects.promotion_gates),
      'execution_evidence_templates.md': buildEvidenceTemplatesMarkdown(workflow),
      'prompt_pack.md': promptPack,
      'review_checklists.md': reviewChecklist,
      'artifact_templates.md': artifactTemplates,
      'responsibility_map.md': responsibilityMap,
      'risk_report.md': riskReport,
      'boundary_rules_report.md': buildBoundaryRulesReport(validationResults || []),
    },
  };
}
