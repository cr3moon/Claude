/**
 * src/modules/imports/import.service.ts
 *
 * Renderer-side facade for import and backup operations.
 */

export interface ImportJobRecord {
  id:                 string;
  source_type:        string;
  adapter_type:       string;
  status:             string;
  records_total:      number;
  records_ok:         number;
  records_skipped:    number;
  records_error:      number;
  error_detail:       string | null;
  triggered_by_name:  string;
  created_at:         string;
  completed_at:       string | null;
}

export interface ImportSummary {
  jobId:          string;
  backupId:       string | null;
  recordsTotal:   number;
  recordsOk:      number;
  recordsSkipped: number;
  recordsError:   number;
  errors:         string[];
  dryRun:         boolean;
  completed:      boolean;
}

export const ImportService = {
  async runMockImport(): Promise<ImportSummary> {
    return window.electronAPI.runMockImport() as Promise<ImportSummary>;
  },

  async importFromFile(filePath: string, format: string): Promise<ImportSummary> {
    return window.electronAPI.importFromFile(filePath, format) as Promise<ImportSummary>;
  },

  /** Unlike the other two paths, this one has a real "not connected" precondition — surfaced as `{ error }` rather than thrown. */
  async importFromCommander(): Promise<ImportSummary | { error: string }> {
    return window.electronAPI.importFromCommander() as Promise<ImportSummary | { error: string }>;
  },

  async getHistory(): Promise<ImportJobRecord[]> {
    return window.electronAPI.getImportHistory() as Promise<ImportJobRecord[]>;
  },

  async openFileDialog(): Promise<{ canceled: boolean; filePaths: string[] }> {
    return window.electronAPI.openFileDialog();
  },
};
