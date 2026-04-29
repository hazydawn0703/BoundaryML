import { writeFileSync, mkdirSync } from 'node:fs';
import { createExampleProject } from '../packages/core/src/sampleProject.js';
import { toSnakeCaseKeys } from '../packages/schema/src/schema.js';
import { validateWorkflow } from '../packages/rules/src/validationEngine.js';

const now = new Date().toISOString();
const project = createExampleProject();
project.workspace_id = 'demo_workspace';
project.created_by = 'demo_user';
project.updated_by = 'demo_user';
project.created_at = now;
project.updated_at = now;

const exampleSpec = {
  boundaryml_version: 'v0.1',
  project: {
    ...project,
    context_pack: project.contextPack,
  },
  context_pack: project.contextPack,
  workflow: {
    ...project.workflow,
    workspace_id: 'demo_workspace',
  },
  assets: project.assets,
  validation: validateWorkflow(project.workflow, project.assets),
  execution_kits: [],
};

mkdirSync('examples', { recursive: true });
writeFileSync('examples/ai-saas-feature-mvp.json', JSON.stringify(toSnakeCaseKeys(exampleSpec), null, 2));
console.log('generated examples/ai-saas-feature-mvp.json');
