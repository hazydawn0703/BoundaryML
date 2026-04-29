import { writeFileSync, mkdirSync } from 'node:fs';
import { createExampleProject } from '../packages/core/src/sampleProject.js';
import { toSnakeCaseKeys } from '../packages/schema/src/schema.js';
import { validateWorkflow } from '../packages/rules/src/validationEngine.js';
import { generateWorkflowDiff } from '../packages/core/src/diff.js';

const now = new Date().toISOString();
const project = createExampleProject();
project.workspace_id = 'demo_workspace';
project.created_by = 'demo_user';
project.updated_by = 'demo_user';
project.created_at = now;
project.updated_at = now;

if (project.assets.prompts[0]) {
  project.assets.prompts[0].status = 'outdated';
  project.assets.prompts[0].outdatedReason = 'Node contract changed by review gate update';
}

const diffExample = generateWorkflowDiff('add testing nodes before launch', project.workflow, project.assets);

const validation = validateWorkflow(project.workflow, project.assets, { forGeneration: true, modelConfig: null });

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
  validation,
  workflow_diffs: [diffExample],
  execution_kits: [],
  templates: [
    {
      id: 'template-ai-saas-v1',
      name: 'AI SaaS MVP Template',
      template_type: 'workflow_template',
      version: 'v1',
      content: {
        phase_count: 6,
      },
    },
  ],
};

mkdirSync('examples', { recursive: true });
writeFileSync('examples/ai-saas-feature-mvp.json', JSON.stringify(toSnakeCaseKeys(exampleSpec), null, 2));
console.log('generated examples/ai-saas-feature-mvp.json');
