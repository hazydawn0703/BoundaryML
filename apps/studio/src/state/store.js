import { createExampleProject } from '../../../packages/core/src/sampleProject.js';
import { validateWorkflow } from '../../../packages/rules/src/validationEngine.js';

const STORAGE_KEY = 'boundaryml_mvp_state_v3';

function initialState() {
  const exampleProject = createExampleProject();
  return {
    runtimeMode: 'local_demo',
    serverAvailable: false,
    currentPage: 'projects',
    projects: [exampleProject],
    activeProjectId: exampleProject.id,
    selectedNodeId: exampleProject.workflow.nodes[0]?.id || null,
    validationResults: validateWorkflow(exampleProject.workflow, exampleProject.assets),
    activeNodeDetailTab: 'overview',
    aiEdit: { open: false, request: '', diff: null },
    exportPreviewType: 'workflowSpec',
    studioFilter: { mode: 'all', risk: 'all' },
    assetsFilter: { type: 'prompt', phase: 'all', status: 'all' },
    selectedAsset: null,
  };
}

function hydrateState(parsed) {
  const base = initialState();
  return {
    ...base,
    ...parsed,
    studioFilter: { ...base.studioFilter, ...(parsed.studioFilter || {}) },
    assetsFilter: { ...base.assetsFilter, ...(parsed.assetsFilter || {}) },
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    return hydrateState(JSON.parse(raw));
  } catch {
    return initialState();
  }
}

let state = loadState();
const listeners = new Set();

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getState() {
  return state;
}

export function setState(updater) {
  const nextState = typeof updater === 'function' ? updater(state) : updater;
  state = nextState;
  persist();
  listeners.forEach((listener) => listener(state));
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getActiveProject(st = state) {
  return st.projects.find((project) => project.id === st.activeProjectId);
}

export function recomputeValidation(project) {
  return validateWorkflow(project.workflow, project.assets);
}

export function replaceActiveProject(updatedProject) {
  setState((prev) => {
    const projects = prev.projects.map((project) => (project.id === updatedProject.id ? updatedProject : project));
    return {
      ...prev,
      projects,
      validationResults: recomputeValidation(updatedProject),
    };
  });
}

export function setRuntimeMode(runtimeMode, serverAvailable) {
  setState((prev) => ({
    ...prev,
    runtimeMode,
    serverAvailable,
  }));
}

if (!state.projects?.length) {
  state = initialState();
}
