import { writeFileSync, mkdirSync } from 'node:fs';
import { createExampleProject } from '../packages/core/src/sampleProject.js';
import { toSnakeCaseKeys } from '../packages/schema/src/schema.js';

const now = new Date().toISOString();
const example = {
  ...createExampleProject(),
  workspace_id: 'demo_workspace',
  created_by: 'demo_user',
  updated_by: 'demo_user',
  created_at: now,
  updated_at: now,
  context_pack: createExampleProject().contextPack,
  execution_kit: null,
};

mkdirSync('examples', { recursive: true });
writeFileSync('examples/ai-saas-feature-mvp.json', JSON.stringify(toSnakeCaseKeys(example), null, 2));
console.log('generated examples/ai-saas-feature-mvp.json');
