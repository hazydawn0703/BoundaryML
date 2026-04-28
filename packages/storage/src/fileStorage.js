import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname } from 'node:path';

export class FileStorage {
  constructor(filePath) {
    this.filePath = filePath;
  }

  get(defaultValue = null) {
    if (!existsSync(this.filePath)) return defaultValue;
    return JSON.parse(readFileSync(this.filePath, 'utf-8'));
  }

  set(value) {
    mkdirSync(dirname(this.filePath), { recursive: true });
    writeFileSync(this.filePath, JSON.stringify(value, null, 2));
  }

  remove() {
    if (existsSync(this.filePath)) unlinkSync(this.filePath);
  }
}
