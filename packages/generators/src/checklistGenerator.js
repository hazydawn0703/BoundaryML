export function generateChecklist(reviewGate, node) {
  return {
    id: `checklist-${node.id}`,
    nodeId: node.id,
    phaseId: node.phaseId,
    name: `Checklist: ${node.name}`,
    status: node.checklistStatus || 'draft',
    reviewerRole: reviewGate?.reviewerRole || node.humanOwnerRole,
    items: [
      `Confirm goal of ${node.name} is met`,
      ...(reviewGate?.criteria || ['Validate quality and risk controls']),
      `Verify pass condition: ${reviewGate?.passCondition || 'manual approval required'}`,
    ],
    updatedAt: new Date().toISOString(),
  };
}
