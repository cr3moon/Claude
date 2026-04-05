/**
 * src/modules/reports/report.service.ts
 *
 * Renderer-side facade for report generation and archive retrieval.
 */

import type { ReportType } from './report-definitions';

export interface ReportParams {
  reportType: ReportType;
  startDate:  string;  // YYYY-MM-DD
  endDate:    string;
  shiftId?:   string;
  cashierId?: string;
}

export interface ReportResult {
  id:   string;
  data: unknown;
}

export interface ArchivedReport {
  id:                  string;
  report_type:         ReportType;
  report_period_start: string;
  report_period_end:   string;
  generated_by:        string;
  created_at:          string;
}

export const ReportService = {
  async generate(params: ReportParams): Promise<ReportResult> {
    return window.electronAPI.generateReport(params) as Promise<ReportResult>;
  },

  async getArchive(): Promise<ArchivedReport[]> {
    return window.electronAPI.getReportArchive() as Promise<ArchivedReport[]>;
  },

  async getById(id: string): Promise<{ data_snapshot: string } & ArchivedReport> {
    return window.electronAPI.getReportById(id) as Promise<{ data_snapshot: string } & ArchivedReport>;
  },
};
