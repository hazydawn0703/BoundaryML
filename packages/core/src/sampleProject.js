import { DEFAULT_PHASES } from '../../schema/src/constants.js';
import {
  createDefaultExecutionEvidenceTemplate,
  createDefaultPromotionGate,
  createDefaultSandboxExecutionContract,
  normalizeAgenticNode,
} from '../../schema/src/agentic.js';
import { generatePrompt } from '../../generators/src/promptGenerator.js';
import { generateChecklist } from '../../generators/src/checklistGenerator.js';

const now = () => new Date().toISOString();

function nodeTemplate(id, phaseId, name, executionMode, riskLevel, reviewGate, humanOwnerRole, aiRole, inputs, outputs) {
  const artifactContract = {
    id: `artifact-${id}`,
    format: 'markdown',
    outputFormat: 'Structured Markdown with headings and bullets',
    acceptanceCriteria: [
      'Output is complete and addresses node goal',
      'Terminology aligns with project objective',
    ],
  };

  return normalizeAgenticNode({
    id,
    phaseId,
    name,
    goal: `Complete ${name} for AI SaaS MVP delivery`,
    executionMode,
    riskLevel,
    status: 'draft',
    humanOwnerRole,
    aiRole,
    inputs,
    outputs,
    artifactContract,
    reviewGate,
    promptStatus: executionMode === 'human_only' ? 'missing' : 'draft',
    checklistStatus: 'draft',
    history: [{ at: now(), action: 'Node created from template' }],
  });
}

function configureAgenticDevelopmentNode(node) {
  const contract = createDefaultSandboxExecutionContract(node, {
    id: `contract-${node.id}`,
    version: 1,
    execution_target: 'codex',
    repo_scope: {
      repository: 'github.com/example/ai-saas-feature',
      base_branch: 'main',
      working_branch: `agent/${node.id}-sandbox`,
      allowed_paths: ['apps/**', 'packages/**', 'tests/**'],
      forbidden_paths: ['infra/**', 'data/**'],
    },
    runtime_scope: {
      allowed_commands: ['npm test', 'npm run build'],
      network_policy: 'blocked',
      package_install_policy: 'allow_lockfile_only',
      max_runtime_minutes: 45,
    },
    secret_scope: { policy: 'production_forbidden', allowed_secret_refs: [] },
    cost_budget: { amount: 25, currency: 'USD' },
    acceptance_tests: { required: ['npm test', 'npm run build'], optional: ['npm run typecheck'] },
    output_required: { evidence: ['diff', 'test_report', 'risk_summary', 'cost_report', 'rollback_note'] },
    review_gate: node.reviewGate?.id,
    promotion_policy: {
      promotion_gates: ['sandbox', 'test', 'review'],
      target_environment: 'review',
      human_approval_required: true,
      agent_can_update_formal_workflow: false,
      production_auto_deploy_allowed: false,
      block_on_forbidden_paths: true,
    },
  });
  return normalizeAgenticNode(node, {
    agent_execution_plan: {
      enabled: true,
      execution_level: 'L3',
      execution_target: 'codex',
      dispatch_mode: 'manual_confirmed',
      sandbox_execution_contract_id: contract.id,
      status: 'ready',
    },
    sandbox_execution_contract: contract,
    promotion_gate: createDefaultPromotionGate(node, {
      id: `promotion-review-${node.id}`,
      gate_type: 'review',
      required_checks: ['required_tests', 'human_review', 'forbidden_path_check'],
      human_approval_required: true,
    }),
    execution_evidence_template: createDefaultExecutionEvidenceTemplate(node, {
      required_items: ['diff', 'test_report', 'risk_summary', 'cost_report', 'rollback_note'],
    }),
  });
}

function configureProductionNode(node) {
  return normalizeAgenticNode(node, {
    agent_execution_plan: {
      enabled: false,
      execution_level: 'L0',
      execution_target: 'manual_handoff',
      dispatch_mode: 'disabled',
      status: 'disabled',
    },
    promotion_gate: createDefaultPromotionGate(node, {
      id: `promotion-production-${node.id}`,
      gate_type: 'production',
      required_checks: ['human_approval', 'release_checklist', 'rollback_plan'],
      human_approval_required: true,
      agent_auto_promote_allowed: false,
    }),
    execution_evidence_template: createDefaultExecutionEvidenceTemplate(node, {
      required_items: ['risk_summary', 'rollback_note', 'human_approval_record'],
    }),
  });
}

export function createExampleProject() {
  const phases = DEFAULT_PHASES.map((name, index) => ({ id: `phase-${index + 1}`, name, order: index + 1 }));

  const [discovery, productDesign, technicalDesign, development, testing, launch] = phases;

  const reviewGate = (name, reviewerRole) => ({
    id: `gate-${name.toLowerCase().replace(/\s+/g, '-')}`,
    name,
    reviewerRole,
    criteria: ['Completeness', 'Consistency', 'Risk controls present'],
    passCondition: 'All required criteria are met',
    rejectCondition: 'Any high-severity issue remains',
    allowAiRevision: true,
    required: true,
  });

  let nodes = [
    nodeTemplate('node-1', discovery.id, 'Project Goal Clarification', 'human_lead_ai_assist', 'medium', reviewGate('PM Review', 'Product Manager'), 'Product Manager', 'AI Strategy Copilot', ['Business objective'], ['Clarified project goal']),
    nodeTemplate('node-2', discovery.id, 'Context Pack Summary', 'ai_draft_human_review', 'medium', reviewGate('PM Review', 'Product Manager'), 'Product Manager', 'Context Synthesizer', ['Team roles', 'Risk constraints'], ['Context summary']),
    nodeTemplate('node-3', productDesign.id, 'PRD Draft Generation', 'ai_draft_human_review', 'medium', reviewGate('PM Review', 'Product Manager'), 'Product Manager', 'PRD Writer', ['Project goal', 'Context pack'], ['PRD draft']),
    nodeTemplate('node-4', productDesign.id, 'Scope Review', 'human_only', 'high', reviewGate('Product Lead Approval', 'Product Lead'), 'Product Lead', '', ['PRD draft'], ['Approved scope']),
    nodeTemplate('node-5', technicalDesign.id, 'Architecture Proposal', 'human_lead_ai_assist', 'high', reviewGate('Tech Lead Review', 'Tech Lead'), 'Tech Lead', 'Architecture Assistant', ['Approved scope'], ['Architecture proposal']),
    nodeTemplate('node-6', technicalDesign.id, 'API Contract Draft', 'ai_draft_human_review', 'medium', reviewGate('Tech Lead Review', 'Tech Lead'), 'Backend Engineer', 'API Contract Copilot', ['Architecture proposal'], ['API contract']),
    nodeTemplate('node-7', development.id, 'Task Breakdown', 'ai_execute_human_approval', 'medium', reviewGate('Engineer Approval', 'Engineering Manager'), 'Engineering Manager', 'Task Planner', ['PRD', 'API contract'], ['Implementation task list']),
    nodeTemplate('node-8', development.id, 'Code Generation Prompt', 'ai_execute_human_approval', 'high', reviewGate('Code Review', 'Senior Engineer'), 'Senior Engineer', 'Code Assistant', ['Task list', 'Architecture proposal'], ['Code prompt pack']),
    nodeTemplate('node-9', testing.id, 'Test Case Generation', 'ai_draft_human_review', 'medium', reviewGate('QA Review', 'QA Engineer'), 'QA Engineer', 'QA Copilot', ['Task list', 'PRD'], ['Test case suite']),
    nodeTemplate('node-10', testing.id, 'QA Review', 'human_only', 'high', reviewGate('QA Lead Approval', 'QA Lead'), 'QA Lead', '', ['Test case suite'], ['QA sign-off']),
    nodeTemplate('node-11', launch.id, 'Launch Checklist', 'ai_draft_human_review', 'high', reviewGate('Release Manager Review', 'Release Manager'), 'Release Manager', 'Release Copilot', ['QA sign-off'], ['Launch checklist']),
    nodeTemplate('node-12', launch.id, 'Production Approval', 'human_only', 'high', reviewGate('Release Manager Approval', 'Release Manager'), 'Release Manager', '', ['Launch checklist'], ['Production approval']),
  ];
  nodes = nodes.map((node) => {
    if (node.id === 'node-8') return configureAgenticDevelopmentNode(node);
    if (node.id === 'node-12') return configureProductionNode(node);
    return node;
  });

  const edges = [
    ['node-1', 'node-2'], ['node-2', 'node-3'], ['node-3', 'node-4'], ['node-4', 'node-5'],
    ['node-5', 'node-6'], ['node-6', 'node-7'], ['node-7', 'node-8'], ['node-8', 'node-9'],
    ['node-9', 'node-10'], ['node-10', 'node-11'], ['node-11', 'node-12'],
  ].map(([from, to], index) => ({ id: `edge-${index + 1}`, from, to }));

  const workflowRef = { id: 'workflow-1', version: 1 };
  const contextPackRef = { version: 1 };
  const prompts = nodes
    .filter((node) => node.executionMode !== 'human_only')
    .map((node) => generatePrompt(node, { workflow: workflowRef, contextPack: contextPackRef }));
  if (prompts[0]) {
    prompts[0].status = 'outdated';
    prompts[0].outdatedReason = 'Contract updated after review gate change';
  }

  const checklists = nodes.map((node) => generateChecklist(node.reviewGate, node, { workflow: workflowRef, contextPack: contextPackRef }));

  return {
    id: 'project-ai-saas-feature-mvp',
    workspace_id: 'demo_workspace',
    created_by: 'demo_user',
    updated_by: 'demo_user',
    created_at: now(),
    updated_at: now(),
    name: 'AI SaaS Feature MVP',
    type: 'AI Feature',
    goal: 'Build an AI SaaS feature MVP with explicit human-AI boundaries',
    currentStage: 'Planning',
    riskLevel: 'high',
    workflowStatus: 'draft',
    deliveryScope: ['PRD', 'Prototype', 'Technical Design', 'API Contract', 'Source Code', 'Test Cases', 'Launch Plan'],
    expectedAiScope: ['PRD', 'Code', 'Test', 'Docs', 'Review'],
    sensitiveAreas: ['Customer Data', 'Production Release', 'Security'],
    setupMode: 'quick_start',
    contextPack: {
      teamRoles: ['Product Manager', 'Tech Lead', 'QA Lead', 'Release Manager'],
      approvalProcess: ['PRD Review', 'Architecture Review', 'Launch Approval'],
      toolStack: ['Jira', 'GitHub', 'Figma', 'Playwright'],
      riskConstraints: ['No production change without manual approval'],
      historicalProcessMaterials: 'Legacy release checklist v2.1',
      summary: null,
    },
    workflow: {
      id: 'workflow-1',
      workspace_id: 'demo_workspace',
      version: 1,
      status: 'draft',
      phases,
      nodes,
      edges,
      updatedAt: now(),
    },
    assets: {
      prompts,
      checklists,
      artifactTemplates: nodes.map((node) => ({
        id: `artifact-template-${node.id}`,
        nodeId: node.id,
        name: `${node.name} Artifact Template`,
        content: `# ${node.name}\n\n## Goal\n${node.goal}\n\n## Required Output\n- ${node.outputs.join('\n- ')}`,
        status: 'draft',
        generated_from: {
          type: 'node_contract',
          asset_type: 'artifact_template',
          node_id: node.id,
          phase_id: node.phaseId,
          workflow_id: workflowRef.id,
          workflow_version: workflowRef.version,
          context_pack_version: contextPackRef.version,
          sandbox_execution_contract_id: node.sandboxExecutionContract?.id || node.agentExecutionPlan?.sandbox_execution_contract_id || null,
          contract_version: node.sandboxExecutionContract?.version || node.agentExecutionPlan?.contract_version || 0,
          generated_at: now(),
        },
      })),
    },
    model_call_logs: [{
      id: 'model-call-1',
      workspace_id: 'demo_workspace',
      model: 'mock-planning-model',
      purpose: 'workflow_generate',
      status: 'succeeded',
      created_at: now(),
    }],
    executionKit: null,
  };
}
