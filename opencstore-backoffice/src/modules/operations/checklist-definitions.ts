/**
 * src/modules/operations/checklist-definitions.ts
 *
 * Step templates for every built-in checklist type.
 * The operations service instantiates these into checklist_steps rows.
 * Operators can add custom steps in a future settings screen.
 */

export type ChecklistType = 'shift_open' | 'shift_close' | 'day_close' | 'shift_handoff';

export interface ChecklistStepTemplate {
  stepKey:        string;
  stepLabel:      string;
  requiresAmount: boolean;   // true = show a numeric input (cash counts etc.)
  requiresNote:   boolean;   // true = show a text note field
  isOptional:     boolean;
}

export const CHECKLIST_TEMPLATES: Record<ChecklistType, { label: string; steps: ChecklistStepTemplate[] }> = {

  shift_open: {
    label: 'Shift Open',
    steps: [
      { stepKey: 'count_opening_drawer',  stepLabel: 'Count and verify opening cash drawer',          requiresAmount: true,  requiresNote: false, isOptional: false },
      { stepKey: 'check_receipt_paper',   stepLabel: 'Check receipt paper in printer',                requiresAmount: false, requiresNote: false, isOptional: false },
      { stepKey: 'check_lottery',         stepLabel: 'Verify lottery ticket dispensers are stocked',   requiresAmount: false, requiresNote: true,  isOptional: true  },
      { stepKey: 'check_tobacco_stock',   stepLabel: 'Verify tobacco stock behind counter',            requiresAmount: false, requiresNote: false, isOptional: false },
      { stepKey: 'read_prev_notes',       stepLabel: 'Review notes from previous shift',               requiresAmount: false, requiresNote: true,  isOptional: false },
      { stepKey: 'confirm_register_open', stepLabel: 'Confirm register is open and balanced',          requiresAmount: false, requiresNote: false, isOptional: false },
    ],
  },

  shift_close: {
    label: 'Shift Close',
    steps: [
      { stepKey: 'review_voids',        stepLabel: 'Review voids and refunds this shift',              requiresAmount: false, requiresNote: true,  isOptional: false },
      { stepKey: 'count_cash_drawer',   stepLabel: 'Count cash in drawer',                             requiresAmount: true,  requiresNote: false, isOptional: false },
      { stepKey: 'safe_drop',           stepLabel: 'Perform safe drop – record amount',                requiresAmount: true,  requiresNote: false, isOptional: false },
      { stepKey: 'record_over_short',   stepLabel: 'Record over/short amount',                         requiresAmount: true,  requiresNote: true,  isOptional: false },
      { stepKey: 'lottery_settle',      stepLabel: 'Settle lottery (if required)',                     requiresAmount: false, requiresNote: true,  isOptional: true  },
      { stepKey: 'notes_for_next',      stepLabel: 'Leave notes for incoming shift',                   requiresAmount: false, requiresNote: true,  isOptional: false },
      { stepKey: 'secure_handoff',      stepLabel: 'Secure area and confirm handoff',                  requiresAmount: false, requiresNote: false, isOptional: false },
    ],
  },

  day_close: {
    label: 'Day Close',
    steps: [
      { stepKey: 'all_shifts_closed',   stepLabel: 'Confirm all shifts are closed',                    requiresAmount: false, requiresNote: false, isOptional: false },
      { stepKey: 'count_safe',          stepLabel: 'Count and record safe total',                       requiresAmount: true,  requiresNote: false, isOptional: false },
      { stepKey: 'run_eod_report',      stepLabel: 'Run end-of-day report in back office',              requiresAmount: false, requiresNote: false, isOptional: false },
      { stepKey: 'fuel_reconciliation', stepLabel: 'Fuel reconciliation (if applicable)',               requiresAmount: false, requiresNote: true,  isOptional: true  },
      { stepKey: 'lottery_close_out',   stepLabel: 'Lottery close-out',                                requiresAmount: false, requiresNote: true,  isOptional: true  },
      { stepKey: 'prepare_deposit',     stepLabel: 'Prepare bank deposit',                             requiresAmount: true,  requiresNote: false, isOptional: false },
      { stepKey: 'manager_signoff',     stepLabel: 'Manager review and sign-off',                      requiresAmount: false, requiresNote: true,  isOptional: false },
      { stepKey: 'backup_confirm',      stepLabel: 'Confirm back-office data backup completed',         requiresAmount: false, requiresNote: false, isOptional: false },
    ],
  },

  shift_handoff: {
    label: 'Shift Handoff',
    steps: [
      { stepKey: 'count_drawer',        stepLabel: 'Count drawer together with incoming cashier',      requiresAmount: true,  requiresNote: false, isOptional: false },
      { stepKey: 'review_exceptions',   stepLabel: 'Review any exceptions or voids',                   requiresAmount: false, requiresNote: true,  isOptional: false },
      { stepKey: 'stock_check',         stepLabel: 'Quick stock check – flag any low items',            requiresAmount: false, requiresNote: true,  isOptional: true  },
      { stepKey: 'handoff_notes',       stepLabel: 'Share notes with incoming cashier',                 requiresAmount: false, requiresNote: true,  isOptional: false },
      { stepKey: 'both_initials',       stepLabel: 'Both parties initial handoff',                     requiresAmount: false, requiresNote: false, isOptional: false },
    ],
  },
};

/** Return the step templates for the given checklist type (safe fallback to empty) */
export function getStepTemplates(type: ChecklistType): ChecklistStepTemplate[] {
  return CHECKLIST_TEMPLATES[type]?.steps ?? [];
}

/** Human-readable label for a checklist type */
export function checklistLabel(type: ChecklistType): string {
  return CHECKLIST_TEMPLATES[type]?.label ?? type;
}
