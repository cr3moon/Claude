/**
 * src/modules/operations/operations.service.ts
 *
 * Renderer-side facade for checklist operations.
 */

import type { ChecklistType } from './checklist-definitions';

export interface ShiftRecord {
  id:              string;
  store_id:        string;
  cashier_user_id: string | null;
  cashier_name:    string | null;
  status:          'open' | 'closed';
  opened_at:       string;
  closed_at:       string | null;
}

export interface ChecklistRecord {
  id:                 string;
  checklist_type:     ChecklistType;
  operator_name:      string;
  operator_initials:  string;
  started_at:         string;
  completed_at:       string | null;
  is_complete:        number;
  over_short_amount:  number;
  manager_notes:      string | null;
}

export interface ChecklistStep {
  id:              string;
  checklist_id:    string;
  step_key:        string;
  step_label:      string;
  step_order:      number;
  completed:       number;
  completed_at:    string | null;
  completed_by:    string | null;
  notes:           string | null;
  numeric_value:   number | null;
}

export const OperationsService = {
  async getShifts(): Promise<ShiftRecord[]> {
    return window.electronAPI.getShifts() as Promise<ShiftRecord[]>;
  },

  async openShift(): Promise<{ id: string; status: string; opened_at: string }> {
    return window.electronAPI.openShift();
  },

  async closeShift(shiftId: string): Promise<void> {
    await window.electronAPI.closeShift(shiftId);
  },

  async startChecklist(
    templateId: ChecklistType
  ): Promise<{ id: string; templateId: string; steps: { key: string; label: string }[] }> {
    return window.electronAPI.startChecklist(templateId) as Promise<{
      id: string; templateId: string; steps: { key: string; label: string }[];
    }>;
  },

  async createChecklist(
    type: ChecklistType,
    operatorName: string,
    operatorInitials: string,
    shiftId?: string
  ): Promise<{ id: string; steps: ChecklistStep[] }> {
    return window.electronAPI.createChecklist({
      checklistType: type,
      operatorName,
      operatorInitials,
      shiftId,
    }) as Promise<{ id: string; steps: ChecklistStep[] }>;
  },

  async getChecklist(id: string): Promise<{ checklist: ChecklistRecord; steps: ChecklistStep[] }> {
    return window.electronAPI.getChecklist(id) as Promise<{ checklist: ChecklistRecord; steps: ChecklistStep[] }>;
  },

  async completeStep(stepId: string, value?: number, notes?: string): Promise<void> {
    await window.electronAPI.completeStep({ stepId, value, notes });
  },

  async finalize(checklistId: string, notes?: string, overShort?: number): Promise<void> {
    await window.electronAPI.finalizeChecklist({ checklistId, notes, overShort });
  },

  async getHistory(): Promise<ChecklistRecord[]> {
    return window.electronAPI.getChecklistHistory() as Promise<ChecklistRecord[]>;
  },
};
