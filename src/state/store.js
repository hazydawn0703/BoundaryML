import { createExampleProject } from '../domain/sampleProject.js';
import { validateWorkflow } from '../services/validationEngine.js';

const STORAGE_KEY = 'boundaryml_mvp_state_v2';

function initialState() {
  const exampleProject = createExampleProject();
  return {
    currentPage: 'projects',
    projects: [exampleProject],
    activeProjectId: exampleProject.id,
    selectedNodeId: exampleProject.workflow.nodes[0]?.id || null,
    validationResults: validateWorkflow(exampleProject.workflow, exampleProject.assets),
    activeNodeDetailTab: 'overview',
    aiEdit: { open: false, request: '', diff: null },
    exportPreviewType: 'workflowSpec',
  };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw);
    return parsed;
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

if (!state.projects?.length) {
  state = initialState();
}
