import { EXECUTION_MODES } from '../../schema/src/constants.js';

function get(obj, ...keys) {
  return keys.find((key) => obj && obj[key] !== undefined) ? obj[keys.find((key) => obj && obj[key] !== undefined)] : undefined;
}

function result({ id, level, targetType, targetId, title, message, suggestedAction, autoFixAvailable = false, blockingFinal = false }) {
  return { id, level, targetType, targetId, title, message, suggestedAction, autoFixAvailable, blockingFinal };
}

export function validateWorkflow(workflow, assets, options = {}) {
  const results = [];
  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];

  nodes.forEach((node) => {
    const nodeId = get(node, 'id');
    const nodeName = get(node, 'name') || nodeId;
    const executionMode = get(node, 'execution_mode', 'executionMode');
    const riskLevel = get(node, 'risk_level', 'riskLevel');
    const artifactContract = get(node, 'artifact_contract', 'artifactContract');
    const outputs = get(node, 'outputs') || [];
    const inputs = get(node, 'inputs') || [];
    const reviewGate = get(node, 'review_gate', 'reviewGate');
    const prompt = (assets.prompts || []).find((item) => get(item, 'node_id', 'nodeId') === nodeId);
    const checklist = (assets.checklists || []).find((item) => get(item, 'node_id', 'nodeId') === nodeId);

    if (riskLevel === 'high' && (!reviewGate || !get(reviewGate, 'required'))) {
      results.push(result({
        id: `high_risk_requires_review_gate-${nodeId}`,
        level: 'error',
        targetType: 'node',
        targetId: nodeId,
        title: 'High risk node requires review gate',
        message: `${nodeName} is high risk but missing required review gate`,
        suggestedAction: 'Add required review gate before final export',
        blockingFinal: true,
      }));
    }

    if (EXECUTION_MODES[executionMode]?.ai && (!artifactContract || (!get(artifactContract, 'output_format', 'outputFormat') && outputs.length === 0))) {
      results.push(result({
        id: `ai_node_requires_output_format-${nodeId}`,
        level: 'error',
        targetType: 'node',
        targetId: nodeId,
        title: 'AI node requires output format',
        message: `${nodeName} has no output format or outputs`,
        suggestedAction: 'Define artifact output format',
        blockingFinal: true,
      }));
    }

    const acceptanceCriteria = get(artifactContract || {}, 'acceptance_criteria', 'acceptanceCriteria') || [];
    if (EXECUTION_MODES[executionMode]?.ai && acceptanceCriteria.length === 0 && !(checklist?.items || []).length) {
      results.push(result({
        id: `ai_node_requires_acceptance_criteria-${nodeId}`,
        level: 'error',
        targetType: 'node',
        targetId: nodeId,
        title: 'AI node requires acceptance criteria',
        message: `${nodeName} missing acceptance criteria`,
        suggestedAction: 'Add acceptance criteria or checklist source',
        blockingFinal: true,
      }));
    }

    if (executionMode === 'human_only' && prompt) {
      results.push(result({
        id: `human_only_no_ai_prompt-${nodeId}`,
        level: 'error',
        targetType: 'prompt',
        targetId: get(prompt, 'id'),
        title: 'Human-only node cannot have AI prompt',
        message: `${nodeName} is human-only but has prompt asset`,
        suggestedAction: 'Remove prompt or change execution mode',
        blockingFinal: true,
      }));
    }

    if (executionMode === 'ai_autonomous' && riskLevel !== 'low') {
      results.push(result({
        id: `ai_autonomous_low_risk_only-${nodeId}`,
        level: 'error',
        targetType: 'node',
        targetId: nodeId,
        title: 'AI autonomous allowed only for low risk',
        message: `${nodeName} has execution mode AI autonomous with ${riskLevel} risk`,
        suggestedAction: 'Lower risk level or change execution mode',
        blockingFinal: true,
      }));
    }

    if (/production|release/i.test(nodeName) && executionMode === 'ai_autonomous') {
      results.push(result({
        id: `production_release_requires_human_only_or_approval-${nodeId}`,
        level: 'error',
        targetType: 'node',
        targetId: nodeId,
        title: 'Production/release node cannot be AI autonomous',
        message: `${nodeName} must be human-only or require human approval`,
        suggestedAction: 'Switch mode to human_only or ai_execute_human_approval',
        blockingFinal: true,
      }));
    }

    if (!inputs.length || !outputs.length) {
      results.push(result({
        id: `node_requires_input_and_output-${nodeId}`,
        level: 'error',
        targetType: 'node',
        targetId: nodeId,
        title: 'Node requires input and output',
        message: `${nodeName} must define both inputs and outputs`,
        suggestedAction: 'Update node inputs/outputs',
        blockingFinal: true,
      }));
    }
  });

  edges.forEach((edge) => {
    const requiredOutputs = get(edge, 'required_outputs', 'requiredOutputs') || [];
    if (!requiredOutputs.length) return;
    const fromNode = nodes.find((node) => get(node, 'id') === get(edge, 'from'));
    const fromOutputs = get(fromNode || {}, 'outputs') || [];
    const missing = requiredOutputs.filter((output) => !fromOutputs.includes(output));
    if (missing.length) {
      results.push(result({
        id: `edge_required_output_missing-${get(edge, 'id')}`,
        level: 'error',
        targetType: 'edge',
        targetId: get(edge, 'id'),
        title: 'Edge required output missing',
        message: `Upstream node missing outputs: ${missing.join(', ')}`,
        suggestedAction: 'Add required outputs to upstream node or update edge contract',
        blockingFinal: true,
      }));
    }
  });

  (assets.prompts || []).forEach((prompt) => {
    if (get(prompt, 'status') === 'outdated') {
      results.push(result({
        id: `outdated_prompt_warning-${get(prompt, 'id')}`,
        level: 'warning',
        targetType: 'prompt',
        targetId: get(prompt, 'id'),
        title: 'Outdated prompt',
        message: `${get(prompt, 'name')} is outdated and should be regenerated`,
        suggestedAction: 'Regenerate prompt using latest node contract',
      }));
    }
  });

  if (!options.modelConfig && options.forGeneration) {
    results.push(result({
      id: 'model_config_required_for_generation',
      level: 'warning',
      targetType: 'workflow',
      targetId: workflow.id,
      title: 'Model config missing for generation',
      message: 'No model config found. Mock fallback or manual edit is required in MVP.',
      suggestedAction: 'Configure model or continue in mock mode',
    }));
  }

  if (!results.length) {
    results.push(result({
      id: 'workflow_clean',
      level: 'suggestion',
      targetType: 'workflow',
      targetId: workflow.id,
      title: 'Workflow validated',
      message: 'No blocking issues found. Ready for final review.',
    }));
  }

  return results;
}
