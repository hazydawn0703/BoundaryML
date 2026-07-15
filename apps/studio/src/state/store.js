import { createExampleProject } from '../../../../packages/core/src/sampleProject.js';
import { validateWorkflow } from '../../../../packages/rules/src/validationEngine.js';

const STORAGE_KEY = 'roleunion_studio_ui_state_v1';

function initialState() {
  const exampleProject = createExampleProject();
  return {
    runtimeMode: 'local_demo',
    serverAvailable: false,
    language: 'en',
    theme: 'open-source',
    currentPage: 'projects',
    projects: [exampleProject],
    activeProjectId: exampleProject.id,
    selectedNodeId: exampleProject.workflow.nodes[0]?.id || null,
    validationResults: validateWorkflow(exampleProject.workflow, exampleProject.assets),
    activeNodeDetailTab: 'overview',
    aiEdit: { open: false, request: '', diff: null, pending: false },
    projectAgent: { request: '', session: null, pending: false, progress: null },
    workflowGenerationPending: false,
    exportPreviewType: 'workflow_spec.yaml',
    settingsNavOpen: false,
    agentAccess: {
      adapter: 'codex',
      mode: 'clipboard',
      payloadView: 'adapter',
      endpoint: '',
      selectedProjectId: exampleProject.id,
      selectedNodeId: exampleProject.workflow.nodes[0]?.id || '',
      lastStatus: '',
      runs: [],
    },
    projectSearch: '',
    jobSearch: '',
    workflowHistoryOpen: false,
    activeProjectMenuId: null,
    activeProjectRenameId: null,
    projectRenameDraft: '',
    projectRenameError: '',
    activePhaseRenameId: null,
    studioFilter: { mode: 'all', risk: 'all' },
    workflowViewport: { x: 0, y: 0, scale: 1 },
    assetsFilter: { type: 'prompt', phase: 'all', status: 'all' },
    selectedAsset: null,
    jobs: [],
    modelStatus: null,
    modelConfig: null,
    toasts: [],
    fieldSaveStatus: {},
    modelTestPending: false,
    serverError: '',
  };
}

function loadUiState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const persisted = raw ? JSON.parse(raw) : {};
    delete persisted.runtimeMode;
    delete persisted.serverAvailable;
    return persisted;
  } catch {
    return {};
  }
}

let state = { ...initialState(), ...loadUiState() };
const listeners = new Set();

function persistUiState() {
  const persisted = {
    currentPage: state.currentPage,
    settingsNavOpen: state.settingsNavOpen,
    projectSearch: state.projectSearch,
    jobSearch: state.jobSearch,
    studioFilter: state.studioFilter,
    workflowViewport: state.workflowViewport,
    assetsFilter: state.assetsFilter,
    activeNodeDetailTab: state.activeNodeDetailTab,
    language: state.language || 'en',
    theme: state.theme || 'open-source',
    projectAgent: {
      request: state.projectAgent?.request || '',
      session: state.projectAgent?.session || null,
      pending: false,
    },
    agentAccess: {
      adapter: state.agentAccess?.adapter || 'codex',
      mode: state.agentAccess?.mode || 'clipboard',
      payloadView: state.agentAccess?.payloadView || 'adapter',
      endpoint: state.agentAccess?.endpoint || '',
      selectedProjectId: state.agentAccess?.selectedProjectId || '',
      selectedNodeId: state.agentAccess?.selectedNodeId || '',
      lastStatus: state.agentAccess?.lastStatus || '',
      runs: [],
    },
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
}

export function getState() { return state; }
export function setState(updater) {
  state = typeof updater === 'function' ? updater(state) : updater;
  persistUiState();
  listeners.forEach((listener) => listener(state));
}
export function updateUiStateSilently(mutator) {
  mutator(state);
  persistUiState();
}
export function subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); }
export function getActiveProject(st = state) { return st.projects.find((project) => project.id === st.activeProjectId); }
export function recomputeValidation(project) { return validateWorkflow(project.workflow, project.assets); }
export function replaceActiveProject(updatedProject) {
  setState((prev) => ({ ...prev, projects: prev.projects.map((p) => (p.id === updatedProject.id ? updatedProject : p)), validationResults: recomputeValidation(updatedProject) }));
}
export function replaceActiveProjectSilently(updatedProject) {
  state.projects = state.projects.map((p) => (p.id === updatedProject.id ? updatedProject : p));
  state.validationResults = recomputeValidation(updatedProject);
  persistUiState();
}
export function setRuntimeMode(runtimeMode, serverAvailable) { setState((prev) => ({ ...prev, runtimeMode, serverAvailable })); }
