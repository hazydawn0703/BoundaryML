export function exportExecutionKit(kit) {
  return {
    exported_at: new Date().toISOString(),
    workflow_snapshot_version: kit.workflow_snapshot_version || kit.snapshotVersion,
    files: kit.files || {},
    status: kit.status || 'draft_only',
  };
}
