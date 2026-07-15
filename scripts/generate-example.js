import { writeFileSync, mkdirSync } from 'node:fs';
import { generateWorkflowDraft } from '../packages/generators/src/workflowGenerator.js';
import { toSnakeCaseKeys } from '../packages/schema/src/schema.js';
import { validateWorkflow } from '../packages/rules/src/validationEngine.js';
import { generateWorkflowDiff } from '../packages/core/src/diff.js';
import { listPublicTemplates, selectTemplateForProject } from '../packages/core/src/templates.js';

const now = new Date().toISOString();

const exampleInputs = [
  {
    filename: 'ai-saas-feature-mvp.json',
    input: { name: 'AI SaaS Feature MVP', goal: 'Plan and deliver an AI-assisted SaaS feature from idea to launch.', type: 'AI Feature', riskLevel: 'high', setupMode: 'quick_start' },
  },
  {
    filename: 'internal-ai-tool.json',
    input: { name: 'Internal AI Tool', goal: 'Build an internal AI assistant with access review and rollout controls.', type: 'Internal Tool', riskLevel: 'medium', setupMode: 'org_aware' },
  },
  {
    filename: 'legacy-system-ai-modernization.json',
    input: { name: 'Legacy System AI Modernization', goal: 'Modernize a legacy system with AI-assisted analysis and safe rollout.', type: 'Legacy Modernization', riskLevel: 'high', setupMode: 'org_aware' },
  },
];

function buildExampleSpec(projectInput) {
  const project = generateWorkflowDraft(projectInput, {});
  const selectedTemplate = selectTemplateForProject(projectInput);
  project.workspace_id = 'demo_workspace';
  project.created_by = 'demo_user';
  project.updated_by = 'demo_user';
  project.created_at = now;
  project.updated_at = now;
  project.created_from_template = selectedTemplate.id;
  project.template_version = selectedTemplate.version;

  if (project.assets.prompts[0]) {
    project.assets.prompts[0].status = 'outdated';
    project.assets.prompts[0].outdatedReason = 'Node contract changed by review gate update';
  }

  const diffExample = generateWorkflowDiff('add testing nodes before launch', project.workflow, project.assets);
  const validation = validateWorkflow(project.workflow, project.assets, { forGeneration: true, modelConfig: null });

  return {
    roleunion_version: 'v0.1',
    project: { ...project, context_pack: project.contextPack },
    context_pack: project.contextPack,
    workflow: { ...project.workflow, workspace_id: 'demo_workspace', template_id: selectedTemplate.id, template_version: selectedTemplate.version },
    assets: project.assets,
    validation,
    workflow_diffs: [diffExample],
    execution_kits: [],
    templates: listPublicTemplates(),
  };
}

mkdirSync('examples', { recursive: true });
exampleInputs.forEach(({ filename, input }) => {
  writeFileSync(`examples/${filename}`, JSON.stringify(toSnakeCaseKeys(buildExampleSpec(input)), null, 2));
  console.log(`generated examples/${filename}`);
});
writeFileSync('examples/templates.json', JSON.stringify(toSnakeCaseKeys({ templates: listPublicTemplates() }), null, 2));
console.log('generated examples/templates.json');
