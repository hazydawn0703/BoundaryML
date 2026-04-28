function resolveBaseUrl() {
  return window.BOUNDARYML_API_BASE_URL || '/api';
}

async function request(path, options = {}, baseUrl = resolveBaseUrl()) {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const envelope = await response.json();
  if (!envelope.ok) throw new Error(envelope.error?.message || 'API error');
  return envelope.data;
}

export const apiClient = {
  health: () => request('/health', {}, ''),
  listProjects: () => request('/projects'),
  getExampleProject: () => request('/projects/example'),
};
