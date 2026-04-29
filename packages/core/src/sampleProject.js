import { DEFAULT_PHASES } from '../../schema/src/constants.js';
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

  return {
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
  };
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

  const nodes = [
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

  const edges = [
    ['node-1', 'node-2'], ['node-2', 'node-3'], ['node-3', 'node-4'], ['node-4', 'node-5'],
    ['node-5', 'node-6'], ['node-6', 'node-7'], ['node-7', 'node-8'], ['node-8', 'node-9'],
    ['node-9', 'node-10'], ['node-10', 'node-11'], ['node-11', 'node-12'],
  ].map(([from, to], index) => ({ id: `edge-${index + 1}`, from, to }));

  const prompts = nodes
    .filter((node) => node.executionMode !== 'human_only')
    .map((node) => generatePrompt(node));

  const checklists = nodes.map((node) => generateChecklist(node.reviewGate, node));

  return {
    id: 'project-ai-saas-feature-mvp',
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
      })),
    },
    executionKit: null,
  };
}
