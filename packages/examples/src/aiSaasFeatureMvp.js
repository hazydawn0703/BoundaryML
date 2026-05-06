import { readFileSync } from 'node:fs';

export function loadAiSaasFeatureMvpSpec() {
  return JSON.parse(readFileSync(new URL('../../../examples/ai-saas-feature-mvp.json', import.meta.url), 'utf-8'));
}
