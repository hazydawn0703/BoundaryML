import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createExampleProject } from '../packages/core/src/sampleProject.js';
import { generateExecutionKit } from '../packages/generators/src/executionKitGenerator.js';
import { validateWorkflow } from '../packages/rules/src/validationEngine.js';

const DEFAULT_OUTPUT_DIR = 'execution-kit';

function readOutputDir(argv) {
  const outIndex = argv.findIndex((arg) => arg === '--out' || arg === '-o');
  if (outIndex >= 0) return argv[outIndex + 1] || DEFAULT_OUTPUT_DIR;

  const outArg = argv.find((arg) => arg.startsWith('--out='));
  if (outArg) return outArg.slice('--out='.length) || DEFAULT_OUTPUT_DIR;

  return DEFAULT_OUTPUT_DIR;
}

export function exportExampleExecutionKit(outputDir = DEFAULT_OUTPUT_DIR) {
  const project = createExampleProject();
  const validation = validateWorkflow(project.workflow, project.assets, { forGeneration: true, modelConfig: null });
  const kit = generateExecutionKit(project.workflow, project.assets, validation);

  if (!kit?.files || Object.keys(kit.files).length === 0) {
    throw new Error('Execution kit generator returned no files.');
  }

  rmSync(outputDir, { recursive: true, force: true });
  mkdirSync(outputDir, { recursive: true });

  for (const [fileName, content] of Object.entries(kit.files)) {
    writeFileSync(join(outputDir, fileName), String(content), 'utf-8');
  }

  return { outputDir, fileNames: Object.keys(kit.files), status: kit.status };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const outputDir = readOutputDir(process.argv.slice(2));
  const result = exportExampleExecutionKit(outputDir);
  console.log(`✅ exported ${result.fileNames.length} files to ${result.outputDir}`);
  for (const fileName of result.fileNames) console.log(`- ${fileName}`);
}
