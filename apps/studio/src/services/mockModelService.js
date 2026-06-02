import { generateWorkflowDraft } from '../../../../packages/generators/src/workflowGenerator.js';
import { generatePrompt } from '../../../../packages/generators/src/promptGenerator.js';
import { generateChecklist } from '../../../../packages/generators/src/checklistGenerator.js';
import { generateWorkflowDiff } from '../../../../packages/core/src/diff.js';
import { generateExecutionKit } from '../../../../packages/generators/src/executionKitGenerator.js';

const callLog = [];

function logCall(name, payload) {
  callLog.unshift({ id: `call-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`, name, at: new Date().toISOString(), payload });
  return callLog.slice(0, 20);
}

export function getModelCallLogs() {
  return callLog;
}

export function modelGenerateWorkflowDraft(projectInput, contextPack) {
  logCall('generateWorkflowDraft', { projectInput, contextPack });
  return generateWorkflowDraft(projectInput, contextPack);
}

export function recommendExecutionMode(node, contextPack, rules) {
  logCall('recommendExecutionMode', { nodeId: node.id, contextPack, rulesCount: rules.length });
  if (node.riskLevel === 'high') return 'human_lead_ai_assist';
  if (contextPack?.riskConstraints?.length) return 'ai_draft_human_review';
  return node.executionMode;
}

export function modelGeneratePrompt(node) {
  logCall('generatePrompt', { nodeId: node.id });
  return generatePrompt(node);
}

export function modelGenerateChecklist(node) {
  logCall('generateChecklist', { nodeId: node.id });
  return generateChecklist(node.reviewGate, node);
}

export function modelGenerateWorkflowDiff(userRequest, workflow, assets) {
  logCall('generateWorkflowDiff', { userRequest, workflowId: workflow.id });
  return generateWorkflowDiff(userRequest, workflow, assets);
}

export function modelGenerateExecutionKit(workflow, assets, validationResults) {
  logCall('generateExecutionKit', { workflowId: workflow.id, validationCount: validationResults.length });
  return generateExecutionKit(workflow, assets, validationResults);
}

export function buildContextSummary(contextPack) {
  logCall('buildContextSummary', contextPack);
  return {
    recognizedRoles: contextPack.teamRoles?.length ? contextPack.teamRoles : ['Product Manager'],
    suggestedReviewGates: [
      'Architecture Review before coding',
      'Security Review for customer data flows',
      'Release approval before production launch',
    ],
    missingContext: [
      contextPack.toolStack?.length ? null : 'No tool stack specified',
      contextPack.historicalProcessMaterials ? null : 'No historical process materials attached',
    ].filter(Boolean),
    riskWarnings: contextPack.riskConstraints?.length
      ? ['Custom risk constraints detected; workflow may need stricter gates.']
      : ['No explicit risk constraints set.'],
  };
}
