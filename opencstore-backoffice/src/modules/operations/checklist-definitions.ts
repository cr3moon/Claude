/**
 * src/modules/operations/checklist-definitions.ts
 *
 * Step templates for every built-in checklist type.
 * The operations service instantiates these into checklist_steps rows.
 * Operators can add custom steps in a future settings screen.
 */

export type ChecklistType = 'shift_open' | 'shift_close' | 'day_close' | 'shift_handoff';

export interface ChecklistStepTemplate {
  key:            string;
  label:          string;
  order:          number;
  requiresAmount: boolean;   // true = show a numeric input (cash counts etc.)
  requiresNote:   boolean;   // true = show a text note field
  isOptional:     boolean;
}

export interface ChecklistTemplate {
  id:    ChecklistType;
  label: string;
  steps: ChecklistStepTemplate[];
}

function steps(defs: Omit<ChecklistStepTemplate, 'order'>[]): ChecklistStepTemplate[] {
  return defs.map((s, i) => ({ ...s, order: i }));
}

export const CHECKLIST_TEMPLATES: ChecklistTemplate[] = [

  {
    id: 'shift_open',
    label: 'Shift Open',
    steps: steps([
      { key: 'count_opening_drawer',  label: 'Count and verify opening cash drawer',          requiresAmount: true,  requiresNote: false, isOptional: false },
      { key: 'check_receipt_paper',   label: 'Check receipt paper in printer',                requiresAmount: false, requiresNote: false, isOptional: false },
      { key: 'check_lottery',         label: 'Verify lottery ticket dispensers are stocked',   requiresAmount: false, requiresNote: true,  isOptional: true  },
      { key: 'check_tobacco_stock',   label: 'Verify tobacco stock behind counter',            requiresAmount: false, requiresNote: false, isOptional: false },
      { key: 'read_prev_notes',       label: 'Review notes from previous shift',               requiresAmount: false, requiresNote: true,  isOptional: false },
      { key: 'confirm_register_open', label: 'Confirm register is open and balanced',          requiresAmount: false, requiresNote: false, isOptional: false },
    ]),
  },

  {
    id: 'shift_close',
    label: 'Shift Close',
    steps: steps([
      { key: 'review_voids',        label: 'Review voids and refunds this shift',              requiresAmount: false, requiresNote: true,  isOptional: false },
      { key: 'count_cash_drawer',   label: 'Count cash in drawer',                             requiresAmount: true,  requiresNote: false, isOptional: false },
      { key: 'safe_drop',           label: 'Perform safe drop – record amount',                requiresAmount: true,  requiresNote: false, isOptional: false },
      { key: 'record_over_short',   label: 'Record over/short amount',                         requiresAmount: true,  requiresNote: true,  isOptional: false },
      { key: 'lottery_settle',      label: 'Settle lottery (if required)',                     requiresAmount: false, requiresNote: true,  isOptional: true  },
      { key: 'notes_for_next',      label: 'Leave notes for incoming shift',                   requiresAmount: false, requiresNote: true,  isOptional: false },
      { key: 'secure_handoff',      label: 'Secure area and confirm handoff',                  requiresAmount: false, requiresNote: false, isOptional: false },
    ]),
  },

  {
    id: 'day_close',
    label: 'Day Close',
    steps: steps([
      { key: 'all_shifts_closed',   label: 'Confirm all shifts are closed',                    requiresAmount: false, requiresNote: false, isOptional: false },
      { key: 'count_safe',          label: 'Count and record safe total',                       requiresAmount: true,  requiresNote: false, isOptional: false },
      { key: 'run_eod_report',      label: 'Run end-of-day report in back office',              requiresAmount: false, requiresNote: false, isOptional: false },
      { key: 'fuel_reconciliation', label: 'Fuel reconciliation (if applicable)',               requiresAmount: false, requiresNote: true,  isOptional: true  },
      { key: 'lottery_close_out',   label: 'Lottery close-out',                                requiresAmount: false, requiresNote: true,  isOptional: true  },
      { key: 'prepare_deposit',     label: 'Prepare bank deposit',                             requiresAmount: true,  requiresNote: false, isOptional: false },
      { key: 'manager_signoff',     label: 'Manager review and sign-off',                      requiresAmount: false, requiresNote: true,  isOptional: false },
      { key: 'backup_confirm',      label: 'Confirm back-office data backup completed',         requiresAmount: false, requiresNote: false, isOptional: false },
    ]),
  },

  {
    id: 'shift_handoff',
    label: 'Shift Handoff',
    steps: steps([
      { key: 'count_drawer',        label: 'Count drawer together with incoming cashier',      requiresAmount: true,  requiresNote: false, isOptional: false },
      { key: 'review_exceptions',   label: 'Review any exceptions or voids',                   requiresAmount: false, requiresNote: true,  isOptional: false },
      { key: 'stock_check',         label: 'Quick stock check – flag any low items',            requiresAmount: false, requiresNote: true,  isOptional: true  },
      { key: 'handoff_notes',       label: 'Share notes with incoming cashier',                 requiresAmount: false, requiresNote: true,  isOptional: false },
      { key: 'both_initials',       label: 'Both parties initial handoff',                     requiresAmount: false, requiresNote: false, isOptional: false },
    ]),
  },
];

/** Return the step templates for the given checklist type (safe fallback to empty) */
export function getStepTemplates(type: string): ChecklistStepTemplate[] {
  return CHECKLIST_TEMPLATES.find(t => t.id === type)?.steps ?? [];
}

/** Human-readable label for a checklist type */
export function checklistLabel(type: string): string {
  return CHECKLIST_TEMPLATES.find(t => t.id === type)?.label ?? type;
}
