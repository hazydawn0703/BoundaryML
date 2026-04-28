import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';

export class FileStorage {
  constructor(baseDir = '.boundaryml-data') {
    this.baseDir = baseDir;
  }

  workspaceDir(workspace_id) {
    if (!workspace_id) throw new Error('workspace_id is required');
    return join(this.baseDir, 'workspaces', workspace_id);
  }

  projectsDir(workspace_id) {
    return join(this.workspaceDir(workspace_id), 'projects');
  }

  projectFile(workspace_id, project_id) {
    return join(this.projectsDir(workspace_id), `${project_id}.json`);
  }

  atomicWrite(filePath, data) {
    mkdirSync(dirname(filePath), { recursive: true });
    const tempPath = `${filePath}.tmp-${Date.now()}`;
    writeFileSync(tempPath, JSON.stringify(data, null, 2));
    renameSync(tempPath, filePath);
  }

  listProjects(workspace_id) {
    const dir = this.projectsDir(workspace_id);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => JSON.parse(readFileSync(join(dir, name), 'utf-8')));
  }

  getProject(workspace_id, project_id) {
    const file = this.projectFile(workspace_id, project_id);
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, 'utf-8'));
  }

  saveProject(workspace_id, project) {
    if (project.workspace_id !== workspace_id) throw new Error('workspace_id mismatch');
    this.atomicWrite(this.projectFile(workspace_id, project.id), project);
    return project;
  }
}
