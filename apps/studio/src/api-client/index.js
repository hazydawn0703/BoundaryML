function resolveBaseUrl() {
  const viteBaseUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_BOUNDARYML_API_BASE_URL : undefined;
  return viteBaseUrl || window.BOUNDARYML_API_BASE_URL || '/api';
}

class ApiError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ApiError';
    Object.assign(this, details);
  }
}

async function request(path, options = {}) {
  const baseUrl = resolveBaseUrl();
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      headers: { 'content-type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
  } catch (error) {
    throw new ApiError('Server unavailable', { code: 'SERVER_UNAVAILABLE', cause: error });
  }

  let envelope;
  try {
    envelope = await response.json();
  } catch {
    throw new ApiError('Invalid server response', { code: 'INVALID_ENVELOPE', status: response.status });
  }

  if (!response.ok || !envelope?.ok) {
    const message = envelope?.error?.message || `HTTP ${response.status}`;
    throw new ApiError(message, {
      code: envelope?.error?.code || 'HTTP_ERROR',
      details: envelope?.error?.details || [],
      requestId: envelope?.meta?.requestId,
      generatedAt: envelope?.meta?.generatedAt,
      status: response.status,
    });
  }

  return {
    data: envelope.data,
    meta: {
      requestId: envelope?.meta?.requestId,
      generatedAt: envelope?.meta?.generatedAt,
    },
  };
}

const get = (path) => request(path);
const post = (path, body = {}) => request(path, { method: 'POST', body: JSON.stringify(body) });
const patch = (path, body = {}) => request(path, { method: 'PATCH', body: JSON.stringify(body) });
const put = (path, body = {}) => request(path, { method: 'PUT', body: JSON.stringify(body) });
const del = (path) => request(path, { method: 'DELETE' });

export const healthApi = { check: () => get('/health') };
export const projectsApi = {
  list: () => get('/projects'),
  create: (payload) => post('/projects', payload),
  getById: (projectId) => get(`/projects/${projectId}`),
  update: (projectId, payload) => patch(`/projects/${projectId}`, payload),
  remove: (projectId) => del(`/projects/${projectId}`),
};
export const contextPackApi = {
  get: (projectId) => get(`/projects/${projectId}/context-pack`),
  save: (projectId, payload) => put(`/projects/${projectId}/context-pack`, payload),
  summarize: (projectId) => post(`/projects/${projectId}/context-pack/summarize`, {}),
  refreshImpact: (projectId) => post(`/projects/${projectId}/context-pack/refresh-impact`, {}),
};
export const workflowApi = {
  get: (projectId) => get(`/projects/${projectId}/workflow`),
  generate: (projectId) => post(`/projects/${projectId}/workflow/generate`, {}),
  validate: (projectId) => post(`/projects/${projectId}/workflow/validate`, {}),
  history: (projectId) => get(`/projects/${projectId}/workflow/history`),
  version: (projectId, version) => get(`/projects/${projectId}/workflow/versions/${version}`),
};
export const nodesApi = {
  patch: (projectId, nodeId, payload) => patch(`/projects/${projectId}/nodes/${nodeId}`, payload),
  generatePrompt: (projectId, nodeId) => post(`/projects/${projectId}/nodes/${nodeId}/generate-prompt`, {}),
  generateChecklist: (projectId, nodeId) => post(`/projects/${projectId}/nodes/${nodeId}/generate-checklist`, {}),
};
export const jobsApi = {
  list: (projectId) => get(`/projects/${projectId}/jobs`),
  get: (projectId, jobId) => get(`/projects/${projectId}/jobs/${jobId}`),
  retry: (projectId, jobId) => post(`/projects/${projectId}/jobs/${jobId}/retry`, {}),
  cancel: (projectId, jobId) => post(`/projects/${projectId}/jobs/${jobId}/cancel`, {}),
};
export const modelApi = {
  status: () => get('/model/status'),
  test: () => post('/model/test', {}),
  calls: () => get('/model/calls'),
};
export const assetsApi = { list: (projectId) => get(`/projects/${projectId}/assets`) };
export const executionKitsApi = {
  preview: (projectId) => post(`/projects/${projectId}/execution-kits/preview`, {}),
  generate: (projectId) => post(`/projects/${projectId}/execution-kits/generate`, {}),
  get: (projectId, kitId) => get(`/projects/${projectId}/execution-kits/${kitId}`),
};

export const apiClient = {
  request,
  resolveBaseUrl,
  ApiError,
  healthApi,
  projectsApi,
  contextPackApi,
  workflowApi,
  nodesApi,
  jobsApi,
  modelApi,
  assetsApi,
  executionKitsApi,
};
