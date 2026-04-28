import { writeFileSync, mkdirSync } from 'node:fs';
import { createExampleProject } from '../packages/core/src/sampleProject.js';

const example = createExampleProject();
mkdirSync('examples', { recursive: true });
writeFileSync('examples/ai-saas-feature-mvp.json', JSON.stringify(example, null, 2));
console.log('generated examples/ai-saas-feature-mvp.json');
