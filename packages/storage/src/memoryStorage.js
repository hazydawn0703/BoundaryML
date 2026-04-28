export class MemoryStorage {
  constructor() {
    this.projectsByWorkspace = new Map();
  }

  ensureWorkspace(workspace_id) {
    if (!workspace_id) throw new Error('workspace_id is required');
    if (!this.projectsByWorkspace.has(workspace_id)) {
      this.projectsByWorkspace.set(workspace_id, new Map());
    }
    return this.projectsByWorkspace.get(workspace_id);
  }

  listProjects(workspace_id) {
    return Array.from(this.ensureWorkspace(workspace_id).values());
  }

  getProject(workspace_id, project_id) {
    return this.ensureWorkspace(workspace_id).get(project_id) || null;
  }

  saveProject(workspace_id, project) {
    if (project.workspace_id !== workspace_id) throw new Error('workspace_id mismatch');
    this.ensureWorkspace(workspace_id).set(project.id, project);
    return project;
  }
}
