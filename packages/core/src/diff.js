import { generatePrompt } from '../../generators/src/promptGenerator.js';

export function generateWorkflowDiff(userRequest, workflow, assets) {
  const request = userRequest.toLowerCase().trim();
  const changes = [];
  const warnings = [];

  if (request.includes('add review gates to all high-risk nodes')) {
    workflow.nodes.forEach((node) => {
      if (node.riskLevel === 'high' && !node.reviewGate?.required) {
        changes.push({
          id: `change-gate-${node.id}`,
          type: 'updated',
          targetType: 'node',
          targetId: node.id,
          field: 'reviewGate',
          before: node.reviewGate,
          after: {
            id: `gate-auto-${node.id}`,
            name: 'Auto Safety Review',
            reviewerRole: node.humanOwnerRole,
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

  if (request.includes('make this workflow more conservative')) {
    workflow.nodes.forEach((node) => {
      if (node.executionMode === 'ai_autonomous') {
        changes.push({
          id: `change-mode-${node.id}`,
          type: 'updated',
          targetType: 'node',
          targetId: node.id,
          field: 'executionMode',
          before: node.executionMode,
          after: 'ai_execute_human_approval',
          reason: 'Conservative mode adds human approval',
          impact: 'increases manual controls',
          selected: true,
        });
      }
    });
    warnings.push('Conservative mode may increase delivery cycle time.');
  }

  if (request.includes('generate prompts for all ai nodes')) {
    workflow.nodes.forEach((node) => {
      if (node.executionMode !== 'human_only' && !assets.prompts.find((p) => p.nodeId === node.id)) {
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

  if (request.includes('add testing nodes before launch')) {
    const testingPhase = workflow.phases.find((phase) => phase.name === 'Testing');
    const launchPhase = workflow.phases.find((phase) => phase.name === 'Launch');
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
          phaseId: testingPhase.id,
          name: 'Regression Dry Run',
          goal: 'Run final regression before launch',
          executionMode: 'ai_draft_human_review',
          riskLevel: 'medium',
          status: 'draft',
          humanOwnerRole: 'QA Lead',
          aiRole: 'Regression Copilot',
          inputs: ['Test case suite', 'Release notes'],
          outputs: ['Regression report'],
          artifactContract: {
            id: 'artifact-node-regression-check',
            format: 'markdown',
            outputFormat: 'Regression matrix markdown',
            acceptanceCriteria: ['All critical tests pass', 'Known issues listed'],
          },
          reviewGate: {
            id: 'gate-regression',
            name: 'QA Lead Review',
            reviewerRole: 'QA Lead',
            criteria: ['Critical path covered'],
            passCondition: 'No critical blocker',
            rejectCondition: 'Critical blocker exists',
            allowAiRevision: false,
            required: true,
          },
          promptStatus: 'draft',
          checklistStatus: 'draft',
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

    if (change.targetType === 'prompt' && change.field === 'prompt') {
      updated.assets.prompts.push(change.after);
    }

    if (change.targetType === 'node' && change.field === 'node') {
      updated.workflow.nodes.push(change.after);
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
