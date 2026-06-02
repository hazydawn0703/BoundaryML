import { readFileSync } from 'node:fs';

function loadExample(filename) {
  return JSON.parse(readFileSync(new URL(`../../../examples/${filename}`, import.meta.url), 'utf-8'));
}

export function loadAiSaasFeatureMvpSpec() {
  return loadExample('ai-saas-feature-mvp.json');
}

export function loadInternalAiToolSpec() {
  return loadExample('internal-ai-tool.json');
}

export function loadLegacySystemAiModernizationSpec() {
  return loadExample('legacy-system-ai-modernization.json');
}

export function loadPublicTemplatesExample() {
  return loadExample('templates.json');
}
