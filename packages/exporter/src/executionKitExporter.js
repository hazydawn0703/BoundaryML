export function exportExecutionKit(kit) {
  return {
    id: kit.id,
    kit_type: kit.kit_type || 'draft',
    exported_at: new Date().toISOString(),
    workflow_snapshot_version: kit.workflow_snapshot_version || kit.snapshotVersion,
    snapshotVersion: kit.snapshotVersion || kit.workflow_snapshot_version,
    files: kit.files || {},
    status: kit.status || 'draft_only',
    canExportFinal: Boolean(kit.canExportFinal),
    blockingErrors: kit.blockingErrors || kit.validation_summary?.blocking_final || 0,
    validation_summary: kit.validation_summary || {},
  };
}
