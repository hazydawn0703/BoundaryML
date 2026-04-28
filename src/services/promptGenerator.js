import { EXECUTION_MODES } from '../domain/constants.js';

export function generatePrompt(node) {
  if (!EXECUTION_MODES[node.executionMode]?.ai) return null;

  const markdown = `# Role\n${node.aiRole || 'AI Assistant'}\n\n# Objective\n${node.goal}\n\n# Context Required\n${node.inputs.map((item) => `- ${item}`).join('\n')}\n\n# Input Materials\n- Context Pack\n- Upstream artifacts\n\n# Output Format\n${node.artifactContract?.outputFormat || 'Structured markdown'}\n\n# Constraints\n- Follow boundary rules\n- Escalate ambiguity\n\n# Acceptance Criteria\n${(node.artifactContract?.acceptanceCriteria || ['Meets node contract']).map((item) => `- ${item}`).join('\n')}\n\n# Failure Handling\n- Report blockers\n- Request human review`; 

  return {
    id: `prompt-${node.id}`,
    nodeId: node.id,
    phaseId: node.phaseId,
    name: `Prompt: ${node.name}`,
    model: 'mock-planning-model',
    status: node.promptStatus || 'draft',
    outputFormat: node.artifactContract?.outputFormat || 'markdown',
    acceptanceCriteria: node.artifactContract?.acceptanceCriteria || [],
    content: markdown,
    updatedAt: new Date().toISOString(),
  };
}
