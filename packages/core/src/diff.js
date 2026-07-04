import { generatePrompt } from '../../generators/src/promptGenerator.js';
import {
  createDefaultAgentExecutionPlan,
  createDefaultExecutionEvidenceTemplate,
  createDefaultPromotionGate,
  createDefaultSandboxExecutionContract,
  normalizeAgenticNode,
  readAgentExecutionPlan,
  readExecutionEvidenceTemplate,
  readPromotionGate,
  readSandboxExecutionContract,
} from '../../schema/src/agentic.js';

function safeDiffId(value, fallback) {
  const id = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return id || fallback;
}

const NODE_FIELD_ALIASES = {
  phase: 'phaseId',
  phase_id: 'phaseId',
  phaseId: 'phaseId',
  mode: 'executionMode',
  execution_mode: 'executionMode',
  executionMode: 'executionMode',
  risk: 'riskLevel',
  risk_level: 'riskLevel',
  riskLevel: 'riskLevel',
  owner: 'humanOwnerRole',
  human_owner: 'humanOwnerRole',
  human_owner_role: 'humanOwnerRole',
  humanOwnerRole: 'humanOwnerRole',
  ai_role: 'aiRole',
  aiRole: 'aiRole',
  artifact_contract: 'artifactContract',
  artifactContract: 'artifactContract',
  review_gate: 'reviewGate',
  reviewGate: 'reviewGate',
  agent_execution_plan: 'agentExecutionPlan',
  agentExecutionPlan: 'agentExecutionPlan',
  sandbox_execution_contract: 'sandboxExecutionContract',
  sandboxExecutionContract: 'sandboxExecutionContract',
  promotion_gate: 'promotionGate',
  promotionGate: 'promotionGate',
  execution_evidence_template: 'executionEvidenceTemplate',
  executionEvidenceTemplate: 'executionEvidenceTemplate',
  prompt_status: 'promptStatus',
  promptStatus: 'promptStatus',
  checklist_status: 'checklistStatus',
  checklistStatus: 'checklistStatus',
};

const EDITABLE_NODE_FIELDS = [
  'name',
  'goal',
  'phaseId',
  'status',
  'riskLevel',
  'executionMode',
  'humanOwnerRole',
  'aiRole',
  'inputs',
  'outputs',
  'artifactContract',
  'reviewGate',
  'agentExecutionPlan',
  'sandboxExecutionContract',
  'promotionGate',
  'executionEvidenceTemplate',
  'promptStatus',
  'checklistStatus',
];

const PHASE_NAME_ALIASES = [
  ['Discovery', ['\u63a2\u7d22', '\u53d1\u73b0']],
  ['Product Design', ['\u4ea7\u54c1\u8bbe\u8ba1']],
  ['Technical Design', ['\u6280\u672f\u8bbe\u8ba1']],
  ['Development', ['\u5f00\u53d1']],
  ['Testing', ['\u6d4b\u8bd5']],
  ['Launch', ['\u53d1\u5e03', '\u4e0a\u7ebf']],
  ['Unassigned', ['\u672a\u5206\u914d']],
];

function normalizeNodeDiffField(field) {
  return NODE_FIELD_ALIASES[field] || field;
}

function readNodePhaseId(node) {
  return node?.phase_id || node?.phaseId || 'unassigned';
}

function readNodeMode(node) {
  return node?.execution_mode || node?.executionMode || 'human_only';
}

function readNodeRisk(node) {
  return node?.risk_level || node?.riskLevel || 'medium';
}

function readNodeOwner(node) {
  return node?.human_owner_role || node?.humanOwnerRole || 'Project Owner';
}

function readNodeAiRole(node) {
  return node?.ai_role || node?.aiRole || '';
}

function readNodeInputs(node) {
  return node?.inputs || [];
}

function readNodeOutputs(node) {
  return node?.outputs || [];
}

function readNodeReviewGate(node) {
  return node?.review_gate || node?.reviewGate || null;
}

function readNodeArtifactContract(node) {
  return node?.artifact_contract || node?.artifactContract || null;
}

function readNodeField(node, field) {
  const normalized = normalizeNodeDiffField(field);
  const readers = {
    phaseId: readNodePhaseId,
    executionMode: readNodeMode,
    riskLevel: readNodeRisk,
    humanOwnerRole: readNodeOwner,
    aiRole: readNodeAiRole,
    inputs: readNodeInputs,
    outputs: readNodeOutputs,
    reviewGate: readNodeReviewGate,
    artifactContract: readNodeArtifactContract,
    agentExecutionPlan: readAgentExecutionPlan,
    sandboxExecutionContract: readSandboxExecutionContract,
    promotionGate: readPromotionGate,
    executionEvidenceTemplate: readExecutionEvidenceTemplate,
    promptStatus: (item) => item?.prompt_status || item?.promptStatus,
    checklistStatus: (item) => item?.checklist_status || item?.checklistStatus,
  };
  return readers[normalized] ? readers[normalized](node) : node?.[normalized];
}

function readAssetNodeId(asset) {
  return asset?.node_id || asset?.nodeId || '';
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function lower(value) {
  return String(value || '').toLowerCase();
}

function includesAny(value, needles) {
  const haystack = lower(value);
  return needles.some((needle) => haystack.includes(lower(needle)));
}

function requestHasChinese(value) {
  return /[\u4e00-\u9fff]/.test(String(value || ''));
}

function edgeId(edge) {
  return edge?.id || `${edge?.from || 'from'}-${edge?.to || 'to'}`;
}

function edgeFrom(edge) {
  return edge?.from || edge?.from_node_id || edge?.fromNodeId;
}

function edgeTo(edge) {
  return edge?.to || edge?.to_node_id || edge?.toNodeId;
}

function phaseNameById(workflow, phaseId) {
  return (workflow.phases || []).find((phase) => phase.id === phaseId)?.name || phaseId || 'Unassigned';
}

function nodeById(workflow, nodeId) {
  return (workflow.nodes || []).find((node) => node.id === nodeId || node.node_id === nodeId);
}

function findMatchingNodes(request, workflow) {
  const normalizedRequest = lower(request);
  return (workflow.nodes || []).filter((node) => {
    const name = lower(node.name);
    return name && normalizedRequest.includes(name);
  });
}

function findMatchingPhases(request, workflow) {
  const normalizedRequest = lower(request);
  return (workflow.phases || []).filter((phase) => {
    const name = lower(phase.name);
    const aliases = PHASE_NAME_ALIASES.find(([source]) => lower(source) === name)?.[1] || [];
    return name && (normalizedRequest.includes(name) || aliases.some((alias) => normalizedRequest.includes(lower(alias))));
  });
}

function phaseMatchesToken(phase, token) {
  const normalizedToken = lower(token);
  const name = lower(phase?.name);
  const aliases = PHASE_NAME_ALIASES.find(([source]) => lower(source) === name)?.[1] || [];
  return Boolean(name && (normalizedToken.includes(name) || name.includes(normalizedToken) || aliases.some((alias) => normalizedToken.includes(lower(alias)) || lower(alias).includes(normalizedToken))));
}

function findPhaseFromAddNodeRequest(request, workflow) {
  const source = String(request || '');
  const chineseScoped = source.match(/(?:\u5728|\u5230|\u5411)\s*([^\s\uff0c\u3002,.;\uff1b\u201c\u201d"']+?)(?:\u9636\u6bb5|\u4e2d|\u91cc|\u5185)/);
  const englishScoped = source.match(/(?:in|inside|to|under)\s+([a-z0-9 _-]+?)(?:\s+phase|\s+lane|\s+stage|\s+add|\s+create|$)/i);
  const scoped = chineseScoped || englishScoped;
  const token = scoped?.[1]?.trim();
  if (token) {
    const phase = (workflow.phases || []).find((item) => phaseMatchesToken(item, token));
    if (phase) return phase;
  }
  return findMatchingPhases(request, workflow)[0] || null;
}

function extractRequestedPhaseName(userRequest) {
  const quoted = String(userRequest || '').match(/[\u201c\u201d"']([^"\u201c\u201d']+)[\u201c\u201d"']/);
  if (quoted?.[1]) return quoted[1].trim();
  const chinese = String(userRequest || '').match(/(?:\u65b0\u589e|\u6dfb\u52a0|\u589e\u52a0)(?:\u4e00\u4e2a|\u65b0\u7684|\u65b0)?\u9636\u6bb5\s*([^\s\uff0c\u3002,.;\uff1b]+)/);
  if (chinese?.[1]) return chinese[1].trim();
  const english = String(userRequest || '').match(/add (?:a |new )?phase (?:called |named )?([a-z0-9 _-]+)/i);
  if (english?.[1]) return english[1].trim();
  return '';
}

function extractQuotedName(userRequest) {
  const quoted = String(userRequest || '').match(/[\u201c\u201d"']([^"\u201c\u201d']+)[\u201c\u201d"']/);
  return quoted?.[1]?.trim() || '';
}

function compactNode(node, workflow) {
  const nodeId = node.id || node.node_id;
  const upstream = (workflow.edges || []).filter((edge) => edgeTo(edge) === nodeId).map((edge) => edgeFrom(edge));
  const downstream = (workflow.edges || []).filter((edge) => edgeFrom(edge) === nodeId).map((edge) => edgeTo(edge));
  return {
    id: nodeId,
    name: node.name,
    phase_id: readNodePhaseId(node),
    phase_name: phaseNameById(workflow, readNodePhaseId(node)),
    mode: readNodeMode(node),
    risk: readNodeRisk(node),
    status: node.status || 'draft',
    inputs: readNodeInputs(node),
    outputs: readNodeOutputs(node),
    upstream: unique(upstream),
    downstream: unique(downstream),
  };
}

export function buildWorkflowIndex(workflow) {
  const safeWorkflow = workflow || {};
  const nodes = safeWorkflow.nodes || [];
  const edges = safeWorkflow.edges || [];
  return {
    workflow_id: safeWorkflow.id || safeWorkflow.workflow_id || '',
    version: safeWorkflow.version || 1,
    phases: (safeWorkflow.phases || []).map((phase) => ({
      id: phase.id,
      name: phase.name,
      order: phase.order,
      node_ids: nodes.filter((node) => readNodePhaseId(node) === phase.id).map((node) => node.id || node.node_id),
    })),
    nodes: nodes.map((node) => compactNode(node, safeWorkflow)),
    edges: edges.map((edge) => ({
      id: edgeId(edge),
      from: edgeFrom(edge),
      to: edgeTo(edge),
      dependency_type: edge.dependency_type || edge.dependencyType || 'hard',
      required_outputs: edge.required_outputs || edge.requiredOutputs || [],
    })),
  };
}

export function normalizeContextPlan(rawPlan, workflowIndex) {
  const source = rawPlan?.context_plan || rawPlan?.plan || rawPlan;
  if (!source || typeof source !== 'object') return null;
  const validNodeIds = new Set((workflowIndex.nodes || []).map((node) => node.id));
  const validPhaseIds = new Set((workflowIndex.phases || []).map((phase) => phase.id));
  const targets = (source.targets || [])
    .map((target) => {
      const type = target.type || target.target_type;
      const id = target.id || target.target_id;
      if (type === 'node' && !validNodeIds.has(id)) return null;
      if (type === 'phase' && !validPhaseIds.has(id)) return null;
      return {
        type,
        id,
        name: target.name || '',
        match: target.match || 'model',
        required_context: target.required_context || 'node_with_neighbors',
      };
    })
    .filter(Boolean);
  const expansion = source.graph_expansion || source.graphExpansion || {};
  const operationScope = source.operation_scope || source.operationScope || [];
  return {
    intent: source.intent || 'workflow_edit',
    targets,
    graph_expansion: {
      upstream_depth: Math.max(0, Math.min(3, Number(expansion.upstream_depth ?? expansion.upstreamDepth ?? 1))),
      downstream_depth: Math.max(0, Math.min(3, Number(expansion.downstream_depth ?? expansion.downstreamDepth ?? 1))),
    },
    operation_scope: Array.isArray(operationScope) ? operationScope : [String(operationScope)],
    needed_fields: Array.isArray(source.needed_fields || source.neededFields) ? (source.needed_fields || source.neededFields) : [],
    confidence: source.confidence || 'model',
  };
}

export function generateWorkflowContextPlan(userRequest, workflowIndex) {
  const request = String(userRequest || '');
  const normalized = lower(request);
  const targets = [];
  const operationScope = [];

  for (const node of workflowIndex.nodes || []) {
    if (node.name && normalized.includes(lower(node.name))) {
      targets.push({ type: 'node', id: node.id, name: node.name, match: 'name', required_context: 'node_with_neighbors' });
    }
  }
  for (const phase of workflowIndex.phases || []) {
    if (phase.name && normalized.includes(lower(phase.name))) {
      targets.push({ type: 'phase', id: phase.id, name: phase.name, match: 'name', required_context: 'phase' });
    }
  }

  if (includesAny(request, ['add phase', '\u65b0\u589e\u9636\u6bb5', '\u6dfb\u52a0\u9636\u6bb5', '\u589e\u52a0\u9636\u6bb5'])) operationScope.push('add_phase');
  if (includesAny(request, ['rename phase', '\u91cd\u547d\u540d\u9636\u6bb5'])) operationScope.push('rename_phase');
  if (includesAny(request, ['delete phase', '\u5220\u9664\u9636\u6bb5'])) operationScope.push('delete_phase');
  if (includesAny(request, ['add node', 'add step', '\u6dfb\u52a0\u8282\u70b9', '\u589e\u52a0\u8282\u70b9', '\u65b0\u589e\u8282\u70b9', '\u4eba\u5de5\u786e\u8ba4'])) operationScope.push('add_node');
  if (includesAny(request, ['after', 'before', '\u540e\u9762', '\u4e4b\u540e', '\u524d\u9762', '\u4e4b\u524d'])) operationScope.push('add_edge');
  if (includesAny(request, [
    'update node',
    'change node',
    'modify node',
    'set node',
    'rename node',
    'goal',
    'status',
    'risk',
    'owner',
    'inputs',
    'outputs',
    'agent',
    'sandbox',
    'promotion',
    'production gate',
    'network',
    'forbidden paths',
    'allowed commands',
    'codex',
    'cursor',
    'github issue',
    '\u4fee\u6539',
    '\u66f4\u65b0',
    '\u8bbe\u7f6e',
    '\u6539\u4e3a',
    '\u6539\u6210',
    '\u76ee\u6807',
    '\u72b6\u6001',
    '\u98ce\u9669',
    '\u8d1f\u8d23\u4eba',
    '\u8f93\u5165',
    '\u8f93\u51fa',
    '\u667a\u80fd\u4f53',
    '\u6c99\u7bb1',
    '\u4e0a\u7ebf',
    '\u7981\u6b62\u8054\u7f51',
    '\u7981\u6b62\u8bbf\u95ee',
  ])) operationScope.push('update_node');
  if (includesAny(request, ['review gate', '\u5ba1\u6838\u95e8\u7981', '\u4eba\u5de5\u5ba1\u6838'])) operationScope.push('add_review_gate');
  if (includesAny(request, ['conservative', '\u4fdd\u5b88'])) operationScope.push('update_execution_mode');
  if (includesAny(request, ['prompt', '\u63d0\u793a\u8bcd'])) operationScope.push('generate_prompt');
  if (includesAny(request, ['high risk', '\u9ad8\u98ce\u9669'])) {
    (workflowIndex.nodes || []).filter((node) => node.risk === 'high').forEach((node) => {
      targets.push({ type: 'node', id: node.id, name: node.name, match: 'risk', required_context: 'node_with_neighbors' });
    });
  }

  return {
    intent: operationScope.length ? 'workflow_edit' : 'workflow_edit_infer',
    targets: unique(targets.map((target) => `${target.type}:${target.id}`)).map((key) => targets.find((target) => `${target.type}:${target.id}` === key)),
    graph_expansion: {
      upstream_depth: operationScope.includes('add_edge') || operationScope.includes('add_node') ? 1 : 0,
      downstream_depth: operationScope.includes('add_edge') || operationScope.includes('add_node') ? 2 : 1,
    },
    operation_scope: unique(operationScope),
    needed_fields: ['phases', 'nodes', 'edges', 'node_detail_fields', 'assets_for_target_nodes'],
    confidence: targets.length || operationScope.length ? 'deterministic' : 'fallback',
  };
}

function expandNodeIds(seedNodeIds, workflow, upstreamDepth, downstreamDepth) {
  const included = new Set(seedNodeIds);
  let frontier = new Set(seedNodeIds);
  for (let depth = 0; depth < upstreamDepth; depth += 1) {
    const next = new Set();
    for (const edge of workflow.edges || []) {
      if (frontier.has(edgeTo(edge))) next.add(edgeFrom(edge));
    }
    next.forEach((id) => included.add(id));
    frontier = next;
  }
  frontier = new Set(seedNodeIds);
  for (let depth = 0; depth < downstreamDepth; depth += 1) {
    const next = new Set();
    for (const edge of workflow.edges || []) {
      if (frontier.has(edgeFrom(edge))) next.add(edgeTo(edge));
    }
    next.forEach((id) => included.add(id));
    frontier = next;
  }
  return included;
}

export function extractFocusedSubgraph(workflow, assets = {}, contextPlan = {}) {
  const targetNodeIds = new Set();
  const targetPhaseIds = new Set();
  for (const target of contextPlan.targets || []) {
    if (target.type === 'node') targetNodeIds.add(target.id);
    if (target.type === 'phase') targetPhaseIds.add(target.id);
  }
  for (const node of workflow.nodes || []) {
    if (targetPhaseIds.has(readNodePhaseId(node))) targetNodeIds.add(node.id || node.node_id);
  }
  if (targetNodeIds.size === 0 && targetPhaseIds.size === 0) {
    (workflow.nodes || []).forEach((node) => targetNodeIds.add(node.id || node.node_id));
    (workflow.phases || []).forEach((phase) => targetPhaseIds.add(phase.id));
  }
  const expansion = contextPlan.graph_expansion || {};
  const includedNodeIds = expandNodeIds(
    [...targetNodeIds],
    workflow,
    Number(expansion.upstream_depth ?? 1),
    Number(expansion.downstream_depth ?? 1),
  );
  const includedPhaseIds = new Set(targetPhaseIds);
  for (const node of workflow.nodes || []) {
    if (includedNodeIds.has(node.id || node.node_id)) includedPhaseIds.add(readNodePhaseId(node));
  }
  const nodes = (workflow.nodes || []).filter((node) => includedNodeIds.has(node.id || node.node_id));
  const edges = (workflow.edges || []).filter((edge) => includedNodeIds.has(edgeFrom(edge)) || includedNodeIds.has(edgeTo(edge)));
  return {
    phases: (workflow.phases || []).filter((phase) => includedPhaseIds.has(phase.id)),
    nodes,
    edges,
    assets: {
      prompts: (assets.prompts || []).filter((asset) => includedNodeIds.has(readAssetNodeId(asset))),
      checklists: (assets.checklists || []).filter((asset) => includedNodeIds.has(readAssetNodeId(asset))),
      artifact_templates: (assets.artifact_templates || assets.artifactTemplates || []).filter((asset) => includedNodeIds.has(readAssetNodeId(asset))),
    },
    included_node_ids: [...includedNodeIds],
    included_phase_ids: [...includedPhaseIds],
  };
}

export function workflowDiffOutputContract() {
  return {
    format: 'strict_json',
    top_level: ['id?', 'request?', 'summary?', 'warnings?', 'changes[]'],
    change_fields: ['id?', 'type', 'targetType', 'targetId', 'field', 'before', 'after', 'reason', 'impact', 'selected'],
    allowed_target_types: ['phase', 'node', 'edge', 'prompt', 'checklist', 'artifact_template'],
    allowed_change_types: ['added', 'updated', 'deleted'],
    editable_node_fields: EDITABLE_NODE_FIELDS,
    node_field_aliases: ['name', 'goal', 'phaseId', 'phase_id', 'status', 'executionMode', 'execution_mode', 'mode', 'riskLevel', 'risk_level', 'risk', 'humanOwnerRole', 'human_owner_role', 'owner', 'aiRole', 'ai_role', 'inputs', 'outputs', 'reviewGate', 'review_gate', 'artifactContract', 'artifact_contract', 'agentExecutionPlan', 'agent_execution_plan', 'sandboxExecutionContract', 'sandbox_execution_contract', 'promotionGate', 'promotion_gate', 'executionEvidenceTemplate', 'execution_evidence_template', 'promptStatus', 'prompt_status', 'checklistStatus', 'checklist_status'],
    node_edit_contract: {
      scalar_fields: ['name', 'goal', 'phaseId', 'status', 'riskLevel', 'executionMode', 'humanOwnerRole', 'aiRole', 'promptStatus', 'checklistStatus'],
      list_fields: ['inputs', 'outputs'],
      object_fields: ['artifactContract', 'reviewGate', 'agentExecutionPlan', 'sandboxExecutionContract', 'promotionGate', 'executionEvidenceTemplate'],
      examples: [
        { type: 'updated', targetType: 'node', targetId: 'node-10', field: 'riskLevel', before: 'high', after: 'medium' },
        { type: 'updated', targetType: 'node', targetId: 'node-10', field: 'inputs', before: ['Old input'], after: ['New input'] },
        { type: 'updated', targetType: 'node', targetId: 'node-8', field: 'agentExecutionPlan', before: { enabled: false, execution_level: 'L0' }, after: { enabled: true, execution_level: 'L3', execution_target: 'codex' } },
      ],
    },
    instruction: 'Return reviewable diffs only. Do not rewrite the entire workflow. For node detail edits, emit one updated node change per edited field using editable_node_fields. Use existing ids for updates/deletes and stable ids for added phases/nodes/edges.',
  };
}

function normalizeChange(change, index) {
  if (!change || typeof change !== 'object') return null;
  const targetType = change.targetType || change.target_type;
  const targetId = change.targetId || change.target_id || change.after?.id || change.after?.node_id || change.after?.phase_id;
  const type = change.type || (change.before === null ? 'added' : 'updated');
  if (!targetType || !targetId) return null;
  const field = targetType === 'node' ? normalizeNodeDiffField(change.field || targetType) : (change.field || targetType);
  return {
    id: change.id || `change-${index + 1}-${safeDiffId(`${targetType}-${targetId}`, `${targetType}-${index + 1}`)}`,
    type,
    targetType,
    targetId,
    field,
    before: change.before ?? null,
    after: change.after,
    reason: change.reason || 'Proposed by workflow edit agent',
    impact: change.impact || 'updates the workflow draft',
    selected: change.selected !== false,
  };
}

export function normalizeAgentDiff(rawDiff, request, workflow, contextPlan) {
  const source = rawDiff?.diff || rawDiff?.workflow_diff || rawDiff;
  const changes = Array.isArray(source?.changes) ? source.changes.map(normalizeChange).filter(Boolean) : [];
  return {
    id: source?.id || `diff-${Date.now()}`,
    request,
    summary: source?.summary || 'Workflow edit agent proposal',
    changes,
    warnings: Array.isArray(source?.warnings) ? source.warnings : [],
    context_plan: contextPlan,
    workflow_version: workflow?.version,
    createdAt: source?.createdAt || source?.created_at || new Date().toISOString(),
  };
}

function makePhaseAddChange(requestedPhaseName, workflow) {
  const phaseId = safeDiffId(`phase-${requestedPhaseName}`, `phase-${Date.now()}`);
  const existing = (workflow.phases || []).some((phase) => phase.id === phaseId || phase.name === requestedPhaseName);
  if (existing) return null;
  return {
    id: `change-add-${phaseId}`,
    type: 'added',
    targetType: 'phase',
    targetId: phaseId,
    field: 'phase',
    before: null,
    after: {
      id: phaseId,
      name: requestedPhaseName,
      order: (workflow.phases || []).length + 1,
    },
    reason: `Requested a new workflow phase: ${requestedPhaseName}`,
    impact: 'adds a new phase lane for subsequent workflow nodes',
    selected: true,
  };
}

function buildHumanConfirmationChanges(userRequest, workflow) {
  const request = String(userRequest || '');
  const afterIntent = includesAny(request, ['after', '\u540e\u9762', '\u4e4b\u540e']);
  const confirmationIntent = includesAny(request, ['human confirmation', 'manual confirmation', '\u4eba\u5de5\u786e\u8ba4', '\u4eba\u5de5\u5ba1\u6279']);
  if (!afterIntent || !confirmationIntent) return [];
  const target = findMatchingNodes(request, workflow)[0];
  if (!target) return [];
  const targetId = target.id || target.node_id;
  const isChinese = requestHasChinese(request);
  const nodeName = isChinese ? '\u4eba\u5de5\u786e\u8ba4' : 'Human Confirmation';
  const newNodeId = safeDiffId(`node-${target.name}-${nodeName}`, `node-human-confirmation-${Date.now()}`);
  const downstreamEdges = (workflow.edges || []).filter((edge) => edgeFrom(edge) === targetId);
  const node = {
    id: newNodeId,
    phase_id: readNodePhaseId(target),
    name: nodeName,
    goal: isChinese ? `\u5728 ${target.name} \u4e4b\u540e\u5b8c\u6210\u4eba\u5de5\u786e\u8ba4` : `Complete manual confirmation after ${target.name}`,
    execution_mode: 'human_only',
    risk_level: readNodeRisk(target),
    status: 'draft',
    human_owner_role: readNodeOwner(target),
    ai_role: '',
    inputs: readNodeOutputs(target).length ? readNodeOutputs(target) : [`${target.name} output`],
    outputs: [isChinese ? '\u4eba\u5de5\u786e\u8ba4\u7ed3\u679c' : 'Manual confirmation result'],
    artifact_contract: {
      id: `artifact-${newNodeId}`,
      format: 'markdown',
      output_format: isChinese ? '\u4eba\u5de5\u786e\u8ba4\u8bb0\u5f55' : 'Manual confirmation note',
      acceptance_criteria: [isChinese ? '\u786e\u8ba4\u7ed3\u679c\u660e\u786e' : 'Decision is explicit'],
    },
    review_gate: null,
    prompt_status: 'not_required',
    checklist_status: 'draft',
    history: [{ at: new Date().toISOString(), action: 'Added by workflow edit agent' }],
  };
  const changes = [{
    id: `change-add-${newNodeId}`,
    type: 'added',
    targetType: 'node',
    targetId: newNodeId,
    field: 'node',
    before: null,
    after: node,
    reason: `Insert ${nodeName} after ${target.name}`,
    impact: 'adds a manual control point to the workflow',
    selected: true,
  }, {
    id: `change-add-edge-${safeDiffId(`${targetId}-${newNodeId}`, `${Date.now()}`)}`,
    type: 'added',
    targetType: 'edge',
    targetId: `edge-${targetId}-${newNodeId}`,
    field: 'edge',
    before: null,
    after: { id: `edge-${targetId}-${newNodeId}`, from: targetId, to: newNodeId, dependency_type: 'hard', required_outputs: readNodeOutputs(target) },
    reason: `Connect ${target.name} to ${nodeName}`,
    impact: 'places the confirmation after the requested node',
    selected: true,
  }];
  for (const edge of downstreamEdges) {
    changes.push({
      id: `change-delete-edge-${edgeId(edge)}`,
      type: 'deleted',
      targetType: 'edge',
      targetId: edgeId(edge),
      field: 'edge',
      before: edge,
      after: null,
      reason: `Route downstream work through ${nodeName}`,
      impact: 'prevents bypassing the new confirmation node',
      selected: true,
    });
    changes.push({
      id: `change-add-edge-${safeDiffId(`${newNodeId}-${edgeTo(edge)}`, `${Date.now()}`)}`,
      type: 'added',
      targetType: 'edge',
      targetId: `edge-${newNodeId}-${edgeTo(edge)}`,
      field: 'edge',
      before: null,
      after: { id: `edge-${newNodeId}-${edgeTo(edge)}`, from: newNodeId, to: edgeTo(edge), dependency_type: edge.dependency_type || edge.dependencyType || 'hard', required_outputs: node.outputs },
      reason: `Reconnect downstream work after ${nodeName}`,
      impact: 'keeps the existing workflow sequence intact',
      selected: true,
    });
  }
  return changes;
}

function isReviewGateForHighRiskRequest(request) {
  return includesAny(request, [
    'add review gates to all high-risk nodes',
    'review gates to all high-risk nodes',
    'all high-risk nodes',
    '\u6240\u6709\u9ad8\u98ce\u9669\u8282\u70b9',
    '\u9ad8\u98ce\u9669\u8282\u70b9',
  ]) && includesAny(request, ['review gate', 'gate', 'approval', '\u5ba1\u6838\u95e8\u7981', '\u5ba1\u6279', '\u4eba\u5de5\u5ba1\u6838', '\u4eba\u5de5\u786e\u8ba4']);
}

function isConservativeWorkflowRequest(request) {
  return includesAny(request, ['make this workflow more conservative', 'more conservative', 'conservative', '\u66f4\u4fdd\u5b88', '\u4fdd\u5b88']);
}

function isGeneratePromptsForAiNodesRequest(request) {
  return includesAny(request, ['generate prompts for all ai nodes', 'prompts for all ai nodes', '\u4e3a\u6240\u6709 ai \u8282\u70b9\u751f\u6210\u63d0\u793a\u8bcd', '\u6240\u6709 ai \u8282\u70b9\u751f\u6210\u63d0\u793a\u8bcd'])
    || (includesAny(request, ['prompt', '\u63d0\u793a\u8bcd']) && includesAny(request, ['all ai nodes', 'all ai', '\u6240\u6709ai', '\u6240\u6709 ai', '\u6240\u6709\u667a\u80fd']));
}

function isAddTestingBeforeLaunchRequest(request) {
  return includesAny(request, ['add testing nodes before launch', 'testing before launch', '\u53d1\u5e03\u524d\u589e\u52a0\u6d4b\u8bd5', '\u4e0a\u7ebf\u524d\u589e\u52a0\u6d4b\u8bd5', '\u53d1\u5e03\u524d\u6d4b\u8bd5']);
}

function extractRequestedNodeName(userRequest) {
  const quoted = extractQuotedName(userRequest);
  if (quoted) return quoted;
  const english = String(userRequest || '').match(/add (?:a |new )?node (?:called |named )?([a-z0-9 _-]+)/i);
  if (english?.[1]) return english[1].trim();
  const chinese = String(userRequest || '').match(/(?:\u65b0\u589e|\u6dfb\u52a0|\u589e\u52a0)(?:\u4e00\u4e2a|\u65b0\u7684)?\u8282\u70b9\s*([^\s\uff0c\u3002,.;\uff1b]+)/);
  if (chinese?.[1]) return chinese[1].trim();
  return '';
}

function extractNodeDetailText(userRequest, field) {
  const patterns = {
    goal: [
      /(?:goal|objective|purpose)\s*(?:is|:|=)\s*([^;\n]+)/i,
      /(?:\u76ee\u6807|目的)\s*(?:是|为|:|：)\s*([^；;\n]+)/,
    ],
    inputs: [
      /inputs?\s*(?:are|is|:|=)\s*([^;\n]+)/i,
      /(?:\u8f93\u5165|依赖)\s*(?:是|为|:|：)\s*([^；;\n]+)/,
    ],
    outputs: [
      /outputs?\s*(?:are|is|:|=)\s*([^;\n]+)/i,
      /(?:\u8f93\u51fa|产出|交付物)\s*(?:是|为|:|：)\s*([^；;\n]+)/,
    ],
    owner: [
      /(?:owner|responsible role|responsible)\s*(?:is|:|=)\s*([^;\n]+)/i,
      /(?:\u8d1f\u8d23\u4eba|负责人|角色)\s*(?:是|为|:|：)\s*([^；;\n]+)/,
    ],
  };
  for (const pattern of patterns[field] || []) {
    const match = String(userRequest || '').match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function extractNodeDetailList(userRequest, field, fallback = []) {
  const value = extractNodeDetailText(userRequest, field);
  if (!value) return fallback;
  return value.split(/[,;，；、]/).map((item) => item.trim()).filter(Boolean);
}

function inferRequestedRisk(userRequest) {
  const request = lower(userRequest);
  if (includesAny(request, ['high risk', 'risk high', '\u9ad8\u98ce\u9669', '\u98ce\u9669\u9ad8'])) return 'high';
  if (includesAny(request, ['low risk', 'risk low', '\u4f4e\u98ce\u9669', '\u98ce\u9669\u4f4e'])) return 'low';
  if (includesAny(request, ['medium risk', 'risk medium', '\u4e2d\u98ce\u9669', '\u98ce\u9669\u4e2d'])) return 'medium';
  return 'medium';
}

function inferRequestedExecutionMode(userRequest) {
  const request = lower(userRequest);
  if (includesAny(request, ['human only', '\u7eaf\u4eba\u5de5', '\u4eba\u5de5\u6267\u884c'])) return 'human_only';
  if (includesAny(request, ['ai execution with human approval', 'ai execute', '\u0041\u0049 \u6267\u884c\u540e\u4eba\u5de5\u5ba1\u6279', '\u4eba\u5de5\u5ba1\u6279'])) return 'ai_execute_human_approval';
  if (includesAny(request, ['ai draft', 'human review', '\u0041\u0049 \u8d77\u8349', '\u4eba\u5de5\u5ba1\u6838'])) return 'ai_draft_human_review';
  if (includesAny(request, ['ai assist', '\u0041\u0049 \u8f85\u52a9'])) return 'human_lead_ai_assist';
  return 'human_only';
}

function buildRequestedNodeAddChanges(userRequest, workflow) {
  const request = String(userRequest || '');
  const addNodeIntent = includesAny(request, ['add node', 'add step', '\u65b0\u589e\u8282\u70b9', '\u6dfb\u52a0\u8282\u70b9', '\u589e\u52a0\u8282\u70b9']);
  if (!addNodeIntent) return [];
  const nodeName = extractRequestedNodeName(request);
  if (!nodeName) return [];
  const phase = findPhaseFromAddNodeRequest(request, workflow) || (workflow.phases || [])[0];
  if (!phase) return [];
  const nodeId = safeDiffId(`node-${phase.id}-${nodeName}`, `node-${Date.now()}`);
  if ((workflow.nodes || []).some((node) => node.id === nodeId || node.name === nodeName)) return [];
  const isChinese = requestHasChinese(request);
  const goal = extractNodeDetailText(request, 'goal') || (isChinese ? `\u5b8c\u6210 ${nodeName}` : `Complete ${nodeName}`);
  const inputs = extractNodeDetailList(request, 'inputs', []);
  const outputs = extractNodeDetailList(request, 'outputs', [nodeName]);
  const owner = extractNodeDetailText(request, 'owner') || 'Project Owner';
  const executionMode = inferRequestedExecutionMode(request);
  const node = {
    id: nodeId,
    phase_id: phase.id,
    name: nodeName,
    goal,
    execution_mode: executionMode,
    risk_level: inferRequestedRisk(request),
    status: 'draft',
    human_owner_role: owner,
    ai_role: executionMode === 'human_only' ? '' : 'Workflow Assistant',
    inputs,
    outputs,
    artifact_contract: {
      id: `artifact-${nodeId}`,
      format: 'markdown',
      output_format: isChinese ? `${nodeName} \u4ea4\u4ed8\u7269` : `${nodeName} deliverable`,
      acceptance_criteria: [isChinese ? '\u4ea4\u4ed8\u7269\u5185\u5bb9\u5b8c\u6574' : 'Deliverable is complete'],
    },
    review_gate: null,
    prompt_status: 'not_required',
    checklist_status: 'draft',
    history: [{ at: new Date().toISOString(), action: 'Added by workflow edit agent' }],
  };
  return [{
    id: `change-add-${nodeId}`,
    type: 'added',
    targetType: 'node',
    targetId: nodeId,
    field: 'node',
    before: null,
    after: node,
    reason: `Add ${nodeName} to ${phase.name}`,
    impact: 'adds a node to the requested workflow phase',
    selected: true,
  }];
}

function extractValueAfterVerb(userRequest) {
  const value = String(userRequest || '');
  const verbMatches = [...value.matchAll(/(?:\u66f4\u65b0\u4e3a|\u8bbe\u7f6e\u4e3a|\u6539\u4e3a|\u6539\u6210|\u8bbe\u4e3a|to|as|\u4e3a)\s*[\u201c\u201d"']?(.+?)[\u201c\u201d"']?(?=$|\n)/gi)];
  if (verbMatches.length) return verbMatches.at(-1)?.[1]?.trim() || '';
  const valueMatches = [...value.matchAll(/(?:^|\n)\s*(?:value|new value|after)\s*(?:=|:)\s*[\u201c\u201d"']?(.+?)[\u201c\u201d"']?(?=$|\n)/gi)];
  if (valueMatches.length) return valueMatches.at(-1)?.[1]?.trim() || '';
  const assignmentMatches = [...value.matchAll(/(?:=)\s*[\u201c\u201d"']?(.+?)[\u201c\u201d"']?(?=$|\n)/gi)];
  return assignmentMatches.at(-1)?.[1]?.trim() || '';
}

function normalizeRiskValue(value) {
  const text = lower(value);
  if (includesAny(text, ['high', '\u9ad8'])) return 'high';
  if (includesAny(text, ['low', '\u4f4e'])) return 'low';
  if (includesAny(text, ['medium', 'mid', '\u4e2d'])) return 'medium';
  return value.trim();
}

function normalizeExecutionModeValue(value) {
  const text = lower(value);
  if (includesAny(text, ['human only', 'human_only', '\u4eba\u5de5'])) return 'human_only';
  if (includesAny(text, ['approval', 'human approval', 'ai_execute_human_approval', '\u5ba1\u6279'])) return 'ai_execute_human_approval';
  if (includesAny(text, ['review', 'ai_draft_human_review', '\u590d\u6838', '\u5ba1\u6838'])) return 'ai_draft_human_review';
  if (includesAny(text, ['autonomous', 'ai_autonomous', '\u81ea\u4e3b'])) return 'ai_autonomous';
  if (includesAny(text, ['assist', 'human_lead_ai_assist', '\u8f85\u52a9'])) return 'human_lead_ai_assist';
  return value.trim();
}

function normalizeNodeEditValue(field, value) {
  if (field === 'riskLevel') return normalizeRiskValue(value);
  if (field === 'executionMode') return normalizeExecutionModeValue(value);
  if (field === 'inputs' || field === 'outputs') {
    return String(value || '')
      .split(/[\n,;\uff0c\uff1b\u3001]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return value.trim();
}

function inferNodeEditField(userRequest) {
  const checks = [
    ['executionMode', ['execution mode', 'mode', '\u6267\u884c\u6a21\u5f0f', '\u6a21\u5f0f']],
    ['riskLevel', ['risk level', 'risk', '\u98ce\u9669\u7b49\u7ea7', '\u98ce\u9669']],
    ['humanOwnerRole', ['human owner', 'owner', 'owner role', '\u4eba\u5de5\u8d1f\u8d23\u4eba', '\u8d1f\u8d23\u4eba']],
    ['aiRole', ['ai role', 'ai persona', '\u0041\u0049\u89d2\u8272', '\u667a\u80fd\u4f53\u89d2\u8272']],
    ['inputs', ['inputs', 'input', '\u8f93\u5165']],
    ['outputs', ['outputs', 'output', '\u8f93\u51fa']],
    ['status', ['status', '\u72b6\u6001']],
    ['goal', ['goal', 'objective', '\u76ee\u6807']],
    ['name', ['rename node', 'node name', 'name', '\u8282\u70b9\u540d\u79f0', '\u540d\u79f0', '\u540d\u5b57']],
  ];
  return checks.find(([, needles]) => includesAny(userRequest, needles))?.[0] || '';
}

function buildNodeFieldUpdateChanges(userRequest, workflow) {
  const target = findMatchingNodes(userRequest, workflow)[0];
  if (!target) return [];
  const field = inferNodeEditField(userRequest);
  if (!field) return [];
  const rawValue = extractValueAfterVerb(userRequest);
  if (!rawValue) return [];
  const after = normalizeNodeEditValue(field, rawValue);
  if (Array.isArray(after) && after.length === 0) return [];
  const before = readNodeField(target, field);
  if (JSON.stringify(before ?? null) === JSON.stringify(after)) return [];
  return [{
    id: `change-node-${safeDiffId(`${target.id}-${field}`, `${Date.now()}`)}`,
    type: 'updated',
    targetType: 'node',
    targetId: target.id || target.node_id,
    field,
    before,
    after,
    reason: `Update ${target.name} ${field} from natural language request`,
    impact: 'updates node detail data without changing workflow topology',
    selected: true,
  }];
}

function workflowPhaseNameForNode(workflow, node) {
  return lower((workflow.phases || []).find((phase) => phase.id === readNodePhaseId(node))?.name || '');
}

function requestMentionsAgenticSandbox(request) {
  return includesAny(request, ['agent', 'sandbox', 'l3', 'codex', 'cursor', 'claude code', '\u667a\u80fd\u4f53', '\u6c99\u7bb1']);
}

function extractForbiddenPaths(userRequest) {
  const paths = [];
  if (includesAny(userRequest, ['infra', '\u57fa\u7840\u8bbe\u65bd'])) paths.push('infra/**');
  if (includesAny(userRequest, ['data directory', 'data folder', '\u6570\u636e\u76ee\u5f55'])) paths.push('data/**');
  const quoted = [...String(userRequest || '').matchAll(/(?:forbid|forbidden|deny|禁止访问|禁止)\s+["']?([a-z0-9_./*-]+)["']?/gi)]
    .map((match) => match[1])
    .filter(Boolean);
  quoted.forEach((path) => paths.push(path.includes('*') ? path : `${path.replace(/\/$/, '')}/**`));
  return unique(paths);
}

function buildAgenticSandboxChanges(userRequest, workflow) {
  if (!requestMentionsAgenticSandbox(userRequest)) return [];
  const request = lower(userRequest);
  const targets = findMatchingNodes(userRequest, workflow);
  const developmentNodes = (workflow.nodes || []).filter((node) => {
    const phaseName = workflowPhaseNameForNode(workflow, node);
    const nodeName = lower(node.name);
    if (targets.length) return targets.includes(node);
    if (includesAny(request, ['development', '\u5f00\u53d1'])) return phaseName.includes('development') || phaseName.includes('\u5f00\u53d1') || /code|task|api/i.test(node.name || '');
    return /code|implementation|development|\u4ee3\u7801|\u5f00\u53d1/.test(nodeName);
  });
  const nodes = targets.length ? targets : developmentNodes;
  const forbiddenPaths = extractForbiddenPaths(userRequest);
  const changes = [];

  nodes.forEach((node) => {
    const nodeId = node.id || node.node_id;
    const existingContract = readSandboxExecutionContract(node);
    const contract = createDefaultSandboxExecutionContract(node, {
      ...(existingContract || {}),
      id: existingContract?.id || `contract-${nodeId}`,
      execution_target: 'codex',
      repo_scope: {
        ...(existingContract?.repo_scope || existingContract?.repoScope || {}),
        allowed_paths: ['apps/**', 'packages/**', 'tests/**'],
        forbidden_paths: unique([...(existingContract?.repo_scope?.forbidden_paths || existingContract?.repoScope?.forbiddenPaths || []), ...forbiddenPaths]),
      },
      runtime_scope: {
        ...(existingContract?.runtime_scope || existingContract?.runtimeScope || {}),
        allowed_commands: ['npm test', 'npm run build'],
        network_policy: includesAny(userRequest, ['allow network', '\u5141\u8bb8\u8054\u7f51']) ? 'approved_only' : 'blocked',
        external_network_approved: includesAny(userRequest, ['approved network', '\u660e\u786e\u6279\u51c6\u8054\u7f51']),
        package_install_policy: 'allow_lockfile_only',
        max_runtime_minutes: 45,
      },
      acceptance_tests: { required: ['npm test', 'npm run build'], optional: [] },
      output_required: { evidence: ['diff', 'test_report', 'risk_summary', 'cost_report', 'rollback_note'] },
      review_gate: readNodeReviewGate(node)?.id || null,
      promotion_policy: {
        promotion_gates: ['sandbox', 'test', 'review'],
        target_environment: 'review',
        human_approval_required: true,
        agent_can_update_formal_workflow: false,
        production_auto_deploy_allowed: false,
        block_on_forbidden_paths: true,
      },
    });
    const plan = createDefaultAgentExecutionPlan(node, {
      ...(readAgentExecutionPlan(node) || {}),
      enabled: true,
      execution_level: includesAny(userRequest, ['l4', 'L4']) ? 'L4' : 'L3',
      execution_target: 'codex',
      dispatch_mode: 'manual_confirmed',
      sandbox_execution_contract_id: contract.id,
      status: 'ready',
      contract_version: contract.version,
    });
    const evidence = createDefaultExecutionEvidenceTemplate(node, {
      ...(readExecutionEvidenceTemplate(node) || {}),
      required_items: ['diff', 'test_report', 'risk_summary', 'cost_report', 'rollback_note'],
    });
    changes.push({
      id: `change-agent-plan-${safeDiffId(nodeId, `${Date.now()}`)}`,
      type: 'updated',
      targetType: 'node',
      targetId: nodeId,
      field: 'agentExecutionPlan',
      before: readAgentExecutionPlan(node),
      after: plan,
      reason: 'Configure node for Agentic Development sandbox execution',
      impact: 'enables reviewed Agent execution without directly changing the formal workflow',
      selected: true,
    }, {
      id: `change-sandbox-contract-${safeDiffId(nodeId, `${Date.now()}`)}`,
      type: 'updated',
      targetType: 'node',
      targetId: nodeId,
      field: 'sandboxExecutionContract',
      before: existingContract,
      after: contract,
      reason: 'Add sandbox boundaries, tests, allowed commands, and forbidden paths',
      impact: 'makes downstream coding-agent work auditable and promotion-gated',
      selected: true,
    }, {
      id: `change-evidence-template-${safeDiffId(nodeId, `${Date.now()}`)}`,
      type: 'updated',
      targetType: 'node',
      targetId: nodeId,
      field: 'executionEvidenceTemplate',
      before: readExecutionEvidenceTemplate(node),
      after: evidence,
      reason: 'Require evidence collection for Agent output review',
      impact: 'requires diff, test, risk, cost, and rollback evidence before promotion',
      selected: true,
    });
  });
  return changes;
}

function buildHighRiskAgentPolicyChanges(userRequest, workflow) {
  if (!includesAny(userRequest, ['high-risk', 'high risk', '\u9ad8\u98ce\u9669'])) return [];
  if (!includesAny(userRequest, ['l2', 'review gate', 'manual review', '\u4eba\u5de5 review', '\u4eba\u5de5\u5ba1\u6838'])) return [];
  const changes = [];
  (workflow.nodes || []).forEach((node) => {
    if (readNodeRisk(node) !== 'high') return;
    const nodeId = node.id || node.node_id;
    const plan = readAgentExecutionPlan(node);
    if (plan && agentPlanLevel(plan) > 2) {
      changes.push({
        id: `change-high-risk-l2-${safeDiffId(nodeId, `${Date.now()}`)}`,
        type: 'updated',
        targetType: 'node',
        targetId: nodeId,
        field: 'agentExecutionPlan',
        before: plan,
        after: { ...plan, execution_level: 'L2', sandbox_execution_contract_id: null, status: 'review_required' },
        reason: 'High-risk nodes are capped at L2 by policy',
        impact: 'prevents high-risk work from entering sandbox execution without explicit redesign',
        selected: true,
      });
    }
    if (!readNodeReviewGate(node)?.required) {
      changes.push({
        id: `change-high-risk-gate-${safeDiffId(nodeId, `${Date.now()}`)}`,
        type: 'updated',
        targetType: 'node',
        targetId: nodeId,
        field: 'reviewGate',
        before: readNodeReviewGate(node),
        after: {
          id: `gate-${nodeId}-manual-review`,
          name: 'Manual Review Gate',
          reviewerRole: readNodeOwner(node),
          criteria: ['High-risk output reviewed', 'Agent boundary checked'],
          passCondition: 'Human reviewer approves',
          rejectCondition: 'Boundary or quality issue remains',
          allowAiRevision: false,
          required: true,
        },
        reason: 'High-risk Agent work requires human review',
        impact: 'adds a blocking review gate before final export',
        selected: true,
      });
    }
  });
  return changes;
}

function agentPlanLevel(plan) {
  const level = String(plan?.execution_level || plan?.executionLevel || 'L0').toUpperCase();
  return Number(level.replace('L', '')) || 0;
}

function buildTestingSandboxCommandChanges(userRequest, workflow) {
  if (!includesAny(userRequest, ['npm test', 'npm run build'])) return [];
  const testingNodes = (workflow.nodes || []).filter((node) => {
    const phaseName = workflowPhaseNameForNode(workflow, node);
    return phaseName.includes('testing') || phaseName.includes('\u6d4b\u8bd5') || /test|qa/i.test(node.name || '');
  });
  return testingNodes.flatMap((node) => {
    const nodeId = node.id || node.node_id;
    const existingContract = readSandboxExecutionContract(node);
    const contract = createDefaultSandboxExecutionContract(node, {
      ...(existingContract || {}),
      id: existingContract?.id || `contract-${nodeId}`,
      runtime_scope: {
        ...(existingContract?.runtime_scope || existingContract?.runtimeScope || {}),
        allowed_commands: ['npm test', 'npm run build'],
        network_policy: includesAny(userRequest, ['no network', 'ban network', '\u7981\u6b62\u8054\u7f51']) ? 'blocked' : 'approved_only',
        external_network_approved: false,
        package_install_policy: 'disabled',
        max_runtime_minutes: 30,
      },
      acceptance_tests: { required: ['npm test', 'npm run build'], optional: [] },
      promotion_policy: {
        promotion_gates: ['sandbox', 'test', 'review'],
        target_environment: 'test',
        human_approval_required: true,
        agent_can_update_formal_workflow: false,
        production_auto_deploy_allowed: false,
        block_on_forbidden_paths: true,
      },
    });
    const plan = createDefaultAgentExecutionPlan(node, {
      ...(readAgentExecutionPlan(node) || {}),
      enabled: true,
      execution_level: 'L3',
      execution_target: 'codex',
      dispatch_mode: 'manual_confirmed',
      sandbox_execution_contract_id: contract.id,
      status: 'ready',
    });
    return [{
      id: `change-test-agent-${safeDiffId(nodeId, `${Date.now()}`)}`,
      type: 'updated',
      targetType: 'node',
      targetId: nodeId,
      field: 'agentExecutionPlan',
      before: readAgentExecutionPlan(node),
      after: plan,
      reason: 'Allow test node to run controlled sandbox commands',
      impact: 'enables test execution while preserving manual confirmation',
      selected: true,
    }, {
      id: `change-test-contract-${safeDiffId(nodeId, `${Date.now()}`)}`,
      type: 'updated',
      targetType: 'node',
      targetId: nodeId,
      field: 'sandboxExecutionContract',
      before: existingContract,
      after: contract,
      reason: 'Declare allowed commands and block external network access',
      impact: 'keeps test execution reproducible and offline',
      selected: true,
    }];
  });
}

function buildProductionGateChanges(userRequest, workflow) {
  if (!includesAny(userRequest, ['production gate', 'production', 'launch', 'release', '\u4e0a\u7ebf', '\u53d1\u5e03'])) return [];
  if (!includesAny(userRequest, ['gate', 'approval', 'auto', 'automatic', '\u4e0d\u80fd\u7531 agent', '\u4eba\u5de5', '\u5ba1\u6279'])) return [];
  const launchNodes = (workflow.nodes || []).filter((node) => {
    const phaseName = workflowPhaseNameForNode(workflow, node);
    return phaseName.includes('launch') || phaseName.includes('\u4e0a\u7ebf') || /launch|production|release/i.test(node.name || '');
  });
  return launchNodes.flatMap((node) => {
    const nodeId = node.id || node.node_id;
    const plan = createDefaultAgentExecutionPlan(node, {
      ...(readAgentExecutionPlan(node) || {}),
      enabled: false,
      execution_level: 'L0',
      execution_target: 'manual_handoff',
      dispatch_mode: 'disabled',
      sandbox_execution_contract_id: null,
      status: 'disabled',
    });
    const gate = createDefaultPromotionGate(node, {
      ...(readPromotionGate(node) || {}),
      id: `promotion-production-${nodeId}`,
      gate_type: 'production',
      required_checks: ['human_approval', 'required_tests', 'rollback_plan'],
      human_approval_required: true,
      agent_auto_promote_allowed: false,
    });
    return [{
      id: `change-production-agent-l0-${safeDiffId(nodeId, `${Date.now()}`)}`,
      type: 'updated',
      targetType: 'node',
      targetId: nodeId,
      field: 'agentExecutionPlan',
      before: readAgentExecutionPlan(node),
      after: plan,
      reason: 'Production work must stay L0 manual handoff',
      impact: 'prevents Agent auto deploy or direct production updates',
      selected: true,
    }, {
      id: `change-production-gate-${safeDiffId(nodeId, `${Date.now()}`)}`,
      type: 'updated',
      targetType: 'node',
      targetId: nodeId,
      field: 'promotionGate',
      before: readPromotionGate(node),
      after: gate,
      reason: 'Add production promotion gate with human approval',
      impact: 'blocks production promotion until human approval and rollback plan exist',
      selected: true,
    }];
  });
}

function buildNodeDeleteChanges(userRequest, workflow) {
  const request = String(userRequest || '');
  const deleteIntent = includesAny(request, ['delete node', 'remove node', 'delete step', 'remove step', '\u5220\u9664\u8282\u70b9', '\u79fb\u9664\u8282\u70b9', '\u5220\u6389\u8282\u70b9'])
    || (includesAny(request, ['delete ', 'remove ', '\u5220\u9664', '\u79fb\u9664']) && !includesAny(request, ['phase', '\u9636\u6bb5', 'edge', '\u8fde\u7ebf']));
  if (!deleteIntent) return [];
  const target = findMatchingNodes(request, workflow)[0];
  if (!target) return [];
  const targetId = target.id || target.node_id;
  return [{
    id: `change-delete-${safeDiffId(targetId, `${Date.now()}`)}`,
    type: 'deleted',
    targetType: 'node',
    targetId,
    field: 'node',
    before: target,
    after: null,
    reason: `Delete ${target.name} from natural language request`,
    impact: 'removes the node and its connected edges from the workflow',
    selected: true,
  }];
}

export function generateWorkflowDiff(userRequest, workflow, assets) {
  const request = lower(userRequest).trim();
  const changes = [];
  const warnings = [];
  const requestedPhaseName = extractRequestedPhaseName(userRequest);
  const addPhaseIntent = request.includes('phase') || /(?:\u65b0\u589e|\u6dfb\u52a0|\u589e\u52a0)(?:\u4e00\u4e2a|\u65b0\u7684|\u65b0)?\u9636\u6bb5/.test(String(userRequest || ''));

  if (requestedPhaseName && addPhaseIntent) {
    const change = makePhaseAddChange(requestedPhaseName, workflow);
    if (change) changes.push(change);
  }

  changes.push(...buildHumanConfirmationChanges(userRequest, workflow));
  changes.push(...buildNodeDeleteChanges(userRequest, workflow));
  changes.push(...buildRequestedNodeAddChanges(userRequest, workflow));
  changes.push(...buildNodeFieldUpdateChanges(userRequest, workflow));
  changes.push(...buildAgenticSandboxChanges(userRequest, workflow));
  changes.push(...buildTestingSandboxCommandChanges(userRequest, workflow));
  changes.push(...buildHighRiskAgentPolicyChanges(userRequest, workflow));
  changes.push(...buildProductionGateChanges(userRequest, workflow));

  if (isReviewGateForHighRiskRequest(userRequest)) {
    (workflow.nodes || []).forEach((node) => {
      if (readNodeRisk(node) === 'high' && !readNodeReviewGate(node)?.required) {
        changes.push({
          id: `change-gate-${node.id}`,
          type: 'updated',
          targetType: 'node',
          targetId: node.id,
          field: 'reviewGate',
          before: readNodeReviewGate(node),
          after: {
            id: `gate-auto-${node.id}`,
            name: 'Auto Safety Review',
            reviewerRole: readNodeOwner(node),
            criteria: ['High-risk quality gate'],
            passCondition: 'manual approval',
            rejectCondition: 'risk unresolved',
            allowAiRevision: true,
            required: true,
          },
          reason: 'High-risk nodes should have required review gate',
          impact: 'reduces release risk',
          selected: true,
        });
      }
    });
  }

  if (isConservativeWorkflowRequest(userRequest)) {
    (workflow.nodes || []).forEach((node) => {
      if (readNodeMode(node) === 'ai_autonomous') {
        changes.push({
          id: `change-mode-${node.id}`,
          type: 'updated',
          targetType: 'node',
          targetId: node.id,
          field: 'executionMode',
          before: readNodeMode(node),
          after: 'ai_execute_human_approval',
          reason: 'Conservative mode adds human approval',
          impact: 'increases manual controls',
          selected: true,
        });
      }
    });
    warnings.push('Conservative mode may increase delivery cycle time.');
  }

  if (isGeneratePromptsForAiNodesRequest(userRequest)) {
    (workflow.nodes || []).forEach((node) => {
      if (readNodeMode(node) !== 'human_only' && !(assets.prompts || []).find((p) => readAssetNodeId(p) === node.id)) {
        const prompt = generatePrompt(node);
        changes.push({
          id: `change-prompt-${node.id}`,
          type: 'added',
          targetType: 'prompt',
          targetId: prompt.id,
          field: 'prompt',
          before: null,
          after: prompt,
          reason: 'AI node should have reusable prompt',
          impact: 'improves execution consistency',
          selected: true,
        });
      }
    });
  }

  if (isAddTestingBeforeLaunchRequest(userRequest)) {
    const testingPhase = (workflow.phases || []).find((phase) => phaseMatchesToken(phase, 'testing') || phaseMatchesToken(phase, '\u6d4b\u8bd5'));
    const launchPhase = (workflow.phases || []).find((phase) => phaseMatchesToken(phase, 'launch') || phaseMatchesToken(phase, '\u53d1\u5e03'));
    if (testingPhase && launchPhase) {
      changes.push({
        id: 'change-add-regression-node',
        type: 'added',
        targetType: 'node',
        field: 'node',
        targetId: 'node-regression-check',
        before: null,
        after: {
          id: 'node-regression-check',
          phase_id: testingPhase.id,
          name: 'Regression Dry Run',
          goal: 'Run final regression before launch',
          execution_mode: 'ai_draft_human_review',
          risk_level: 'medium',
          status: 'draft',
          human_owner_role: 'QA Lead',
          ai_role: 'Regression Copilot',
          inputs: ['Test case suite', 'Release notes'],
          outputs: ['Regression report'],
          artifact_contract: {
            id: 'artifact-node-regression-check',
            format: 'markdown',
            output_format: 'Regression matrix markdown',
            acceptance_criteria: ['All critical tests pass', 'Known issues listed'],
          },
          review_gate: {
            id: 'gate-regression',
            name: 'QA Lead Review',
            reviewer_role: 'QA Lead',
            criteria: ['Critical path covered'],
            pass_condition: 'No critical blocker',
            reject_condition: 'Critical blocker exists',
            allow_ai_revision: false,
            required: true,
          },
          prompt_status: 'draft',
          checklist_status: 'draft',
          history: [{ at: new Date().toISOString(), action: 'Added by AI diff' }],
        },
        reason: 'Requested extra testing before launch',
        impact: 'increases testing coverage',
        selected: true,
      });
    }
  }

  return {
    id: `diff-${Date.now()}`,
    request: userRequest,
    changes,
    warnings,
    createdAt: new Date().toISOString(),
  };
}

export function applyWorkflowDiff(project, diff, applySelectedOnly = true) {
  const updated = structuredClone(project);
  const selectedChanges = diff.changes.filter((change) => !applySelectedOnly || change.selected);

  selectedChanges.forEach((change) => {
    if (change.targetType === 'node' && change.field === 'reviewGate') {
      const node = updated.workflow.nodes.find((item) => item.id === change.targetId);
      if (node) {
        node.reviewGate = change.after;
        node.history.push({ at: new Date().toISOString(), action: `Diff applied: ${change.reason}` });
      }
    }

    if (change.targetType === 'node' && change.field === 'executionMode') {
      const node = updated.workflow.nodes.find((item) => item.id === change.targetId);
      if (node) {
        node.executionMode = change.after;
        node.promptStatus = 'outdated';
        node.checklistStatus = 'outdated';
        node.history.push({ at: new Date().toISOString(), action: `Diff applied: ${change.reason}` });
      }
    }

    if (change.targetType === 'node') {
      const field = normalizeNodeDiffField(change.field);
      if (field !== 'node' && !['reviewGate', 'executionMode'].includes(field) && EDITABLE_NODE_FIELDS.includes(field)) {
        const node = updated.workflow.nodes.find((item) => item.id === change.targetId);
        if (node) {
          node[field] = change.after;
          node.history = [...(node.history || []), { at: new Date().toISOString(), action: `Diff applied: ${change.reason}` }];
        }
      }
    }

    if (change.targetType === 'prompt' && change.field === 'prompt') {
      updated.assets.prompts.push(change.after);
    }

    if (change.targetType === 'node' && change.field === 'node') {
      updated.workflow.nodes.push(normalizeAgenticNode(change.after));
      const latestTestingNode = updated.workflow.nodes.find((n) => n.name === 'QA Review');
      if (latestTestingNode) {
        updated.workflow.edges.push({ id: `edge-${Date.now()}`, from: latestTestingNode.id, to: change.after.id });
      }
    }
  });

  const affectedNodeIds = selectedChanges
    .filter((change) => change.targetType === 'node')
    .map((change) => change.targetId);

  updated.assets.prompts = updated.assets.prompts.map((prompt) => (
    affectedNodeIds.includes(prompt.nodeId)
      ? { ...prompt, status: 'outdated', outdatedReason: 'Workflow diff changed node contract' }
      : prompt
  ));

  updated.assets.checklists = updated.assets.checklists.map((checklist) => (
    affectedNodeIds.includes(checklist.nodeId)
      ? { ...checklist, status: 'outdated', outdatedReason: 'Workflow diff changed node contract' }
      : checklist
  ));

  updated.workflow.version += 1;
  updated.workflow.updatedAt = new Date().toISOString();
  return updated;
}
