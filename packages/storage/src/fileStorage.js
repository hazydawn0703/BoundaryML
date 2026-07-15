import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';

function readJsonFile(filePath) {
  return JSON.parse(readFileSync(filePath, 'utf-8').replace(/^\uFEFF/, ''));
}

function waitSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function replaceFileWithRetry(tempPath, filePath) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      renameSync(tempPath, filePath);
      return;
    } catch (e) {
      lastError = e;
      if (!['EACCES', 'EBUSY', 'EPERM'].includes(e.code) || attempt === 4) throw e;
      try { if (existsSync(filePath)) unlinkSync(filePath); } catch {}
      waitSync(25 * (attempt + 1));
    }
  }
  throw lastError;
}

export class FileStorage {
  constructor(baseDir = '.roleunion-data') {
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
    try {
      writeFileSync(tempPath, JSON.stringify(data, null, 2));
      replaceFileWithRetry(tempPath, filePath);
    } catch (e) {
      try { if (existsSync(tempPath)) unlinkSync(tempPath); } catch {}
      const err = new Error(e.message || 'Storage write failed');
      err.code = 'STORAGE_WRITE_FAILED';
      throw err;
    }
  }

  listProjects(workspace_id) {
    const dir = this.projectsDir(workspace_id);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => name.endsWith('.json'))
      .map((name) => {
        try { return readJsonFile(join(dir, name)); } catch (e) { const err = new Error('Storage object corrupted'); err.code = 'STORAGE_OBJECT_CORRUPTED'; throw err; }
      });
  }

  getProject(workspace_id, project_id) {
    const file = this.projectFile(workspace_id, project_id);
    if (!existsSync(file)) return null;
    try { return readJsonFile(file); } catch (e) { const err = new Error('Storage object corrupted'); err.code = 'STORAGE_OBJECT_CORRUPTED'; throw err; }
  }

  saveProject(workspace_id, project) {
    if (project.workspace_id !== workspace_id) throw new Error('workspace_id mismatch');
    this.atomicWrite(this.projectFile(workspace_id, project.id), project);
    return project;
  }
}
