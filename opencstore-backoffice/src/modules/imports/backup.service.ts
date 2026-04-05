/**
 * src/modules/imports/backup.service.ts
 *
 * Renderer-side types and helpers for backup operations.
 * Actual backup creation happens in the main process via ImportService.
 */

export interface BackupManifestRecord {
  id:             string;
  backup_type:    string;
  file_path:      string;
  file_size_bytes: number | null;
  checksum:       string | null;
  source_adapter: string;
  status:         string;
  notes:          string | null;
  created_at:     string;
  completed_at:   string | null;
}

/**
 * Returns a human-friendly description of why a backup is required.
 * Used in confirmation dialogs before any write-back workflow.
 */
export function backupRequiredMessage(actionLabel: string): string {
  return (
    `Before ${actionLabel}, a backup snapshot must be created. ` +
    `This ensures you can roll back if anything goes wrong. ` +
    `Click "Create Backup" to proceed, or cancel to abort.`
  );
}
