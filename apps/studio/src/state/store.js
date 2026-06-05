import { createExampleProject } from '../../../../packages/core/src/sampleProject.js';
import { validateWorkflow } from '../../../../packages/rules/src/validationEngine.js';

const STORAGE_KEY = 'boundaryml_studio_ui_state_v1';

function initialState() {
  const exampleProject = createExampleProject();
  return {
    runtimeMode: 'local_demo',
    serverAvailable: false,
    language: 'en',
    currentPage: 'projects',
    projects: [exampleProject],
    activeProjectId: exampleProject.id,
    selectedNodeId: exampleProject.workflow.nodes[0]?.id || null,
    validationResults: validateWorkflow(exampleProject.workflow, exampleProject.assets),
    activeNodeDetailTab: 'overview',
    aiEdit: { open: false, request: '', diff: null },
    exportPreviewType: 'workflow_spec.yaml',
    settingsNavOpen: false,
    projectSearch: '',
    studioFilter: { mode: 'all', risk: 'all' },
    workflowViewport: { x: 0, y: 0, scale: 1 },
    assetsFilter: { type: 'prompt', phase: 'all', status: 'all' },
    selectedAsset: null,
    jobs: [],
    modelStatus: null,
    modelConfig: null,
    toasts: [],
    serverError: '',
  };
}

function loadUiState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
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
    studioFilter: state.studioFilter,
    workflowViewport: state.workflowViewport,
    assetsFilter: state.assetsFilter,
    activeNodeDetailTab: state.activeNodeDetailTab,
    runtimeMode: state.runtimeMode,
    serverAvailable: state.serverAvailable,
    language: state.language || 'en',
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
