import { createExampleProject } from '../../core/src/sampleProject.js';
import { normalizeAgenticNode } from '../../schema/src/agentic.js';

function applySensitiveAreaRules(project) {
  const hasCustomerData = project.sensitiveAreas.includes('Customer Data');
  const hasProdRelease = project.sensitiveAreas.includes('Production Release');

  project.workflow.nodes.forEach((node) => {
    if (hasCustomerData && ['Technical Design', 'Development', 'Launch'].includes(project.workflow.phases.find((p) => p.id === node.phaseId)?.name)) {
      node.reviewGate = node.reviewGate || {
        id: `gate-${node.id}`,
        name: 'Security Review',
        reviewerRole: 'Security Owner',
        criteria: ['Data classification complete', 'PII handling validated'],
        passCondition: 'Security owner approved',
        rejectCondition: 'Any unresolved data risk',
        allowAiRevision: true,
        required: true,
      };
      node.reviewGate.name = node.reviewGate.name.includes('Security') ? node.reviewGate.name : `Security Review · ${node.reviewGate.name}`;
      node.reviewGate.required = true;
      node.riskLevel = node.riskLevel === 'low' ? 'medium' : node.riskLevel;
    }

    if (hasProdRelease && ['Launch Checklist', 'Production Approval'].includes(node.name)) {
      node.riskLevel = 'high';
      if (node.name === 'Production Approval') node.executionMode = 'human_only';
      if (node.executionMode === 'ai_autonomous') node.executionMode = 'ai_execute_human_approval';
      node.reviewGate = node.reviewGate || {
        id: `gate-prod-${node.id}`,
        name: 'Release Approval',
        reviewerRole: 'Release Manager',
        criteria: ['Rollback plan ready', 'Change window approved'],
        passCondition: 'Release manager approval',
        rejectCondition: 'Missing release controls',
        allowAiRevision: false,
        required: true,
      };
      node.reviewGate.required = true;
    }
  });
}

function applyOrganizationAwareMapping(project, contextPack) {
  if (project.setupMode !== 'org_aware') return;
  const roleFallback = contextPack.teamRoles?.[0] || 'Project Manager';

  project.workflow.nodes.forEach((node, index) => {
    const reviewerFromApproval = contextPack.approvalProcess?.[index % (contextPack.approvalProcess.length || 1)] || '';
    const matchedRole = contextPack.teamRoles?.find((role) => reviewerFromApproval.toLowerCase().includes(role.toLowerCase().split(' ')[0]));
    if (node.reviewGate) {
      node.reviewGate.reviewerRole = matchedRole || roleFallback;
      node.reviewGate.name = reviewerFromApproval || node.reviewGate.name;
    }
  });
}

function applyProjectTypeTemplate(project, projectType) {
  const normalized = (projectType || '').toLowerCase();
  if (normalized.includes('internal tool')) {
    project.workflow.templateType = 'internal_tool';
    project.workflow.phases[0].name = 'Intake';
    const firstNode = project.workflow.nodes[0];
    firstNode.name = 'Internal Requirement Intake';
    firstNode.goal = 'Align internal stakeholders and constraints';
  } else if (normalized.includes('legacy')) {
    project.workflow.templateType = 'legacy_modernization';
    project.workflow.phases[0].name = 'Assessment';
    const node = project.workflow.nodes.find((item) => item.name === 'Architecture Proposal');
    if (node) node.name = 'Modernization Architecture Proposal';
  } else {
    project.workflow.templateType = 'ai_feature';
  }
}

function disableAgenticNode(node) {
  const next = normalizeAgenticNode(node, {
    agent_execution_plan: {
      enabled: false,
      execution_level: 'L0',
      execution_target: 'manual_handoff',
      dispatch_mode: 'disabled',
      sandbox_execution_contract_id: null,
      status: 'disabled',
    },
  });
  delete next.sandbox_execution_contract;
  delete next.sandboxExecutionContract;
  delete next.promotion_gate;
  delete next.promotionGate;
  delete next.execution_evidence_template;
  delete next.executionEvidenceTemplate;
  next.agent_execution_plan.sandbox_execution_contract_id = null;
  next.agent_execution_plan.contract_version = 0;
  return next;
}

function applyAgenticScenarioDefaults(project, projectType) {
  const normalized = (projectType || '').toLowerCase();
  if (normalized.includes('internal tool')) {
    project.workflow.nodes = project.workflow.nodes.map(disableAgenticNode);
    return;
  }
  if (normalized.includes('legacy')) {
    project.workflow.nodes = project.workflow.nodes.map((node) => {
      const next = disableAgenticNode(node);
      if (/architecture|modernization|api contract/i.test(next.name || '')) {
        next.agent_execution_plan = {
          ...next.agent_execution_plan,
          enabled: true,
          execution_level: 'L2',
          execution_target: 'manual_handoff',
          dispatch_mode: 'manual_confirmed',
          status: 'review_required',
        };
      }
      return next;
    });
  }
}

function markAssetsOutdated(project, reason) {
  project.assets.prompts = project.assets.prompts.map((prompt) => ({ ...prompt, status: 'outdated', outdatedReason: reason }));
  project.assets.checklists = project.assets.checklists.map((checklist) => ({ ...checklist, status: 'outdated', outdatedReason: reason }));
  project.workflow.nodes = project.workflow.nodes.map((node) => ({
    ...node,
    promptStatus: node.executionMode === 'human_only' ? 'missing' : 'outdated',
    checklistStatus: 'outdated',
    history: [...node.history, { at: new Date().toISOString(), action: `Assets marked outdated: ${reason}` }],
  }));
}

export function generateWorkflowDraft(projectInput, contextPack) {
  const project = createExampleProject();
  project.id = `project-${Date.now()}`;
  project.name = projectInput.name || project.name;
  project.goal = projectInput.goal || project.goal;
  project.type = projectInput.type || project.type;
  project.currentStage = projectInput.currentStage || project.currentStage;
  project.riskLevel = projectInput.riskLevel || project.riskLevel;
  project.deliveryScope = projectInput.deliveryScope || project.deliveryScope;
  project.expectedAiScope = projectInput.expectedAiScope || project.expectedAiScope;
  project.sensitiveAreas = projectInput.sensitiveAreas || project.sensitiveAreas;
  project.setupMode = projectInput.setupMode;
  project.contextPack = { ...project.contextPack, ...contextPack };

  applyProjectTypeTemplate(project, project.type);
  applySensitiveAreaRules(project);
  applyOrganizationAwareMapping(project, project.contextPack);
  applyAgenticScenarioDefaults(project, project.type);

  if (contextPack?.summary || (contextPack?.teamRoles?.length || 0) > 0) {
    markAssetsOutdated(project, 'Context Pack changed and workflow regenerated');
  }

  project.workflow.version = 1;
  project.workflow.status = 'draft';
  return project;
}
