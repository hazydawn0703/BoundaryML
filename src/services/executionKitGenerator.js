export function generateExecutionKit(workflow, assets, validationResults) {
  const hasBlockingError = validationResults.some((item) => item.level === 'error' && item.blockingFinal);

  const workflowSpec = {
    version: workflow.version,
    status: workflow.status,
    phases: workflow.phases.map((phase) => ({ id: phase.id, name: phase.name })),
    nodes: workflow.nodes.map((node) => ({
      id: node.id,
      name: node.name,
      phaseId: node.phaseId,
      mode: node.executionMode,
      risk: node.riskLevel,
      reviewGate: node.reviewGate?.name,
    })),
  };

  const taskList = workflow.nodes.map((node, index) => `${index + 1}. ${node.name} (${node.humanOwnerRole})`).join('\n');
  const promptPack = assets.prompts.map((prompt) => `## ${prompt.name}\n\n${prompt.content}`).join('\n\n');
  const reviewChecklist = assets.checklists.map((item) => `## ${item.name}\n${item.items.map((x) => `- ${x}`).join('\n')}`).join('\n\n');
  const artifactTemplates = assets.artifactTemplates.map((item) => `## ${item.name}\n\n${item.content}`).join('\n\n');
  const responsibilityMap = workflow.nodes.map((node) => `- ${node.name}: ${node.humanOwnerRole}`).join('\n');
  const riskReport = workflow.nodes.filter((node) => node.riskLevel === 'high').map((node) => `- ${node.name}: gate=${node.reviewGate?.name || 'missing'}`).join('\n');

  return {
    id: `kit-${Date.now()}`,
    status: hasBlockingError ? 'draft_only' : 'final_ready',
    canExportFinal: !hasBlockingError,
    generatedAt: new Date().toISOString(),
    files: {
      workflowSpec,
      taskList,
      promptPack,
      reviewChecklist,
      artifactTemplates,
      responsibilityMap,
      riskReport,
    },
  };
}
