import { readFileSync } from 'node:fs';

function assert(cond, msg) { if (!cond) { console.error(`❌ ${msg}`); process.exit(1); } }

const app = readFileSync(new URL('../apps/studio/src/app.js', import.meta.url), 'utf-8');
const api = readFileSync(new URL('../apps/studio/src/api-client/index.js', import.meta.url), 'utf-8');
const store = readFileSync(new URL('../apps/studio/src/state/store.js', import.meta.url), 'utf-8');
const styles = readFileSync(new URL('../apps/studio/styles.css', import.meta.url), 'utf-8');
const studioPackage = readFileSync(new URL('../apps/studio/package.json', import.meta.url), 'utf-8');
const devStudio = readFileSync(new URL('./dev-studio.js', import.meta.url), 'utf-8');

const exportedApiNames = [...api.matchAll(/export const (\w+Api)\s*=/g)].map((match) => match[1]);
const duplicateApiNames = exportedApiNames.filter((name, index) => exportedApiNames.indexOf(name) !== index);
assert(duplicateApiNames.length === 0, `api client exports must be unique: ${duplicateApiNames.join(', ')}`);
const diffsApiExportCount = (api.match(/export const diffsApi\s*=/g) || []).length;
const apiClientObjectMatch = api.match(/export const apiClient = \{[\s\S]*?\};/);
const diffsApiClientReferenceCount = (apiClientObjectMatch?.[0].match(/\bdiffsApi\b/g) || []).length;
assert(diffsApiExportCount === 1, `diffsApi must be declared once, found ${diffsApiExportCount}`);
assert(diffsApiClientReferenceCount === 1, `apiClient must reference diffsApi once, found ${diffsApiClientReferenceCount}`);

assert(api.includes('workflowApi') && api.includes('patch: (projectId, payload)'), 'workflow patch api exists');
assert(api.includes('undo: (projectId)'), 'workflow undo api exists');
assert(api.includes('restore: (projectId, version)'), 'workflow restore api exists');
assert(app.includes('workflow_version: project.workflow.version'), 'workflow version passed in edit requests');
assert(app.includes('data-theme="open-source"'), 'open-source theme root exists');
assert(app.includes('Open Source Theme'), 'theme identity strip exists');
assert(styles.includes('[data-theme="open-source"]') && styles.includes('--primary: #4257ff') && styles.includes('--accent: #05b6d4'), 'open-source theme color tokens exist');
assert(styles.includes('.node-card::before') && styles.includes('.theme-swatch'), 'theme visual components exist');
assert(!store.includes("from '../../../packages/") && !devStudio.includes('/apps/packages/'), 'studio nested imports resolve from served repo root');
assert(studioPackage.includes('node ../../scripts/dev-studio.js') && devStudio.includes('API proxy: /api'), 'studio dev server serves repo root and proxies api');
assert(devStudio.includes('listenWithFallback') && devStudio.includes('EADDRINUSE') && devStudio.includes('trying'), 'studio dev server handles occupied ports');
assert(app.includes('Workflow has been updated by another operation. Please refresh and try again.'), 'version conflict message exists');
assert(app.includes('add-edge-from-node') && app.includes('delete-edge'), 'edge add/delete actions exist');
assert(app.includes('start-edge-edit') && app.includes('save-edge-edit'), 'edge independent edit path exists');
assert(app.includes('edge-edit-field'), 'edge edit form field path exists');
assert(app.includes('dependency_type') && app.includes('required_outputs') && app.includes('gate_id'), 'edge edit fields exist');
assert(app.includes('restore-version') && app.includes('view-version'), 'version detail/restore actions exist');
assert(app.includes('workflowApi.validate'), 'validate uses server api');
assert(api.includes('regenerate: (projectId, assetId)'), 'assets regenerate api exists');
assert(app.includes('edit-asset-field'), 'execution asset edit path exists');
assert(app.includes('Role') && app.includes('Objective') && app.includes('Context Required') && app.includes('Output Format') && app.includes('Acceptance Criteria'), 'prompt structured fields exist');
assert(app.includes('Reviewer Role') && app.includes('Checklist Items'), 'checklist edit fields exist');
assert(app.includes('Artifact Name') && app.includes('Required Sections') && app.includes('Completion Criteria'), 'artifact template edit fields exist');
assert(app.includes('copy-asset') && app.includes('regenerate-asset'), 'asset copy/regenerate actions exist');
assert(app.includes('refreshProjectRuntime(project.id)'), 'asset edits refresh runtime');
assert(api.includes('download: (projectId, kitId)'), 'execution kit download api exists');
assert(app.includes('generate-kit-preview') && app.includes('set-kit-type') && app.includes('download-kit'), 'phase 6 kit preview/generate/download actions exist');
assert(app.includes('Draft Kit') && app.includes('Final Kit'), 'draft/final kit UI exists');
assert(api.includes('diffsApi') && api.includes('/diffs/generate') && api.includes('/apply'), 'diffs api exists');
assert(app.includes('apiClient.diffsApi.generate') && app.includes('apiClient.diffsApi.apply') && app.includes('selected_change_ids'), 'server AI diff review path exists');
assert(app.includes('Selected workflow context may be sent to the configured LLM provider'), 'model context warning exists');
assert(app.includes('update-artifact-contract-field') && app.includes('required_sections'), 'artifact contract required_sections edit path exists');
assert(app.includes('completion_criteria'), 'artifact contract completion_criteria edit path exists');
assert(app.includes('apiClient.workflowApi.patch(project.id, { workflow_version: project.workflow.version, edges: nextEdges })'), 'edge edit uses workflow patch + workflow version');
assert(app.includes('apiClient.nodesApi.patch(project.id, nodeId, { workflow_version: project.workflow.version, artifactContract })'), 'artifact contract edit uses node patch + workflow version');
const persistedMatch = store.match(/const persisted = \{[\s\S]*?\n  \};/);
assert(Boolean(persistedMatch), 'persisted ui state block exists');
assert(!persistedMatch[0].includes('projects') && !persistedMatch[0].includes('workflow') && !persistedMatch[0].includes('validationResults'), 'localStorage does not persist formal workflow/projects');
assert(!app.includes('applyWorkflowDiff(project, st.aiEdit.diff') || app.includes('toggle-ai-edit'), 'no new server-mode fallback to mock edit path added');

console.log('✅ studio workflow edit checks passed');
