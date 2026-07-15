const migrations = new Map();

export function registerMigration(fromVersion, toVersion, fn) {
  migrations.set(`${fromVersion}->${toVersion}`, fn);
}

export function detectSchemaVersion(object) {
  return object?.schema_version || object?.schemaVersion || null;
}

export function migrateObjectIfNeeded(object) {
  const fromVersion = detectSchemaVersion(object);
  if (!fromVersion) return object;
  if (fromVersion === '0.1' || fromVersion === 'roleunion-schema-v0.1') return object;
  const key = `${fromVersion}->0.1`;
  const fn = migrations.get(key);
  if (!fn) {
    const err = new Error('This object schema version is not supported by the current RoleUnion runtime.');
    err.code = 'SCHEMA_VERSION_UNSUPPORTED';
    throw err;
  }
  try {
    return fn(object);
  } catch (e) {
    const err = new Error(e.message || 'Schema migration failed');
    err.code = 'SCHEMA_MIGRATION_FAILED';
    throw err;
  }
}

registerMigration('0.1', '0.1', (obj) => obj);
