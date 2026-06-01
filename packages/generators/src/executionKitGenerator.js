function list(items = []) {
  return items.length ? items.map((item) => `- ${item}`).join('\n') : '- None specified';
}

function scalar(value) {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const text = String(value);
  if (!text) return '""';
  if (/[:#\n]|^[-{}[\],&*?!|>'"%@`]|\s$|^\s/.test(text)) return JSON.stringify(text);
  return text;
}

function toYaml(value, indent = 0) {
  const pad = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return value.map((item) => {
      if (item && typeof item === 'object') {
        return `${pad}- ${toYaml(item, indent + 2).trimStart()}`;
      }
      return `${pad}- ${scalar(item)}`;
    }).join('\n');
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    return entries.map(([key, item]) => {
      if (Array.isArray(item)) {
        return item.length ? `${pad}${key}:\n${toYaml(item, indent + 2)}` : `${pad}${key}: []`;
      }
      if (item && typeof item === 'object') {
        return `${pad}${key}:\n${toYaml(item, indent + 2)}`;
      }
      return `${pad}${key}: ${scalar(item)}`;
    }).join('\n');
  }
  return `${pad}${scalar(value)}`;
}

function phaseName(phaseById, phaseId) {
  return phaseById.get(phaseId)?.name || phaseId || 'Unassigned';
}

function nodePrompt(assets, nodeId) {
  return (assets.prompts || []).find((prompt) => prompt.nodeId === nodeId);
}

function nodeChecklist(assets, nodeId) {
  return (assets.checklists || []).find((checklist) => checklist.nodeId === nodeId);
}

function nodeArtifactTemplate(assets, nodeId) {
  return (assets.artifactTemplates || []).find((template) => template.nodeId === nodeId);
}

function suggestedHandoff(node) {
  if (node.executionMode === 'human_only') return 'Human owner only; do not hand off as an AI execution prompt.';
  if (node.executionMode === 'ai_execute_human_approval') return 'Codex / Claude Code / GitHub Copilot / Cursor task with required human approval before downstream work.';
  if (node.executionMode === 'ai_draft_human_review') return 'AI draft task followed by human review.';
  if (node.executionMode === 'human_lead_ai_assist') return 'Human-led task with AI assistance prompt.';
  return 'Review execution mode before handoff.';
}

function buildWorkflowSpec(workflow, assets, validationResults) {
  return {
    boundaryml_version: 'v0.1',
    kit_type: 'agent_ready_execution_kit',
    workflow: {
      id: workflow.id,
      version: workflow.version,
      status: workflow.status,
      phases: (workflow.phases || []).map((phase) => ({ id: phase.id, name: phase.name, order: phase.order })),
      nodes: (workflow.nodes || []).map((node) => ({
        id: node.id,
        name: node.name,
        phase_id: node.phaseId,
        execution_mode: node.executionMode,
        risk_level: node.riskLevel,
        status: node.status,
        human_owner_role: node.humanOwnerRole,
        ai_role: node.aiRole || null,
        inputs: node.inputs || [],
        outputs: node.outputs || [],
        artifact_contract: {
          id: node.artifactContract?.id,
          format: node.artifactContract?.format,
          output_format: node.artifactContract?.outputFormat,
          acceptance_criteria: node.artifactContract?.acceptanceCriteria || [],
        },
        review_gate: node.reviewGate ? {
          id: node.reviewGate.id,
          name: node.reviewGate.name,
          reviewer_role: node.reviewGate.reviewerRole,
          required: node.reviewGate.required,
          criteria: node.reviewGate.criteria || [],
        } : null,
      })),
      edges: (workflow.edges || []).map((edge) => ({ id: edge.id, from: edge.from, to: edge.to })),
    },
    validation: {
      blocking_errors: validationResults.filter((item) => item.level === 'error' && item.blockingFinal).length,
      results: validationResults.map((item) => ({ id: item.id, level: item.level, message: item.message })),
    },
    assets: {
      prompts: (assets.prompts || []).map((prompt) => ({ id: prompt.id, node_id: prompt.nodeId, status: prompt.status })),
      checklists: (assets.checklists || []).map((checklist) => ({ id: checklist.id, node_id: checklist.nodeId, reviewer_role: checklist.reviewerRole })),
      artifact_templates: (assets.artifactTemplates || []).map((template) => ({ id: template.id, node_id: template.nodeId, status: template.status })),
    },
  };
}

function buildAgentTaskList(workflow, assets) {
  const phaseById = new Map((workflow.phases || []).map((phase) => [phase.id, phase]));
  const sections = [
    '# Agent Task List',
    '',
    'BoundaryML prepares this task list before agents execute. It does not run Codex / Claude Code / GitHub Copilot / Cursor and does not replace Jira / Linear.',
  ];

  (workflow.nodes || []).forEach((node, index) => {
    const prompt = nodePrompt(assets, node.id);
    sections.push(
      '',
      `## ${index + 1}. ${node.name}`,
      '',
      `- Phase: ${phaseName(phaseById, node.phaseId)}`,
      `- Execution Mode: ${node.executionMode}`,
      `- Risk Level: ${node.riskLevel}`,
      `- Human Owner: ${node.humanOwnerRole || 'Unassigned'}`,
      `- AI Role: ${node.aiRole || 'N/A'}`,
      `- Suggested Handoff: ${suggestedHandoff(node)}`,
      `- Related Prompt: ${prompt?.id || 'N/A'}`,
      `- Review Gate: ${node.reviewGate?.name || 'N/A'}`,
      '',
      '### Required Context',
      list(node.inputs || []),
      '',
      '### Output Contract',
      `- Format: ${node.artifactContract?.outputFormat || 'Not specified'}`,
      list(node.outputs || []),
      '',
      '### Acceptance Criteria',
      list(node.artifactContract?.acceptanceCriteria || []),
    );
  });

  return sections.join('\n');
}

function buildPromptPack(workflow, assets) {
  const phaseById = new Map((workflow.phases || []).map((phase) => [phase.id, phase]));
  const prompts = assets.prompts || [];
  const sections = ['# Prompt Pack', '', 'Prompts are prepared for downstream AI coding agents. BoundaryML does not execute these prompts itself.'];

  prompts.forEach((prompt) => {
    const node = (workflow.nodes || []).find((item) => item.id === prompt.nodeId);
    sections.push(
      '',
      `## ${prompt.name}`,
      '',
      `- Prompt ID: ${prompt.id}`,
      `- Node: ${node?.name || prompt.nodeId}`,
      `- Phase: ${phaseName(phaseById, prompt.phaseId || node?.phaseId)}`,
      `- Status: ${prompt.status || 'draft'}`,
      `- Model: ${prompt.model || 'N/A'}`,
      `- Output Format: ${prompt.outputFormat || node?.artifactContract?.outputFormat || 'Not specified'}`,
      '',
      prompt.content || '_No prompt content generated._',
    );
  });

  return sections.join('\n');
}

function buildReviewChecklists(workflow, assets) {
  const sections = ['# Review Checklists', '', 'Review gates help humans approve outputs before downstream execution.'];
  (assets.checklists || []).forEach((checklist) => {
    const node = (workflow.nodes || []).find((item) => item.id === checklist.nodeId);
    sections.push(
      '',
      `## ${checklist.name}`,
      '',
      `- Checklist ID: ${checklist.id}`,
      `- Node: ${node?.name || checklist.nodeId}`,
      `- Reviewer Role: ${checklist.reviewerRole || node?.reviewGate?.reviewerRole || 'Unassigned'}`,
      `- Review Gate: ${node?.reviewGate?.name || 'N/A'}`,
      `- Required: ${node?.reviewGate?.required === false ? 'No' : 'Yes'}`,
      '',
      '### Criteria',
      (checklist.items || []).map((item) => `- [ ] ${item}`).join('\n') || '- [ ] Manual review required',
      '',
      `### Pass Condition\n${node?.reviewGate?.passCondition || 'All required criteria are met.'}`,
      '',
      `### Reject Condition\n${node?.reviewGate?.rejectCondition || 'Any unresolved blocker prevents downstream execution.'}`,
    );
  });
  return sections.join('\n');
}

function buildArtifactTemplates(workflow, assets) {
  const sections = ['# Artifact Templates', '', 'Artifact templates define expected output contracts for handoff and review.'];
  (workflow.nodes || []).forEach((node) => {
    const template = nodeArtifactTemplate(assets, node.id);
    sections.push(
      '',
      `## ${template?.name || `${node.name} Artifact Template`}`,
      '',
      `- Node: ${node.name}`,
      `- Format: ${node.artifactContract?.format || 'markdown'}`,
      `- Output Format: ${node.artifactContract?.outputFormat || 'Not specified'}`,
      '',
      '### Required Outputs',
      list(node.outputs || []),
      '',
      '### Acceptance Criteria',
      list(node.artifactContract?.acceptanceCriteria || []),
      '',
      template?.content || `# ${node.name}\n\n## Output\n${list(node.outputs || [])}`,
    );
  });
  return sections.join('\n');
}

function buildResponsibilityMap(workflow) {
  const byRole = new Map();
  const phaseById = new Map((workflow.phases || []).map((phase) => [phase.id, phase]));
  (workflow.nodes || []).forEach((node) => {
    const role = node.humanOwnerRole || 'Unassigned';
    if (!byRole.has(role)) byRole.set(role, []);
    byRole.get(role).push(node);
  });

  const sections = ['# Responsibility Map', '', 'BoundaryML defines responsibility before agents execute.'];
  sections.push('', '## By Role');
  byRole.forEach((nodes, role) => {
    sections.push('', `### ${role}`, ...nodes.map((node) => `- ${node.name} (${node.executionMode}, ${node.riskLevel})`));
  });

  sections.push('', '## By Phase');
  (workflow.phases || []).forEach((phase) => {
    const nodes = (workflow.nodes || []).filter((node) => node.phaseId === phase.id);
    sections.push('', `### ${phase.name}`, ...(nodes.length ? nodes.map((node) => `- ${node.name}: ${node.humanOwnerRole || 'Unassigned'}`) : ['- No nodes']));
  });

  sections.push('', '## By Execution Mode');
  const modes = new Map();
  (workflow.nodes || []).forEach((node) => {
    if (!modes.has(node.executionMode)) modes.set(node.executionMode, []);
    modes.get(node.executionMode).push(node);
  });
  modes.forEach((nodes, mode) => {
    sections.push('', `### ${mode}`, ...nodes.map((node) => `- ${node.name} (${phaseName(phaseById, node.phaseId)})`));
  });
  return sections.join('\n');
}

function buildRiskReport(workflow, validationResults) {
  const highRiskNodes = (workflow.nodes || []).filter((node) => node.riskLevel === 'high');
  const sections = ['# Risk Report', '', 'Risk gates prevent high-risk AI autonomy and require human approval where needed.'];
  sections.push('', '## High-Risk Nodes');
  if (highRiskNodes.length === 0) sections.push('- No high-risk nodes.');
  highRiskNodes.forEach((node) => {
    sections.push(
      '',
      `### ${node.name}`,
      `- Risk Level: ${node.riskLevel}`,
      `- Execution Mode: ${node.executionMode}`,
      `- Review Gate: ${node.reviewGate?.name || 'Missing'}`,
      `- Reviewer Role: ${node.reviewGate?.reviewerRole || 'Unassigned'}`,
      `- Suggested Mitigation: Require human review before downstream execution.`,
      `- Blocking Final: ${node.reviewGate?.required === false ? 'Yes' : 'No'}`,
    );
  });

  sections.push('', '## Validation Results');
  if (!validationResults.length) sections.push('- No validation issues.');
  validationResults.forEach((item) => {
    sections.push(`- [${item.level}] ${item.id}: ${item.message}`);
  });
  return sections.join('\n');
}

export function generateExecutionKit(workflow, assets = {}, validationResults = []) {
  const blockingErrors = validationResults.filter((item) => item.level === 'error' && item.blockingFinal);
  const hasBlockingError = blockingErrors.length > 0;
  const workflowSpec = buildWorkflowSpec(workflow, assets, validationResults);

  return {
    id: `kit-${Date.now()}`,
    status: hasBlockingError ? 'draft_only' : 'final_ready',
    canExportFinal: !hasBlockingError,
    generatedAt: new Date().toISOString(),
    snapshotVersion: workflow.version,
    blockingErrors: blockingErrors.length,
    files: {
      'workflow_spec.yaml': toYaml(workflowSpec),
      'agent_task_list.md': buildAgentTaskList(workflow, assets),
      'prompt_pack.md': buildPromptPack(workflow, assets),
      'review_checklists.md': buildReviewChecklists(workflow, assets),
      'artifact_templates.md': buildArtifactTemplates(workflow, assets),
      'responsibility_map.md': buildResponsibilityMap(workflow),
      'risk_report.md': buildRiskReport(workflow, validationResults),
    },
  };
}
