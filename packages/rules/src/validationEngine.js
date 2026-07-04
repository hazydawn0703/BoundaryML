import { EXECUTION_MODES } from '../../schema/src/constants.js';
import { agentExecutionLevelNumber } from '../../schema/src/agentic.js';

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
    const agentPlan = get(node, 'agent_execution_plan', 'agentExecutionPlan');
    const sandboxContract = get(node, 'sandbox_execution_contract', 'sandboxExecutionContract');
    const promotionGate = get(node, 'promotion_gate', 'promotionGate');
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

    if (agentPlan) {
      const agentEnabled = get(agentPlan, 'enabled') === true;
      const executionLevel = get(agentPlan, 'execution_level', 'executionLevel') || 'L0';
      const levelNumber = agentExecutionLevelNumber(executionLevel);
      const contractId = get(agentPlan, 'sandbox_execution_contract_id', 'sandboxExecutionContractId');
      const contractNodeId = get(sandboxContract || {}, 'node_id', 'nodeId');
      const reviewRequired = get(reviewGate || {}, 'required') === true;
      const promotionPolicy = get(sandboxContract || {}, 'promotion_policy', 'promotionPolicy') || {};
      const runtimeScope = get(sandboxContract || {}, 'runtime_scope', 'runtimeScope') || {};
      const secretScope = get(sandboxContract || {}, 'secret_scope', 'secretScope') || {};
      const repoScope = get(sandboxContract || {}, 'repo_scope', 'repoScope') || {};
      const acceptanceTests = get(sandboxContract || {}, 'acceptance_tests', 'acceptanceTests') || {};
      const requiredTests = get(acceptanceTests, 'required') || [];
      const promotionGates = get(promotionPolicy, 'promotion_gates', 'promotionGates') || [];
      const targetEnvironment = get(promotionPolicy, 'target_environment', 'targetEnvironment') || '';
      const productionRelated = /production|release|launch/i.test(nodeName)
        || targetEnvironment === 'production'
        || promotionGates.includes('production')
        || get(promotionGate || {}, 'gate_type', 'gateType') === 'production';

      if (agentEnabled && levelNumber >= 3 && (!sandboxContract || !contractId || (contractNodeId && contractNodeId !== nodeId))) {
        results.push(result({
          id: `l3_agent_requires_sandbox_contract-${nodeId}`,
          level: 'error',
          targetType: 'agent_execution_plan',
          targetId: nodeId,
          title: 'L3+ Agent execution requires Sandbox Contract',
          message: `${nodeName} is ${executionLevel} but missing a node-linked Sandbox Execution Contract`,
          suggestedAction: 'Create or link a Sandbox Execution Contract before final export',
          blockingFinal: true,
        }));
      }

      if (agentEnabled && riskLevel === 'high' && !reviewRequired) {
        results.push(result({
          id: `high_risk_agent_requires_review_gate-${nodeId}`,
          level: 'error',
          targetType: 'agent_execution_plan',
          targetId: nodeId,
          title: 'High-risk Agent execution requires Review Gate',
          message: `${nodeName} enables Agent execution on a high-risk node without a required human review gate`,
          suggestedAction: 'Link a required Review Gate or disable Agent execution',
          blockingFinal: true,
        }));
      }

      if (productionRelated && get(promotionPolicy, 'human_approval_required', 'humanApprovalRequired') === false) {
        results.push(result({
          id: `production_promotion_requires_human_approval-${nodeId}`,
          level: 'error',
          targetType: 'promotion_gate',
          targetId: nodeId,
          title: 'Production promotion requires human approval',
          message: `${nodeName} targets production or release promotion without human approval`,
          suggestedAction: 'Set human_approval_required to true for production-related promotion',
          blockingFinal: true,
        }));
      }

      const secretRefs = get(secretScope, 'allowed_secret_refs', 'allowedSecretRefs') || [];
      if (agentEnabled && (get(secretScope, 'policy') === 'production_allowed' || secretRefs.some((item) => /prod|production/i.test(String(item))))) {
        results.push(result({
          id: `sandbox_forbids_production_secrets-${nodeId}`,
          level: 'error',
          targetType: 'sandbox_execution_contract',
          targetId: nodeId,
          title: 'Production secrets are forbidden in sandbox',
          message: `${nodeName} exposes production secret references to sandbox execution`,
          suggestedAction: 'Use no_secrets or approved non-production secret references',
          blockingFinal: true,
        }));
      }

      const networkPolicy = get(runtimeScope, 'network_policy', 'networkPolicy') || 'blocked';
      if (agentEnabled && networkPolicy !== 'blocked' && get(runtimeScope, 'external_network_approved', 'externalNetworkApproved') !== true) {
        results.push(result({
          id: `external_network_requires_approval-${nodeId}`,
          level: 'error',
          targetType: 'sandbox_execution_contract',
          targetId: nodeId,
          title: 'External network access requires approval',
          message: `${nodeName} allows network policy ${networkPolicy} without explicit approval`,
          suggestedAction: 'Set external_network_approved or block network access',
          blockingFinal: true,
        }));
      }

      const needsPromotionTests = ['test', 'review', 'staging', 'production'].includes(targetEnvironment)
        || promotionGates.some((gate) => ['test', 'review', 'staging', 'production'].includes(gate));
      if (agentEnabled && sandboxContract && needsPromotionTests && requiredTests.length === 0) {
        results.push(result({
          id: `required_tests_before_promotion-${nodeId}`,
          level: 'error',
          targetType: 'sandbox_execution_contract',
          targetId: nodeId,
          title: 'Required tests must be declared before promotion',
          message: `${nodeName} has promotion gates but no required tests`,
          suggestedAction: 'Declare required acceptance tests in the Sandbox Contract',
          blockingFinal: true,
        }));
      }

      const forbiddenPaths = get(repoScope, 'forbidden_paths', 'forbiddenPaths') || [];
      if (agentEnabled && forbiddenPaths.length && get(promotionPolicy, 'block_on_forbidden_paths', 'blockOnForbiddenPaths') !== true) {
        results.push(result({
          id: `forbidden_paths_block_promotion-${nodeId}`,
          level: 'error',
          targetType: 'sandbox_execution_contract',
          targetId: nodeId,
          title: 'Forbidden paths must block promotion',
          message: `${nodeName} declares forbidden paths but promotion does not block on them`,
          suggestedAction: 'Enable block_on_forbidden_paths before final export',
          blockingFinal: true,
        }));
      }

      if (agentEnabled && get(promotionPolicy, 'agent_can_update_formal_workflow', 'agentCanUpdateFormalWorkflow') === true) {
        results.push(result({
          id: `agent_output_cannot_update_formal_workflow-${nodeId}`,
          level: 'error',
          targetType: 'agent_execution_plan',
          targetId: nodeId,
          title: 'Agent output cannot directly update formal Workflow',
          message: `${nodeName} allows Agent output to bypass Diff Review and update the formal workflow`,
          suggestedAction: 'Require Workflow Diff Review before applying Agent-produced changes',
          blockingFinal: true,
        }));
      }

      if (productionRelated && (get(promotionPolicy, 'production_auto_deploy_allowed', 'productionAutoDeployAllowed') === true || get(promotionGate || {}, 'agent_auto_promote_allowed', 'agentAutoPromoteAllowed') === true)) {
        results.push(result({
          id: `production_agent_auto_deploy_forbidden-${nodeId}`,
          level: 'error',
          targetType: 'promotion_gate',
          targetId: nodeId,
          title: 'Production deploy cannot be automated by Agent',
          message: `${nodeName} is production-related but allows Agent auto promotion`,
          suggestedAction: 'Disable Agent auto promotion and keep manual production approval',
          blockingFinal: true,
        }));
      }

      if (agentEnabled && levelNumber >= 3 && sandboxContract && requiredTests.length === 0) {
        results.push(result({
          id: `sandbox_agent_should_declare_tests-${nodeId}`,
          level: 'warning',
          targetType: 'sandbox_execution_contract',
          targetId: nodeId,
          title: 'Sandbox Agent should declare tests',
          message: `${nodeName} has a Sandbox Contract but no required tests yet`,
          suggestedAction: 'Add npm test, npm run build, or project-specific validation commands',
        }));
      }
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
