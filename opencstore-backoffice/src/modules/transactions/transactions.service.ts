/**
 * src/modules/transactions/transactions.service.ts
 *
 * Renderer-side facade for the Commander T-Log sync IPC handlers.
 * Mirrors the other *.service.ts facades in this app.
 */

export interface TransactionSyncResult {
  periodFilename: string;
  ticketCount: number;
  imported: number;
  alreadyImported: number;
  voidCount: number;
}

export interface TransactionItem {
  id: string;
  pos_plu_id: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
  ext_price: number;
  is_fuel: number;
}

export interface Transaction {
  id: string;
  pos_txn_id: string;
  txn_type: string;
  txn_at: string;
  subtotal: number;
  tax_total: number;
  total: number;
  source_raw: string | null;
  items: TransactionItem[];
}

type Result<T> = T | { error: string };

function unwrap<T>(result: Result<T>): T {
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error((result as { error: string }).error);
  }
  return result as T;
}

export const TransactionsService = {
  async importDaily(dateIso: string): Promise<TransactionSyncResult> {
    const result = await window.electronAPI.transactionsImportDaily(dateIso);
    return unwrap(result as Result<{ success: true; result: TransactionSyncResult }>).result;
  },

  async listForDate(dateIso: string): Promise<Transaction[]> {
    return window.electronAPI.transactionsListForDate(dateIso) as unknown as Promise<Transaction[]>;
  },
};
