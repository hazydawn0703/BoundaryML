import { createExampleProject } from '../domain/sampleProject.js';

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
  project.contextPack = {
    ...project.contextPack,
    ...contextPack,
  };
  project.workflow.version = 1;
  project.workflow.status = 'draft';
  return project;
}
