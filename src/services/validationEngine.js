import { EXECUTION_MODES } from '../domain/constants.js';

function result({ id, level, targetType, targetId, title, message, suggestedAction, autoFixAvailable = false, blockingFinal = false }) {
  return { id, level, targetType, targetId, title, message, suggestedAction, autoFixAvailable, blockingFinal };
}

export function validateWorkflow(workflow, assets) {
  const results = [];
  workflow.nodes.forEach((node) => {
    const prompt = assets.prompts.find((item) => item.nodeId === node.id);

    if (node.riskLevel === 'high' && (!node.reviewGate || !node.reviewGate.required)) {
      results.push(result({
        id: `high_risk_requires_review_gate-${node.id}`,
        level: 'error',
        targetType: 'node',
        targetId: node.id,
        title: 'High risk node requires review gate',
        message: `${node.name} is high risk but missing required review gate`,
        suggestedAction: 'Add required review gate before final export',
        blockingFinal: true,
      }));
    }

    if (EXECUTION_MODES[node.executionMode]?.ai && !node.artifactContract?.outputFormat && (!node.outputs || node.outputs.length === 0)) {
      results.push(result({
        id: `ai_node_requires_output_format-${node.id}`,
        level: 'error',
        targetType: 'node',
        targetId: node.id,
        title: 'AI node requires output format',
        message: `${node.name} has no output format or outputs`,
        suggestedAction: 'Define artifact output format',
        blockingFinal: true,
      }));
    }

    if (EXECUTION_MODES[node.executionMode]?.ai && (!node.artifactContract?.acceptanceCriteria || node.artifactContract.acceptanceCriteria.length === 0)) {
      results.push(result({
        id: `ai_node_requires_acceptance_criteria-${node.id}`,
        level: 'error',
        targetType: 'node',
        targetId: node.id,
        title: 'AI node requires acceptance criteria',
        message: `${node.name} missing acceptance criteria`,
        suggestedAction: 'Add acceptance criteria in artifact contract',
        blockingFinal: true,
      }));
    }

    if (node.executionMode === 'human_only' && prompt) {
      results.push(result({
        id: `human_only_no_ai_prompt-${node.id}`,
        level: 'error',
        targetType: 'prompt',
        targetId: prompt.id,
        title: 'Human-only node cannot have AI prompt',
        message: `${node.name} is human-only but has prompt asset`,
        suggestedAction: 'Remove prompt or change execution mode',
        blockingFinal: true,
      }));
    }

    if (node.executionMode === 'ai_autonomous' && node.riskLevel !== 'low') {
      results.push(result({
        id: `ai_autonomous_low_risk_only-${node.id}`,
        level: 'error',
        targetType: 'node',
        targetId: node.id,
        title: 'AI autonomous allowed only for low risk',
        message: `${node.name} has execution mode AI autonomous with ${node.riskLevel} risk`,
        suggestedAction: 'Lower risk level or change execution mode',
        blockingFinal: true,
      }));
    }

    if (!node.inputs?.length || !node.outputs?.length) {
      results.push(result({
        id: `node_requires_input_and_output-${node.id}`,
        level: 'error',
        targetType: 'node',
        targetId: node.id,
        title: 'Node requires input and output',
        message: `${node.name} must define both inputs and outputs`,
        suggestedAction: 'Update node inputs/outputs',
        blockingFinal: true,
      }));
    }
  });

  assets.prompts.forEach((prompt) => {
    if (prompt.status === 'outdated') {
      results.push(result({
        id: `outdated_prompt_warning-${prompt.id}`,
        level: 'warning',
        targetType: 'prompt',
        targetId: prompt.id,
        title: 'Outdated prompt',
        message: `${prompt.name} is outdated and should be regenerated`,
        suggestedAction: 'Regenerate prompt using latest node contract',
      }));
    }
  });

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
