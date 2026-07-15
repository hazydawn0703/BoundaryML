import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyWorkflowPatch, applyDiff, createWorkflowSnapshot, markAffectedAssetsOutdated, normalizeWorkflowSpec } from '../../../packages/core/src/engine.js';
import { getTemplateById, listPublicTemplates, selectTemplateForProject } from '../../../packages/core/src/templates.js';
import { generatePrompt } from '../../../packages/generators/src/promptGenerator.js';
import { generateChecklist } from '../../../packages/generators/src/checklistGenerator.js';
import { buildWorkflowIndex, extractFocusedSubgraph, generateWorkflowContextPlan, generateWorkflowDiff, normalizeAgentDiff, normalizeContextPlan, workflowDiffOutputContract } from '../../../packages/core/src/diff.js';
import { generateExecutionKit } from '../../../packages/generators/src/executionKitGenerator.js';
import { exportExecutionKit } from '../../../packages/exporter/src/executionKitExporter.js';
import { loadAiSaasFeatureMvpSpec } from '../../../packages/examples/src/aiSaasFeatureMvp.js';
import { validateWorkflow as validateRulesWorkflow } from '../../../packages/rules/src/validationEngine.js';
import { validateProject, validateWorkflow, validateRoleUnionProjectSpec, validateGenerationJob } from '../../../packages/schema/src/schema.js';
import { normalizeAgenticNode } from '../../../packages/schema/src/agentic.js';
import { MemoryStorage } from '../../../packages/storage/src/memoryStorage.js';
import { FileStorage } from '../../../packages/storage/src/fileStorage.js';
import { getModelConfig, getModelStatus, runModel, updateModelConfig } from './llmAccess.js';
import { detectSchemaVersion, migrateObjectIfNeeded } from '../../../packages/schema/src/migrations.js';

const port = Number(process.env.ROLEUNION_SERVER_PORT || process.env.PORT || 8787);
const runtimeMode = 'local_server';
const storageAdapter = process.env.ROLEUNION_STORAGE_ADAPTER || process.env.STORAGE_MODE || 'file';
const repoRoot = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
const defaultDataDir = resolve(repoRoot, 'data');
const dataDir = process.env.ROLEUNION_DATA_DIR || process.env.STORAGE_DIR || process.env.DATA_DIR || defaultDataDir;
if (storageAdapter === 'file') mkdirSync(dataDir, { recursive: true });
const storage = storageAdapter === 'file' ? new FileStorage(dataDir) : new MemoryStorage();
const ACTIVE_JOB_STATUS = new Set(['queued', 'running', 'succeeded']);
const RETRYABLE_JOB_TYPES = new Set(['summarize_context_pack', 'generate_prompt', 'generate_checklist', 'generate_execution_kit_preview', 'generate_execution_kit']);
const AI_EXECUTION_MODES = new Set(['human_lead_ai_assist', 'ai_draft_human_review', 'ai_execute_human_approval', 'ai_autonomous']);
function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, ''));
}
const modelCallsPath = `${dataDir}/model-calls.json`;
function loadModelCalls() {
  if (storageAdapter !== 'file' || !existsSync(modelCallsPath)) return [];
  try {
    const parsed = readJsonFile(modelCallsPath);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
function persistModelCalls() {
  if (storageAdapter !== 'file') return;
  try {
    writeFileSync(modelCallsPath, JSON.stringify(modelCalls.slice(0, 100), null, 2));
  } catch {}
}
const modelCalls = loadModelCalls();
const persistModelCallUnshift = modelCalls.unshift.bind(modelCalls);
modelCalls.unshift = (...items) => {
  const result = persistModelCallUnshift(...items);
  modelCalls.splice(100);
  persistModelCalls();
  return result;
};
const AI_CONVERSATION_LIMIT = 20;
const EDIT_SESSION_LIMIT = 10;
const DEFAULT_EDIT_SESSION_BATCH_SIZE = 4;
const ACTIVE_EDIT_SESSION_STATUS = new Set(['collecting_info', 'planning', 'diff_ready', 'awaiting_next_batch']);
const PROJECT_CREATION_SESSION_LIMIT = 20;
const AGENT_RUN_LIMIT = 50;
const projectCreationSessions = new Map();
const projectCreationSessionsPath = `${dataDir}/project-creation-sessions.json`;

function makeContext() {
  return {
    user_id: 'local_user', workspace_id: 'local_default', mode: runtimeMode,
    source: 'server_default', roles: [], request_id: `req_${randomUUID()}`,
  };
}

function respond(res, statusCode, body) {
  res.writeHead(statusCode, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

function ok(res, ctx, data, statusCode = 200) {
  respond(res, statusCode, { ok: true, data, meta: { requestId: ctx.request_id, generatedAt: new Date().toISOString() } });
}

function fail(res, ctx, statusCode, code, message, details = []) {
  respond(res, statusCode, { ok: false, error: { code, message, details }, meta: { requestId: ctx.request_id } });
}

function requireConfiguredLlm(res, ctx, capability) {
  const status = getModelStatus();
  if (status.configured) return true;
  fail(
    res,
    ctx,
    428,
    'LLM_CONFIGURATION_REQUIRED',
    `Configure an LLM in Settings / Model Access before using ${capability}.`,
    [{ field: 'api_key', settings_page: 'settings-model' }],
  );
  return false;
}

function ensureAiConversation(project) {
  const conversation = project.ai_conversation || project.aiConversation || [];
  project.ai_conversation = Array.isArray(conversation) ? conversation : [];
  project.aiConversation = project.ai_conversation;
  return project.ai_conversation;
}

function appendAiConversation(project, entries) {
  const conversation = ensureAiConversation(project);
  project.ai_conversation = [...conversation, ...entries].slice(-AI_CONVERSATION_LIMIT);
  project.aiConversation = project.ai_conversation;
  return project.ai_conversation;
}

function updateAiConversationMessage(project, diffId, patch) {
  const conversation = ensureAiConversation(project);
  const updatedAt = new Date().toISOString();
  project.ai_conversation = conversation.map((message) => (
    (message.diff_id === diffId || message.diffId === diffId)
      ? { ...message, ...patch, updated_at: updatedAt }
      : message
  ));
  project.aiConversation = project.ai_conversation;
  return project.ai_conversation;
}

function ensureEditSessions(project) {
  const sessions = project.edit_sessions || project.editSessions || [];
  project.edit_sessions = Array.isArray(sessions) ? sessions : [];
  project.editSessions = project.edit_sessions;
  return project.edit_sessions;
}

function getActiveEditSession(project) {
  return ensureEditSessions(project).find((session) => ACTIVE_EDIT_SESSION_STATUS.has(session.status)) || null;
}

function saveEditSession(project, session) {
  const sessions = ensureEditSessions(project).filter((item) => item.id !== session.id);
  project.edit_sessions = [session, ...sessions].slice(0, EDIT_SESSION_LIMIT);
  project.editSessions = project.edit_sessions;
  return session;
}

function appendEditSessionMessage(session, message) {
  if (!session) return session;
  const now = new Date().toISOString();
  session.messages = [...(Array.isArray(session.messages) ? session.messages : []), { at: now, ...message }].slice(-AI_CONVERSATION_LIMIT);
  session.updated_at = now;
  return session;
}

function findWorkflowPhase(project, text) {
  const value = String(text || '').toLowerCase();
  const aliases = [
    ['launch', '\u53d1\u5e03', '\u4e0a\u7ebf', 'release'],
    ['testing', '\u6d4b\u8bd5', 'qa', '\u9a8c\u6536'],
    ['development', '\u5f00\u53d1', '\u5b9e\u73b0', '\u7f16\u7801'],
    ['technical design', '\u6280\u672f\u8bbe\u8ba1', '\u67b6\u6784\u8bbe\u8ba1'],
    ['product design', '\u4ea7\u54c1\u8bbe\u8ba1', 'prd', '\u9700\u6c42\u8bbe\u8ba1'],
    ['discovery', '\u63a2\u7d22', '\u8c03\u7814', '\u53d1\u73b0'],
  ];
  return (project.workflow?.phases || []).find((phase) => {
    const phaseName = String(phase.name || '').toLowerCase();
    const aliasGroup = aliases.find((group) => group.includes(phaseName)) || [];
    return [phase.name, phase.id, ...aliasGroup].some((name) => name && value.includes(String(name).toLowerCase()));
  }) || null;
}

function firstQuotedText(text) {
  const match = String(text || '').match(/[\u201c\u201d"']([^"\u201c\u201d']+)[\u201c\u201d"']/);
  return match?.[1]?.trim() || '';
}

function extractAgentSlotText(text, field) {
  const patterns = {
    goal: [/(?:goal|objective|purpose)\s*(?:is|:|=)\s*([^;\n]+)/i, /(?:\u76ee\u6807|\u76ee\u7684|\u7528\u4e8e|\u7528\u6765)\s*(?:\u662f|\u4e3a|:|\uff1a)?\s*([^\uff0c\u3002\uff1b;\n]+)/],
    inputs: [/(?:inputs?|depends? on)\s*(?:are|is|:|=)\s*([^;\n]+)/i, /(?:\u8f93\u5165|\u4f9d\u8d56|\u57fa\u4e8e)\s*(?:\u662f|\u4e3a|:|\uff1a)?\s*([^\uff0c\u3002\uff1b;\n]+)/],
    outputs: [/(?:outputs?|deliverables?)\s*(?:are|is|:|=)\s*([^;\n]+)/i, /(?:\u8f93\u51fa|\u4ea7\u51fa|\u4ea4\u4ed8\u7269)\s*(?:\u662f|\u4e3a|:|\uff1a)?\s*([^\uff0c\u3002\uff1b;\n]+)/],
    owner: [/(?:owner|responsible role|responsible)\s*(?:is|:|=)\s*([^;\n]+)/i, /(?:\u8d1f\u8d23\u4eba|\u8d1f\u8d23\u89d2\u8272|\u8d23\u4efb\u4eba|owner)\s*(?:\u662f|\u4e3a|:|\uff1a)?\s*([^\uff0c\u3002\uff1b;\n]+)/i],
  };
  for (const pattern of patterns[field] || []) {
    const match = String(text || '').match(pattern);
    if (match?.[1]) return match[1].trim();
  }
  return '';
}

function splitAgentSlotList(value) {
  return String(value || '').split(/[,;\uff0c\uff1b\u3001/]/).map((item) => item.trim()).filter(Boolean);
}

function inferEditIntent(text, contextPlan = null) {
  const operations = contextPlan?.operation_scope || contextPlan?.operationScope || [];
  if (operations.includes('add_node') || isAddNodeRequest(text)) return 'add_node';
  if (operations.includes('add_phase') || textIncludesAny(text, ['add phase', '\u65b0\u589e\u9636\u6bb5', '\u6dfb\u52a0\u9636\u6bb5', '\u589e\u52a0\u9636\u6bb5'])) return 'add_phase';
  if (operations.includes('delete_node') || textIncludesAny(text, ['delete node', 'remove node', '\u5220\u9664\u8282\u70b9', '\u79fb\u9664\u8282\u70b9'])) return 'delete_node';
  if (operations.includes('update_node') || textIncludesAny(text, ['update node', 'change node', '\u4fee\u6539\u8282\u70b9', '\u66f4\u65b0\u8282\u70b9'])) return 'update_node';
  return 'workflow_edit';
}

function mergeEditSlots(previous = {}, next = {}) {
  const merged = { ...previous };
  for (const [key, value] of Object.entries(next || {})) {
    if ((key === 'target_phase_id' || key === 'target_phase_name') && merged[key]) continue;
    if (Array.isArray(value)) {
      if (value.length) merged[key] = value;
    } else if (value !== null && value !== undefined && value !== '') {
      merged[key] = value;
    }
  }
  return merged;
}

function buildEditSlots(project, intent, text) {
  if (intent === 'add_node') {
    const phase = findWorkflowPhase(project, text);
    return {
      node_name: firstQuotedText(text) || '',
      target_phase_id: phase?.id || null,
      target_phase_name: phase?.name || null,
      goal: extractAgentSlotText(text, 'goal') || null,
      inputs: splitAgentSlotList(extractAgentSlotText(text, 'inputs')),
      outputs: splitAgentSlotList(extractAgentSlotText(text, 'outputs')),
      owner: extractAgentSlotText(text, 'owner') || null,
      risk: textIncludesAny(text, ['high risk', '\u9ad8\u98ce\u9669', '\u98ce\u9669\u9ad8']) ? 'high'
        : (textIncludesAny(text, ['low risk', '\u4f4e\u98ce\u9669', '\u98ce\u9669\u4f4e']) ? 'low'
          : (textIncludesAny(text, ['risk', '\u98ce\u9669']) ? 'medium' : null)),
      execution: textIncludesAny(text, ['human only', '\u4eba\u5de5\u6267\u884c', '\u7eaf\u4eba\u5de5']) ? 'human_only'
        : (textIncludesAny(text, ['ai execute', 'AI \u6267\u884c', '\u4eba\u5de5\u5ba1\u6279']) ? 'ai_execute_human_approval'
          : (textIncludesAny(text, ['ai draft', 'AI \u8d77\u8349', '\u4eba\u5de5\u5ba1\u6838']) ? 'ai_draft_human_review' : null)),
    };
  }
  if (intent === 'update_node') {
    const matches = matchingWorkflowNodes(project, text);
    const target = matches.length === 1 ? matches[0] : null;
    const field = inferServerNodeEditField(text);
    const value = extractServerEditValue(text);
    return {
      target_node_id: target?.id || target?.node_id || null,
      target_node_name: target?.name || null,
      field: field || null,
      value: value || null,
    };
  }
  return {};
}

function findMissingEditSlots(intent, slots) {
  if (intent === 'update_node') {
    return [
      !slots.target_node_id ? 'target_node' : null,
      !slots.field ? 'field' : null,
      slots.value === null || slots.value === undefined || slots.value === '' ? 'value' : null,
    ].filter(Boolean);
  }
  if (intent !== 'add_node') return [];
  return [
    !slots.node_name ? 'node_name' : null,
    !slots.goal ? 'goal' : null,
    !slots.inputs?.length ? 'inputs' : null,
    !slots.outputs?.length ? 'outputs' : null,
    !slots.owner ? 'owner' : null,
    !slots.risk ? 'risk' : null,
    !slots.execution ? 'execution' : null,
  ].filter(Boolean);
}

function createEditPlan(intent, slots, contextPlan = {}) {
  if (intent === 'add_node') {
    return [
      { id: 'slot-check', title: 'Confirm required node details', status: findMissingEditSlots(intent, slots).length ? 'needs_input' : 'done' },
      { id: 'context-select', title: `Select target phase ${slots.target_phase_name || slots.target_phase_id || 'from request'}`, status: slots.target_phase_id ? 'done' : 'pending' },
      { id: 'node-diff', title: `Create reviewable node diff for ${slots.node_name || 'new node'}`, status: 'pending' },
      { id: 'validate', title: 'Validate workflow diff before user review', status: 'pending' },
    ];
  }
  if (intent === 'update_node') {
    return [
      { id: 'slot-check', title: 'Confirm target node, field, and value', status: findMissingEditSlots(intent, slots).length ? 'needs_input' : 'done' },
      { id: 'context-select', title: `Select node ${slots.target_node_name || slots.target_node_id || 'from request'}`, status: slots.target_node_id ? 'done' : 'pending' },
      { id: 'node-diff', title: `Create reviewable field diff for ${slots.field || 'node field'}`, status: 'pending' },
      { id: 'validate', title: 'Validate workflow diff before user review', status: 'pending' },
    ];
  }
  return [
    { id: 'context-select', title: 'Infer workflow edit context', status: contextPlan?.targets?.length ? 'done' : 'pending' },
    { id: 'diff', title: 'Generate reviewable workflow diff', status: 'pending' },
    { id: 'validate', title: 'Validate workflow diff before user review', status: 'pending' },
  ];
}

function buildAddNodeDiffFromSlots(project, requestText, slots = {}) {
  if (!slots.node_name || !slots.goal || !slots.inputs?.length || !slots.outputs?.length || !slots.owner || !slots.risk || !slots.execution) return null;
  const phases = project.workflow?.phases || [];
  const phase = phases.find((item) => item.id === slots.target_phase_id || item.name === slots.target_phase_name)
    || findWorkflowPhase(project, `${slots.target_phase_name || ''} ${requestText || ''}`)
    || phases[0];
  if (!phase) return null;
  const baseId = safeId(`node-${phase.id}-${slots.node_name}`, `node-${Date.now()}`);
  const existingIds = new Set((project.workflow?.nodes || []).map((node) => node.id || node.node_id));
  let nodeId = baseId;
  let suffix = 2;
  while (existingIds.has(nodeId)) {
    nodeId = `${baseId}-${suffix}`;
    suffix += 1;
  }
  const isChinese = textHasChinese(`${requestText || ''} ${slots.node_name || ''}`);
  const node = {
    id: nodeId,
    phase_id: phase.id,
    name: slots.node_name,
    goal: slots.goal,
    execution_mode: slots.execution,
    risk_level: normalizeProjectRisk(slots.risk) || slots.risk || 'medium',
    status: 'draft',
    human_owner_role: slots.owner,
    ai_role: slots.execution === 'human_only' ? '' : 'Workflow Assistant',
    inputs: slots.inputs,
    outputs: slots.outputs,
    artifact_contract: {
      id: `artifact-${nodeId}`,
      format: 'markdown',
      output_format: isChinese ? `${slots.node_name} \u4ea4\u4ed8\u7269` : `${slots.node_name} deliverable`,
      acceptance_criteria: [isChinese ? '\u4ea4\u4ed8\u7269\u5185\u5bb9\u5b8c\u6574' : 'Deliverable is complete'],
    },
    review_gate: slots.risk === 'high'
      ? { id: `gate-${nodeId}`, required: true, approver_role: slots.owner, description: isChinese ? '\u9ad8\u98ce\u9669\u8282\u70b9\u9700\u8981\u4eba\u5de5\u5ba1\u6838' : 'High-risk node requires human review' }
      : null,
    prompt_status: slots.execution === 'human_only' ? 'not_required' : 'draft',
    checklist_status: 'draft',
    history: [{ at: new Date().toISOString(), action: 'Added by workflow edit agent slots' }],
  };
  return {
    id: `diff-${Date.now()}-slot-add-node`,
    request: requestText,
    summary: isChinese ? `\u65b0\u589e\u8282\u70b9 ${slots.node_name}` : `Add node ${slots.node_name}`,
    changes: [{
      id: `change-add-${nodeId}`,
      type: 'added',
      targetType: 'node',
      targetId: nodeId,
      field: 'node',
      before: null,
      after: node,
      reason: isChinese ? `\u6839\u636e\u8865\u5145\u4fe1\u606f\u5c06 ${slots.node_name} \u52a0\u5230 ${phase.name}` : `Add ${slots.node_name} to ${phase.name} from clarified details`,
      impact: isChinese ? '\u65b0\u589e\u4e00\u4e2a\u5df2\u8865\u5168\u5173\u952e\u5b57\u6bb5\u7684\u5de5\u4f5c\u6d41\u8282\u70b9' : 'adds a workflow node with clarified goal, IO, owner, risk, and execution mode',
      selected: true,
    }],
    warnings: [],
    createdAt: new Date().toISOString(),
  };
}

function readServerNodeField(node, field) {
  const readers = {
    name: () => node?.name || '',
    goal: () => node?.goal || '',
    riskLevel: () => node?.risk_level || node?.riskLevel || 'medium',
    executionMode: () => node?.execution_mode || node?.executionMode || 'human_lead_ai_assist',
    humanOwnerRole: () => node?.human_owner_role || node?.humanOwnerRole || '',
    aiRole: () => node?.ai_role || node?.aiRole || '',
    inputs: () => node?.inputs || [],
    outputs: () => node?.outputs || [],
    status: () => node?.status || 'draft',
  };
  return (readers[field] || (() => node?.[field]))();
}

function normalizeServerNodeEditValue(field, value) {
  const raw = String(value || '').trim();
  const lowered = raw.toLowerCase();
  if (field === 'riskLevel') {
    if (textIncludesAny(raw, ['high', '\u9ad8'])) return 'high';
    if (textIncludesAny(raw, ['low', '\u4f4e'])) return 'low';
    if (textIncludesAny(raw, ['medium', 'mid', '\u4e2d'])) return 'medium';
    return raw;
  }
  if (field === 'executionMode') {
    if (textIncludesAny(lowered, ['human only', 'human_only', '\u7eaf\u4eba\u5de5', '\u4eba\u5de5\u6267\u884c'])) return 'human_only';
    if (textIncludesAny(lowered, ['approval', 'ai_execute_human_approval', '\u4eba\u5de5\u5ba1\u6279'])) return 'ai_execute_human_approval';
    if (textIncludesAny(lowered, ['review', 'ai_draft_human_review', '\u4eba\u5de5\u5ba1\u6838', '\u590d\u6838'])) return 'ai_draft_human_review';
    if (textIncludesAny(lowered, ['autonomous', 'ai_autonomous', '\u81ea\u4e3b'])) return 'ai_autonomous';
    if (textIncludesAny(lowered, ['assist', 'human_lead_ai_assist', '\u8f85\u52a9'])) return 'human_lead_ai_assist';
    return raw;
  }
  if (field === 'inputs' || field === 'outputs') return splitAgentSlotList(raw);
  return raw;
}

function buildUpdateNodeDiffFromSlots(project, requestText, slots = {}) {
  if (!slots.target_node_id || !slots.field || slots.value === null || slots.value === undefined || slots.value === '') return null;
  const node = (project.workflow?.nodes || []).find((item) => (item.id || item.node_id) === slots.target_node_id);
  if (!node) return null;
  const before = readServerNodeField(node, slots.field);
  const after = normalizeServerNodeEditValue(slots.field, slots.value);
  if (Array.isArray(after) && after.length === 0) return null;
  if (JSON.stringify(before ?? null) === JSON.stringify(after)) return null;
  const isChinese = textHasChinese(`${requestText || ''} ${slots.value || ''}`);
  return {
    id: `diff-${Date.now()}-slot-update-node`,
    request: requestText,
    summary: isChinese
      ? `\u4fee\u6539\u8282\u70b9 ${node.name || slots.target_node_id} \u7684 ${slots.field}`
      : `Update ${node.name || slots.target_node_id} ${slots.field}`,
    changes: [{
      id: `change-node-${safeId(`${slots.target_node_id}-${slots.field}`, `${Date.now()}`)}`,
      type: 'updated',
      targetType: 'node',
      targetId: slots.target_node_id,
      field: slots.field,
      before,
      after,
      reason: isChinese
        ? `\u6839\u636e\u5bf9\u8bdd\u8865\u5145\u4fe1\u606f\u4fee\u6539 ${node.name || slots.target_node_id} \u7684 ${slots.field}`
        : `Update ${node.name || slots.target_node_id} ${slots.field} from clarified details`,
      impact: isChinese ? '\u53ea\u4fee\u6539\u8282\u70b9\u5b57\u6bb5\uff0c\u4e0d\u6539\u53d8\u5de5\u4f5c\u6d41\u62d3\u6251' : 'updates node detail data without changing workflow topology',
      selected: true,
    }],
    warnings: [],
    createdAt: new Date().toISOString(),
  };
}

function workflowEditRequestWithSlots(requestText, slots) {
  if (slots?.target_node_id && slots?.field && slots?.value) {
    return [
      requestText,
      `update node ${slots.target_node_name || slots.target_node_id}`,
      `field: ${slots.field}`,
      `value: ${slots.value}`,
    ].filter(Boolean).join('\n');
  }
  if (!slots?.node_name) return requestText;
  return [
    requestText,
    `add node named ${slots.node_name}`,
    slots.target_phase_name ? `target phase: ${slots.target_phase_name}` : '',
    slots.goal ? `goal: ${slots.goal}` : '',
    slots.inputs?.length ? `inputs: ${slots.inputs.join(', ')}` : '',
    slots.outputs?.length ? `outputs: ${slots.outputs.join(', ')}` : '',
    slots.owner ? `owner: ${slots.owner}` : '',
    slots.risk ? `${slots.risk} risk` : '',
    slots.execution ? `execution mode: ${slots.execution}` : '',
  ].filter(Boolean).join('\n');
}

function buildAgentTrace({ stage, intent, slots, contextPlan = null, diff = null, evaluation = null, generationSource = null, repairAttempt = null }) {
  const trace = [{
    stage: 'planner',
    status: stage === 'collecting_info' ? 'needs_input' : 'completed',
    intent,
    missing_slots: findMissingEditSlots(intent, slots),
    context_targets: (contextPlan?.targets || []).map((target) => ({ type: target.type, id: target.id, name: target.name })),
    operation_scope: contextPlan?.operation_scope || contextPlan?.operationScope || [],
  }];
  if (diff) trace.push({ stage: 'patcher', status: 'completed', generation_source: generationSource || diff.generation_source || 'unknown', diff_id: diff.id, changes_count: (diff.changes || []).length, selected_count: (diff.changes || []).filter((change) => change.selected !== false).length });
  if (repairAttempt) trace.push({ stage: 'repair', status: repairAttempt.error ? 'failed' : 'completed', source: repairAttempt.source, model_status: repairAttempt.result?.status || null, error: repairAttempt.error?.message || null });
  if (evaluation) trace.push({ stage: 'critic', status: evaluation.ok ? 'passed' : 'needs_attention', score: evaluation.score, errors: evaluation.errors, warnings: evaluation.warnings, issues: evaluation.issues || [] });
  return trace;
}

function createExecutionPlanFromChanges(changes = [], options = {}) {
  const currentIds = new Set(options.currentIds || changes.map((change) => change.id));
  const appliedIds = new Set(options.appliedIds || []);
  const skippedIds = new Set(options.skippedIds || []);
  const rejectedIds = new Set(options.rejectedIds || []);
  const pendingIds = new Set(options.pendingIds || []);
  const evaluation = options.evaluation || null;
  return [
    { id: 'planner', title: 'Infer workflow edit intent and context', status: 'done' },
    ...changes.map((change, index) => ({
      id: `change-${index + 1}`,
      title: `${change.type || 'update'} ${change.targetType || 'target'} ${change.targetId || change.after?.id || ''}`.trim(),
      status: appliedIds.has(change.id) ? 'applied'
        : (skippedIds.has(change.id) ? 'skipped'
          : (rejectedIds.has(change.id) ? 'rejected'
            : (pendingIds.has(change.id) || !currentIds.has(change.id) ? 'pending' : (change.selected === false ? 'skipped' : 'ready')))),
      change_id: change.id,
      target_type: change.targetType || change.target_type,
      target_id: change.targetId || change.target_id,
    })),
    { id: 'critic', title: 'Validate proposed workflow diff', status: evaluation?.ok ? 'done' : 'needs_attention' },
  ];
}

function createExecutionPlanFromDiff(diff, evaluation) {
  return createExecutionPlanFromChanges(diff?.changes || [], { evaluation });
}

function boundedEditSessionBatchSize(rawSize) {
  const size = Number(rawSize || DEFAULT_EDIT_SESSION_BATCH_SIZE);
  if (!Number.isFinite(size) || size <= 0) return DEFAULT_EDIT_SESSION_BATCH_SIZE;
  return Math.max(1, Math.min(10, Math.floor(size)));
}

function buildBatchedWorkflowDiff(diff, batchSize, completedIds = [], batchIndex = 1) {
  const allChanges = diff?.changes || [];
  const completed = new Set(completedIds || []);
  const remaining = allChanges.filter((change) => !completed.has(change.id));
  const currentChanges = remaining.slice(0, batchSize);
  const pendingChanges = remaining.slice(currentChanges.length);
  const batchDiff = {
    ...diff,
    id: `${diff.id}-batch-${batchIndex}`,
    parent_diff_id: diff.parent_diff_id || diff.id,
    parentDiffId: diff.parentDiffId || diff.id,
    changes: currentChanges,
    batch: {
      index: batchIndex,
      size: batchSize,
      total_changes: allChanges.length,
      current_change_ids: currentChanges.map((change) => change.id),
      pending_change_ids: pendingChanges.map((change) => change.id),
    },
  };
  return { batchDiff, currentChanges, pendingChanges, remainingChanges: remaining };
}

function selectedDiffChangeIds(diff, rawSelectedIds) {
  if (Array.isArray(rawSelectedIds) && rawSelectedIds.length > 0) return rawSelectedIds;
  return (diff?.changes || []).filter((change) => change.selected !== false).map((change) => change.id);
}

function closeEditSessionAfterApply(session, diff, selectedChangeIds) {
  if (!session) return null;
  const selected = new Set(selectedChangeIds);
  const diffChangeIds = new Set((diff?.changes || []).map((change) => change.id));
  const previousApplied = session.applied_change_ids || session.appliedChangeIds || [];
  const previousSkipped = session.skipped_change_ids || session.skippedChangeIds || [];
  const allChanges = session.all_changes || session.allChanges || diff?.changes || [];
  const applied = [...new Set([...previousApplied, ...selected])];
  const skipped = [...new Set([...previousSkipped, ...[...diffChangeIds].filter((id) => !selected.has(id))])];
  const completed = new Set([...applied, ...skipped, ...(session.rejected_change_ids || session.rejectedChangeIds || [])]);
  const pending = allChanges.filter((change) => !completed.has(change.id));
  const hasMore = pending.length > 0;
  const plan = createExecutionPlanFromChanges(allChanges, {
    currentIds: (diff?.changes || []).map((change) => change.id),
    appliedIds: applied,
    skippedIds: skipped,
    rejectedIds: session.rejected_change_ids || session.rejectedChangeIds || [],
    pendingIds: pending.map((change) => change.id),
    evaluation: { ok: true },
  });
  return appendEditSessionMessage({
    ...session,
    status: hasMore ? 'awaiting_next_batch' : 'applied',
    plan,
    candidate_diff_id: hasMore ? null : session.candidate_diff_id,
    candidateDiffId: hasMore ? null : (session.candidateDiffId || session.candidate_diff_id),
    applied_change_ids: applied,
    skipped_change_ids: skipped,
    pending_change_ids: pending.map((change) => change.id),
    appliedChangeIds: applied,
    skippedChangeIds: skipped,
    pendingChangeIds: pending.map((change) => change.id),
  }, {
    role: 'agent',
    status: hasMore ? 'awaiting_next_batch' : 'applied',
    content: `Applied ${selected.size} workflow change${selected.size === 1 ? '' : 's'}.${skipped.length ? ` Skipped ${skipped.length}.` : ''}${hasMore ? ` ${pending.length} change${pending.length === 1 ? '' : 's'} remain for the next batch.` : ''}`,
  });
}

function closeEditSessionAfterReject(session) {
  if (!session) return null;
  const plan = (session.plan || []).map((step) => (step.change_id ? { ...step, status: 'rejected' } : step));
  return appendEditSessionMessage({ ...session, status: 'rejected', plan }, {
    role: 'agent',
    status: 'rejected',
    content: 'Rejected workflow changes.',
  });
}

function isCancelEditSessionRequest(text) {
  return textIncludesAny(text, [
    'cancel',
    'cancel this edit',
    'cancel current edit',
    'stop this edit',
    'discard this edit',
    'nevermind',
    'never mind',
    'start over',
    '\u53d6\u6d88',
    '\u53d6\u6d88\u8fd9\u6b21',
    '\u505c\u6b62\u8fd9\u6b21',
    '\u4e0d\u505a\u4e86',
    '\u91cd\u65b0\u6765',
  ]);
}

function cancelActiveEditSession(session, requestText) {
  if (!session) return null;
  const plan = (session.plan || []).map((step) => (
    ['done', 'applied', 'skipped', 'rejected'].includes(step.status)
      ? step
      : { ...step, status: 'cancelled' }
  ));
  appendEditSessionMessage(session, { role: 'user', content: requestText });
  return appendEditSessionMessage({
    ...session,
    status: 'cancelled',
    candidate_diff_id: null,
    candidateDiffId: null,
    pending_change_ids: [],
    pendingChangeIds: [],
    plan,
  }, {
    role: 'agent',
    status: 'cancelled',
    content: textHasChinese(requestText) ? '\u5df2\u53d6\u6d88\u5f53\u524d\u5de5\u4f5c\u6d41\u4fee\u6539\u4efb\u52a1\u3002' : 'Cancelled the current workflow edit task.',
  });
}

function buildEditSession(project, requestText, effectiveRequest, contextPlan = null, patch = {}) {
  const existing = getActiveEditSession(project);
  const intent = patch.intent || existing?.intent || inferEditIntent(effectiveRequest, contextPlan);
  const slots = mergeEditSlots(mergeEditSlots(existing?.slots || {}, buildEditSlots(project, intent, effectiveRequest)), patch.slots || {});
  const missingSlots = patch.missing_slots || findMissingEditSlots(intent, slots);
  const now = new Date().toISOString();
  const trace = patch.agent_trace || patch.agentTrace || existing?.agent_trace || existing?.agentTrace || [];
  return {
    id: existing?.id || `edit_session_${randomUUID()}`,
    project_id: project.id,
    status: patch.status || (missingSlots.length ? 'collecting_info' : 'planning'),
    intent,
    original_request: existing?.original_request || requestText,
    effective_request: effectiveRequest,
    slots,
    missing_slots: missingSlots,
    plan: patch.plan || existing?.plan || createEditPlan(intent, slots, contextPlan),
    context_plan: contextPlan || existing?.context_plan || null,
    context_scope: patch.context_scope || existing?.context_scope || null,
    candidate_diff_id: patch.candidate_diff_id || existing?.candidate_diff_id || null,
    root_diff_id: patch.root_diff_id || existing?.root_diff_id || existing?.rootDiffId || null,
    rootDiffId: patch.rootDiffId || patch.root_diff_id || existing?.rootDiffId || existing?.root_diff_id || null,
    generation_source: patch.generation_source || existing?.generation_source || existing?.generationSource || null,
    generationSource: patch.generationSource || patch.generation_source || existing?.generationSource || existing?.generation_source || null,
    summary: patch.summary || existing?.summary || null,
    all_changes: patch.all_changes || existing?.all_changes || existing?.allChanges || [],
    allChanges: patch.allChanges || patch.all_changes || existing?.allChanges || existing?.all_changes || [],
    batch_size: patch.batch_size || existing?.batch_size || existing?.batchSize || DEFAULT_EDIT_SESSION_BATCH_SIZE,
    batchSize: patch.batchSize || patch.batch_size || existing?.batchSize || existing?.batch_size || DEFAULT_EDIT_SESSION_BATCH_SIZE,
    batch_index: patch.batch_index || existing?.batch_index || existing?.batchIndex || 0,
    batchIndex: patch.batchIndex || patch.batch_index || existing?.batchIndex || existing?.batch_index || 0,
    total_changes: patch.total_changes || existing?.total_changes || existing?.totalChanges || 0,
    totalChanges: patch.totalChanges || patch.total_changes || existing?.totalChanges || existing?.total_changes || 0,
    pending_change_ids: patch.pending_change_ids || existing?.pending_change_ids || existing?.pendingChangeIds || [],
    pendingChangeIds: patch.pendingChangeIds || patch.pending_change_ids || existing?.pendingChangeIds || existing?.pending_change_ids || [],
    applied_change_ids: patch.applied_change_ids || existing?.applied_change_ids || existing?.appliedChangeIds || [],
    appliedChangeIds: patch.appliedChangeIds || patch.applied_change_ids || existing?.appliedChangeIds || existing?.applied_change_ids || [],
    skipped_change_ids: patch.skipped_change_ids || existing?.skipped_change_ids || existing?.skippedChangeIds || [],
    skippedChangeIds: patch.skippedChangeIds || patch.skipped_change_ids || existing?.skippedChangeIds || existing?.skipped_change_ids || [],
    rejected_change_ids: patch.rejected_change_ids || existing?.rejected_change_ids || existing?.rejectedChangeIds || [],
    rejectedChangeIds: patch.rejectedChangeIds || patch.rejected_change_ids || existing?.rejectedChangeIds || existing?.rejected_change_ids || [],
    validation: patch.validation || existing?.validation || [],
    agent_trace: trace,
    agentTrace: trace,
    messages: [...(existing?.messages || []), { role: 'user', content: requestText, at: now }].slice(-AI_CONVERSATION_LIMIT),
    created_at: existing?.created_at || now,
    updated_at: now,
  };
}

function evaluateDiffCandidate(project, diff) {
  const changes = diff?.changes || [];
  const issues = [];
  if (!changes.length) issues.push({ level: 'error', code: 'empty_diff', message: 'No changes were produced.' });
  for (const change of changes) {
    if (!change.targetType || !change.type) issues.push({ level: 'error', code: 'invalid_change', message: `Change ${change.id || 'unknown'} is missing type or targetType.` });
    if (change.type === 'added' && change.targetType === 'node' && (!change.after?.name || !change.after?.goal)) issues.push({ level: 'warning', code: 'underspecified_node', message: `Added node ${change.targetId || change.after?.id || 'unknown'} is missing name or goal.` });
  }
  try {
    const previewWorkflow = applyDiff(structuredClone(project.workflow), diff, changes.filter((change) => change.selected !== false).map((change) => change.id));
    issues.push(...validateRulesWorkflow(previewWorkflow, project.assets, { forGeneration: false, modelConfig: getModelStatus() }).map((item) => ({ level: item.level || 'warning', code: item.ruleId || item.id || 'validation', message: item.message || item.title || 'Workflow validation issue' })));
  } catch (error) {
    issues.push({ level: 'error', code: 'diff_apply_failed', message: error.message || 'Diff cannot be applied.' });
  }
  const errors = issues.filter((item) => item.level === 'error').length;
  const warnings = issues.filter((item) => item.level === 'warning').length;
  return { ok: errors === 0, score: Math.max(0, 100 - errors * 35 - warnings * 10), errors, warnings, issues };
}

function repairWorkflowDiffCandidate(diff, evaluation) {
  const repaired = structuredClone(diff);
  repaired.repair_strategy = 'workflow_diff_repair';
  repaired.repair_issues = evaluation?.issues || [];
  return repaired;
}

async function repairWorkflowDiffWithModel(ctx, project, requestText, diff, evaluation, contextPlan, workflowIndex, focusedSubgraph, outputContract) {
  const fallback = {
    diff: repairWorkflowDiffCandidate(diff, evaluation),
    result: null,
    source: 'deterministic_repair',
    error: null,
  };
  try {
    const result = await runModel('workflow_diff_repair', {
      request: requestText,
      invalid_diff: diff,
      validation: evaluation,
      context_plan: contextPlan,
      workflow_index: workflowIndex,
      focused_subgraph: focusedSubgraph,
      output_contract: outputContract,
    });
    modelCalls.unshift({
      id: `call_${Date.now()}_repair`,
      workspace_id: ctx.workspace_id,
      created_by: ctx.user_id,
      created_at: new Date().toISOString(),
      model: result.model,
      purpose: 'workflow_diff_repair',
      status: result.status,
      summary: result.output?.summary || `repair diff request: ${requestText}`,
    });
    const repaired = normalizeAgentDiff(result?.output, requestText, project.workflow, contextPlan);
    if (Array.isArray(repaired?.changes) && repaired.changes.length > 0 && result.status !== 'mock') {
      return { diff: repaired, result, source: 'llm_repair', error: null };
    }
    return { ...fallback, result, source: result.status === 'mock' ? 'mock_repair_fallback' : 'model_empty_repair_fallback' };
  } catch (error) {
    modelCalls.unshift({
      id: `call_${Date.now()}_repair`,
      workspace_id: ctx.workspace_id,
      created_by: ctx.user_id,
      created_at: new Date().toISOString(),
      model: getModelStatus().diff_model,
      purpose: 'workflow_diff_repair',
      status: 'failed',
      summary: error.message,
    });
    return { ...fallback, error };
  }
}

function assetCollectionForTargetType(assets, targetType) {
  if (targetType === 'prompt') return 'prompts';
  if (targetType === 'checklist') return 'checklists';
  if (targetType === 'artifact_template') return assets.artifact_templates ? 'artifact_templates' : 'artifactTemplates';
  return null;
}

function applyAssetDiffChanges(assets, diff, selectedChangeIds = []) {
  const next = structuredClone(assets || { prompts: [], checklists: [], artifact_templates: [], artifactTemplates: [] });
  const selected = (diff.changes || []).filter((change) => selectedChangeIds.length === 0 || selectedChangeIds.includes(change.id));
  for (const change of selected) {
    const targetType = change.targetType || change.target_type;
    const collectionName = assetCollectionForTargetType(next, targetType);
    if (!collectionName) continue;
    const collection = Array.isArray(next[collectionName]) ? next[collectionName] : [];
    const targetId = change.targetId || change.target_id || change.after?.id;
    if (change.type === 'deleted') {
      next[collectionName] = collection.filter((item) => item.id !== targetId);
    } else if (change.type === 'added') {
      if (change.after && !collection.some((item) => item.id === (change.after.id || targetId))) next[collectionName] = [...collection, change.after];
    } else {
      next[collectionName] = collection.map((item) => (item.id === targetId ? { ...item, ...(change.field && change.field !== targetType ? { [change.field]: change.after } : change.after) } : item));
    }
  }
  next.artifactTemplates = next.artifactTemplates || next.artifact_templates || [];
  next.artifact_templates = next.artifact_templates || next.artifactTemplates || [];
  return next;
}

function textHasChinese(text) {
  return /[\u4e00-\u9fff]/.test(String(text || ''));
}

function textIncludesAny(text, needles) {
  const value = String(text || '').toLowerCase();
  return needles.some((needle) => value.includes(String(needle).toLowerCase()));
}

function isAddNodeRequest(text) {
  return textIncludesAny(text, ['add node', 'add step', 'new node', '\u65b0\u589e\u8282\u70b9', '\u6dfb\u52a0\u8282\u70b9', '\u589e\u52a0\u8282\u70b9']);
}

function isDeleteNodeRequest(text) {
  return textIncludesAny(text, ['delete node', 'remove node', 'delete step', 'remove step', '\u5220\u9664\u8282\u70b9', '\u79fb\u9664\u8282\u70b9', '\u5220\u6389\u8282\u70b9'])
    || (textIncludesAny(text, ['delete ', 'remove ', '\u5220\u9664', '\u79fb\u9664']) && !textIncludesAny(text, ['phase', '\u9636\u6bb5', 'edge', '\u8fde\u7ebf']));
}

function isUpdateNodeRequest(text) {
  return textIncludesAny(text, ['update node', 'change node', 'modify node', 'set node', 'rename node', '\u4fee\u6539\u8282\u70b9', '\u66f4\u65b0\u8282\u70b9', '\u8bbe\u7f6e\u8282\u70b9', '\u91cd\u547d\u540d\u8282\u70b9'])
    || (textIncludesAny(text, ['\u6539\u6210', '\u6539\u4e3a', '\u8bbe\u4e3a', '\u8bbe\u7f6e\u4e3a']) && Boolean(inferServerNodeEditField(text)));
}

function hasNodeDetailSignal(text, needles) {
  return textIncludesAny(text, needles);
}

function matchingWorkflowNodes(project, text) {
  const value = String(text || '').toLowerCase();
  const nodes = project.workflow?.nodes || [];
  const exactMatches = nodes.filter((node) => {
    const id = String(node.id || node.node_id || '').toLowerCase();
    const name = String(node.name || '').toLowerCase();
    return (id && value.includes(id)) || (name && value.includes(name));
  });
  if (exactMatches.length) return exactMatches;
  const stopWords = new Set([
    'delete', 'remove', 'node', 'step', 'update', 'change', 'modify', 'set', 'rename', 'the', 'a', 'an',
    '\u5220\u9664', '\u79fb\u9664', '\u8282\u70b9', '\u4fee\u6539', '\u66f4\u65b0', '\u8bbe\u7f6e', '\u91cd\u547d\u540d',
  ]);
  const tokens = value
    .split(/[^a-z0-9\u4e00-\u9fff]+/i)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !stopWords.has(token));
  const scored = nodes.map((node) => {
    const id = String(node.id || node.node_id || '').toLowerCase();
    const name = String(node.name || '').toLowerCase();
    const nameTokens = name.split(/[^a-z0-9\u4e00-\u9fff]+/i).filter(Boolean);
    const score = tokens.reduce((sum, token) => (
      sum + (nameTokens.includes(token) || name.includes(token) || token.includes(name) ? 10 : 0)
    ), 0);
    return { node, score };
  }).filter((item) => item.score > 0);
  return scored.sort((a, b) => b.score - a.score).map((item) => item.node);
}

function inferServerNodeEditField(text) {
  const fields = [
    ['executionMode', ['execution mode', 'mode', '\u6267\u884c\u6a21\u5f0f', '\u6a21\u5f0f']],
    ['riskLevel', ['risk level', 'risk', '\u98ce\u9669\u7b49\u7ea7', '\u98ce\u9669']],
    ['humanOwnerRole', ['owner', 'human owner', '\u8d1f\u8d23\u4eba', '\u4eba\u5de5\u8d1f\u8d23\u4eba']],
    ['inputs', ['input', 'inputs', '\u8f93\u5165']],
    ['outputs', ['output', 'outputs', '\u8f93\u51fa']],
    ['status', ['status', '\u72b6\u6001']],
    ['goal', ['goal', 'objective', '\u76ee\u6807']],
    ['name', ['name', 'rename', '\u540d\u79f0', '\u540d\u5b57', '\u91cd\u547d\u540d']],
  ];
  return fields.find(([, needles]) => textIncludesAny(text, needles))?.[0] || '';
}

function hasServerEditValue(text) {
  return Boolean(extractServerEditValue(text));
}

function extractServerEditValue(text) {
  const value = String(text || '');
  const verbMatches = [...value.matchAll(/(?:\u66f4\u65b0\u4e3a|\u8bbe\u7f6e\u4e3a|\u6539\u4e3a|\u6539\u6210|\u8bbe\u4e3a|to|as|\u4e3a)\s*[\u201c\u201d"']?(.+?)[\u201c\u201d"']?(?=$|\n)/gi)];
  if (verbMatches.length) return verbMatches.at(-1)?.[1]?.trim() || '';
  const valueMatches = [...value.matchAll(/(?:^|\n)\s*(?:value|new value|after)\s*(?:=|:)\s*[\u201c\u201d"']?(.+?)[\u201c\u201d"']?(?=$|\n)/gi)];
  if (valueMatches.length) return valueMatches.at(-1)?.[1]?.trim() || '';
  const assignmentMatches = [...value.matchAll(/(?:=)\s*[\u201c\u201d"']?(.+?)[\u201c\u201d"']?(?=$|\n)/gi)];
  return assignmentMatches.at(-1)?.[1]?.trim() || '';
}

function buildNodeClarification(project, requestText) {
  const request = String(requestText || '');
  if (!isAddNodeRequest(request)) return null;
  const isChinese = textHasChinese(request);
  const missing = [];
  if (!hasNodeDetailSignal(request, ['goal', 'objective', 'purpose', '\u76ee\u6807', '\u7528\u6765', '\u4e3a\u4e86'])) missing.push('goal');
  if (!hasNodeDetailSignal(request, ['input', 'inputs', 'depend', 'from', '\u8f93\u5165', '\u4f9d\u8d56', '\u57fa\u4e8e'])) missing.push('inputs');
  if (!hasNodeDetailSignal(request, ['output', 'outputs', 'deliverable', 'artifact', '\u8f93\u51fa', '\u4ea4\u4ed8', '\u4ea7\u51fa'])) missing.push('outputs');
  if (!hasNodeDetailSignal(request, ['owner', 'responsible', 'role', 'human', 'ai', '\u8d1f\u8d23', '\u89d2\u8272', '\u4eba\u5de5', '\u81ea\u52a8', '\u667a\u80fd'])) missing.push('execution');
  if (!hasNodeDetailSignal(request, ['risk', 'high', 'medium', 'low', '\u98ce\u9669', '\u9ad8', '\u4e2d', '\u4f4e'])) missing.push('risk');
  if (missing.length < 3) return null;
  const phaseNames = (project.workflow?.phases || []).map((phase) => phase.name).filter(Boolean);
  const questions = isChinese
    ? [
      '\u8fd9\u4e2a\u65b0\u8282\u70b9\u7684\u76ee\u6807\u662f\u4ec0\u4e48\uff1f',
      '\u5b83\u9700\u8981\u54ea\u4e9b\u8f93\u5165\uff0c\u4ea7\u51fa\u54ea\u4e9b\u8f93\u51fa\uff1f',
      '\u8c01\u8d1f\u8d23\u8be5\u8282\u70b9\uff0c\u5e0c\u671b\u662f\u4eba\u5de5\u6267\u884c\u3001AI \u8d77\u8349\u8fd8\u662f AI \u6267\u884c\u540e\u4eba\u5de5\u5ba1\u6279\uff1f',
      '\u8be5\u8282\u70b9\u7684\u98ce\u9669\u7b49\u7ea7\u662f\u4f4e\u3001\u4e2d\u8fd8\u662f\u9ad8\uff1f',
    ]
    : [
      'What is the goal of this new node?',
      'What inputs does it need, and what outputs should it produce?',
      'Who owns it, and should it be human-only, AI draft with review, or AI execution with human approval?',
      'What risk level should it use: low, medium, or high?',
    ];
  return {
    status: 'needs_clarification',
    reason: isChinese
      ? '\u65b0\u8282\u70b9\u7f3a\u5c11\u76ee\u6807\u3001\u8f93\u5165\u8f93\u51fa\u3001\u8d1f\u8d23\u4eba\u6216\u98ce\u9669\u7b49\u7ea7\u7b49\u5173\u952e\u4fe1\u606f\u3002'
      : 'The new node is missing key details such as goal, inputs, outputs, ownership, or risk level.',
    content: isChinese
      ? `\u6211\u53ef\u4ee5\u5e2e\u4f60\u65b0\u589e\u8282\u70b9\uff0c\u4f46\u9700\u8981\u5148\u8865\u5168\u5173\u952e\u4fe1\u606f\uff0c\u907f\u514d\u521b\u5efa\u7a7a\u767d\u8282\u70b9\u3002${phaseNames.length ? `\u5f53\u524d\u53ef\u9009\u9636\u6bb5\uff1a${phaseNames.join('\u3001')}\u3002` : ''}`
      : `I can add the node, but I need a few details first so we do not create an empty node.${phaseNames.length ? ` Available phases: ${phaseNames.join(', ')}.` : ''}`,
    questions,
    missing_fields: missing,
  };
}

function buildWorkflowEditClarification(project, requestText) {
  const nodeClarification = buildNodeClarification(project, requestText);
  if (nodeClarification) return { ...nodeClarification, intent: 'add_node' };
  const request = String(requestText || '');
  const isChinese = textHasChinese(request);
  const matches = matchingWorkflowNodes(project, request);
  const candidateNodes = matches.map((node) => ({ id: node.id || node.node_id, name: node.name, phase_id: node.phase_id || node.phaseId })).slice(0, 8);
  const candidateText = candidateNodes.map((node) => `${node.name} (${node.id})`).join(isChinese ? '\u3001' : ', ');
  if (isDeleteNodeRequest(request) && matches.length !== 1) {
    const nodeNames = (project.workflow?.nodes || []).map((node) => node.name).filter(Boolean).slice(0, 12);
    return {
      status: 'needs_clarification',
      intent: 'delete_node',
      reason: isChinese ? '\u5220\u9664\u8282\u70b9\u524d\u9700\u8981\u660e\u786e\u552f\u4e00\u76ee\u6807\u8282\u70b9\u3002' : 'Deleting a node requires one clear target node.',
      content: isChinese
        ? `\u4f60\u60f3\u5220\u9664\u54ea\u4e2a\u8282\u70b9\uff1f${candidateText ? `\u6211\u627e\u5230\u7684\u5019\u9009\u8282\u70b9\uff1a${candidateText}\u3002` : (nodeNames.length ? `\u53ef\u9009\u8282\u70b9\uff1a${nodeNames.join('\u3001')}\u3002` : '')}`
        : `Which node should I delete?${candidateText ? ` Candidate nodes: ${candidateText}.` : (nodeNames.length ? ` Available nodes: ${nodeNames.join(', ')}.` : '')}`,
      questions: [isChinese ? '\u8bf7\u63d0\u4f9b\u8981\u5220\u9664\u7684\u8282\u70b9\u540d\u79f0\u6216 ID\u3002' : 'Provide the exact node name or id to delete.'],
      missing_fields: ['target_node'],
      candidate_nodes: candidateNodes,
    };
  }
  if (isUpdateNodeRequest(request)) {
    const missing = [];
    if (matches.length !== 1) missing.push('target_node');
    if (!inferServerNodeEditField(request)) missing.push('field');
    if (!hasServerEditValue(request)) missing.push('value');
    if (missing.length) {
      return {
        status: 'needs_clarification',
        intent: 'update_node',
        reason: isChinese ? '\u4fee\u6539\u8282\u70b9\u9700\u8981\u76ee\u6807\u8282\u70b9\u3001\u5b57\u6bb5\u548c\u65b0\u503c\u3002' : 'Updating a node requires the target node, field, and new value.',
        content: isChinese
          ? '\u6211\u53ef\u4ee5\u4fee\u6539\u8282\u70b9\uff0c\u4f46\u9700\u8981\u5148\u786e\u8ba4\u8981\u6539\u54ea\u4e2a\u8282\u70b9\u3001\u54ea\u4e2a\u5b57\u6bb5\u4ee5\u53ca\u6539\u6210\u4ec0\u4e48\u3002'
          : 'I can update the node, but I need the target node, the field to update, and the new value.',
        questions: [
          isChinese ? '\u8981\u4fee\u6539\u54ea\u4e2a\u8282\u70b9\uff1f' : 'Which node should be updated?',
          isChinese ? '\u8981\u4fee\u6539\u54ea\u4e2a\u5b57\u6bb5\uff08\u540d\u79f0\u3001\u76ee\u6807\u3001\u98ce\u9669\u3001\u8d1f\u8d23\u4eba\u3001\u8f93\u5165\u6216\u8f93\u51fa\uff09\uff1f' : 'Which field should change: name, goal, risk, owner, inputs, or outputs?',
          isChinese ? '\u65b0\u503c\u662f\u4ec0\u4e48\uff1f' : 'What is the new value?',
        ],
        missing_fields: missing,
        candidate_nodes: candidateNodes,
      };
    }
  }
  return null;
}

function getPendingNodeClarification(project) {
  const conversation = ensureAiConversation(project);
  for (let index = conversation.length - 1; index >= 0; index -= 1) {
    const message = conversation[index];
    if (message.role === 'agent' && message.status === 'needs_clarification' && message.intent === 'add_node') {
      const previousUser = conversation.slice(0, index).reverse().find((item) => item.role === 'user');
      return { message, previousUser };
    }
    if (message.role === 'agent' && (message.status === 'draft' || message.status === 'applied' || message.status === 'rejected')) break;
  }
  return null;
}

function resolveWorkflowEditRequest(project, requestText) {
  const active = getActiveEditSession(project);
  if (active?.status === 'collecting_info') {
    const intent = active.intent || inferEditIntent(active.original_request || active.effective_request || '');
    if (intent === 'delete_node') {
      return {
        effectiveRequest: `delete node ${requestText}`,
        pending: { session: active },
      };
    }
    return {
      effectiveRequest: `${active.original_request || active.effective_request || ''}\nAdditional edit details: ${requestText}`,
      pending: { session: active },
    };
  }
  const pending = getPendingNodeClarification(project);
  if (!pending) return { effectiveRequest: requestText, pending: null };
  const original = pending.previousUser?.content || pending.previousUser?.request || '';
  return {
    effectiveRequest: `${original}\nAdditional node details: ${requestText}`,
    pending,
  };
}

function isCancelRemainingEditRequest(text) {
  return textIncludesAny(text, [
    'cancel remaining',
    'skip remaining',
    'stop remaining',
    'discard remaining',
    'do not continue',
    '\u53d6\u6d88\u5269\u4f59',
    '\u8df3\u8fc7\u5269\u4f59',
    '\u4e0d\u8981\u7ee7\u7eed',
    '\u5269\u4e0b\u7684\u4e0d\u505a',
    '\u540e\u7eed\u4e0d\u505a',
  ]);
}

function closeRemainingEditSession(session, requestText) {
  const allChanges = session.all_changes || session.allChanges || [];
  const applied = session.applied_change_ids || session.appliedChangeIds || [];
  const previousSkipped = session.skipped_change_ids || session.skippedChangeIds || [];
  const rejected = session.rejected_change_ids || session.rejectedChangeIds || [];
  const completed = new Set([...applied, ...previousSkipped, ...rejected]);
  const remainingIds = allChanges.filter((change) => !completed.has(change.id)).map((change) => change.id);
  const skipped = [...new Set([...previousSkipped, ...remainingIds])];
  const plan = createExecutionPlanFromChanges(allChanges, {
    currentIds: [],
    appliedIds: applied,
    skippedIds: skipped,
    rejectedIds: rejected,
    pendingIds: [],
    evaluation: { ok: true },
  });
  appendEditSessionMessage(session, { role: 'user', content: requestText });
  return appendEditSessionMessage({
    ...session,
    status: 'applied',
    candidate_diff_id: null,
    candidateDiffId: null,
    plan,
    pending_change_ids: [],
    pendingChangeIds: [],
    skipped_change_ids: skipped,
    skippedChangeIds: skipped,
  }, {
    role: 'agent',
    status: 'applied',
    content: `Stopped the remaining workflow edit plan. ${remainingIds.length} pending change${remainingIds.length === 1 ? '' : 's'} marked as skipped.`,
  });
}

function makeSessionChangeIdsUnique(changes, reservedIds = []) {
  const used = new Set(reservedIds);
  const stamp = Date.now();
  return (changes || []).map((change, index) => {
    const baseId = change.id || `change-${index + 1}`;
    if (!used.has(baseId)) {
      used.add(baseId);
      return change;
    }
    const nextId = `${String(baseId).replace(/[^a-zA-Z0-9_-]/g, '-')}-replan-${stamp}-${index + 1}`;
    used.add(nextId);
    return { ...change, id: nextId };
  });
}

async function replanRemainingEditSession(ctx, project, session, requestText, batchSize) {
  const oldChanges = session.all_changes || session.allChanges || [];
  const appliedIds = session.applied_change_ids || session.appliedChangeIds || [];
  const skippedIds = session.skipped_change_ids || session.skippedChangeIds || [];
  const rejectedIds = session.rejected_change_ids || session.rejectedChangeIds || [];
  const completed = new Set([...appliedIds, ...skippedIds, ...rejectedIds]);
  const remainingIds = oldChanges.filter((change) => !completed.has(change.id)).map((change) => change.id);
  const nextSkippedIds = [...new Set([...skippedIds, ...remainingIds])];
  const agentContextPolicy = 'replan_remaining_work_from_session_state';
  const workflowIndex = buildWorkflowIndex(project.workflow);
  const outputContract = workflowDiffOutputContract();
  let contextPlan = generateWorkflowContextPlan(requestText, workflowIndex);
  let focusedSubgraph = extractFocusedSubgraph(project.workflow, project.assets, contextPlan);
  let planResult = null;
  let modelResult = null;
  try {
    planResult = await runModel('workflow_context_plan', {
      request: requestText,
      context_policy: agentContextPolicy,
      existing_session: {
        id: session.id,
        status: session.status,
        applied_change_ids: appliedIds,
        skipped_change_ids: nextSkippedIds,
        remaining_change_ids: remainingIds,
      },
      workflow_index: workflowIndex,
      output_contract: {
        intent: 'workflow_replan_remaining',
        targets: [{ type: 'node|phase', id: 'existing id', required_context: 'node_with_neighbors|phase|workflow' }],
        graph_expansion: { upstream_depth: 0, downstream_depth: 2 },
        operation_scope: ['add_phase', 'rename_phase', 'add_node', 'update_node', 'delete_node', 'add_edge', 'delete_edge', 'add_review_gate', 'generate_prompt'],
      },
    });
    const modelContextPlan = normalizeContextPlan(planResult.output, workflowIndex);
    if (modelContextPlan && (modelContextPlan.targets.length > 0 || modelContextPlan.operation_scope.length > 0)) {
      contextPlan = modelContextPlan;
      focusedSubgraph = extractFocusedSubgraph(project.workflow, project.assets, contextPlan);
    }
    modelCalls.unshift({ id: `call_${Date.now()}_replan_plan`, workspace_id: ctx.workspace_id, created_by: ctx.user_id, created_at: new Date().toISOString(), model: planResult.model, purpose: 'workflow_replan_context_plan', status: planResult.status, summary: planResult.output?.summary || `replan context: ${requestText}` });
  } catch (error) {
    modelCalls.unshift({ id: `call_${Date.now()}_replan_plan`, workspace_id: ctx.workspace_id, created_by: ctx.user_id, created_at: new Date().toISOString(), model: getModelStatus().planning_model, purpose: 'workflow_replan_context_plan', status: 'failed', summary: error.message });
  }
  try {
    modelResult = await runModel('workflow_diff', {
      request: requestText,
      context_policy: agentContextPolicy,
      existing_session: {
        id: session.id,
        applied_changes: oldChanges.filter((change) => appliedIds.includes(change.id)),
        skipped_pending_changes: oldChanges.filter((change) => remainingIds.includes(change.id)),
      },
      context_plan: contextPlan,
      workflow_index: workflowIndex,
      focused_subgraph: focusedSubgraph,
      output_contract: outputContract,
    });
    modelCalls.unshift({ id: `call_${Date.now()}_replan`, workspace_id: ctx.workspace_id, created_by: ctx.user_id, created_at: new Date().toISOString(), model: modelResult.model, purpose: 'workflow_replan_diff', status: modelResult.status, summary: modelResult.output?.summary || `replan diff: ${requestText}` });
  } catch (error) {
    modelCalls.unshift({ id: `call_${Date.now()}_replan`, workspace_id: ctx.workspace_id, created_by: ctx.user_id, created_at: new Date().toISOString(), model: getModelStatus().diff_model, purpose: 'workflow_replan_diff', status: 'failed', summary: error.message });
  }
  const modelCandidate = normalizeAgentDiff(modelResult?.output, requestText, project.workflow, contextPlan);
  const modelHasChanges = Array.isArray(modelCandidate?.changes) && modelCandidate.changes.length > 0;
  const generationSource = modelHasChanges && modelResult?.status !== 'mock'
    ? 'llm_replan'
    : (modelResult?.status === 'mock' ? 'mock_replan_fallback' : (modelResult ? 'model_empty_replan_fallback' : 'model_failed_replan_fallback'));
  const candidate = modelHasChanges ? modelCandidate : generateWorkflowDiff(requestText, project.workflow, project.assets);
  let replacementChanges = makeSessionChangeIdsUnique(candidate.changes || [], oldChanges.map((change) => change.id));
  const replacementDiff = {
    ...candidate,
    id: `diff-replan-${randomUUID()}`,
    request: requestText,
    changes: replacementChanges,
    context_policy: agentContextPolicy,
    context_plan: contextPlan,
    focused_subgraph_summary: {
      phases: focusedSubgraph.phases.length,
      nodes: focusedSubgraph.nodes.length,
      edges: focusedSubgraph.edges.length,
    },
    model_diff_status: modelResult?.status || 'failed',
    context_plan_status: planResult?.status || 'fallback',
    generation_source: candidate.generation_source || generationSource,
    status: 'draft',
  };
  let evaluation = evaluateDiffCandidate(project, replacementDiff);
  let repairAttempt = null;
  if (!evaluation.ok && replacementChanges.length) {
    repairAttempt = await repairWorkflowDiffWithModel(ctx, project, requestText, replacementDiff, evaluation, contextPlan, workflowIndex, focusedSubgraph, outputContract);
    const repairedEvaluation = evaluateDiffCandidate(project, repairAttempt.diff);
    if (repairedEvaluation.score >= evaluation.score) {
      replacementChanges = makeSessionChangeIdsUnique(repairAttempt.diff.changes || [], oldChanges.map((change) => change.id));
      replacementDiff.changes = replacementChanges;
      replacementDiff.generation_source = repairAttempt.source;
      replacementDiff.repair_attempt = {
        source: repairAttempt.source,
        status: repairAttempt.result?.status || (repairAttempt.error ? 'failed' : 'fallback'),
        error: repairAttempt.error?.message || null,
      };
      evaluation = repairedEvaluation;
    }
  }
  const { batchDiff, currentChanges, pendingChanges } = buildBatchedWorkflowDiff(replacementDiff, batchSize, [], Number(session.batch_index || session.batchIndex || 1) + 1);
  const allChanges = [...oldChanges, ...replacementChanges];
  const plan = createExecutionPlanFromChanges(allChanges, {
    currentIds: currentChanges.map((change) => change.id),
    appliedIds,
    skippedIds: nextSkippedIds,
    rejectedIds,
    pendingIds: pendingChanges.map((change) => change.id),
    evaluation,
  });
  const trace = [
    ...(session.agent_trace || session.agentTrace || []),
    {
      stage: 'replanner',
      status: replacementChanges.length ? 'completed' : 'needs_input',
      skipped_previous_pending: remainingIds.length,
      replacement_changes: replacementChanges.length,
      request: requestText,
      context_plan_status: planResult?.status || 'fallback',
    },
    ...buildAgentTrace({ stage: 'diff_ready', intent: inferEditIntent(requestText), slots: {}, contextPlan, diff: batchDiff, evaluation, generationSource: replacementDiff.generation_source, repairAttempt }).slice(1),
  ];
  appendEditSessionMessage(session, { role: 'user', content: requestText });
  const updatedSession = appendEditSessionMessage({
    ...session,
    status: replacementChanges.length ? 'diff_ready' : 'collecting_info',
    effective_request: requestText,
    candidate_diff_id: replacementChanges.length ? batchDiff.id : null,
    candidateDiffId: replacementChanges.length ? batchDiff.id : null,
    all_changes: allChanges,
    allChanges,
    context_plan: contextPlan,
    contextPlan,
    context_scope: replacementDiff.focused_subgraph_summary,
    contextScope: replacementDiff.focused_subgraph_summary,
    batch_index: batchDiff.batch.index,
    batchIndex: batchDiff.batch.index,
    total_changes: allChanges.length,
    totalChanges: allChanges.length,
    pending_change_ids: pendingChanges.map((change) => change.id),
    pendingChangeIds: pendingChanges.map((change) => change.id),
    skipped_change_ids: nextSkippedIds,
    skippedChangeIds: nextSkippedIds,
    plan,
    validation: evaluation.issues,
    agent_trace: trace,
    agentTrace: trace,
  }, {
    role: 'agent',
    status: replacementChanges.length ? 'diff_ready' : 'needs_clarification',
    content: replacementChanges.length
      ? `Replanned the remaining workflow edit work. ${remainingIds.length} previous pending change${remainingIds.length === 1 ? '' : 's'} skipped; ${currentChanges.length} replacement change${currentChanges.length === 1 ? '' : 's'} ready for review.`
      : 'I could not produce replacement workflow changes from that instruction. Please describe the desired remaining changes more specifically.',
    diff_id: replacementChanges.length ? batchDiff.id : null,
    changes_count: currentChanges.length,
    selected_count: currentChanges.filter((change) => change.selected !== false).length,
    total_changes: allChanges.length,
    pending_changes: pendingChanges.length,
    validation_score: evaluation.score,
    generation_source: replacementDiff.generation_source,
  });
  return { session: updatedSession, diff: replacementChanges.length ? { ...batchDiff, validation: evaluation } : null, evaluation };
}

function validateSchemaCompatibility(obj) {
  const version = detectSchemaVersion(obj);
  if (!version) return;
  migrateObjectIfNeeded(obj);
}

function removeVersionFields(body = {}) {
  const { workflow_version, workflowVersion, ...payload } = body;
  return payload;
}

function normalizeWorkflowPatchBody(body = {}) {
  const payload = removeVersionFields(body);
  if (Array.isArray(payload.nodes)) payload.nodes = payload.nodes.map((node) => normalizeAgenticNode(node));
  return payload;
}

function normalizeNodePatch(node, body = {}) {
  const patch = removeVersionFields(body);
  const previousContract = node.sandbox_execution_contract || node.sandboxExecutionContract || null;
  const hasContractPatch = Object.hasOwn(patch, 'sandbox_execution_contract') || Object.hasOwn(patch, 'sandboxExecutionContract');
  const next = normalizeAgenticNode({ ...node, ...patch });
  if (hasContractPatch && next.sandbox_execution_contract) {
    const nextVersion = Math.max(Number(previousContract?.version || 0) + 1, Number(next.sandbox_execution_contract.version || 1));
    next.sandbox_execution_contract.version = nextVersion;
    next.agent_execution_plan = {
      ...(next.agent_execution_plan || {}),
      sandbox_execution_contract_id: next.sandbox_execution_contract.id,
      contract_version: nextVersion,
    };
  }
  return next;
}

function markKitsStaleIfNeeded(project, previousVersion) {
  if ((project.workflow?.version || 0) === previousVersion) return;
  project.execution_kits = (project.execution_kits || []).map((k) => (
    (k.status === 'generated' || k.status === 'exported') ? { ...k, status: 'stale', stale_since_workflow_version: project.workflow.version } : k
  ));
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (!chunks.length) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf-8')); } catch { return null; }
}

function seedIfEmpty(ctx) {
  const existing = storage.listProjects(ctx.workspace_id);
  if (existing.length) return;
  const spec = loadAiSaasFeatureMvpSpec();
  const p = structuredClone(spec.project);
  p.workspace_id = ctx.workspace_id;
  p.created_by = ctx.user_id;
  p.updated_by = ctx.user_id;
  p.assets = spec.assets;
  p.workflow = spec.workflow;
  p.context_pack = spec.context_pack;
  p.roleunion_version = spec.roleunion_version;
  p.schema_version = 'roleunion-schema-v0.1';
  p.workflow_history = [createWorkflowSnapshot(p, p.context_pack, p.workflow, p.assets, spec.validation || [])];
  p.deleted_at = null;
  storage.saveProject(ctx.workspace_id, p);
}

function listScopedProjects(ctx) { return storage.listProjects(ctx.workspace_id).filter((p) => !p.deleted_at); }
function getProject(ctx, projectId) { const p = storage.getProject(ctx.workspace_id, projectId); return (p && !p.deleted_at) ? p : null; }

function ensureAgentRuns(project) {
  const runs = project.agent_runs || project.agentRuns || [];
  project.agent_runs = Array.isArray(runs) ? runs : [];
  project.agentRuns = project.agent_runs;
  return project.agent_runs;
}

function normalizeAgentRunAdapter(value = {}) {
  if (typeof value === 'string') return { id: value, label: value };
  return {
    id: value.id || value.adapter_id || value.adapterId || 'manual',
    label: value.label || value.name || value.id || 'Manual Handoff',
    payload_profile: value.payload_profile || value.payloadProfile || 'agent_task_payload_v1',
    handoff_mode: value.handoff_mode || value.handoffMode || 'manual',
    endpoint_configured: Boolean(value.endpoint_configured || value.endpointConfigured),
  };
}

function normalizeAgentRunEvidence(value = {}) {
  const evidence = Array.isArray(value.evidence) ? value.evidence : (Array.isArray(value.items) ? value.items : []);
  return {
    id: value.id || `evidence_${Date.now()}_${randomUUID().slice(0, 8)}`,
    status: value.status || 'received',
    summary: value.summary || '',
    external_run_id: value.external_run_id || value.externalRunId || '',
    preview_url: value.preview_url || value.previewUrl || value.result_url || value.resultUrl || '',
    cost_report: value.cost_report || value.costReport || '',
    risk_summary: value.risk_summary || value.riskSummary || '',
    items: evidence,
    received_at: value.received_at || value.receivedAt || new Date().toISOString(),
  };
}

function createAgentRun(ctx, project, body = {}) {
  const payload = body.payload || {};
  const canonicalPayload = body.canonical_payload || body.canonicalPayload || payload.roleunion_trace?.canonical_payload || payload;
  const nodeId = body.node_id || body.nodeId || canonicalPayload?.task?.node_id || canonicalPayload?.task?.nodeId || payload?.task?.id || payload?.job?.id;
  const node = (project.workflow?.nodes || []).find((item) => item.id === nodeId);
  if (!node) {
    const error = new Error('Agent run node not found');
    error.code = 'NODE_NOT_FOUND';
    throw error;
  }
  const now = new Date().toISOString();
  const adapter = normalizeAgentRunAdapter(body.adapter || payload.adapter || {});
  const run = {
    id: body.id || `agent_run_${Date.now()}_${randomUUID().slice(0, 8)}`,
    workspace_id: ctx.workspace_id,
    project_id: project.id,
    workflow_version: payload?.workflow?.version || project.workflow?.version || 0,
    node_id: nodeId,
    node_name: node.name,
    adapter,
    status: body.status || 'ready_for_handoff',
    handoff_mode: body.handoff_mode || body.handoffMode || adapter.handoff_mode || 'manual',
    external_endpoint: body.external_endpoint || body.externalEndpoint || '',
    external_run_id: body.external_run_id || body.externalRunId || '',
    payload,
    canonical_payload: canonicalPayload,
    payload_schema: payload.schema || 'roleunion.agent_task_payload.v1',
    evidence: [],
    created_by: ctx.user_id,
    created_at: now,
    updated_at: now,
  };
  const runs = ensureAgentRuns(project);
  project.agent_runs = [run, ...runs.filter((item) => item.id !== run.id)].slice(0, AGENT_RUN_LIMIT);
  project.agentRuns = project.agent_runs;
  project.updated_by = ctx.user_id;
  project.updated_at = now;
  return run;
}

function attachAgentRunEvidence(ctx, project, runId, body = {}) {
  const runs = ensureAgentRuns(project);
  const run = runs.find((item) => item.id === runId);
  if (!run) {
    const error = new Error('Agent run not found');
    error.code = 'AGENT_RUN_NOT_FOUND';
    throw error;
  }
  const now = new Date().toISOString();
  const evidence = normalizeAgentRunEvidence(body);
  run.evidence = [...(run.evidence || []), evidence];
  run.status = body.status || run.status || 'evidence_received';
  if (body.external_run_id || body.externalRunId) run.external_run_id = body.external_run_id || body.externalRunId;
  run.updated_at = now;
  project.agent_runs = runs;
  project.agentRuns = runs;
  project.updated_by = ctx.user_id;
  project.updated_at = now;
  return run;
}

function projectWorkflowStats(project) {
  const nodes = Array.isArray(project?.workflow?.nodes) ? project.workflow.nodes : [];
  return {
    nodes: nodes.length,
    ai_nodes: nodes.filter((node) => AI_EXECUTION_MODES.has(node.execution_mode || node.executionMode)).length,
    gates: nodes.filter((node) => (node.review_gate || node.reviewGate)?.required).length,
  };
}

function projectListSummary(project) {
  const executionKit = project.execution_kit || project.executionKit || null;
  return {
    id: project.id,
    name: project.name,
    workspace_id: project.workspace_id,
    project_type: project.project_type || project.type || '',
    type: project.type || project.project_type || '',
    risk_level: project.risk_level || project.riskLevel || 'medium',
    current_stage: project.current_stage || project.currentStage || '',
    updated_at: project.updated_at,
    workflow: { status: project.workflow?.status || 'draft' },
    workflow_stats: projectWorkflowStats(project),
    execution_kit: executionKit ? { status: executionKit.status || 'generated' } : null,
  };
}

function writeOwnership(ctx, obj, isCreate = false) {
  const now = new Date().toISOString();
  return { ...obj, workspace_id: ctx.workspace_id, created_by: isCreate ? ctx.user_id : (obj.created_by || ctx.user_id), updated_by: ctx.user_id, created_at: isCreate ? now : (obj.created_at || now), updated_at: now, roleunion_version: obj.roleunion_version || 'v0.1', schema_version: obj.schema_version || 'roleunion-schema-v0.1' };
}

function safeId(value, fallback) {
  const id = String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
  return id || fallback;
}

function asList(value, fallback = []) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
  return fallback;
}

function createContextPack(input = {}) {
  const sourceMaterials = input.source_materials || input.sourceMaterials;
  return {
    request_sources: asList(input.request_sources || input.requestSources || input.request_sources_list),
    team_roles: asList(input.team_roles || input.teamRoles || input.roles),
    approval_process: asList(input.approval_process || input.approvalProcess || input.approval_processes || input.approvalProcesses),
    tool_stack: asList(input.tool_stack || input.toolStack),
    risk_constraints: asList(input.risk_constraints || input.riskConstraints),
    historical_process_materials: input.historical_process_materials
      || input.historicalProcessMaterials
      || (Array.isArray(sourceMaterials) ? sourceMaterials.map((item) => item?.content || item).filter(Boolean).join('\n') : '')
      || '',
    summary: null,
    version: 1,
  };
}

function hasAnyField(input, fields) {
  return fields.some((field) => Object.hasOwn(input, field));
}

function normalizeContextPackPatch(input = {}) {
  const patch = {};
  if (hasAnyField(input, ['request_sources', 'requestSources', 'request_sources_list'])) patch.request_sources = asList(input.request_sources || input.requestSources || input.request_sources_list);
  if (hasAnyField(input, ['team_roles', 'teamRoles', 'roles'])) patch.team_roles = asList(input.team_roles || input.teamRoles || input.roles);
  if (hasAnyField(input, ['approval_process', 'approvalProcess', 'approval_processes', 'approvalProcesses'])) patch.approval_process = asList(input.approval_process || input.approvalProcess || input.approval_processes || input.approvalProcesses);
  if (hasAnyField(input, ['tool_stack', 'toolStack'])) patch.tool_stack = asList(input.tool_stack || input.toolStack);
  if (hasAnyField(input, ['risk_constraints', 'riskConstraints'])) patch.risk_constraints = asList(input.risk_constraints || input.riskConstraints);
  if (hasAnyField(input, ['historical_process_materials', 'historicalProcessMaterials', 'source_materials', 'sourceMaterials'])) {
    const sourceMaterials = input.source_materials || input.sourceMaterials;
    patch.historical_process_materials = input.historical_process_materials
      || input.historicalProcessMaterials
      || (Array.isArray(sourceMaterials) ? sourceMaterials.map((item) => item?.content || item).filter(Boolean).join('\n') : '')
      || '';
  }
  for (const field of ['summary', 'security_boundary', 'impact_analysis']) {
    if (Object.hasOwn(input, field)) patch[field] = input[field];
  }
  return patch;
}

function readContextList(contextPack, snakeKey, camelKey) {
  return asList(contextPack?.[snakeKey] || contextPack?.[camelKey]);
}

function readNodeField(node, snakeKey, camelKey, fallback = undefined) {
  return node?.[snakeKey] ?? node?.[camelKey] ?? fallback;
}

function buildGeneratedFrom(node, workflow, contextPack, assetType) {
  const plan = readNodeField(node, 'agent_execution_plan', 'agentExecutionPlan', {});
  const contract = readNodeField(node, 'sandbox_execution_contract', 'sandboxExecutionContract', {});
  return {
    type: 'node_contract',
    asset_type: assetType,
    node_id: readNodeField(node, 'id', 'id'),
    phase_id: readNodeField(node, 'phase_id', 'phaseId', null),
    workflow_id: workflow?.id || null,
    workflow_version: workflow?.version ?? null,
    context_pack_version: contextPack?.version ?? workflow?.context_pack_version ?? null,
    sandbox_execution_contract_id: contract?.id || plan?.sandbox_execution_contract_id || plan?.sandboxExecutionContractId || null,
    contract_version: contract?.version || plan?.contract_version || plan?.contractVersion || 0,
    generated_at: new Date().toISOString(),
  };
}

function attachGeneratedFrom(asset, node, workflow, contextPack, assetType) {
  return {
    ...asset,
    generated_from: buildGeneratedFrom(node, workflow, contextPack, assetType),
  };
}

function buildContextSecurityBoundary(contextPack, workflow) {
  const risks = readContextList(contextPack, 'risk_constraints', 'riskConstraints');
  const tools = readContextList(contextPack, 'tool_stack', 'toolStack');
  const riskText = risks.join(' ').toLowerCase();
  const hasSensitiveData = /secret|token|key|credential|customer|privacy|pii|生产|密钥|客户|隐私|个人信息|敏感/.test(riskText);
  const hasProduction = /production|prod|release|deploy|上线|发布|生产/.test(riskText);
  const agentNodes = (workflow?.nodes || []).filter((node) => readNodeField(node, 'agent_execution_plan', 'agentExecutionPlan')?.enabled);
  return {
    secret_policy: hasSensitiveData ? 'sandbox_only_no_production_secrets' : 'least_privilege',
    network_policy: hasSensitiveData ? 'blocked_by_default' : 'explicit_approval_required',
    human_approval_required_for: [
      ...(hasProduction ? ['production release'] : []),
      ...(hasSensitiveData ? ['sensitive data access'] : []),
      ...readContextList(contextPack, 'approval_process', 'approvalProcess'),
    ],
    forbidden_areas: risks.filter((item) => /forbid|禁止|不能|no /.test(String(item).toLowerCase())),
    external_systems: tools,
    agent_boundary: agentNodes.length
      ? `${agentNodes.length} agent-enabled node${agentNodes.length === 1 ? '' : 's'} must obey node-level Sandbox Execution Contracts.`
      : 'No agent-enabled nodes are currently declared.',
  };
}

function buildContextPackSummary(project) {
  const contextPack = project.context_pack || {};
  const workflow = project.workflow || {};
  const teamRoles = readContextList(contextPack, 'team_roles', 'teamRoles');
  const approvalProcess = readContextList(contextPack, 'approval_process', 'approvalProcess');
  const toolStack = readContextList(contextPack, 'tool_stack', 'toolStack');
  const riskConstraints = readContextList(contextPack, 'risk_constraints', 'riskConstraints');
  const historical = contextPack.historical_process_materials || contextPack.historicalProcessMaterials || '';
  const ownerRoles = [...new Set((workflow.nodes || []).map((node) => readNodeField(node, 'human_owner_role', 'humanOwnerRole')).filter(Boolean))];
  const highRiskNodes = (workflow.nodes || []).filter((node) => readNodeField(node, 'risk_level', 'riskLevel') === 'high');
  const suggestedGates = [
    ...approvalProcess,
    ...(highRiskNodes.length ? ['High-risk node review before execution'] : []),
    ...(riskConstraints.length ? ['Risk constraint confirmation before final kit export'] : []),
  ].filter(Boolean);
  return {
    recognized_roles: [...new Set([...teamRoles, ...ownerRoles])],
    suggested_review_gates: suggestedGates.length ? [...new Set(suggestedGates)] : ['Project owner review before execution'],
    missing_context: [
      teamRoles.length ? null : 'Team roles are not specified.',
      approvalProcess.length ? null : 'Approval process is not specified.',
      toolStack.length ? null : 'Tool stack is not specified.',
      riskConstraints.length ? null : 'Risk constraints are not specified.',
      historical ? null : 'Historical process materials are not attached.',
    ].filter(Boolean),
    risk_warnings: riskConstraints.length
      ? riskConstraints.map((item) => `Confirm boundary rule coverage for: ${item}`)
      : ['No explicit risk constraints set.'],
    security_boundary: buildContextSecurityBoundary(contextPack, workflow),
    confirmation: {
      status: 'needs_review',
      required_confirmations: ['roles', 'approval_process', 'risk_constraints', 'security_boundary'],
      message: 'Review and confirm the Context Pack summary before generating final execution assets.',
    },
    impact_preview: deriveContextPackImpact(project, { markAssets: false }),
    summary_source: 'deterministic_context_policy',
    context_pack_version: contextPack.version || 1,
    generated_at: new Date().toISOString(),
  };
}

function assetNodeId(asset) {
  return asset.node_id || asset.nodeId;
}

function markContextAssetsOutdated(project, affectedNodeIds, reason) {
  const affected = [];
  const mark = (asset, assetType) => {
    if (!affectedNodeIds.has(assetNodeId(asset))) return asset;
    affected.push({ id: asset.id, type: assetType, node_id: assetNodeId(asset) });
    return {
      ...asset,
      status: 'outdated',
      outdated_reason: reason,
      outdatedReason: asset.outdatedReason || reason,
      generated_from: {
        ...(asset.generated_from || asset.generatedFrom || {}),
        stale: true,
        stale_reason: reason,
        stale_since_context_pack_version: project.context_pack?.version || null,
        stale_since_workflow_version: project.workflow?.version || null,
      },
    };
  };
  project.assets ||= { prompts: [], checklists: [], artifact_templates: [], artifactTemplates: [] };
  project.assets.prompts = (project.assets.prompts || []).map((asset) => mark(asset, 'prompt'));
  project.assets.checklists = (project.assets.checklists || []).map((asset) => mark(asset, 'checklist'));
  const templates = (project.assets.artifact_templates || project.assets.artifactTemplates || []).map((asset) => mark(asset, 'artifact_template'));
  project.assets.artifact_templates = templates;
  project.assets.artifactTemplates = templates;
  return affected;
}

function deriveContextPackImpact(project, { markAssets = false } = {}) {
  const contextPack = project.context_pack || {};
  const workflow = project.workflow || {};
  const contextVersion = contextPack.version || 1;
  const previousWorkflowContextVersion = workflow.context_pack_version || 1;
  const contextChanged = Number(contextVersion) !== Number(previousWorkflowContextVersion);
  const risks = readContextList(contextPack, 'risk_constraints', 'riskConstraints');
  const tools = readContextList(contextPack, 'tool_stack', 'toolStack');
  const roles = readContextList(contextPack, 'team_roles', 'teamRoles');
  const affectedNodes = (workflow.nodes || []).filter((node) => {
    const mode = readNodeField(node, 'execution_mode', 'executionMode');
    const risk = readNodeField(node, 'risk_level', 'riskLevel');
    const owner = readNodeField(node, 'human_owner_role', 'humanOwnerRole', '');
    const agentPlan = readNodeField(node, 'agent_execution_plan', 'agentExecutionPlan', {});
    return contextChanged
      || risk === 'high'
      || mode !== 'human_only'
      || agentPlan?.enabled
      || roles.some((role) => owner.toLowerCase().includes(String(role).toLowerCase()));
  });
  const affectedNodeIds = new Set(affectedNodes.map((node) => readNodeField(node, 'id', 'id')));
  const reason = `Context Pack v${contextVersion} changed; regenerate assets that depend on roles, tools, risks, or approvals.`;
  const affectedAssets = markAssets ? markContextAssetsOutdated(project, affectedNodeIds, reason) : [
    ...(project.assets?.prompts || []).filter((asset) => affectedNodeIds.has(assetNodeId(asset))).map((asset) => ({ id: asset.id, type: 'prompt', node_id: assetNodeId(asset) })),
    ...(project.assets?.checklists || []).filter((asset) => affectedNodeIds.has(assetNodeId(asset))).map((asset) => ({ id: asset.id, type: 'checklist', node_id: assetNodeId(asset) })),
    ...(project.assets?.artifact_templates || project.assets?.artifactTemplates || []).filter((asset) => affectedNodeIds.has(assetNodeId(asset))).map((asset) => ({ id: asset.id, type: 'artifact_template', node_id: assetNodeId(asset) })),
  ];
  return {
    context_pack_version: contextVersion,
    previous_workflow_context_pack_version: previousWorkflowContextVersion,
    affected_nodes: affectedNodes.map((node) => ({
      id: readNodeField(node, 'id', 'id'),
      name: readNodeField(node, 'name', 'name'),
      risk_level: readNodeField(node, 'risk_level', 'riskLevel'),
      reason: contextChanged ? 'Context Pack version changed' : 'Node depends on roles, risks, approvals, tools, or agent boundaries',
    })),
    affected_assets: affectedAssets,
    security_boundary: buildContextSecurityBoundary(contextPack, workflow),
    changed_dimensions: {
      roles: roles.length,
      tools: tools.length,
      risk_constraints: risks.length,
    },
    mark_assets_outdated: markAssets,
  };
}

function createEmptyWorkflow(ctx, project, selectedTemplate) {
  const phases = (selectedTemplate.content?.default_phases || selectedTemplate.default_phases || ['Discovery', 'Design', 'Development', 'Testing', 'Launch'])
    .map((name, index) => ({ id: `phase-${index + 1}`, name, order: index + 1 }));
  return {
    id: `workflow-${project.id}`,
    workspace_id: ctx.workspace_id,
    project_id: project.id,
    template_id: selectedTemplate.id,
    context_pack_version: project.context_pack?.version || 1,
    version: 0,
    status: 'draft',
    phases,
    nodes: [],
    edges: [],
    updated_at: new Date().toISOString(),
  };
}

function createEmptyAssets() {
  return { prompts: [], checklists: [], artifact_templates: [], artifactTemplates: [] };
}

function createProjectShell(ctx, body, selectedTemplate) {
  const projectType = body.project_type || body.type || selectedTemplate.name;
  const project = writeOwnership(ctx, {
    id: body.id || `project_${Date.now()}`,
    name: body.name || 'Untitled Project',
    goal: body.goal || '',
    type: projectType,
    project_type: projectType,
    current_stage: body.current_stage || body.currentStage || '',
    risk_level: body.risk_level || body.riskLevel || 'medium',
    target_deliverables: asList(body.target_deliverables || body.deliveryScope || body.delivery_scope),
    expected_ai_scope: asList(body.expected_ai_scope || body.expectedAiScope),
    sensitive_areas: asList(body.sensitive_areas || body.sensitiveAreas),
    setup_mode: body.setup_mode || body.setupMode || 'quick_start',
    output_language: body.output_language || 'en',
    created_from_template: selectedTemplate.id,
    template_version: selectedTemplate.version,
    context_pack: createContextPack(body.context_pack || {}),
    execution_kits: [],
    generation_jobs: [],
    model_call_logs: [],
    ai_conversation: [],
    aiConversation: [],
    edit_sessions: [],
    editSessions: [],
    deleted_at: null,
  }, true);
  project.workflow = createEmptyWorkflow(ctx, project, selectedTemplate);
  project.assets = createEmptyAssets();
  project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
  return project;
}

function normalizeProjectAgentList(value) {
  return asList(value).map((item) => String(item || '').trim()).filter(Boolean);
}

function normalizeProjectContextList(value) {
  if (Array.isArray(value)) return normalizeProjectAgentList(value);
  return String(value || '')
    .split(/[,;\n\uff0c\uff1b\u3001]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const PROJECT_CONTEXT_FIELD_ALIASES = {
  request_sources: ['request sources', 'request source', 'demand sources', 'demand source', '\u9700\u6c42\u6765\u6e90', '\u9700\u6c42\u63d0\u51fa\u65b9', '\u9700\u6c42\u65b9', '\u53d1\u8d77\u56e2\u961f'],
  team_roles: ['team roles', 'roles', '\u56e2\u961f\u89d2\u8272', '\u56e2\u961f\u6210\u5458', '\u53c2\u4e0e\u89d2\u8272'],
  approval_process: ['approval process', 'approval flow', 'review process', '\u5ba1\u6279\u6d41\u7a0b', '\u5ba1\u6838\u6d41\u7a0b', '\u95e8\u7981'],
  tool_stack: ['tool stack', 'tools', '\u5de5\u5177\u6808', '\u5de5\u5177'],
  risk_constraints: ['risk constraints', 'constraints', '\u98ce\u9669\u7ea6\u675f', '\u98ce\u9669\u9650\u5236', '\u7ea6\u675f'],
  historical_process_materials: ['historical process materials', 'historical materials', 'process materials', '\u5386\u53f2\u6d41\u7a0b\u6750\u6599', '\u5386\u53f2\u6750\u6599', '\u6d41\u7a0b\u6750\u6599'],
};

const PROJECT_CONTEXT_ALIASES = Object.values(PROJECT_CONTEXT_FIELD_ALIASES).flat();

const PROJECT_AGENT_FIELD_ALIASES = {
  name: ['project name', 'name', '\u9879\u76ee\u540d\u79f0', '\u9879\u76ee\u540d', '\u540d\u79f0'],
  goal: ['project goal', 'goal', 'objective', 'purpose', '\u9879\u76ee\u76ee\u6807', '\u76ee\u6807', '\u76ee\u7684'],
  current_stage: ['current stage', 'stage', '\u5f53\u524d\u9636\u6bb5', '\u6240\u5904\u9636\u6bb5', '\u9636\u6bb5'],
  project_type: ['project type', 'type', '\u9879\u76ee\u7c7b\u578b', '\u7c7b\u578b'],
  risk_level: ['risk level', 'risk', '\u98ce\u9669\u7b49\u7ea7', '\u98ce\u9669'],
  target_deliverables: ['target deliverables', 'deliverables', 'deliverable', 'delivery scope', '\u76ee\u6807\u4ea4\u4ed8\u7269', '\u76ee\u6807\u4ea4\u4ed8', '\u4ea4\u4ed8\u7269'],
  expected_ai_scope: ['expected ai scope', 'ai scope', '\u9884\u671f AI \u8303\u56f4', '\u9884\u671fAI\u8303\u56f4', 'AI \u8303\u56f4', 'AI\u8303\u56f4'],
  sensitive_areas: ['sensitive areas', 'sensitive scope', '\u654f\u611f\u533a\u57df', '\u654f\u611f\u8303\u56f4'],
};

const PROJECT_AGENT_ALL_ALIASES = [
  ...Object.values(PROJECT_AGENT_FIELD_ALIASES).flat(),
  ...PROJECT_CONTEXT_ALIASES,
].sort((left, right) => String(right).length - String(left).length);

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function projectAgentLabelPattern(alias) {
  const escaped = escapeRegex(alias).replace(/\s+/g, '\\s*');
  const startsWithWord = /^[a-z0-9]/i.test(alias);
  const endsWithWord = /[a-z0-9]$/i.test(alias);
  return `${startsWithWord ? '\\b' : ''}${escaped}${endsWithWord ? '\\b' : ''}`;
}

function findProjectAgentLabels(text) {
  const source = String(text || '');
  const labels = [];
  for (const alias of PROJECT_AGENT_ALL_ALIASES) {
    const pattern = new RegExp(projectAgentLabelPattern(alias), 'gi');
    for (const match of source.matchAll(pattern)) {
      labels.push({ alias, index: match.index, end: match.index + match[0].length });
    }
  }
  return labels
    .sort((left, right) => left.index - right.index || right.end - left.end)
    .filter((label, index, all) => index === 0 || label.index !== all[index - 1].index);
}

function cleanProjectAgentFieldValue(value) {
  return String(value || '')
    .replace(/^\s*(?:is|are|include|includes|including|as|uses?|using|has|have|with|\u662f|\u4e3a|\u53eb|\u6709|\u5305\u62ec|\u4f7f\u7528|\u91c7\u7528|[:=\uff1a])\s*/i, '')
    .replace(/^[\s,\uff0c:;\uff1b]+|[\s,\uff0c:;\uff1b]+$/g, '')
    .replace(/["']$/g, '')
    .trim();
}

function extractLabeledProjectAgentValue(text, aliases = []) {
  const source = String(text || '');
  const labels = findProjectAgentLabels(source);
  const accepted = new Set(aliases.map((alias) => String(alias).toLowerCase()));
  const label = labels.find((item) => accepted.has(String(item.alias).toLowerCase()));
  if (!label) return '';
  const nextLabel = labels.find((item) => item.index >= label.end);
  let end = nextLabel?.index ?? source.length;
  const sentenceEnd = source.slice(label.end, end).search(/[.\n\u3002;\uff1b]/);
  if (sentenceEnd >= 0) end = label.end + sentenceEnd;
  return cleanProjectAgentFieldValue(source.slice(label.end, end));
}

function extractLabeledProjectContextValue(text, aliases = []) {
  const boundedValue = extractLabeledProjectAgentValue(text, aliases);
  if (boundedValue) return boundedValue;
  const source = String(text || '');
  const lower = source.toLowerCase();
  for (const alias of aliases) {
    const index = lower.indexOf(String(alias).toLowerCase());
    if (index < 0) continue;
    let start = index + String(alias).length;
    const afterLabel = source.slice(start);
    const prefix = afterLabel.match(/^\s*(?:is|are|include|includes|as|[:=\uff1a])\s*/i);
    if (prefix) start += prefix[0].length;
    let end = source.length;
    for (const otherAlias of PROJECT_CONTEXT_ALIASES) {
      if (aliases.includes(otherAlias)) continue;
      const nextIndex = lower.indexOf(String(otherAlias).toLowerCase(), start + 1);
      if (nextIndex >= 0 && nextIndex < end) end = nextIndex;
    }
    const sentenceEnd = source.slice(start, end).search(/[.\n\u3002]/);
    if (sentenceEnd >= 0) end = start + sentenceEnd;
    const value = source.slice(start, end).replace(/^[\s:：=,，;；]+|[\s,，;；]+$/g, '').trim();
    if (value) return value;
  }
  return '';
}

function normalizeProjectCreationContextPack(input = {}) {
  const source = input?.context_pack || input?.contextPack || input?.context || input;
  if (!source || typeof source !== 'object') return {};
  return {
    request_sources: normalizeProjectContextList(source.request_sources || source.requestSources || source.demand_sources || source.demandSources),
    team_roles: normalizeProjectContextList(source.team_roles || source.teamRoles || source.roles),
    approval_process: normalizeProjectContextList(source.approval_process || source.approvalProcess || source.review_process || source.reviewProcess),
    tool_stack: normalizeProjectContextList(source.tool_stack || source.toolStack || source.tools),
    risk_constraints: normalizeProjectContextList(source.risk_constraints || source.riskConstraints || source.constraints),
    historical_process_materials: source.historical_process_materials || source.historicalProcessMaterials || source.process_materials || source.processMaterials || '',
  };
}

function extractProjectCreationContextPack(text, previous = {}) {
  const source = String(text || '');
  const extracted = {
    request_sources: normalizeProjectContextList(extractLabeledProjectContextValue(source, PROJECT_CONTEXT_FIELD_ALIASES.request_sources)),
    team_roles: normalizeProjectContextList(extractLabeledProjectContextValue(source, PROJECT_CONTEXT_FIELD_ALIASES.team_roles)),
    approval_process: normalizeProjectContextList(extractLabeledProjectContextValue(source, PROJECT_CONTEXT_FIELD_ALIASES.approval_process)),
    tool_stack: normalizeProjectContextList(extractLabeledProjectContextValue(source, PROJECT_CONTEXT_FIELD_ALIASES.tool_stack)),
    risk_constraints: normalizeProjectContextList(extractLabeledProjectContextValue(source, PROJECT_CONTEXT_FIELD_ALIASES.risk_constraints)),
    historical_process_materials: extractLabeledProjectContextValue(source, PROJECT_CONTEXT_FIELD_ALIASES.historical_process_materials),
  };
  return mergeProjectCreationContextPack(previous, extracted);
}

function mergeProjectCreationContextPack(previous = {}, next = {}) {
  const merged = normalizeProjectCreationContextPack(previous);
  const incoming = normalizeProjectCreationContextPack(next);
  for (const key of ['request_sources', 'team_roles', 'approval_process', 'tool_stack', 'risk_constraints']) {
    const values = [...(merged[key] || []), ...(incoming[key] || [])].map((item) => String(item || '').trim()).filter(Boolean);
    merged[key] = [...new Set(values)];
  }
  merged.historical_process_materials = incoming.historical_process_materials || merged.historical_process_materials || '';
  return merged;
}

function extractProjectAgentField(text, field) {
  const source = String(text || '');
  const boundedValue = extractLabeledProjectAgentValue(source, PROJECT_AGENT_FIELD_ALIASES[field] || []);
  if (boundedValue) return boundedValue;
  const cleanPatterns = {
    name: [
      /(?:\u9879\u76ee\u540d\u79f0|\u9879\u76ee\u540d|\u540d\u79f0)\s*(?:\u662f|\u4e3a|\u53eb|[:\uff1a=])?\s*["']?([^"'\n\uff0c\u3002\uff1b;,]+)/,
    ],
    goal: [
      /(?:\u76ee\u6807|\u76ee\u7684)\s*(?:\u662f|\u4e3a|[:\uff1a=])?\s*([^。\u3002\n\uff1b;]*?)(?=[\uff0c,]\s*(?:\u5f53\u524d\u9636\u6bb5|\u6240\u5904\u9636\u6bb5|\u9636\u6bb5)|[。\u3002\n\uff1b;]|$)/,
    ],
    current_stage: [
      /(?:\u5f53\u524d\u9636\u6bb5|\u6240\u5904\u9636\u6bb5|\u9636\u6bb5)\s*(?:\u662f|\u4e3a|[:\uff1a=])?\s*([^。\u3002\n\uff0c\uff1b,;]+)/,
    ],
    project_type: [
      /(?:\u9879\u76ee\u7c7b\u578b|\u7c7b\u578b)\s*(?:\u662f|\u4e3a|[:\uff1a=])?\s*([^。\u3002\n\uff0c\uff1b,;]+)/,
    ],
    risk_level: [
      /(?:\u98ce\u9669\u7b49\u7ea7|\u98ce\u9669)\s*(?:\u662f|\u4e3a|[:\uff1a=])?\s*(\u4f4e|\u4e2d|\u9ad8|low|medium|high)/i,
    ],
    target_deliverables: [
      /(?:\u76ee\u6807\u4ea4\u4ed8|\u4ea4\u4ed8\u7269)\s*(?:\u662f|\u4e3a|[:\uff1a=])?\s*([^。\u3002\n\uff1b;]+)/,
    ],
    expected_ai_scope: [
      /(?:\u9884\u671f\s*AI\s*\u8303\u56f4|AI\s*\u8303\u56f4)\s*(?:\u662f|\u4e3a|[:\uff1a=])?\s*([^。\u3002\n\uff1b;]+)/i,
    ],
    sensitive_areas: [
      /(?:\u654f\u611f\u533a\u57df|\u654f\u611f\u8303\u56f4)\s*(?:\u662f|\u4e3a|[:\uff1a=])?\s*([^。\u3002\n\uff1b;]+)/,
    ],
  };
  for (const pattern of cleanPatterns[field] || []) {
    const match = source.match(pattern);
    if (match?.[1]) return match[1].trim().replace(/["']$/, '');
  }
  const patterns = {
    name: [
      /(?:project\s*name|name|called|named)\s*(?:is|:|=)?\s*["']?([^"'\n;,.]+)/i,
      /(?:\u9879\u76ee\u540d|\u540d\u79f0|叫|命名为)\s*(?:是|为|:|：)?\s*[“”"']?([^“”"'\n，。；;]+)/,
    ],
    goal: [
      /(?:goal|objective|purpose|for)\s*(?:is|:|=)?\s*([^;\n]+)/i,
      /(?:\u76ee\u6807|\u76ee\u7684|\u7528\u4e8e|\u7528\u6765)\s*(?:是|为|:|：)?\s*([^。\n；;]+)/,
    ],
    current_stage: [
      /(?:current stage|stage)\s*(?:is|:|=)?\s*([^;\n,.]+)/i,
      /(?:\u5f53\u524d\u9636\u6bb5|\u9636\u6bb5)\s*(?:是|为|:|：)?\s*([^，。；;\n]+)/,
    ],
    project_type: [
      /(?:project type|type)\s*(?:is|:|=)?\s*([^;\n,.]+)/i,
      /(?:\u9879\u76ee\u7c7b\u578b|\u7c7b\u578b)\s*(?:是|为|:|：)?\s*([^，。；;\n]+)/,
    ],
    risk_level: [
      /(?:risk|risk level)\s*(?:is|:|=)?\s*(low|medium|high)/i,
      /(?:\u98ce\u9669|\u98ce\u9669\u7b49\u7ea7)\s*(?:是|为|:|：)?\s*(低|中|高|low|medium|high)/i,
    ],
    target_deliverables: [
      /(?:deliverables?|delivery scope)\s*(?:are|is|:|=)?\s*([^;\n]+)/i,
      /(?:\u4ea4\u4ed8\u7269|\u76ee\u6807\u4ea4\u4ed8)\s*(?:是|为|:|：)?\s*([^。\n；;]+)/,
    ],
    expected_ai_scope: [
      /(?:ai scope|expected ai scope)\s*(?:is|:|=)?\s*([^;\n]+)/i,
      /(?:AI范围|AI \u8303\u56f4|\u9884\u671fAI\u8303\u56f4|\u9884\u671f AI \u8303\u56f4)\s*(?:是|为|:|：)?\s*([^。\n；;]+)/i,
    ],
    sensitive_areas: [
      /(?:sensitive areas?|sensitive scope)\s*(?:are|is|:|=)?\s*([^;\n]+)/i,
      /(?:\u654f\u611f\u533a\u57df|\u654f\u611f\u8303\u56f4)\s*(?:是|为|:|：)?\s*([^。\n；;]+)/,
    ],
  };
  for (const pattern of patterns[field] || []) {
    const match = source.match(pattern);
    if (match?.[1]) return match[1].trim().replace(/[”"']$/, '');
  }
  return '';
}

function normalizeProjectRisk(value) {
  const text = String(value || '').toLowerCase();
  if (textIncludesAny(text, ['high', '\u9ad8'])) return 'high';
  if (textIncludesAny(text, ['low', '\u4f4e'])) return 'low';
  if (textIncludesAny(text, ['medium', 'middle', '\u4e2d'])) return 'medium';
  return '';
}

function inferProjectNameFromRequest(text) {
  const quoted = firstQuotedText(text);
  if (quoted) return quoted;
  const cleanChinese = String(text || '').match(/(?:\u521b\u5efa|\u65b0\u5efa|\u505a)(?:\u4e00\u4e2a)?\s*(?:\u9879\u76ee)?\s*[:\uff1a]?\s*([\u4e00-\u9fa5A-Za-z0-9 _-]{2,40}?)(?:\u9879\u76ee)?(?:[.\u3002\uff0c,;\uff1b\n]|$)/);
  if (cleanChinese?.[1]) return cleanChinese[1].trim();
  const chinese = String(text || '').match(/(?:\u521b\u5efa|\u65b0\u5efa|\u505a)(?:\u4e00\u4e2a)?\s*([^，。；;\n]{2,40}?)(?:\u9879\u76ee|project)/i);
  if (chinese?.[1]) return chinese[1].trim();
  const english = String(text || '').match(/(?:create|new|build)\s+(?:a\s+)?(?:project\s+)?(?:for\s+)?([a-z0-9 _-]{3,60})/i);
  if (english?.[1]) return english[1].trim();
  return '';
}

function extractProjectCreationSlots(text, previous = {}) {
  const rawRisk = extractProjectAgentField(text, 'risk_level');
  const previousContextPack = previous.context_pack || previous.contextPack || {};
  const explicitName = extractProjectAgentField(text, 'name');
  const inferredName = inferProjectNameFromRequest(text);
  const explicitGoal = extractProjectAgentField(text, 'goal');
  const explicitType = extractProjectAgentField(text, 'project_type');
  const explicitStage = extractProjectAgentField(text, 'current_stage');
  const explicitRisk = normalizeProjectRisk(rawRisk);
  const explicitDeliverables = normalizeProjectAgentList(extractProjectAgentField(text, 'target_deliverables'));
  const explicitAiScope = normalizeProjectAgentList(extractProjectAgentField(text, 'expected_ai_scope'));
  const explicitSensitiveAreas = normalizeProjectAgentList(extractProjectAgentField(text, 'sensitive_areas'));
  const next = {
    ...previous,
    name: explicitName || previous.name || inferredName,
    goal: explicitGoal || previous.goal,
    project_type: explicitType || previous.project_type || (textIncludesAny(text, ['internal tool', '\u5185\u90e8\u5de5\u5177']) ? 'Internal Tool' : ''),
    current_stage: explicitStage || previous.current_stage,
    risk_level: explicitRisk || previous.risk_level || (textIncludesAny(text, ['\u9ad8\u98ce\u9669', 'high risk']) ? 'high' : ''),
    target_deliverables: explicitDeliverables.length ? explicitDeliverables : (previous.target_deliverables || []),
    expected_ai_scope: explicitAiScope.length ? explicitAiScope : (previous.expected_ai_scope || []),
    sensitive_areas: explicitSensitiveAreas.length ? explicitSensitiveAreas : (previous.sensitive_areas || []),
    context_pack: extractProjectCreationContextPack(text, previousContextPack),
  };
  if (!next.project_type) next.project_type = 'Custom AI Workflow';
  if (!next.risk_level) next.risk_level = 'medium';
  if (!next.current_stage && textIncludesAny(text, ['discovery', '\u63a2\u7d22', '\u8c03\u7814'])) next.current_stage = 'Discovery';
  return next;
}

function extractExplicitProjectCreationSlots(text) {
  const raw = {
    name: extractProjectAgentField(text, 'name'),
    goal: extractProjectAgentField(text, 'goal'),
    project_type: extractProjectAgentField(text, 'project_type'),
    current_stage: extractProjectAgentField(text, 'current_stage'),
    risk_level: normalizeProjectRisk(extractProjectAgentField(text, 'risk_level')),
    target_deliverables: normalizeProjectAgentList(extractProjectAgentField(text, 'target_deliverables')),
    expected_ai_scope: normalizeProjectAgentList(extractProjectAgentField(text, 'expected_ai_scope')),
    sensitive_areas: normalizeProjectAgentList(extractProjectAgentField(text, 'sensitive_areas')),
    context_pack: extractProjectCreationContextPack(text, {}),
  };
  return Object.fromEntries(Object.entries(raw).filter(([key, value]) => {
    if (key === 'context_pack') return Object.values(value || {}).some((item) => Array.isArray(item) ? item.length : Boolean(item));
    return Array.isArray(value) ? value.length : Boolean(value);
  }));
}

function mergeProjectCreationSlots(previous = {}, next = {}) {
  const merged = { ...previous };
  for (const [key, value] of Object.entries(next || {})) {
    if (key === 'context_pack' || key === 'contextPack') {
      merged.context_pack = mergeProjectCreationContextPack(merged.context_pack || merged.contextPack || {}, value);
      continue;
    }
    if (Array.isArray(value)) {
      if (value.length) merged[key] = value.map((item) => String(item || '').trim()).filter(Boolean);
      continue;
    }
    if (value !== null && value !== undefined && String(value).trim() !== '') merged[key] = String(value).trim();
  }
  if (merged.risk_level) merged.risk_level = normalizeProjectRisk(merged.risk_level) || merged.risk_level;
  return merged;
}

function normalizeProjectCreationModelSlots(output) {
  const source = output?.project || output?.slots || output?.project_creation || output?.projectCreation || output;
  if (!source || typeof source !== 'object') return {};
  return {
    name: source.name || source.project_name || source.projectName,
    goal: source.goal || source.project_goal || source.projectGoal,
    project_type: source.project_type || source.projectType || source.type,
    current_stage: source.current_stage || source.currentStage || source.stage,
    risk_level: source.risk_level || source.riskLevel || source.risk,
    target_deliverables: normalizeProjectAgentList(source.target_deliverables || source.targetDeliverables || source.delivery_scope || source.deliveryScope || source.deliverables),
    expected_ai_scope: normalizeProjectAgentList(source.expected_ai_scope || source.expectedAiScope || source.ai_scope || source.aiScope),
    sensitive_areas: normalizeProjectAgentList(source.sensitive_areas || source.sensitiveAreas || source.sensitive_scope || source.sensitiveScope),
    context_pack: normalizeProjectCreationContextPack(source.context_pack || source.contextPack || output?.context_pack || output?.contextPack),
  };
}

function normalizeProjectCreationChangedFields(output = {}) {
  const raw = output.changed_fields || output.changedFields || output.updated_fields || output.updatedFields || [];
  const aliases = {
    request_sources: 'context_pack.request_sources',
    team_roles: 'context_pack.team_roles',
    approval_process: 'context_pack.approval_process',
    tool_stack: 'context_pack.tool_stack',
    risk_constraints: 'context_pack.risk_constraints',
    historical_process_materials: 'context_pack.historical_process_materials',
  };
  const allowed = new Set([
    'name', 'goal', 'project_type', 'current_stage', 'risk_level', 'target_deliverables', 'expected_ai_scope', 'sensitive_areas',
    'context_pack.request_sources', 'context_pack.team_roles', 'context_pack.approval_process', 'context_pack.tool_stack',
    'context_pack.risk_constraints', 'context_pack.historical_process_materials',
  ]);
  return [...new Set((Array.isArray(raw) ? raw : [raw]).map((field) => {
    const normalized = String(field || '').trim().replace(/^contextPack\./, 'context_pack.');
    return aliases[normalized] || normalized;
  }).filter((field) => allowed.has(field)))];
}

function applyDeclaredProjectCreationChanges(slots, modelSlots, changedFields, explicitSlots) {
  const next = structuredClone(slots || {});
  const explicitContext = explicitSlots.context_pack || {};
  for (const field of changedFields) {
    if (field.startsWith('context_pack.')) {
      const contextField = field.slice('context_pack.'.length);
      const explicitValue = explicitContext[contextField];
      if (Array.isArray(explicitValue) ? explicitValue.length : Boolean(explicitValue)) continue;
      if (!(contextField in (modelSlots.context_pack || {}))) continue;
      next.context_pack ||= {};
      next.context_pack[contextField] = structuredClone(modelSlots.context_pack[contextField]);
      continue;
    }
    const explicitValue = explicitSlots[field];
    if (Array.isArray(explicitValue) ? explicitValue.length : Boolean(explicitValue)) continue;
    if (field in modelSlots) next[field] = structuredClone(modelSlots[field]);
  }
  return next;
}

function projectCreationFocusSummary(requestText, language = 'en') {
  const isChinese = normalizeProjectAgentLanguage(language, textHasChinese(requestText) ? 'zh-Hans' : 'en') === 'zh-Hans';
  const text = String(requestText || '').toLowerCase();
  if (textIncludesAny(text, ['\u9700\u6c42\u6765\u6e90', '\u9700\u6c42\u65b9', '\u8c01\u63d0\u51fa', '\u54ea\u91cc', 'request source', 'demand source', 'who requests'])) {
    return isChinese ? '\u9700\u6c42\u6765\u6e90\u3001\u53d1\u8d77\u56e2\u961f\u4e0e\u4e0a\u4e0b\u6e38\u8d23\u4efb\u8fb9\u754c' : 'Request sources, initiating teams, and upstream/downstream ownership';
  }
  if (textIncludesAny(text, ['\u5ba1\u6279', '\u5ba1\u6838', '\u98ce\u9669', '\u5408\u89c4', 'approval', 'review', 'risk', 'compliance'])) {
    return isChinese ? '\u5ba1\u6279\u8def\u5f84\u3001\u98ce\u9669\u7ea6\u675f\u4e0e\u4eba\u673a\u8d23\u4efb\u8fb9\u754c' : 'Approval paths, risk constraints, and human-AI ownership';
  }
  if (textIncludesAny(text, ['\u4ea4\u4ed8', 'ai \u8303\u56f4', '\u4eba\u5de5', 'deliverable', 'ai scope', 'human'])) {
    return isChinese ? '\u4ea4\u4ed8\u7269\u3001AI \u5de5\u4f5c\u8303\u56f4\u4e0e\u4eba\u5de5\u51b3\u7b56\u70b9' : 'Deliverables, AI scope, and human decision points';
  }
  return isChinese ? '\u9879\u76ee\u76ee\u6807\u3001\u4ea4\u4ed8\u7269\u3001AI \u8fb9\u754c\u3001\u89d2\u8272\u4e0e\u5ba1\u6279\u7ea6\u675f' : 'Project goals, deliverables, AI boundaries, roles, and approvals';
}

async function enrichProjectCreationSessionWithModel(ctx, session, requestText) {
  const previousSlots = session.slots || {};
  let modelResult = null;
  let modelError = null;
  const modelCall = {
    id: `call_${Date.now()}_project_agent`,
    workspace_id: ctx.workspace_id,
    created_by: ctx.user_id,
    created_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    model: getModelStatus().planning_model,
    purpose: 'project_creation_plan',
    status: 'running',
    stage: 'requesting',
    focus_summary: projectCreationFocusSummary(requestText, session.output_language || session.outputLanguage),
    summary: `project creation: ${requestText}`,
  };
  modelCalls.unshift(modelCall);
  try {
    modelResult = await runModel('project_creation_plan', {
      request: requestText,
      existing_slots: previousSlots,
      conversation: (session.messages || []).slice(-6).map((message) => ({ role: message.role, content: message.content })),
      output_language: session.output_language || session.outputLanguage || 'en',
      required_fields: ['name', 'goal', 'current_stage', 'target_deliverables', 'expected_ai_scope', 'sensitive_areas', 'context_pack.request_sources', 'context_pack.team_roles', 'context_pack.approval_process', 'context_pack.risk_constraints'],
      optional_fields: ['project_type', 'risk_level', 'context_pack.tool_stack', 'context_pack.historical_process_materials'],
      quality_rules: [
        'Do not silently finalize the project. Extract explicit facts and make clearly labeled proposals for inferred values.',
        'Return an empty value and list the field in missing_fields when a safe workflow boundary cannot be inferred.',
        'The user will review and confirm the resulting blueprint before project creation.',
        'Treat the request as the latest turn in a conversation. Answer questions directly and revise the blueprint when the user challenges an assumption.',
        'List every field intentionally revised in changed_fields. Do not list unchanged fields.',
        'Never return an unchanged blueprint without an assistant_reply that directly addresses the latest user message.',
      ],
      output_contract: {
        intent: 'complete_blueprint | answer_question | revise_blueprint',
        assistant_reply: 'direct answer to the latest user message and a concise explanation of proposed blueprint revisions',
        reasoning_summary: 'one short user-safe summary of the current planning focus; do not reveal hidden chain-of-thought',
        changed_fields: ['field path intentionally changed, for example context_pack.request_sources or context_pack.team_roles'],
        project: {
          name: 'short project name',
          goal: 'project goal',
          project_type: 'short domain-specific category, for example Contract Review AI or Internal Support Automation',
          current_stage: 'Discovery | Design | Development | Testing | Launch',
          risk_level: 'low | medium | high',
          target_deliverables: ['deliverable'],
          expected_ai_scope: ['AI responsibility'],
          sensitive_areas: ['sensitive area'],
          context_pack: {
            request_sources: ['team, role, system, event, or business trigger that originates work requests'],
            team_roles: ['project role or accountable owner'],
            approval_process: ['approval or review gate'],
            tool_stack: ['tool, system, repository, design app, deployment target'],
            risk_constraints: ['privacy, safety, compliance, release or data constraint'],
            historical_process_materials: 'short note about known existing docs or prior process',
          },
        },
        confidence: 'low | medium | high',
        missing_fields: ['name | goal | current_stage | target_deliverables | expected_ai_scope | sensitive_areas | context_pack.request_sources | context_pack.team_roles | context_pack.approval_process | context_pack.risk_constraints'],
      },
    }, {
      onProgress: (progress) => Object.assign(modelCall, {
        stage: progress.stage || 'reasoning',
        reasoning_characters: progress.reasoning_characters || 0,
        last_activity_at: new Date().toISOString(),
      }),
    });
    Object.assign(modelCall, {
      model: modelResult.model,
      status: modelResult.status,
      stage: 'completed',
      summary: modelResult.output?.summary || modelResult.output?.reasoning_summary || modelResult.output?.reasoningSummary || modelCall.summary,
      focus_summary: modelResult.output?.reasoning_summary || modelResult.output?.reasoningSummary || modelCall.focus_summary,
      last_activity_at: new Date().toISOString(),
    });
  } catch (error) {
    modelError = error;
    Object.assign(modelCall, { status: 'failed', stage: 'failed', summary: error.message, last_activity_at: new Date().toISOString() });
  }
  const modelOutput = modelResult?.output || {};
  const modelSlots = modelResult?.status && modelResult.status !== 'mock'
    ? normalizeProjectCreationModelSlots(modelResult.output)
    : {};
  const changedFields = normalizeProjectCreationChangedFields(modelOutput);
  const modelProvidedProjectPlan = Object.entries(modelSlots).some(([key, value]) => {
    if (key === 'context_pack') return Object.values(value || {}).some((item) => Array.isArray(item) ? item.length : Boolean(item));
    return Array.isArray(value) ? value.length : Boolean(value);
  });
  const modelFailure = modelError?.message
    || (modelResult?.status !== 'succeeded' ? 'PROJECT_AGENT_MODEL_UNAVAILABLE' : '')
    || (!modelProvidedProjectPlan ? 'PROJECT_AGENT_INVALID_MODEL_OUTPUT' : '');
  const fallbackSlots = extractProjectCreationSlots(requestText, previousSlots);
  const modelEnrichedSlots = mergeProjectCreationSlots(modelSlots, fallbackSlots);
  const fallbackContextPack = fallbackSlots.context_pack || {};
  modelEnrichedSlots.context_pack = { ...(modelEnrichedSlots.context_pack || {}) };
  for (const [key, value] of Object.entries(fallbackContextPack)) {
    if (Array.isArray(value) ? value.length : Boolean(value)) modelEnrichedSlots.context_pack[key] = value;
  }
  const explicitCurrentTurnSlots = extractExplicitProjectCreationSlots(requestText);
  let slots = mergeProjectCreationSlots(modelEnrichedSlots, explicitCurrentTurnSlots);
  const explicitContextPack = explicitCurrentTurnSlots.context_pack || {};
  if (Object.keys(explicitContextPack).length) {
    slots.context_pack = { ...(slots.context_pack || {}) };
    for (const [key, value] of Object.entries(explicitContextPack)) {
      if (Array.isArray(value) ? value.length : Boolean(value)) slots.context_pack[key] = value;
    }
  }
  slots = applyDeclaredProjectCreationChanges(slots, modelSlots, changedFields, explicitCurrentTurnSlots);
  const missing = missingProjectCreationSlots(slots);
  const trace = [
    ...(session.agent_trace || session.agentTrace || []),
    {
      stage: 'project_planner',
      status: modelError ? 'failed' : (modelResult?.status || 'fallback'),
      generation_source: modelProvidedProjectPlan ? 'llm' : 'failed',
      missing_slots: missing,
      context_pack_fields: Object.entries(slots.context_pack || {}).filter(([, value]) => Array.isArray(value) ? value.length : Boolean(value)).map(([key]) => key),
      changed_fields: changedFields,
      reasoning_summary: modelOutput.reasoning_summary || modelOutput.reasoningSummary || null,
      error: modelError?.message || null,
    },
  ];
  return {
    ...session,
    slots,
    missing_slots: missing,
    status: missing.length ? 'collecting_info' : 'ready_to_create',
    agent_trace: trace,
    agentTrace: trace,
    model_status: modelResult?.status || (modelError ? 'failed' : 'fallback'),
    model_error: modelFailure || null,
    assistant_reply: modelOutput.assistant_reply || modelOutput.assistantReply || '',
    reasoning_summary: modelOutput.reasoning_summary || modelOutput.reasoningSummary || '',
    changed_fields: changedFields,
    updated_at: new Date().toISOString(),
  };
}

function missingProjectCreationSlots(slots) {
  const contextPack = slots.context_pack || slots.contextPack || {};
  return [
    !slots.name ? 'name' : null,
    !slots.goal ? 'goal' : null,
    !slots.current_stage ? 'current_stage' : null,
    !slots.target_deliverables?.length ? 'target_deliverables' : null,
    !slots.expected_ai_scope?.length ? 'expected_ai_scope' : null,
    !slots.sensitive_areas?.length ? 'sensitive_areas' : null,
    !contextPack.request_sources?.length ? 'request_sources' : null,
    !contextPack.team_roles?.length ? 'team_roles' : null,
    !contextPack.approval_process?.length ? 'approval_process' : null,
    !contextPack.risk_constraints?.length ? 'risk_constraints' : null,
  ].filter(Boolean);
}

function normalizeProjectAgentLanguage(value, fallback = 'en') {
  const language = String(value || fallback || 'en');
  return language === 'zh-Hans' ? 'zh-Hans' : 'en';
}

function isCancelProjectCreationRequest(text) {
  return textIncludesAny(text, [
    'cancel',
    'cancel project',
    'cancel creation',
    'stop creating',
    'discard project',
    'start over',
    'nevermind',
    'never mind',
    '\u53d6\u6d88',
    '\u53d6\u6d88\u521b\u5efa',
    '\u4e0d\u521b\u5efa\u4e86',
    '\u4e0d\u505a\u4e86',
    '\u91cd\u65b0\u6765',
  ]);
}

function isConfirmProjectCreationRequest(text) {
  const normalized = String(text || '').trim().toLowerCase().replace(/[.!。！]/g, '');
  return [
    'confirm', 'confirmed', 'confirm creation', 'create it', 'proceed', 'looks good', 'yes, create it',
    '\u786e\u8ba4', '\u786e\u8ba4\u521b\u5efa', '\u5f00\u59cb\u521b\u5efa', '\u53ef\u4ee5\u521b\u5efa', '\u6ca1\u95ee\u9898', '\u6309\u8fd9\u4e2a\u521b\u5efa',
  ].includes(normalized);
}

function cancelProjectCreationSession(session, requestText) {
  const isChinese = normalizeProjectAgentLanguage(session.output_language || session.outputLanguage, textHasChinese(requestText) ? 'zh-Hans' : 'en') === 'zh-Hans';
  const now = new Date().toISOString();
  return {
    ...session,
    status: 'cancelled',
    missing_slots: [],
    missingSlots: [],
    messages: [
      ...(session.messages || []),
      { role: 'user', content: requestText, at: now },
      {
        role: 'agent',
        status: 'cancelled',
        content: isChinese ? '\u5df2\u53d6\u6d88\u5f53\u524d\u9879\u76ee\u521b\u5efa\u4f1a\u8bdd\u3002' : 'Cancelled the current project creation session.',
        at: now,
      },
    ].slice(-AI_CONVERSATION_LIMIT),
    updated_at: now,
  };
}

function buildProjectCreationSession(ctx, requestText, patch = {}) {
  const existingSession = patch.session_id ? projectCreationSessions.get(patch.session_id) : null;
  const existing = existingSession && !['created', 'cancelled'].includes(existingSession.status) ? existingSession : null;
  const slots = extractProjectCreationSlots(requestText, existing?.slots || {});
  const missing = missingProjectCreationSlots(slots);
  const now = new Date().toISOString();
  const outputLanguage = normalizeProjectAgentLanguage(patch.output_language || patch.outputLanguage, existing?.output_language || existing?.outputLanguage || 'en');
  const session = {
    id: existing?.id || `project_session_${randomUUID()}`,
    workspace_id: ctx.workspace_id,
    status: patch.status || (missing.length ? 'collecting_info' : 'ready_to_create'),
    output_language: outputLanguage,
    outputLanguage,
    slots,
    missing_slots: missing,
    messages: [
      ...(existing?.messages || []),
      { role: 'user', content: requestText, at: now },
    ].slice(-AI_CONVERSATION_LIMIT),
    created_at: existing?.created_at || now,
    updated_at: now,
  };
  return session;
}

function loadProjectCreationSessions() {
  if (storageAdapter !== 'file' || !existsSync(projectCreationSessionsPath)) return;
  try {
    const raw = readJsonFile(projectCreationSessionsPath);
    const sessions = Array.isArray(raw?.sessions) ? raw.sessions : [];
    projectCreationSessions.clear();
    sessions
      .filter((session) => session?.id)
      .slice(0, PROJECT_CREATION_SESSION_LIMIT)
      .forEach((session) => projectCreationSessions.set(session.id, session));
  } catch {
    projectCreationSessions.clear();
  }
}

function persistProjectCreationSessions() {
  if (storageAdapter !== 'file') return;
  const sessions = [...projectCreationSessions.values()]
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)))
    .slice(0, PROJECT_CREATION_SESSION_LIMIT);
  writeFileSync(projectCreationSessionsPath, JSON.stringify({ sessions }, null, 2));
}

function saveProjectCreationSession(session) {
  projectCreationSessions.set(session.id, session);
  const entries = [...projectCreationSessions.values()].sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
  entries.slice(PROJECT_CREATION_SESSION_LIMIT).forEach((item) => projectCreationSessions.delete(item.id));
  persistProjectCreationSessions();
  return session;
}

function projectCreationClarification(session) {
  const isChinese = normalizeProjectAgentLanguage(session.output_language || session.outputLanguage, textHasChinese(session.messages.at(-1)?.content || '') ? 'zh-Hans' : 'en') === 'zh-Hans';
  const questions = {
    name: isChinese ? '\u9879\u76ee\u540d\u79f0\u662f\u4ec0\u4e48\uff1f' : 'What should the project be called?',
    goal: isChinese ? '\u8fd9\u4e2a\u9879\u76ee\u7684\u76ee\u6807\u662f\u4ec0\u4e48\uff1f' : 'What is the project goal?',
    current_stage: isChinese ? '\u5f53\u524d\u5904\u4e8e\u54ea\u4e2a\u9636\u6bb5\uff1f' : 'What stage is the project currently in?',
    target_deliverables: isChinese ? '\u5e0c\u671b\u8fd9\u4e2a\u9879\u76ee\u6700\u7ec8\u4ea4\u4ed8\u54ea\u4e9b\u6210\u679c\uff1f' : 'What outcomes or artifacts should this project deliver?',
    expected_ai_scope: isChinese ? 'AI \u5e94\u8be5\u8d1f\u8d23\u54ea\u4e9b\u5de5\u4f5c\uff0c\u54ea\u4e9b\u5fc5\u987b\u7531\u4eba\u5b8c\u6210\uff1f' : 'What should AI handle, and what must remain human-owned?',
    sensitive_areas: isChinese ? '\u6709\u54ea\u4e9b\u654f\u611f\u6570\u636e\u3001\u64cd\u4f5c\u6216\u9ad8\u98ce\u9669\u533a\u57df\uff1f\u5982\u679c\u6ca1\u6709\u8bf7\u660e\u786e\u8bf4\u660e\u3002' : 'Which data, actions, or decisions are sensitive? Say explicitly if there are none.',
    request_sources: isChinese ? '\u8c01\u4f1a\u63d0\u51fa\u6216\u89e6\u53d1\u8fd9\u4e9b\u5de5\u4f5c\u9700\u6c42\uff1f' : 'Who or what originates and triggers these work requests?',
    team_roles: isChinese ? '\u8c01\u4f1a\u53c2\u4e0e\u9879\u76ee\uff0c\u4ed6\u4eec\u5206\u522b\u8d1f\u8d23\u4ec0\u4e48\uff1f' : 'Which roles participate, and what are they accountable for?',
    approval_process: isChinese ? '\u54ea\u4e9b\u7ed3\u679c\u9700\u8981\u4eba\u5de5\u5ba1\u6838\u6216\u6279\u51c6\uff1f' : 'Which results require human review or approval?',
    risk_constraints: isChinese ? '\u5fc5\u987b\u9075\u5b88\u54ea\u4e9b\u9690\u79c1\u3001\u5408\u89c4\u3001\u5b89\u5168\u6216\u53d1\u5e03\u7ea6\u675f\uff1f' : 'Which privacy, compliance, safety, or release constraints must be enforced?',
  };
  return {
    status: 'needs_clarification',
    content: isChinese ? '\u6211\u53ef\u4ee5\u5e2e\u4f60\u521b\u5efa\u9879\u76ee\uff0c\u4f46\u9700\u8981\u5148\u8865\u5168\u51e0\u4e2a\u5173\u952e\u4fe1\u606f\u3002' : 'I can create the project, but I need a few key details first.',
    questions: session.missing_slots.slice(0, 3).map((slot) => questions[slot] || slot),
    missing_fields: session.missing_slots,
  };
}

function projectCreationConfirmation(session) {
  const isChinese = normalizeProjectAgentLanguage(session.output_language || session.outputLanguage) === 'zh-Hans';
  const slots = session.slots || {};
  const contextPack = slots.context_pack || slots.contextPack || {};
  const value = (items) => (Array.isArray(items) ? items.join(isChinese ? '\u3001' : ', ') : (items || (isChinese ? '\u672a\u8bbe\u7f6e' : 'Not set')));
  const lines = isChinese
    ? [
      ...(session.assistant_reply ? [session.assistant_reply, ''] : []),
      '\u9879\u76ee\u84dd\u56fe\u5df2\u51c6\u5907\u597d\uff0c\u8bf7\u786e\u8ba4\uff1a',
      `\u540d\u79f0\uff1a${slots.name}`,
      `\u76ee\u6807\uff1a${slots.goal}`,
      `\u5f53\u524d\u9636\u6bb5\uff1a${slots.current_stage}`,
      `\u4ea4\u4ed8\u7269\uff1a${value(slots.target_deliverables)}`,
      `AI \u8303\u56f4\uff1a${value(slots.expected_ai_scope)}`,
      `\u654f\u611f\u533a\u57df\uff1a${value(slots.sensitive_areas)}`,
      `\u9700\u6c42\u6765\u6e90\uff1a${value(contextPack.request_sources)}`,
      `\u53c2\u4e0e\u89d2\u8272\uff1a${value(contextPack.team_roles)}`,
      `\u5ba1\u6279\u6d41\u7a0b\uff1a${value(contextPack.approval_process)}`,
      `\u98ce\u9669\u7ea6\u675f\uff1a${value(contextPack.risk_constraints)}`,
      '\u8bf7\u56de\u590d\u201c\u786e\u8ba4\u521b\u5efa\u201d\uff0c\u6216\u76f4\u63a5\u544a\u8bc9\u6211\u9700\u8981\u4fee\u6539\u7684\u5185\u5bb9\u3002',
    ]
    : [
      ...(session.assistant_reply ? [session.assistant_reply, ''] : []),
      'The project blueprint is ready for review:',
      `Name: ${slots.name}`,
      `Goal: ${slots.goal}`,
      `Current stage: ${slots.current_stage}`,
      `Deliverables: ${value(slots.target_deliverables)}`,
      `AI scope: ${value(slots.expected_ai_scope)}`,
      `Sensitive areas: ${value(slots.sensitive_areas)}`,
      `Request sources: ${value(contextPack.request_sources)}`,
      `Team roles: ${value(contextPack.team_roles)}`,
      `Approval process: ${value(contextPack.approval_process)}`,
      `Risk constraints: ${value(contextPack.risk_constraints)}`,
      'Reply "Confirm creation", or tell me what you want to change.',
    ];
  return { status: 'awaiting_confirmation', content: lines.join('\n') };
}

loadProjectCreationSessions();

function normalizeGeneratedWorkflow(project, selectedTemplate, modelOutput) {
  const rawEnvelope = modelOutput?.workflow_draft || modelOutput?.draft || modelOutput?.workflow || modelOutput;
  const rawWorkflow = rawEnvelope?.workflow || rawEnvelope;
  const normalized = normalizeWorkflowSpec({ workflow: rawWorkflow }).workflow;
  const templatePhases = selectedTemplate.content?.default_phases || selectedTemplate.default_phases || ['Discovery', 'Design', 'Development', 'Testing', 'Launch'];
  const phases = (normalized.phases?.length ? normalized.phases : templatePhases.map((name, index) => ({ id: `phase-${index + 1}`, name, order: index + 1 })))
    .map((phase, index) => ({
      id: safeId(phase.id, `phase-${index + 1}`),
      name: String(phase.name || templatePhases[index] || `Phase ${index + 1}`),
      order: Number(phase.order || index + 1),
    }));
  const phaseIds = new Set(phases.map((phase) => phase.id));
  const defaultPhaseId = phases[0]?.id || 'phase-1';
  const nodes = (normalized.nodes || []).map((node, index) => {
    const nodeId = safeId(node.id, `node-${index + 1}`);
    const phaseId = phaseIds.has(node.phase_id) ? node.phase_id : defaultPhaseId;
    const executionMode = ['human_only', 'ai_draft_human_review', 'human_lead_ai_assist', 'ai_execute_human_approval', 'ai_autonomous'].includes(node.execution_mode)
      ? node.execution_mode
      : 'human_lead_ai_assist';
    const riskLevel = ['low', 'medium', 'high'].includes(node.risk_level) ? node.risk_level : 'medium';
    const outputs = asList(node.outputs, ['Draft output']);
    const inputs = asList(node.inputs, index === 0 ? ['Project goal'] : ['Upstream output']);
    const artifactContract = node.artifact_contract || {};
    const reviewGate = node.review_gate || (riskLevel === 'high' || executionMode !== 'ai_autonomous' ? {
      id: `gate-${nodeId}`,
      name: `${node.name || `Node ${index + 1}`} Review`,
      reviewer_role: node.human_owner_role || 'Project Owner',
      criteria: ['Completeness', 'Risk controls present'],
      pass_condition: 'Reviewer approves the output',
      reject_condition: 'Required criteria are not met',
      allow_ai_revision: true,
      required: riskLevel !== 'low',
    } : null);
    return normalizeAgenticNode({
      id: nodeId,
      phase_id: phaseId,
      name: String(node.name || `Workflow Step ${index + 1}`),
      goal: String(node.goal || `Complete ${node.name || `workflow step ${index + 1}`}`),
      execution_mode: executionMode,
      risk_level: riskLevel,
      status: node.status || 'draft',
      human_owner_role: node.human_owner_role || 'Project Owner',
      ai_role: node.ai_role || (executionMode === 'human_only' ? '' : 'AI Assistant'),
      inputs,
      outputs,
      artifact_contract: {
        id: artifactContract.id || `artifact-${nodeId}`,
        format: artifactContract.format || 'markdown',
        output_format: artifactContract.output_format || outputs.join(', '),
        acceptance_criteria: asList(artifactContract.acceptance_criteria, ['Output addresses the node goal', 'Boundary rules are followed']),
      },
      review_gate: reviewGate,
      prompt_status: executionMode === 'human_only' ? 'missing' : 'draft',
      checklist_status: 'draft',
      history: [{ at: new Date().toISOString(), action: 'Node generated by model' }],
    });
  });
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = (normalized.edges || [])
    .map((edge, index) => ({ id: safeId(edge.id, `edge-${index + 1}`), from: edge.from, to: edge.to, required_outputs: asList(edge.required_outputs) }))
    .filter((edge) => nodeIds.has(edge.from) && nodeIds.has(edge.to));
  if (!nodes.length) throw new Error('MODEL_WORKFLOW_EMPTY: Model output must include at least one workflow node.');
  return {
    id: normalized.id || `workflow-${project.id}`,
    workspace_id: project.workspace_id,
    project_id: project.id,
    template_id: selectedTemplate.id,
    context_pack_version: project.context_pack?.version || 1,
    version: 1,
    status: 'draft',
    phases,
    nodes,
    edges,
    updated_at: new Date().toISOString(),
    generated_by: 'real_llm',
  };
}

function buildAssetsForWorkflow(workflow, contextPack = {}, modelName = 'configured-planning-model') {
  const prompts = workflow.nodes
    .filter((node) => node.execution_mode !== 'human_only')
    .map((node) => attachGeneratedFrom({
      id: `prompt-${node.id}`,
      node_id: node.id,
      phase_id: node.phase_id,
      name: `Prompt: ${node.name}`,
      model: modelName,
      status: node.prompt_status || 'draft',
      output_format: node.artifact_contract?.output_format || 'markdown',
      acceptance_criteria: node.artifact_contract?.acceptance_criteria || [],
      content: `# Role\n${node.ai_role || 'AI Assistant'}\n\n# Objective\n${node.goal}\n\n# Context Required\n${node.inputs.map((item) => `- ${item}`).join('\n')}\n\n# Output Format\n${node.artifact_contract?.output_format || 'Structured markdown'}\n\n# Acceptance Criteria\n${(node.artifact_contract?.acceptance_criteria || ['Meets node contract']).map((item) => `- ${item}`).join('\n')}`,
      updated_at: new Date().toISOString(),
    }, node, workflow, contextPack, 'prompt'));
  const checklists = workflow.nodes.map((node) => attachGeneratedFrom({
    id: `checklist-${node.id}`,
    node_id: node.id,
    phase_id: node.phase_id,
    name: `Checklist: ${node.name}`,
    status: node.checklist_status || 'draft',
    reviewer_role: node.review_gate?.reviewer_role || node.human_owner_role,
    items: [
      `Confirm goal of ${node.name} is met`,
      ...asList(node.review_gate?.criteria, ['Validate quality and risk controls']),
      `Verify pass condition: ${node.review_gate?.pass_condition || 'manual approval required'}`,
    ],
    updated_at: new Date().toISOString(),
  }, node, workflow, contextPack, 'checklist'));
  const artifact_templates = workflow.nodes.map((node) => attachGeneratedFrom({
    id: `artifact-template-${node.id}`,
    node_id: node.id,
    name: `${node.name} Artifact Template`,
    content: `# ${node.name}\n\n## Goal\n${node.goal}\n\n## Required Output\n- ${node.outputs.join('\n- ')}`,
    status: 'draft',
  }, node, workflow, contextPack, 'artifact_template'));
  return { prompts, checklists, artifact_templates, artifactTemplates: artifact_templates };
}

function modelWorkflowPayload(project) {
  return {
    instruction: 'Generate a domain-specific RoleUnion workflow draft as strict JSON. Infer phases and nodes from this project only. Do not copy a generic software delivery template. Return at least three concrete nodes whose names and goals clearly match the project domain.',
    output_contract: {
      workflow: {
        phases: [{ id: 'phase-1', name: 'Discovery', order: 1 }],
        nodes: [{
          id: 'node-1',
          phase_id: 'phase-1',
          name: 'Specific project step',
          goal: 'Concrete goal',
          execution_mode: 'human_lead_ai_assist | ai_draft_human_review | ai_execute_human_approval | human_only | ai_autonomous',
          risk_level: 'low | medium | high',
          inputs: ['input artifact'],
          outputs: ['output artifact'],
          artifact_contract: { format: 'markdown', output_format: 'structured markdown', acceptance_criteria: ['criterion'] },
          review_gate: { name: 'Review', reviewer_role: 'Owner', criteria: ['criterion'], pass_condition: 'approved', reject_condition: 'rework', allow_ai_revision: true, required: true },
        }],
        edges: [{ id: 'edge-1', from: 'node-1', to: 'node-2', required_outputs: ['output artifact'] }],
      },
    },
    project: {
      id: project.id,
      name: project.name,
      goal: project.goal,
      project_type: project.project_type || project.type,
      current_stage: project.current_stage,
      risk_level: project.risk_level,
      target_deliverables: project.target_deliverables || [],
      expected_ai_scope: project.expected_ai_scope || [],
      sensitive_areas: project.sensitive_areas || [],
      output_language: project.output_language || 'en',
    },
    context_pack: project.context_pack || {},
    boundary_rules: [
      'High risk nodes require a required review gate.',
      'Human-only nodes must not have AI prompts.',
      'AI autonomous is allowed only for low-risk non-production work.',
      'Every node must have inputs, outputs, and acceptance criteria.',
    ],
  };
}

async function prepareWorkflowGeneration(ctx, project, selectedTemplate) {
  let modelResult;
  const modelCall = {
    id: `call_${Date.now()}_workflow_generate`,
    workspace_id: ctx.workspace_id,
    created_by: ctx.user_id,
    created_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    model: getModelStatus().planning_model,
    purpose: 'workflow_generate',
    status: 'running',
    stage: 'requesting',
    summary: `generating domain workflow for ${project.name}`,
  };
  modelCalls.unshift(modelCall);
  try {
    modelResult = await runModel('workflow_generate', modelWorkflowPayload(project), {
      onProgress: (progress) => Object.assign(modelCall, {
        stage: progress.stage || 'reasoning',
        reasoning_characters: progress.reasoning_characters || 0,
        last_activity_at: new Date().toISOString(),
      }),
    });
    if (modelResult.status !== 'succeeded') throw new Error('WORKFLOW_MODEL_UNAVAILABLE: The configured LLM did not execute.');
    Object.assign(modelCall, { model: modelResult.model, status: 'succeeded', stage: 'completed', summary: modelResult.output?.summary || `generated domain workflow for ${project.name}`, last_activity_at: new Date().toISOString() });
  } catch (error) {
    Object.assign(modelCall, { status: 'failed', stage: 'failed', summary: error.message || 'Workflow generation failed', last_activity_at: new Date().toISOString() });
    throw error;
  }

  try {
    const workflow = normalizeGeneratedWorkflow(project, selectedTemplate, modelResult.output);
    const assets = buildAssetsForWorkflow(workflow, project.context_pack, modelResult.model);
    const schema = validateWorkflow(workflow);
    if (!schema.ok) throw new Error(`MODEL_WORKFLOW_SCHEMA_INVALID: ${schema.errors.join('; ')}`);
    const validation = validateRulesWorkflow(workflow, assets, { forGeneration: true, modelConfig: getModelStatus() });
    const specCheck = validateRoleUnionProjectSpec({ roleunion_version: 'v0.1', project, context_pack: project.context_pack, workflow, assets, validation, execution_kits: project.execution_kits || [] });
    if (!specCheck.ok) throw new Error(`MODEL_PROJECT_SPEC_INVALID: ${specCheck.errors.join('; ')}`);
    return { workflow, assets, validation, modelResult };
  } catch (error) {
    modelCalls.unshift({ id: `call_${Date.now()}_invalid`, workspace_id: ctx.workspace_id, created_by: ctx.user_id, created_at: new Date().toISOString(), model: modelResult.model, purpose: 'workflow_generate', status: 'failed', summary: error.message || 'Model workflow output invalid' });
    throw error;
  }
}

function applyPreparedWorkflow(ctx, project, prepared) {
  recordUndoSnapshot(ctx, project, 'model_generation');
  project.workflow = prepared.workflow;
  project.assets = prepared.assets;
  project.validation = prepared.validation;
  return { type: 'workflow', workflow_id: prepared.workflow.id, workflow_version: prepared.workflow.version };
}
function ensureWorkflowHistory(project) {
  if (!Array.isArray(project.workflow_history_items)) project.workflow_history_items = [];
  if (!Array.isArray(project.workflow_snapshots)) project.workflow_snapshots = [];
  if (!Array.isArray(project.workflow_undo_snapshots)) project.workflow_undo_snapshots = [];
}

function createStoredWorkflowSnapshot(ctx, project, changeSource) {
  const snapshot = createWorkflowSnapshot(project, project.context_pack, project.workflow, project.assets, project.validation || []);
  return {
    id: `workflow_snapshot_v${project.workflow.version}_${randomUUID()}`,
    workspace_id: project.workspace_id,
    project_id: project.id,
    workflow_id: project.workflow.id,
    workflow_version: project.workflow.version,
    project_summary: { name: project.name, goal: project.goal },
    context_pack_version: project.context_pack?.version || 1,
    phases: snapshot.workflow.phases,
    nodes: snapshot.workflow.nodes,
    edges: snapshot.workflow.edges,
    asset_references: { prompts: (project.assets?.prompts || []).map((a) => a.id), checklists: (project.assets?.checklists || []).map((a) => a.id) },
    validation_results: snapshot.validation,
    created_at: new Date().toISOString(),
    created_by: ctx.user_id,
    change_source: changeSource,
  };
}

function recordUndoSnapshot(ctx, project, changeSource = 'workflow_edit') {
  ensureWorkflowHistory(project);
  project.workflow_undo_snapshots.push(createStoredWorkflowSnapshot(ctx, project, changeSource));
  project.workflow_undo_snapshots = project.workflow_undo_snapshots.slice(-50);
}

function recordWorkflowHistory(ctx, project, changeSource, summary, diffId = null) {
  ensureWorkflowHistory(project);
  const previousVersion = (project.workflow.version || 1) - 1;
  const snapshot = createStoredWorkflowSnapshot(ctx, project, changeSource);
  project.workflow_snapshots = project.workflow_snapshots.filter((s) => s.workflow_version !== project.workflow.version);
  project.workflow_snapshots.push(snapshot);
  project.workflow_history_items.push({
    id: `history_${randomUUID()}`,
    workspace_id: project.workspace_id,
    project_id: project.id,
    workflow_id: project.workflow.id,
    version: project.workflow.version,
    previous_version: previousVersion > 0 ? previousVersion : null,
    change_source: changeSource,
    summary,
    created_by: ctx.user_id,
    created_at: new Date().toISOString(),
    diff_id: diffId,
    snapshot_ref: snapshot.id,
  });
  project.workflow_history_items = project.workflow_history_items.slice(-10);
  const refs = new Set(project.workflow_history_items.map((item) => item.snapshot_ref));
  project.workflow_snapshots = project.workflow_snapshots.filter((snapshot) => refs.has(snapshot.id));
}
function rehydrateFromSnapshot(project, snapshot) {
  project.workflow = {
    ...project.workflow,
    id: snapshot.workflow_id,
    version: snapshot.workflow_version,
    phases: structuredClone(snapshot.phases || []),
    nodes: structuredClone(snapshot.nodes || []),
    edges: structuredClone(snapshot.edges || []),
    updated_at: new Date().toISOString(),
  };
}

function ensureJobStore(project) {
  if (!Array.isArray(project.generation_jobs)) project.generation_jobs = [];
}

function readIdempotencyKey(req) {
  const raw = req.headers['idempotency-key'];
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

function createJob(ctx, project, type, inputSnapshot, idempotencyKey = null, retryOf = null) {
  const now = new Date().toISOString();
  ensureJobStore(project);
  if (idempotencyKey) {
    const existing = project.generation_jobs.find((j) => j.type === type && j.idempotency_key === idempotencyKey && ACTIVE_JOB_STATUS.has(j.status));
    if (existing) return existing;
  }
  const job = {
    id: `job_${randomUUID()}`,
    workspace_id: ctx.workspace_id,
    project_id: project.id,
    type,
    status: 'queued',
    created_by: ctx.user_id,
    created_at: now,
    updated_at: now,
    input_snapshot: inputSnapshot || {},
    output_ref: null,
    error: null,
    progress: { stage: 'queued', message: 'Waiting to start generation.' },
    stage_history: [{ stage: 'queued', message: 'Waiting to start generation.', at: now }],
    idempotency_key: idempotencyKey,
    retry_of: retryOf,
    attempt: retryOf ? ((project.generation_jobs.find((j) => j.id === retryOf)?.attempt || 1) + 1) : 1,
    cancel_requested: false,
  };
  const v = validateGenerationJob(job);
  if (!v.ok) throw new Error(v.errors.join('; '));
  project.generation_jobs.push(job);
  storage.saveProject(ctx.workspace_id, project);
  return job;
}

function setJobProgress(job, stage, message) {
  job.progress = { stage, message };
  job.updated_at = new Date().toISOString();
  job.stage_history = [...(job.stage_history || []), { stage, message, at: job.updated_at }].slice(-20);
}

function runJob(ctx, project, job, fn) {
  if (job.status === 'cancelled') return;
  job.status = 'running';
  job.started_at = job.started_at || new Date().toISOString();
  setJobProgress(job, 'preparing_input', 'Preparing generation input.');
  try {
    const outputRef = fn((stage, message) => setJobProgress(job, stage, message));
    if (job.cancel_requested) {
      job.status = 'cancelled';
      setJobProgress(job, 'failed', 'Cancelled before apply.');
    } else {
      job.output_ref = outputRef;
      job.status = 'succeeded';
      job.completed_at = new Date().toISOString();
      setJobProgress(job, 'completed', 'Generation completed.');
    }
  } catch (e) {
    job.status = 'failed';
    job.error = { code: 'JOB_FAILED', stage: job.progress?.stage || 'failed', retryable: true, message: e.message };
    setJobProgress(job, 'failed', e.message);
  }
  job.updated_at = new Date().toISOString();
  storage.saveProject(ctx.workspace_id, project);
}

function upsertPromptAsset(project, node, prompt) {
  const asset = attachGeneratedFrom(prompt, node, project.workflow, project.context_pack, 'prompt');
  project.assets.prompts = (project.assets.prompts || []).filter((item) => (item.node_id || item.nodeId) !== node.id).concat(asset);
  return asset;
}

function upsertChecklistAsset(project, node, checklist) {
  const asset = attachGeneratedFrom(checklist, node, project.workflow, project.context_pack, 'checklist');
  project.assets.checklists = (project.assets.checklists || []).filter((item) => (item.node_id || item.nodeId) !== node.id).concat(asset);
  return asset;
}

function runRetryableJob(ctx, project, original, progress) {
  if (!RETRYABLE_JOB_TYPES.has(original.type)) {
    throw new Error(`JOB_RETRY_UNSUPPORTED: ${original.type} cannot be retried from persisted input yet.`);
  }
  if (original.type === 'summarize_context_pack') {
    progress('analyzing_context', 'Rebuilding Context Pack summary from the persisted snapshot.');
    project.context_pack.summary = buildContextPackSummary(project);
    project.context_pack.updated_at = new Date().toISOString();
    storage.saveProject(ctx.workspace_id, project);
    return { type: 'context_pack_summary', project_id: project.id, context_pack_version: project.context_pack.version || 1 };
  }
  if (original.type === 'generate_prompt') {
    const nodeId = original.input_snapshot?.node_id || original.input_snapshot?.node?.id;
    const node = (project.workflow.nodes || []).find((item) => item.id === nodeId);
    if (!node) throw new Error(`NODE_NOT_FOUND: Cannot retry prompt generation for missing node ${nodeId}`);
    progress('calling_model', 'Regenerating prompt from node contract.');
    const prompt = generatePrompt(node, { workflow: project.workflow, contextPack: project.context_pack, model: getModelStatus().prompt_model });
    if (!prompt) throw new Error('HUMAN_ONLY_NO_PROMPT: Human-only node cannot generate AI prompt.');
    const asset = upsertPromptAsset(project, node, prompt);
    project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: true, modelConfig: null });
    storage.saveProject(ctx.workspace_id, project);
    return { type: 'prompt_asset', asset_id: asset.id };
  }
  if (original.type === 'generate_checklist') {
    const nodeId = original.input_snapshot?.node_id || original.input_snapshot?.node?.id;
    const node = (project.workflow.nodes || []).find((item) => item.id === nodeId);
    if (!node) throw new Error(`NODE_NOT_FOUND: Cannot retry checklist generation for missing node ${nodeId}`);
    progress('calling_model', 'Regenerating checklist from review gate.');
    const checklist = generateChecklist(node.review_gate, node, { workflow: project.workflow, contextPack: project.context_pack });
    const asset = upsertChecklistAsset(project, node, checklist);
    project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: true, modelConfig: null });
    storage.saveProject(ctx.workspace_id, project);
    return { type: 'checklist_asset', asset_id: asset.id };
  }
  if (original.type === 'generate_execution_kit_preview') {
    progress('generating_files', 'Regenerating Execution Kit preview files.');
    const kitType = original.input_snapshot?.kit_type || original.input_snapshot?.kitType || 'draft';
    const validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    project.validation = validation;
    const kit = generateExecutionKit(project.workflow, project.assets, validation, { kit_type: kitType });
    project.execution_kit = exportExecutionKit(kit);
    storage.saveProject(ctx.workspace_id, project);
    return { type: 'execution_kit_preview', project_id: project.id, kit_type: kit.kit_type };
  }
  if (original.type === 'generate_execution_kit') {
    progress('generating_files', 'Regenerating Execution Kit files.');
    const kitType = original.input_snapshot?.kit_type || original.input_snapshot?.kitType || 'draft';
    const validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    project.validation = validation;
    const kit = generateExecutionKit(project.workflow, project.assets, validation, { kit_type: kitType });
    if (kitType === 'final' && !kit.canExportFinal) throw new Error('FINAL_KIT_BLOCKED: Final Kit cannot be generated while blocking validation errors exist.');
    const rec = { id: `kit_${Date.now()}`, project_id: project.id, workspace_id: project.workspace_id, created_by: ctx.user_id, updated_by: ctx.user_id, workflow_snapshot_version: project.workflow.version, status: kit.kit_type === 'final' ? 'generated_final' : 'generated', kit_type: kit.kit_type, files: kit.files, validation_summary: kit.validation_summary, generated_at: new Date().toISOString(), input_snapshot: { workflow_version: project.workflow.version } };
    project.execution_kits = (project.execution_kits || []).concat(rec);
    storage.saveProject(ctx.workspace_id, project);
    return { type: 'execution_kit', kit_id: rec.id };
  }
  throw new Error(`JOB_RETRY_UNSUPPORTED: ${original.type}`);
}

const server = createServer(async (req, res) => {
  const ctx = makeContext();
  seedIfEmpty(ctx);
  const method = req.method || 'GET';
  const url = new URL(req.url || '/', `http://localhost:${port}`);
  const path = url.pathname;

  if (method === 'GET' && path === '/api/health') return ok(res, ctx, { status: 'ok', mode: runtimeMode, version: '0.1.0', storage: storageAdapter });

  if (method === 'GET' && path === '/api/templates') return ok(res, ctx, { templates: listPublicTemplates() });
  if (method === 'GET' && path.startsWith('/api/templates/')) {
    const template = getTemplateById(decodeURIComponent(path.split('/').pop()));
    if (!template) return fail(res, ctx, 404, 'TEMPLATE_NOT_FOUND', 'Template not found');
    return ok(res, ctx, template);
  }

  if (method === 'GET' && path === '/api/projects') return ok(res, ctx, listScopedProjects(ctx).map(projectListSummary));

  if (method === 'POST' && path === '/api/project-agent/messages') {
    const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
    const requestText = body.request || '';
    if (!requestText.trim()) return fail(res, ctx, 400, 'PROJECT_AGENT_EMPTY_REQUEST', 'Describe the project you want to create.');
    const existingProjectSession = body.session_id || body.sessionId ? projectCreationSessions.get(body.session_id || body.sessionId) : null;
    if (existingProjectSession && !['created', 'cancelled'].includes(existingProjectSession.status) && isCancelProjectCreationRequest(requestText)) {
      const cancelledSession = cancelProjectCreationSession(existingProjectSession, requestText);
      saveProjectCreationSession(cancelledSession);
      return ok(res, ctx, { project_creation_session: cancelledSession, model_status: getModelStatus() });
    }
    if (!requireConfiguredLlm(res, ctx, 'the project creation Agent')) return;
    const confirmationRequested = existingProjectSession?.status === 'awaiting_confirmation' && isConfirmProjectCreationRequest(requestText);
    let session;
    if (confirmationRequested) {
      const now = new Date().toISOString();
      session = {
        ...existingProjectSession,
        status: 'creating_project',
        messages: [...(existingProjectSession.messages || []), { role: 'user', content: requestText, at: now }].slice(-AI_CONVERSATION_LIMIT),
        updated_at: now,
      };
    } else {
      session = buildProjectCreationSession(ctx, requestText, { session_id: body.session_id || body.sessionId, output_language: body.output_language || body.outputLanguage });
      session = await enrichProjectCreationSessionWithModel(ctx, session, requestText);
      if (session.model_error) {
        const isChinese = normalizeProjectAgentLanguage(session.output_language || session.outputLanguage, textHasChinese(requestText) ? 'zh-Hans' : 'en') === 'zh-Hans';
        session.status = 'failed';
        session.messages.push({
          role: 'agent',
          status: 'failed',
          content: isChinese ? '\u9879\u76ee\u89c4\u5212\u6a21\u578b\u8c03\u7528\u5931\u8d25\uff0c\u672a\u521b\u5efa\u9879\u76ee\u3002\u8bf7\u68c0\u67e5\u6a21\u578b\u914d\u7f6e\u540e\u91cd\u8bd5\u3002' : 'Project planning failed and no project was created. Check Model Access and try again.',
          error: session.model_error,
          at: new Date().toISOString(),
        });
        saveProjectCreationSession(session);
        return fail(res, ctx, 502, 'PROJECT_AGENT_MODEL_FAILED', `Project planning failed: ${session.model_error}`, [{ session_id: session.id, cause: session.model_error }]);
      }
      if (session.missing_slots.length) {
        const clarification = projectCreationClarification(session);
        session.status = 'collecting_info';
        session.messages.push({ role: 'agent', status: 'needs_clarification', content: clarification.content, clarification_questions: clarification.questions, missing_fields: clarification.missing_fields, at: new Date().toISOString() });
        saveProjectCreationSession(session);
        return ok(res, ctx, { project_creation_session: session, clarification, model_status: getModelStatus() });
      }
      const confirmation = projectCreationConfirmation(session);
      session.status = 'awaiting_confirmation';
      session.messages.push({ role: 'agent', ...confirmation, at: new Date().toISOString() });
      saveProjectCreationSession(session);
      return ok(res, ctx, { project_creation_session: session, confirmation, model_status: getModelStatus() });
    }
    session.status = 'creating_project';
    saveProjectCreationSession(session);
    const selectedTemplate = selectTemplateForProject(session.slots);
    const contextPack = createContextPack(session.slots.context_pack || {});
    const selectedTemplateTrace = {
      stage: 'template_selector',
      status: 'selected',
      template_id: selectedTemplate.id,
      template_name: selectedTemplate.name,
      matched_project_type: session.slots.project_type || '',
      context_pack_fields: Object.entries(contextPack)
        .filter(([key, value]) => !['summary', 'version'].includes(key) && (Array.isArray(value) ? value.length : Boolean(value)))
        .map(([key]) => key),
    };
    const project = createProjectShell(ctx, {
      name: session.slots.name,
      goal: session.slots.goal,
      project_type: session.slots.project_type,
      current_stage: session.slots.current_stage,
      risk_level: session.slots.risk_level,
      target_deliverables: session.slots.target_deliverables,
      expected_ai_scope: session.slots.expected_ai_scope,
      sensitive_areas: session.slots.sensitive_areas,
      setup_mode: body.setup_mode || body.setupMode || 'quick_start',
      output_language: body.output_language || body.outputLanguage || 'en',
      context_pack: contextPack,
    }, selectedTemplate);
    const v = validateProject(project); if (!v.ok) return fail(res, ctx, 400, 'SCHEMA_INVALID', 'Project invalid', v.errors);
    ensureWorkflowHistory(project);
    let preparedWorkflow;
    try {
      preparedWorkflow = await prepareWorkflowGeneration(ctx, project, selectedTemplate);
    } catch (error) {
      session.status = 'failed';
      session.messages.push({ role: 'agent', status: 'failed', content: normalizeProjectAgentLanguage(session.output_language || session.outputLanguage) === 'zh-Hans' ? '\u5de5\u4f5c\u6d41\u751f\u6210\u5931\u8d25\uff0c\u9879\u76ee\u672a\u521b\u5efa\u3002\u8bf7\u68c0\u67e5\u6a21\u578b\u914d\u7f6e\u6216\u91cd\u8bd5\u3002' : 'Workflow generation failed and no project was created. Check Model Access or try again.', error: error.message, at: new Date().toISOString() });
      saveProjectCreationSession(session);
      return fail(res, ctx, 502, 'PROJECT_WORKFLOW_GENERATION_FAILED', 'The configured LLM could not generate a valid project workflow.', [{ session_id: session.id, cause: error.message }]);
    }
    const generationJob = createJob(ctx, project, 'generate_workflow_draft', { source: 'project_creation_agent', context_pack: structuredClone(project.context_pack || {}) }, readIdempotencyKey(req));
    runJob(ctx, project, generationJob, (progress) => {
      progress('running_boundary_rules', 'Applying validated model workflow');
      return applyPreparedWorkflow(ctx, project, preparedWorkflow);
    });
    session = {
      ...session,
      status: 'created',
      project_id: project.id,
      projectId: project.id,
      selected_template_id: selectedTemplate.id,
      selectedTemplateId: selectedTemplate.id,
      context_pack: project.context_pack,
      contextPack: project.context_pack,
      agent_trace: [...(session.agent_trace || []), selectedTemplateTrace, { stage: 'workflow_generator', status: 'completed', generation_source: 'llm', model: preparedWorkflow.modelResult.model, phases: project.workflow.phases.length, nodes: project.workflow.nodes.length }],
      agentTrace: [...(session.agent_trace || []), selectedTemplateTrace, { stage: 'workflow_generator', status: 'completed', generation_source: 'llm', model: preparedWorkflow.modelResult.model, phases: project.workflow.phases.length, nodes: project.workflow.nodes.length }],
      messages: [...session.messages, { role: 'agent', status: 'created', content: normalizeProjectAgentLanguage(session.output_language || session.outputLanguage) === 'zh-Hans' ? `\u5df2\u521b\u5efa\u9879\u76ee ${project.name}\u3002` : `Created project ${project.name}.`, project_id: project.id, at: new Date().toISOString() }].slice(-AI_CONVERSATION_LIMIT),
      updated_at: new Date().toISOString(),
    };
    project.project_creation_session = session;
    project.projectCreationSession = session;
    project.creation_agent_trace = session.agent_trace || [];
    project.creationAgentTrace = session.agent_trace || [];
    project.ai_conversation = (session.messages || []).map((message, index) => ({
      id: `project_agent_${session.id}_${index}`,
      role: message.role,
      content: message.content,
      status: message.status,
      created_at: message.at || message.created_at || new Date().toISOString(),
      source: 'project_creation_agent',
    })).slice(-AI_CONVERSATION_LIMIT);
    project.aiConversation = project.ai_conversation;
    saveProjectCreationSession(session);
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { project, project_creation_session: session, generation_job: generationJob, model_status: getModelStatus() }, 201);
  }

  if (method === 'POST' && path === '/api/projects') {
    const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
    const selectedTemplate = selectTemplateForProject(body);
    const project = createProjectShell(ctx, body, selectedTemplate);
    const v = validateProject(project); if (!v.ok) return fail(res, ctx, 400, 'SCHEMA_INVALID', 'Project invalid', v.errors);
    ensureWorkflowHistory(project);
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, project, 201);
  }

  const pRoute = path.match(/^\/api\/projects\/([^/]+)$/);
  if (pRoute) {
    const project = getProject(ctx, pRoute[1]);
    if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    if (method === 'GET') return ok(res, ctx, project);
    if (method === 'PATCH') {
      const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
      const next = writeOwnership(ctx, { ...project, ...body }, false);
      storage.saveProject(ctx.workspace_id, next); return ok(res, ctx, next);
    }
    if (method === 'DELETE') { project.deleted_at = new Date().toISOString(); project.updated_by = ctx.user_id; project.updated_at = new Date().toISOString(); storage.saveProject(ctx.workspace_id, project); return ok(res, ctx, { deleted: true, project_id: project.id, mode: 'soft_delete' }); }
  }

  const agentRunsRoute = path.match(/^\/api\/projects\/([^/]+)\/agent-runs$/);
  if (agentRunsRoute) {
    const project = getProject(ctx, agentRunsRoute[1]);
    if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    if (method === 'GET') return ok(res, ctx, { agent_runs: ensureAgentRuns(project) });
    if (method === 'POST') {
      const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
      try {
        const agentRun = createAgentRun(ctx, project, body);
        storage.saveProject(ctx.workspace_id, project);
        return ok(res, ctx, { agent_run: agentRun, agent_runs: ensureAgentRuns(project) }, 201);
      } catch (error) {
        if (error.code === 'NODE_NOT_FOUND') return fail(res, ctx, 404, 'NODE_NOT_FOUND', 'Agent run node not found');
        throw error;
      }
    }
  }

  const agentRunEvidenceRoute = path.match(/^\/api\/projects\/([^/]+)\/agent-runs\/([^/]+)\/evidence$/);
  if (method === 'POST' && agentRunEvidenceRoute) {
    const project = getProject(ctx, agentRunEvidenceRoute[1]);
    if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
    try {
      const agentRun = attachAgentRunEvidence(ctx, project, agentRunEvidenceRoute[2], body);
      storage.saveProject(ctx.workspace_id, project);
      return ok(res, ctx, { agent_run: agentRun, agent_runs: ensureAgentRuns(project) });
    } catch (error) {
      if (error.code === 'AGENT_RUN_NOT_FOUND') return fail(res, ctx, 404, 'AGENT_RUN_NOT_FOUND', 'Agent run not found');
      throw error;
    }
  }

  const cpRoute = path.match(/^\/api\/projects\/([^/]+)\/context-pack$/);
  if (cpRoute) {
    const project = getProject(ctx, cpRoute[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    if (method === 'GET') return ok(res, ctx, project.context_pack || project.contextPack || {});
    if (method === 'PUT') {
      const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
      project.context_pack = { ...(project.context_pack || {}), ...normalizeContextPackPatch(body), updated_at: new Date().toISOString(), version: ((project.context_pack?.version) || 0) + 1 };
      project.updated_by = ctx.user_id; project.updated_at = new Date().toISOString(); storage.saveProject(ctx.workspace_id, project); return ok(res, ctx, project.context_pack);
    }
  }

  const cpSumm = path.match(/^\/api\/projects\/([^/]+)\/context-pack\/summarize$/);
  if (method === 'POST' && cpSumm) {
    const project = getProject(ctx, cpSumm[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const job = createJob(ctx, project, 'summarize_context_pack', { context_pack: structuredClone(project.context_pack || {}) }, readIdempotencyKey(req));
    runJob(ctx, project, job, (progress) => {
      progress('analyzing_context', 'Summarizing roles, approvals, risks, and security boundaries.');
      project.context_pack.summary = buildContextPackSummary(project);
      project.context_pack.updated_at = new Date().toISOString();
      return { type: 'context_pack_summary', project_id: project.id, context_pack_version: project.context_pack.version || 1 };
    });
    return ok(res, ctx, { job_id: job.id, status: job.status, output_ref: job.output_ref, summary: project.context_pack.summary, context_pack: project.context_pack });
  }
  const cpImpact = path.match(/^\/api\/projects\/([^/]+)\/context-pack\/refresh-impact$/);
  if (method === 'POST' && cpImpact) {
    const project = getProject(ctx, cpImpact[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    recordUndoSnapshot(ctx, project, 'context_refresh');
    const impact = deriveContextPackImpact(project, { markAssets: true });
    project.context_pack.impact_analysis = impact;
    project.workflow = applyWorkflowPatch(project.workflow, { context_pack_version: project.context_pack?.version || 1 });
    project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { ...impact, workflow_version: project.workflow.version, context_pack: project.context_pack, validation_results: project.validation });
  }

  const wfRoute = path.match(/^\/api\/projects\/([^/]+)\/workflow$/);
  if (wfRoute) {
    const project = getProject(ctx, wfRoute[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    if (method === 'GET') return ok(res, ctx, project.workflow);
    if (method === 'PATCH') {
      const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
      if (body.workflow_version && Number(body.workflow_version) !== Number(project.workflow.version)) return fail(res, ctx, 409, 'VERSION_CONFLICT', 'Workflow has been updated by another operation. Please refresh and try again.');
      const previousVersion = project.workflow.version;
      recordUndoSnapshot(ctx, project, 'workflow_patch');
      const merged = applyWorkflowPatch(project.workflow, normalizeWorkflowPatchBody(body));
      const schema = validateWorkflow(merged); if (!schema.ok) return fail(res, ctx, 400, 'WORKFLOW_SCHEMA_INVALID', 'Workflow schema invalid', schema.errors);
      const validation = validateRulesWorkflow(merged, project.assets, { forGeneration: false, modelConfig: {} });
      project.workflow = merged; project.validation = validation;
      markKitsStaleIfNeeded(project, previousVersion);
      storage.saveProject(ctx.workspace_id, project);
      return ok(res, ctx, { workflow: merged, validation_results: validation });
    }
  }

  const wfGen = path.match(/^\/api\/projects\/([^/]+)\/workflow\/generate$/);
  if (method === 'POST' && wfGen) {
    const project = getProject(ctx, wfGen[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    if (!requireConfiguredLlm(res, ctx, 'Workflow Agent generation')) return;
    const job = createJob(ctx, project, 'generate_workflow_draft', { context_pack: structuredClone(project.context_pack || {}), workflow: structuredClone(project.workflow) }, readIdempotencyKey(req));
    const selectedTemplate = getTemplateById(project.created_from_template) || selectTemplateForProject(project);
    let preparedWorkflow;
    try {
      preparedWorkflow = await prepareWorkflowGeneration(ctx, project, selectedTemplate);
    } catch (error) {
      job.status = 'failed';
      job.error = { code: 'WORKFLOW_GENERATION_FAILED', stage: 'calling_model', retryable: true, message: error.message };
      setJobProgress(job, 'failed', error.message);
      job.updated_at = new Date().toISOString();
      storage.saveProject(ctx.workspace_id, project);
      return fail(res, ctx, 502, 'WORKFLOW_GENERATION_FAILED', 'The configured LLM could not generate a valid workflow.', [{ job_id: job.id, cause: error.message }]);
    }
    runJob(ctx, project, job, (progress) => {
      progress('running_boundary_rules', 'Applying validated model workflow');
      return applyPreparedWorkflow(ctx, project, preparedWorkflow);
    });
    return ok(res, ctx, { job_id: job.id, status: job.status, workflow: project.workflow, validation_results: project.validation });
  }

  const wfValidate = path.match(/^\/api\/projects\/([^/]+)\/workflow\/validate$/);
  if (method === 'POST' && wfValidate) {
    const project = getProject(ctx, wfValidate[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    project.validation = validation; storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { validation_results: validation });
  }

  const wfFinal = path.match(/^\/api\/projects\/([^/]+)\/workflow\/mark-final$/);
  if (method === 'POST' && wfFinal) {
    const project = getProject(ctx, wfFinal[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
    if (body.workflow_version && Number(body.workflow_version) !== Number(project.workflow.version)) return fail(res, ctx, 409, 'VERSION_CONFLICT', 'Workflow has been updated by another operation. Please refresh and try again.');
    const validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    if (validation.some((v) => v.level === 'error' && v.blockingFinal)) return fail(res, ctx, 400, 'WORKFLOW_BLOCKING_ERRORS', 'Workflow has blocking errors', validation.filter((v) => v.level === 'error'));
    const previousVersion = project.workflow.version;
    recordUndoSnapshot(ctx, project, 'mark_final');
    project.workflow = applyWorkflowPatch(project.workflow, { status: 'final' }); project.validation = validation;
    markKitsStaleIfNeeded(project, previousVersion);
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { workflow_version: project.workflow.version, validation_summary: { errors: 0, warnings: validation.filter((v) => v.level === 'warning').length } });
  }
  const wfRestore = path.match(/^\/api\/projects\/([^/]+)\/workflow\/restore$/);
  if (method === 'POST' && wfRestore) {
    const project = getProject(ctx, wfRestore[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    ensureWorkflowHistory(project);
    const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
    const version = Number(body.version);
    const source = project.workflow_snapshots.find((s) => s.workflow_version === version);
    if (!source) return fail(res, ctx, 404, 'WORKFLOW_VERSION_NOT_FOUND', 'Workflow version snapshot not found');
    const nextVersion = (project.workflow.version || 0) + 1;
    recordUndoSnapshot(ctx, project, 'restore_version');
    rehydrateFromSnapshot(project, { ...source, workflow_version: nextVersion });
    project.assets = markAffectedAssetsOutdated([{ target_type: 'workflow', target_id: project.workflow.id }], project.assets);
    project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { workflow: project.workflow, validation_results: project.validation });
  }

  const wfUndo = path.match(/^\/api\/projects\/([^/]+)\/workflow\/undo$/);
  if (method === 'POST' && wfUndo) {
    const project = getProject(ctx, wfUndo[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    ensureWorkflowHistory(project);
    if (project.workflow_undo_snapshots.length < 1) return fail(res, ctx, 400, 'UNDO_NOT_AVAILABLE', 'No undo snapshot available');
    const source = project.workflow_undo_snapshots.pop();
    if (!source) return fail(res, ctx, 404, 'UNDO_SNAPSHOT_NOT_FOUND', 'Undo snapshot not found');
    const nextVersion = (project.workflow.version || 0) + 1;
    rehydrateFromSnapshot(project, { ...source, workflow_version: nextVersion });
    project.assets = markAffectedAssetsOutdated([{ target_type: 'workflow', target_id: project.workflow.id }], project.assets);
    project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { workflow: project.workflow, validation_results: project.validation, undo_available: project.workflow_undo_snapshots.length > 0 });
  }

  const nodeGet = path.match(/^\/api\/projects\/([^/]+)\/nodes\/([^/]+)$/);
  if (nodeGet) {
    const project = getProject(ctx, nodeGet[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const node = project.workflow.nodes.find((n) => n.id === nodeGet[2]); if (!node) return fail(res, ctx, 404, 'NODE_NOT_FOUND', 'Node not found');
    if (method === 'GET') return ok(res, ctx, node);
    if (method === 'PATCH') {
      const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
      if (body.workflow_version && Number(body.workflow_version) !== Number(project.workflow.version)) return fail(res, ctx, 409, 'VERSION_CONFLICT', 'Workflow has been updated by another operation. Please refresh and try again.');
      const previousVersion = project.workflow.version;
      const idx = project.workflow.nodes.findIndex((n) => n.id === node.id);
      recordUndoSnapshot(ctx, project, 'node_patch');
      project.workflow.nodes[idx] = normalizeNodePatch(node, body);
      project.workflow = applyWorkflowPatch(project.workflow, { nodes: project.workflow.nodes });
      project.assets = markAffectedAssetsOutdated([{ target_type: 'node', target_id: node.id }], project.assets);
      project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
      markKitsStaleIfNeeded(project, previousVersion);
      storage.saveProject(ctx.workspace_id, project);
      return ok(res, ctx, { node: project.workflow.nodes[idx], workflow_summary: { version: project.workflow.version }, validation_results: project.validation });
    }
  }

  const nodePrompt = path.match(/^\/api\/projects\/([^/]+)\/nodes\/([^/]+)\/generate-prompt$/);
  if (method === 'POST' && nodePrompt) {
    const project = getProject(ctx, nodePrompt[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const node = project.workflow.nodes.find((n) => n.id === nodePrompt[2]); if (!node) return fail(res, ctx, 404, 'NODE_NOT_FOUND', 'Node not found');
    if (node.executionMode === 'human_only') return fail(res, ctx, 400, 'HUMAN_ONLY_NO_PROMPT', 'Human only node cannot generate AI prompt');
    const job = createJob(ctx, project, 'generate_prompt', { node_id: node.id, node: structuredClone(node) }, readIdempotencyKey(req));
    runJob(ctx, project, job, (progress) => {
      progress('calling_model', 'Generating prompt');
      const prompt = generatePrompt(node, { workflow: project.workflow, contextPack: project.context_pack, model: getModelStatus().prompt_model });
      const asset = upsertPromptAsset(project, node, prompt);
      project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: true, modelConfig: null });
      storage.saveProject(ctx.workspace_id, project);
      return { type: 'prompt_asset', asset_id: asset.id };
    });
    return ok(res, ctx, { job_id: job.id, status: job.status });
  }

  const nodeChecklist = path.match(/^\/api\/projects\/([^/]+)\/nodes\/([^/]+)\/generate-checklist$/);
  if (method === 'POST' && nodeChecklist) {
    const project = getProject(ctx, nodeChecklist[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const node = project.workflow.nodes.find((n) => n.id === nodeChecklist[2]); if (!node) return fail(res, ctx, 404, 'NODE_NOT_FOUND', 'Node not found');
    const job = createJob(ctx, project, 'generate_checklist', { node_id: node.id, review_gate: structuredClone(node.reviewGate || {}) }, readIdempotencyKey(req));
    runJob(ctx, project, job, (progress) => {
      progress('calling_model', 'Generating checklist');
      const checklist = generateChecklist(node.review_gate || node.reviewGate, node, { workflow: project.workflow, contextPack: project.context_pack });
      const asset = upsertChecklistAsset(project, node, checklist);
      project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: true, modelConfig: null });
      storage.saveProject(ctx.workspace_id, project);
      return { type: 'checklist_asset', asset_id: asset.id };
    });
    return ok(res, ctx, { job_id: job.id, status: job.status });
  }

  const diffGenerate = path.match(/^\/api\/projects\/([^/]+)\/(?:diffs\/generate|edit-sessions\/messages)$/);
  if (method === 'POST' && diffGenerate) {
    const project = getProject(ctx, diffGenerate[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
    const requestText = body.request || body.message || body.content || 'default';
    const batchSize = boundedEditSessionBatchSize(body.batch_size || body.batchSize);
    const activeSession = getActiveEditSession(project);
    if (activeSession?.status === 'awaiting_next_batch' && isCancelRemainingEditRequest(requestText)) {
      const closedSession = saveEditSession(project, closeRemainingEditSession(activeSession, requestText));
      appendAiConversation(project, [
        {
          id: `msg_user_${randomUUID()}`,
          role: 'user',
          content: requestText,
          request: requestText,
          workflow_version: project.workflow.version,
          edit_session_id: closedSession.id,
          created_at: new Date().toISOString(),
        },
        {
          id: `msg_agent_${randomUUID()}`,
          role: 'agent',
          status: 'applied',
          content: closedSession.messages.at(-1)?.content || 'Stopped remaining workflow edit plan.',
          edit_session_id: closedSession.id,
          created_at: new Date().toISOString(),
        },
      ]);
      storage.saveProject(ctx.workspace_id, project);
      return ok(res, ctx, { edit_session: closedSession, ai_conversation: project.ai_conversation, model_status: getModelStatus() });
    }
    if (activeSession && isCancelEditSessionRequest(requestText)) {
      const closedSession = saveEditSession(project, cancelActiveEditSession(activeSession, requestText));
      if (project.last_diff && (project.last_diff.id === activeSession.candidate_diff_id || project.last_diff.id === activeSession.candidateDiffId)) {
        project.last_diff.status = 'cancelled';
      }
      appendAiConversation(project, [
        {
          id: `msg_user_${randomUUID()}`,
          role: 'user',
          content: requestText,
          request: requestText,
          workflow_version: project.workflow.version,
          edit_session_id: closedSession.id,
          created_at: new Date().toISOString(),
        },
        {
          id: `msg_agent_${randomUUID()}`,
          role: 'agent',
          status: 'cancelled',
          content: closedSession.messages.at(-1)?.content || 'Cancelled the current workflow edit task.',
          edit_session_id: closedSession.id,
          created_at: new Date().toISOString(),
        },
      ]);
      storage.saveProject(ctx.workspace_id, project);
      return ok(res, ctx, { edit_session: closedSession, ai_conversation: project.ai_conversation, model_status: getModelStatus() });
    }
    if (!requireConfiguredLlm(res, ctx, 'the Workflow Edit Agent')) return;
    if (activeSession?.status === 'awaiting_next_batch') {
      const replan = await replanRemainingEditSession(ctx, project, activeSession, requestText, batchSize);
      if (replan.diff) {
        project.last_diff = replan.diff;
        project.last_diff.context_policy = 'session_replan_remaining';
        project.last_diff.status = 'draft';
      }
      const updatedSession = saveEditSession(project, replan.session);
      appendAiConversation(project, [
        {
          id: `msg_user_${randomUUID()}`,
          role: 'user',
          content: requestText,
          request: requestText,
          workflow_version: project.workflow.version,
          edit_session_id: updatedSession.id,
          created_at: new Date().toISOString(),
        },
        {
          id: `msg_agent_${randomUUID()}`,
          role: 'agent',
          status: updatedSession.status,
          content: updatedSession.messages.at(-1)?.content || 'Replanned remaining workflow edit work.',
          diff_id: replan.diff?.id || null,
          changes_count: replan.diff?.changes?.length || 0,
          selected_count: (replan.diff?.changes || []).filter((change) => change.selected !== false).length,
          generation_source: replan.diff?.generation_source || 'deterministic_replan',
          edit_session_id: updatedSession.id,
          created_at: new Date().toISOString(),
        },
      ]);
      storage.saveProject(ctx.workspace_id, project);
      return ok(res, ctx, { diff: replan.diff, edit_session: updatedSession, ai_conversation: project.ai_conversation, model_status: getModelStatus() });
    }
    const resolvedRequest = resolveWorkflowEditRequest(project, requestText);
    let effectiveRequestText = resolvedRequest.effectiveRequest;
    const clarification = buildWorkflowEditClarification(project, effectiveRequestText);
    if (clarification) {
      const session = buildEditSession(project, requestText, effectiveRequestText, null, {
        intent: clarification.intent || 'workflow_edit',
        status: 'collecting_info',
        missing_slots: clarification.missing_fields,
        validation: [{ level: 'info', code: 'needs_clarification', message: clarification.reason }],
      });
      session.agent_trace = buildAgentTrace({ stage: 'collecting_info', intent: session.intent, slots: session.slots });
      session.agentTrace = session.agent_trace;
      appendEditSessionMessage(session, { role: 'agent', status: 'needs_clarification', content: clarification.content, clarification_questions: clarification.questions, missing_fields: clarification.missing_fields, candidate_nodes: clarification.candidate_nodes || [] });
      saveEditSession(project, session);
      const createdAt = new Date().toISOString();
      appendAiConversation(project, [
        {
          id: `msg_user_${randomUUID()}`,
          role: 'user',
          content: requestText,
          request: requestText,
          workflow_version: project.workflow.version,
          created_at: createdAt,
        },
        {
          id: `msg_agent_${randomUUID()}`,
          role: 'agent',
          intent: clarification.intent || 'workflow_edit',
          status: 'needs_clarification',
          content: clarification.content,
          clarification_questions: clarification.questions,
          missing_fields: clarification.missing_fields,
          candidate_nodes: clarification.candidate_nodes || [],
          reason: clarification.reason,
          request: effectiveRequestText,
          created_at: createdAt,
        },
      ]);
      storage.saveProject(ctx.workspace_id, project);
      return ok(res, ctx, { clarification, edit_session: session, ai_conversation: project.ai_conversation, model_status: getModelStatus() });
    }
    const slotSession = buildEditSession(project, requestText, effectiveRequestText, null, { status: 'planning' });
    if ((slotSession.intent === 'add_node' || slotSession.intent === 'update_node') && !slotSession.missing_slots.length) {
      effectiveRequestText = workflowEditRequestWithSlots(effectiveRequestText, slotSession.slots);
    }
    const contextScope = body.context_scope || body.contextScope || null;
    const agentContextPolicy = 'infer_context_from_request_and_workflow_json';
    const workflowIndex = buildWorkflowIndex(project.workflow);
    const outputContract = workflowDiffOutputContract();
    let contextPlan = generateWorkflowContextPlan(effectiveRequestText, workflowIndex);
    let focusedSubgraph = extractFocusedSubgraph(project.workflow, project.assets, contextPlan);
    const job = createJob(ctx, project, 'generate_workflow_diff', { request: effectiveRequestText, user_request: requestText, context_policy: agentContextPolicy, workflow_index: workflowIndex }, readIdempotencyKey(req));
    let planResult = null;
    let modelResult = null;
    try {
      planResult = await runModel('workflow_context_plan', {
        request: effectiveRequestText,
        context_policy: agentContextPolicy,
        workflow_index: workflowIndex,
        output_contract: {
          intent: 'workflow_edit',
          targets: [{ type: 'node|phase', id: 'existing id', required_context: 'node_with_neighbors|phase|workflow' }],
          graph_expansion: { upstream_depth: 0, downstream_depth: 2 },
          operation_scope: ['add_phase', 'rename_phase', 'add_node', 'update_node', 'delete_node', 'add_edge', 'delete_edge', 'add_review_gate', 'generate_prompt'],
        },
      });
      const modelContextPlan = normalizeContextPlan(planResult.output, workflowIndex);
      if (modelContextPlan && (modelContextPlan.targets.length > 0 || modelContextPlan.operation_scope.length > 0)) {
        contextPlan = modelContextPlan;
        focusedSubgraph = extractFocusedSubgraph(project.workflow, project.assets, contextPlan);
      }
      saveEditSession(project, buildEditSession(project, requestText, effectiveRequestText, contextPlan, {
        status: 'planning',
        context_scope: { phases: focusedSubgraph.phases.length, nodes: focusedSubgraph.nodes.length, edges: focusedSubgraph.edges.length },
        agent_trace: buildAgentTrace({ stage: 'planning', intent: slotSession.intent, slots: slotSession.slots, contextPlan }),
      }));
      modelCalls.unshift({ id: `call_${Date.now()}_plan`, workspace_id: ctx.workspace_id, created_by: ctx.user_id, created_at: new Date().toISOString(), model: planResult.model, purpose: 'workflow_context_plan', status: planResult.status, summary: planResult.output?.summary || `context plan: ${effectiveRequestText}` });
    } catch (error) {
      modelCalls.unshift({ id: `call_${Date.now()}_plan`, workspace_id: ctx.workspace_id, created_by: ctx.user_id, created_at: new Date().toISOString(), model: getModelStatus().planning_model, purpose: 'workflow_context_plan', status: 'failed', summary: error.message });
    }
    try {
      modelResult = await runModel('workflow_diff', {
        request: effectiveRequestText,
        context_policy: agentContextPolicy,
        ...(contextScope ? { context_scope: contextScope } : {}),
        context_plan: contextPlan,
        workflow_index: workflowIndex,
        focused_subgraph: focusedSubgraph,
        output_contract: outputContract,
      });
      modelCalls.unshift({ id: `call_${Date.now()}`, workspace_id: ctx.workspace_id, created_by: ctx.user_id, created_at: new Date().toISOString(), model: modelResult.model, purpose: 'workflow_diff', status: modelResult.status, summary: modelResult.output?.summary || `diff request: ${effectiveRequestText}` });
    } catch (error) {
      modelCalls.unshift({ id: `call_${Date.now()}`, workspace_id: ctx.workspace_id, created_by: ctx.user_id, created_at: new Date().toISOString(), model: getModelStatus().diff_model, purpose: 'workflow_diff', status: 'failed', summary: error.message });
    }
    const candidate = normalizeAgentDiff(modelResult?.output, effectiveRequestText, project.workflow, contextPlan);
    const candidateHasChanges = Array.isArray(candidate?.changes) && candidate.changes.length > 0;
    let generationSource = candidateHasChanges && modelResult?.status !== 'mock'
      ? 'llm'
      : (modelResult?.status === 'mock' ? 'mock_fallback' : (modelResult ? 'model_empty_fallback' : 'model_failed_fallback'));
    let selectedDiff = candidateHasChanges ? candidate : generateWorkflowDiff(effectiveRequestText, project.workflow, project.assets);
    if (slotSession.intent === 'add_node') {
      selectedDiff = { ...selectedDiff, changes: (selectedDiff.changes || []).filter((change) => !(change.type === 'added' && change.targetType === 'phase')) };
      const slotDiff = buildAddNodeDiffFromSlots(project, effectiveRequestText, slotSession.slots);
      const hasAddedNode = (selectedDiff.changes || []).some((change) => change.type === 'added' && change.targetType === 'node');
      if (slotDiff && (!hasAddedNode || generationSource !== 'llm')) {
        selectedDiff = slotDiff;
        generationSource = generationSource === 'llm' && hasAddedNode ? generationSource : 'slot_structured_fallback';
      }
    }
    if (slotSession.intent === 'update_node') {
      const slotDiff = buildUpdateNodeDiffFromSlots(project, effectiveRequestText, slotSession.slots);
      const hasUpdatedNodeField = (selectedDiff.changes || []).some((change) => (
        change.type === 'updated'
        && change.targetType === 'node'
        && change.targetId === slotSession.slots.target_node_id
        && change.field === slotSession.slots.field
      ));
      if (slotDiff && (!hasUpdatedNodeField || generationSource !== 'llm')) {
        selectedDiff = slotDiff;
        generationSource = generationSource === 'llm' && hasUpdatedNodeField ? generationSource : 'slot_structured_fallback';
      }
    }
    let diffEvaluation = evaluateDiffCandidate(project, selectedDiff);
    let repairAttempt = null;
    if (!diffEvaluation.ok) {
      repairAttempt = await repairWorkflowDiffWithModel(ctx, project, effectiveRequestText, selectedDiff, diffEvaluation, contextPlan, workflowIndex, focusedSubgraph, outputContract);
      const repairedDiff = slotSession.intent === 'add_node'
        ? { ...repairAttempt.diff, changes: (repairAttempt.diff.changes || []).filter((change) => !(change.type === 'added' && change.targetType === 'phase')) }
        : repairAttempt.diff;
      const repairedEvaluation = evaluateDiffCandidate(project, repairedDiff);
      if (repairedEvaluation.score >= diffEvaluation.score) {
        selectedDiff = repairedDiff;
        diffEvaluation = repairedEvaluation;
        generationSource = repairAttempt.source;
      }
    }
    if (!(selectedDiff.changes || []).length) {
      runJob(ctx, project, job, (progress) => {
        progress('completed', 'No workflow changes were produced.');
        return { type: 'workflow_diff_no_changes' };
      });
      const session = buildEditSession(project, requestText, effectiveRequestText, contextPlan, {
        status: 'no_changes',
        context_scope: { phases: focusedSubgraph.phases.length, nodes: focusedSubgraph.nodes.length, edges: focusedSubgraph.edges.length },
        validation: diffEvaluation.issues,
        agent_trace: buildAgentTrace({ stage: 'diff_ready', intent: slotSession.intent, slots: slotSession.slots, contextPlan, diff: selectedDiff, evaluation: diffEvaluation, generationSource, repairAttempt }),
        generation_source: generationSource,
        generationSource: generationSource,
        summary: selectedDiff.summary || 'No workflow changes were produced.',
        all_changes: [],
        allChanges: [],
        total_changes: 0,
        totalChanges: 0,
        pending_change_ids: [],
        pendingChangeIds: [],
      });
      appendEditSessionMessage(session, {
        role: 'agent',
        status: 'no_changes',
        content: 'No workflow changes were produced. The request may already be satisfied, or it needs more specific target details.',
        changes_count: 0,
        selected_count: 0,
        total_changes: 0,
        validation_score: diffEvaluation.score,
        critic: { status: 'needs_attention', score: diffEvaluation.score, errors: diffEvaluation.errors, warnings: diffEvaluation.warnings },
        generation_source: generationSource,
      });
      saveEditSession(project, session);
      const createdAt = new Date().toISOString();
      appendAiConversation(project, [
        {
          id: `msg_user_${randomUUID()}`,
          role: 'user',
          content: requestText,
          request: requestText,
          workflow_version: project.workflow.version,
          edit_session_id: session.id,
          created_at: createdAt,
        },
        {
          id: `msg_agent_${randomUUID()}`,
          role: 'agent',
          status: 'no_changes',
          content: 'No workflow changes were produced. The request may already be satisfied, or it needs more specific target details.',
          changes_count: 0,
          selected_count: 0,
          total_changes: 0,
          generation_source: generationSource,
          edit_session_id: session.id,
          validation_score: diffEvaluation.score,
          created_at: createdAt,
        },
      ]);
      storage.saveProject(ctx.workspace_id, project);
      return ok(res, ctx, { job_id: job.id, edit_session: session, model_status: getModelStatus(), ai_conversation: project.ai_conversation });
    }
    runJob(ctx, project, job, (progress) => {
      progress('calling_model', 'Generating workflow diff');
      const fullDiff = {
        ...selectedDiff,
        context_policy: agentContextPolicy,
        context_plan: contextPlan,
        generation_source: generationSource,
        model_diff_status: modelResult?.status || 'failed',
        context_plan_status: planResult?.status || 'fallback',
        status: 'draft',
        validation: diffEvaluation,
      };
      fullDiff.focused_subgraph_summary = {
        phases: focusedSubgraph.phases.length,
        nodes: focusedSubgraph.nodes.length,
        edges: focusedSubgraph.edges.length,
      };
      if (contextScope) fullDiff.context_scope = contextScope;
      if (repairAttempt) {
        fullDiff.repair_attempt = {
          source: repairAttempt.source,
          status: repairAttempt.result?.status || (repairAttempt.error ? 'failed' : 'fallback'),
          error: repairAttempt.error?.message || null,
        };
      }
      const { batchDiff, currentChanges, pendingChanges } = buildBatchedWorkflowDiff(fullDiff, batchSize, [], 1);
      project.last_diff = batchDiff;
      const changes = currentChanges;
      const allChanges = fullDiff.changes || [];
      const session = buildEditSession(project, requestText, effectiveRequestText, contextPlan, {
        status: 'diff_ready',
        candidate_diff_id: project.last_diff.id,
        context_scope: project.last_diff.focused_subgraph_summary,
        validation: diffEvaluation.issues,
        agent_trace: buildAgentTrace({ stage: 'diff_ready', intent: slotSession.intent, slots: slotSession.slots, contextPlan, diff: project.last_diff, evaluation: diffEvaluation, generationSource, repairAttempt }),
        plan: createExecutionPlanFromChanges(allChanges, {
          currentIds: currentChanges.map((change) => change.id),
          pendingIds: pendingChanges.map((change) => change.id),
          evaluation: diffEvaluation,
        }),
        root_diff_id: fullDiff.id,
        rootDiffId: fullDiff.id,
        generation_source: generationSource,
        generationSource: generationSource,
        summary: fullDiff.summary,
        all_changes: allChanges,
        allChanges,
        batch_size: batchSize,
        batchSize,
        batch_index: 1,
        batchIndex: 1,
        total_changes: allChanges.length,
        totalChanges: allChanges.length,
        pending_change_ids: pendingChanges.map((change) => change.id),
        pendingChangeIds: pendingChanges.map((change) => change.id),
        applied_change_ids: [],
        appliedChangeIds: [],
        skipped_change_ids: [],
        skippedChangeIds: [],
      });
      appendEditSessionMessage(session, {
        role: 'agent',
        status: 'diff_ready',
        content: pendingChanges.length
          ? `${changes.length} of ${allChanges.length} changes are ready for review. ${pendingChanges.length} remain queued.`
          : (project.last_diff.summary || `${changes.length} changes proposed`),
        diff_id: project.last_diff.id,
        changes_count: changes.length,
        selected_count: changes.filter((change) => change.selected !== false).length,
        total_changes: allChanges.length,
        pending_changes: pendingChanges.length,
        validation_score: diffEvaluation.score,
        critic: { status: diffEvaluation.ok ? 'passed' : 'needs_attention', score: diffEvaluation.score, errors: diffEvaluation.errors, warnings: diffEvaluation.warnings },
        generation_source: generationSource,
      });
      saveEditSession(project, session);
      const createdAt = new Date().toISOString();
      appendAiConversation(project, [
        {
          id: `msg_user_${randomUUID()}`,
          role: 'user',
          content: requestText,
          request: requestText,
          workflow_version: project.workflow.version,
          created_at: createdAt,
        },
        {
          id: `msg_agent_${randomUUID()}`,
          role: 'agent',
          diff_id: project.last_diff.id,
          content: pendingChanges.length
            ? `${changes.length} of ${allChanges.length} changes are ready for review.`
            : (project.last_diff.summary || `${changes.length} changes proposed`),
          request: effectiveRequestText,
          changes_count: changes.length,
          selected_count: changes.filter((change) => change.selected !== false).length,
          total_changes: allChanges.length,
          pending_changes: pendingChanges.length,
          generation_source: generationSource,
          status: 'draft',
          edit_session_id: session.id,
          validation_score: diffEvaluation.score,
          created_at: createdAt,
        },
      ]);
      return { type: 'workflow_diff', diff_id: project.last_diff.id };
    });
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { job_id: job.id, diff: project.last_diff, edit_session: getActiveEditSession(project), model_status: getModelStatus(), ai_conversation: project.ai_conversation });
  }

  const editSessionsList = path.match(/^\/api\/projects\/([^/]+)\/edit-sessions$/);
  if (method === 'GET' && editSessionsList) {
    const project = getProject(ctx, editSessionsList[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    return ok(res, ctx, { sessions: ensureEditSessions(project), active: getActiveEditSession(project) });
  }

  const editSessionNext = path.match(/^\/api\/projects\/([^/]+)\/edit-sessions\/([^/]+)\/next$/);
  if (method === 'POST' && editSessionNext) {
    const project = getProject(ctx, editSessionNext[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const session = ensureEditSessions(project).find((item) => item.id === editSessionNext[2]);
    if (!session) return fail(res, ctx, 404, 'EDIT_SESSION_NOT_FOUND', 'Edit session not found');
    if (!requireConfiguredLlm(res, ctx, 'the Workflow Edit Agent')) return;
    if (session.status !== 'awaiting_next_batch') return fail(res, ctx, 409, 'EDIT_SESSION_NOT_AWAITING_NEXT_BATCH', 'Apply or reject the current workflow edit batch before requesting the next batch.');
    const allChanges = session.all_changes || session.allChanges || [];
    const completedIds = [
      ...(session.applied_change_ids || session.appliedChangeIds || []),
      ...(session.skipped_change_ids || session.skippedChangeIds || []),
      ...(session.rejected_change_ids || session.rejectedChangeIds || []),
    ];
    const pendingChanges = allChanges.filter((change) => !completedIds.includes(change.id));
    if (!pendingChanges.length) return fail(res, ctx, 400, 'NO_PENDING_CHANGES', 'No pending workflow edit changes remain.');
    const batchSize = boundedEditSessionBatchSize(session.batch_size || session.batchSize);
    const nextIndex = Number(session.batch_index || session.batchIndex || 1) + 1;
    const sourceDiff = {
      id: session.root_diff_id || session.rootDiffId || session.candidate_root_diff_id || session.candidateRootDiffId || `diff_${session.id}`,
      request: session.effective_request || session.original_request,
      summary: session.summary || 'Next workflow edit batch',
      changes: allChanges,
      generation_source: session.generation_source || session.generationSource || 'session_batch',
      status: 'draft',
      context_plan: session.context_plan || session.contextPlan || null,
      context_policy: 'infer_context_from_request_and_workflow_json',
      validation: session.validation || [],
    };
    const { batchDiff, currentChanges, pendingChanges: queuedChanges } = buildBatchedWorkflowDiff(sourceDiff, batchSize, completedIds, nextIndex);
    const evaluation = evaluateDiffCandidate(project, batchDiff);
    project.last_diff = {
      ...batchDiff,
      validation: evaluation,
      focused_subgraph_summary: session.context_scope || session.contextScope || null,
    };
    const updatedSession = appendEditSessionMessage({
      ...session,
      status: 'diff_ready',
      candidate_diff_id: project.last_diff.id,
      candidateDiffId: project.last_diff.id,
      batch_index: nextIndex,
      batchIndex: nextIndex,
      pending_change_ids: queuedChanges.map((change) => change.id),
      pendingChangeIds: queuedChanges.map((change) => change.id),
      plan: createExecutionPlanFromChanges(allChanges, {
        currentIds: currentChanges.map((change) => change.id),
        appliedIds: session.applied_change_ids || session.appliedChangeIds || [],
        skippedIds: session.skipped_change_ids || session.skippedChangeIds || [],
        rejectedIds: session.rejected_change_ids || session.rejectedChangeIds || [],
        pendingIds: queuedChanges.map((change) => change.id),
        evaluation,
      }),
      validation: evaluation.issues,
      agent_trace: buildAgentTrace({ stage: 'diff_ready', intent: session.intent, slots: session.slots || {}, contextPlan: session.context_plan || session.contextPlan, diff: project.last_diff, evaluation, generationSource: project.last_diff.generation_source }),
      agentTrace: buildAgentTrace({ stage: 'diff_ready', intent: session.intent, slots: session.slots || {}, contextPlan: session.context_plan || session.contextPlan, diff: project.last_diff, evaluation, generationSource: project.last_diff.generation_source }),
    }, {
      role: 'agent',
      status: 'diff_ready',
      content: `${currentChanges.length} more workflow change${currentChanges.length === 1 ? '' : 's'} are ready for review.${queuedChanges.length ? ` ${queuedChanges.length} remain queued.` : ''}`,
      diff_id: project.last_diff.id,
      changes_count: currentChanges.length,
      selected_count: currentChanges.filter((change) => change.selected !== false).length,
      total_changes: allChanges.length,
      pending_changes: queuedChanges.length,
      validation_score: evaluation.score,
      critic: { status: evaluation.ok ? 'passed' : 'needs_attention', score: evaluation.score, errors: evaluation.errors, warnings: evaluation.warnings },
      generation_source: project.last_diff.generation_source,
    });
    saveEditSession(project, updatedSession);
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { diff: project.last_diff, edit_session: updatedSession, ai_conversation: project.ai_conversation, model_status: getModelStatus() });
  }

  const editSessionGet = path.match(/^\/api\/projects\/([^/]+)\/edit-sessions\/([^/]+)$/);
  if (method === 'GET' && editSessionGet) {
    const project = getProject(ctx, editSessionGet[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const session = ensureEditSessions(project).find((item) => item.id === editSessionGet[2]);
    if (!session) return fail(res, ctx, 404, 'EDIT_SESSION_NOT_FOUND', 'Edit session not found');
    return ok(res, ctx, session);
  }

  const diffGet = path.match(/^\/api\/projects\/([^/]+)\/diffs\/([^/]+)$/);
  if (method === 'GET' && diffGet) {
    const project = getProject(ctx, diffGet[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    if (!project.last_diff || project.last_diff.id !== diffGet[2]) return fail(res, ctx, 404, 'DIFF_NOT_FOUND', 'Diff not found');
    return ok(res, ctx, project.last_diff);
  }

  const diffApply = path.match(/^\/api\/projects\/([^/]+)\/diffs\/([^/]+)\/apply$/);
  const editSessionApply = path.match(/^\/api\/projects\/([^/]+)\/edit-sessions\/([^/]+)\/apply$/);
  if (method === 'POST' && (diffApply || editSessionApply)) {
    const project = getProject(ctx, diffApply?.[1] || editSessionApply?.[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
    if (body.workflow_version && Number(body.workflow_version) !== Number(project.workflow.version)) return fail(res, ctx, 409, 'VERSION_CONFLICT', 'Workflow has been updated by another operation. Please refresh and try again.');
    const targetSession = editSessionApply ? ensureEditSessions(project).find((item) => item.id === editSessionApply[2]) : null;
    if (editSessionApply && !targetSession) return fail(res, ctx, 404, 'EDIT_SESSION_NOT_FOUND', 'Edit session not found');
    const expectedDiffId = diffApply?.[2] || targetSession?.candidate_diff_id;
    const diff = project.last_diff; if (!diff || diff.id !== expectedDiffId) return fail(res, ctx, 404, 'DIFF_NOT_FOUND', 'Diff not found');
    const previousVersion = project.workflow.version;
    const selectedChangeIds = selectedDiffChangeIds(diff, body.selected_change_ids);
    recordUndoSnapshot(ctx, project, 'ai_diff_apply');
    project.workflow = applyDiff(project.workflow, diff, selectedChangeIds);
    project.assets = applyAssetDiffChanges(project.assets, diff, selectedChangeIds);
    project.assets = markAffectedAssetsOutdated((diff.changes || []).filter((change) => selectedChangeIds.length === 0 || selectedChangeIds.includes(change.id)), project.assets);
    project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    markKitsStaleIfNeeded(project, previousVersion);
    diff.previous_version = previousVersion;
    diff.status = 'applied';
    const session = targetSession || getActiveEditSession(project);
    const sessionDiffId = session?.candidate_diff_id || session?.candidateDiffId;
    const closedSession = sessionDiffId === diff.id
      ? saveEditSession(project, closeEditSessionAfterApply(session, diff, selectedChangeIds))
      : null;
    updateAiConversationMessage(project, diff.id, { status: 'applied' });
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { workflow: project.workflow, validation_results: project.validation, edit_session: closedSession, ai_conversation: project.ai_conversation });
  }

  const diffReject = path.match(/^\/api\/projects\/([^/]+)\/diffs\/([^/]+)\/reject$/);
  const editSessionReject = path.match(/^\/api\/projects\/([^/]+)\/edit-sessions\/([^/]+)\/reject$/);
  if (method === 'POST' && (diffReject || editSessionReject)) {
    const project = getProject(ctx, diffReject?.[1] || editSessionReject?.[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const targetSession = editSessionReject ? ensureEditSessions(project).find((item) => item.id === editSessionReject[2]) : null;
    if (editSessionReject && !targetSession) return fail(res, ctx, 404, 'EDIT_SESSION_NOT_FOUND', 'Edit session not found');
    const expectedDiffId = diffReject?.[2] || targetSession?.candidate_diff_id;
    if (!project.last_diff || project.last_diff.id !== expectedDiffId) return fail(res, ctx, 404, 'DIFF_NOT_FOUND', 'Diff not found');
    project.last_diff.status = 'rejected';
    const session = targetSession || getActiveEditSession(project);
    const sessionDiffId = session?.candidate_diff_id || session?.candidateDiffId;
    const closedSession = sessionDiffId === project.last_diff.id
      ? saveEditSession(project, closeEditSessionAfterReject(session))
      : null;
    updateAiConversationMessage(project, project.last_diff.id, { status: 'rejected' });
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { diff_id: project.last_diff.id, status: 'rejected', edit_session: closedSession, ai_conversation: project.ai_conversation });
  }
  const diffRevert = path.match(/^\/api\/projects\/([^/]+)\/diffs\/([^/]+)\/revert$/);
  if (method === 'POST' && diffRevert) {
    const project = getProject(ctx, diffRevert[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const diff = project.last_diff; if (!diff || diff.id !== diffRevert[2]) return fail(res, ctx, 404, 'DIFF_NOT_FOUND', 'Diff not found');
    if (diff.status !== 'applied') return fail(res, ctx, 400, 'DIFF_NOT_APPLIED', 'Only applied diff can be reverted');
    ensureWorkflowHistory(project);
    const before = diff.previous_version;
    const source = project.workflow_undo_snapshots.find((s) => s.workflow_version === before) || project.workflow_snapshots.find((s) => s.workflow_version === before);
    if (!source) return fail(res, ctx, 404, 'REVERT_SNAPSHOT_NOT_FOUND', 'Pre-diff snapshot not found');
    const nextVersion = (project.workflow.version || 0) + 1;
    recordUndoSnapshot(ctx, project, 'revert_diff');
    rehydrateFromSnapshot(project, { ...source, workflow_version: nextVersion });
    project.assets = markAffectedAssetsOutdated(diff.changes || [], project.assets);
    project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    diff.status = 'reverted';
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { workflow: project.workflow, validation_results: project.validation, diff });
  }

  const assetsRoute = path.match(/^\/api\/projects\/([^/]+)\/assets$/);
  if (method === 'GET' && assetsRoute) {
    const project = getProject(ctx, assetsRoute[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    return ok(res, ctx, project.assets);
  }

  const assetRoute = path.match(/^\/api\/projects\/([^/]+)\/assets\/([^/]+)$/);
  if (assetRoute) {
    const project = getProject(ctx, assetRoute[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const all = [...project.assets.prompts, ...project.assets.checklists, ...(project.assets.artifact_templates || project.assets.artifactTemplates || [])];
    const asset = all.find((a) => a.id === assetRoute[2]); if (!asset) return fail(res, ctx, 404, 'ASSET_NOT_FOUND', 'Asset not found');
    if (method === 'GET') return ok(res, ctx, asset);
    if (method === 'PATCH') {
      const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
      for (const key of ['prompts', 'checklists', 'artifactTemplates', 'artifact_templates']) {
        const arr = project.assets[key] || [];
        const idx = arr.findIndex((a) => a.id === asset.id);
        if (idx >= 0) { arr[idx] = { ...arr[idx], ...body, manually_edited: true, updated_at: new Date().toISOString() }; project.assets[key] = arr; break; }
      }
      project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
      storage.saveProject(ctx.workspace_id, project); return ok(res, ctx, { updated: true, assets: project.assets, validation_results: project.validation });
    }
  }

  const assetRegen = path.match(/^\/api\/projects\/([^/]+)\/assets\/([^/]+)\/regenerate$/);
  if (method === 'POST' && assetRegen) {
    const project = getProject(ctx, assetRegen[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const assetId = assetRegen[2];
    const prompt = (project.assets.prompts || []).find((p) => p.id === assetId);
    const checklist = (project.assets.checklists || []).find((c) => c.id === assetId);
    const template = (project.assets.artifact_templates || project.assets.artifactTemplates || []).find((t) => t.id === assetId);
    const asset = prompt || checklist || template;
    if (!asset) return fail(res, ctx, 404, 'ASSET_NOT_FOUND', 'Asset not found');
    if (asset.manually_edited) return fail(res, ctx, 400, 'ASSET_MANUAL_EDIT_WARNING', 'Asset was manually edited, confirm before regenerate');
    const nodeId = asset.node_id || asset.nodeId;
    const node = (project.workflow.nodes || []).find((item) => item.id === nodeId);
    if (!node) return fail(res, ctx, 404, 'NODE_NOT_FOUND', 'Asset node not found');
    let regenerated;
    if (prompt) {
      regenerated = upsertPromptAsset(project, node, generatePrompt(node, { workflow: project.workflow, contextPack: project.context_pack, model: getModelStatus().prompt_model }));
    } else if (checklist) {
      regenerated = upsertChecklistAsset(project, node, generateChecklist(node.review_gate || node.reviewGate, node, { workflow: project.workflow, contextPack: project.context_pack }));
    } else {
      regenerated = attachGeneratedFrom({
        ...template,
        content: `# ${node.name}\n\n## Goal\n${node.goal}\n\n## Required Output\n- ${(node.outputs || []).join('\n- ')}`,
        status: 'draft',
        outdated_reason: '',
        outdatedReason: '',
        updated_at: new Date().toISOString(),
      }, node, project.workflow, project.context_pack, 'artifact_template');
      const templates = (project.assets.artifact_templates || project.assets.artifactTemplates || []).map((item) => (item.id === assetId ? regenerated : item));
      project.assets.artifact_templates = templates;
      project.assets.artifactTemplates = templates;
    }
    project.validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { regenerated: true, asset: regenerated, assets: project.assets, validation_results: project.validation });
  }

  const kitPreview = path.match(/^\/api\/projects\/([^/]+)\/execution-kits\/preview$/);
  if (method === 'POST' && kitPreview) {
    const project = getProject(ctx, kitPreview[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const body = await readJsonBody(req) || {};
    const validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    project.validation = validation;
    const job = createJob(ctx, project, 'generate_execution_kit_preview', { workflow: structuredClone(project.workflow), assets: structuredClone(project.assets), kit_type: body.kit_type || 'draft' }, readIdempotencyKey(req));
    runJob(ctx, project, job, (progress) => { progress('generating_files', 'Generating preview files'); return { type: 'execution_kit_preview', project_id: project.id }; });
    const preview = exportExecutionKit(generateExecutionKit(project.workflow, project.assets, validation, { kit_type: body.kit_type || 'draft' }));
    project.execution_kit = preview;
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { job_id: job.id, preview, execution_kit: preview, validation_results: validation });
  }

  const kitGenerate = path.match(/^\/api\/projects\/([^/]+)\/execution-kits\/generate$/);
  if (method === 'POST' && kitGenerate) {
    const project = getProject(ctx, kitGenerate[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const body = await readJsonBody(req) || {};
    const validation = validateRulesWorkflow(project.workflow, project.assets, { forGeneration: false, modelConfig: {} });
    project.validation = validation;
    const kit = generateExecutionKit(project.workflow, project.assets, validation, { kit_type: body.kit_type || 'draft' });
    if ((body.kit_type || 'draft') === 'final' && !kit.canExportFinal) return fail(res, ctx, 400, 'FINAL_KIT_BLOCKED', 'Final Kit cannot be generated while blocking validation errors exist', kit.validation_summary);
    const job = createJob(ctx, project, 'generate_execution_kit', { workflow: structuredClone(project.workflow), assets: structuredClone(project.assets), kit_type: kit.kit_type }, readIdempotencyKey(req));
    runJob(ctx, project, job, (progress) => {
      progress('generating_files', 'Generating execution kit');
      if (!kit?.files || Object.keys(kit.files).length === 0) throw new Error('EXECUTION_KIT_GENERATION_FAILED');
      const rec = { id: `kit_${Date.now()}`, project_id: project.id, workspace_id: project.workspace_id, created_by: ctx.user_id, updated_by: ctx.user_id, workflow_snapshot_version: project.workflow.version, status: kit.kit_type === 'final' ? 'generated_final' : 'generated', kit_type: kit.kit_type, files: kit.files, validation_summary: kit.validation_summary, generated_at: new Date().toISOString(), input_snapshot: { workflow_version: project.workflow.version } };
      project.execution_kits = (project.execution_kits || []).concat(rec);
      return { type: 'execution_kit', kit_id: rec.id };
    });
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { job_id: job.id, status: job.status, output_ref: job.output_ref, kit: (project.execution_kits || []).at(-1), validation_results: validation });
  }

  const kitGet = path.match(/^\/api\/projects\/([^/]+)\/execution-kits\/([^/]+)$/);
  if (method === 'GET' && kitGet) {
    const project = getProject(ctx, kitGet[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const kit = (project.execution_kits || []).find((k) => k.id === kitGet[2]); if (!kit) return fail(res, ctx, 404, 'KIT_NOT_FOUND', 'Kit not found');
    return ok(res, ctx, kit);
  }

  const kitDl = path.match(/^\/api\/projects\/([^/]+)\/execution-kits\/([^/]+)\/download$/);
  if (method === 'GET' && kitDl) {
    const project = getProject(ctx, kitDl[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    const kit = (project.execution_kits || []).find((k) => k.id === kitDl[2]); if (!kit) return fail(res, ctx, 404, 'KIT_NOT_FOUND', 'Kit not found');
    if (kit.status === 'failed' || kit.status === 'generating') return fail(res, ctx, 400, 'EXECUTION_KIT_GENERATION_FAILED', 'Execution kit is not downloadable in current status');
    return ok(res, ctx, { filename: `${kit.id}.json`, content: JSON.stringify(kit, null, 2), stale: kit.status === 'stale' });
  }

  if (method === 'GET' && path === '/api/model/status') return ok(res, ctx, getModelStatus());
  if (method === 'GET' && path === '/api/model/config') return ok(res, ctx, getModelConfig());
  if (method === 'PUT' && path === '/api/model/config') {
    const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
    return ok(res, ctx, { status: updateModelConfig(body), config: getModelConfig() });
  }
  if (method === 'POST' && path === '/api/model/test') {
    const status = getModelStatus();
    try {
      const result = await runModel('test', { ping: true });
      modelCalls.unshift({ id: `call_${Date.now()}`, workspace_id: ctx.workspace_id, created_by: ctx.user_id, created_at: new Date().toISOString(), model: result.model, purpose: 'test', status: result.status || 'succeeded', summary: result.output.summary });
      return ok(res, ctx, { status: result.status || 'succeeded', mode: status.using_mock ? 'mock' : 'real', result: result.output });
    } catch (error) {
      modelCalls.unshift({ id: `call_${Date.now()}`, workspace_id: ctx.workspace_id, created_by: ctx.user_id, created_at: new Date().toISOString(), model: status.default_model, purpose: 'test', status: 'failed', summary: error.message || 'Model test failed' });
      return ok(res, ctx, { status: 'failed', mode: status.using_mock ? 'mock' : 'real', error: error.message || 'Model test failed' });
    }
  }
  if (method === 'GET' && path === '/api/model/calls') return ok(res, ctx, modelCalls.slice(0, 50));

  const jobsList = path.match(/^\/api\/projects\/([^/]+)\/jobs$/);
  if (method === 'GET' && jobsList) {
    const project = getProject(ctx, jobsList[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    ensureJobStore(project);
    return ok(res, ctx, project.generation_jobs.filter((j) => j.workspace_id === ctx.workspace_id));
  }
  const wfHistory = path.match(/^\/api\/projects\/([^/]+)\/workflow\/history$/);
  if (method === 'POST' && wfHistory) {
    const project = getProject(ctx, wfHistory[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    ensureWorkflowHistory(project);
    const body = await readJsonBody(req); if (body === null) return fail(res, ctx, 400, 'INVALID_JSON', 'Invalid JSON');
    if (body.workflow_version && Number(body.workflow_version) !== Number(project.workflow.version)) return fail(res, ctx, 409, 'VERSION_CONFLICT', 'Workflow has been updated by another operation. Please refresh and try again.');
    recordWorkflowHistory(ctx, project, 'manual_save', body.summary || `Saved workflow version ${project.workflow.version}.`, null);
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, { history_item: project.workflow_history_items.at(-1), history: project.workflow_history_items });
  }
  if (method === 'GET' && wfHistory) {
    const project = getProject(ctx, wfHistory[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    ensureWorkflowHistory(project);
    return ok(res, ctx, project.workflow_history_items);
  }
  const wfVersion = path.match(/^\/api\/projects\/([^/]+)\/workflow\/versions\/([^/]+)$/);
  if (method === 'GET' && wfVersion) {
    const project = getProject(ctx, wfVersion[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    ensureWorkflowHistory(project);
    const version = Number(wfVersion[2]);
    const snap = project.workflow_snapshots.find((s) => s.workflow_version === version);
    if (!snap) return fail(res, ctx, 404, 'WORKFLOW_VERSION_NOT_FOUND', 'Workflow version snapshot not found');
    return ok(res, ctx, snap);
  }
  const jobsGet = path.match(/^\/api\/projects\/([^/]+)\/jobs\/([^/]+)$/);
  if (method === 'GET' && jobsGet) {
    const project = getProject(ctx, jobsGet[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    ensureJobStore(project);
    const job = project.generation_jobs.find((j) => j.id === jobsGet[2]);
    if (!job || job.project_id !== project.id || job.workspace_id !== ctx.workspace_id) return fail(res, ctx, 404, 'JOB_NOT_FOUND', 'Job not found');
    return ok(res, ctx, job);
  }
  const jobsRetry = path.match(/^\/api\/projects\/([^/]+)\/jobs\/([^/]+)\/retry$/);
  if (method === 'POST' && jobsRetry) {
    const project = getProject(ctx, jobsRetry[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    ensureJobStore(project);
    const original = project.generation_jobs.find((j) => j.id === jobsRetry[2]);
    if (!original) return fail(res, ctx, 404, 'JOB_NOT_FOUND', 'Job not found');
    if (!original.input_snapshot) return fail(res, ctx, 400, 'JOB_NOT_RETRYABLE', 'Job has no input snapshot');
    if (!RETRYABLE_JOB_TYPES.has(original.type)) return fail(res, ctx, 400, 'JOB_NOT_RETRYABLE', `${original.type} jobs cannot be retried from persisted input yet.`);
    const retried = createJob(ctx, project, original.type, structuredClone(original.input_snapshot), null, original.id);
    runJob(ctx, project, retried, (progress) => runRetryableJob(ctx, project, original, progress));
    return ok(res, ctx, retried);
  }
  const jobsCancel = path.match(/^\/api\/projects\/([^/]+)\/jobs\/([^/]+)\/cancel$/);
  if (method === 'POST' && jobsCancel) {
    const project = getProject(ctx, jobsCancel[1]); if (!project) return fail(res, ctx, 404, 'PROJECT_NOT_FOUND', 'Project not found');
    ensureJobStore(project);
    const job = project.generation_jobs.find((j) => j.id === jobsCancel[2]);
    if (!job) return fail(res, ctx, 404, 'JOB_NOT_FOUND', 'Job not found');
    if (job.status === 'succeeded') return fail(res, ctx, 409, 'JOB_ALREADY_COMPLETED', 'Job already succeeded');
    job.cancel_requested = true;
    job.status = 'cancelled';
    setJobProgress(job, 'failed', 'Cancel requested by user.');
    storage.saveProject(ctx.workspace_id, project);
    return ok(res, ctx, job);
  }

  return fail(res, ctx, 404, 'ROUTE_NOT_FOUND', `${method} ${path} not found`);
});

server.listen(port, () => {
  console.log(`RoleUnion Server listening on http://localhost:${port}`);
});
