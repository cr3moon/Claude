/**
 * TransactionSyncService
 *
 * Pulls Commander's closed daily T-Log (`vtransset`, via
 * CommanderNaxmlClient.getTransactionSet, parsed by t-log-parser.ts) and
 * persists each sale/network-sale ticket into transactions/
 * transaction_items — the tables this app's Reports already query but
 * that have never had a live feed to populate them (see schema.sql's note
 * above manual_sales_entries). This is the first one.
 *
 * Idempotent by design: pos_txn_id is Commander's own trUniqueSN, unique
 * per store (idx_transactions_pos_txn_unique), so re-running the same
 * closed period is a safe no-op for tickets already imported.
 *
 * See t-log-parser.ts's doc comment: this surface is the least-verified
 * in the app. Treat imported totals as provisional until confirmed
 * against a real unit's numbers (e.g. cross-check against the Ruby
 * summary report ReconciliationService already pulls for the same date).
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseService } from './DatabaseService';
import type { AuditLogger } from '../../audit/AuditLogger';
import type { CommanderNaxmlClient } from '../../integrations/commander/CommanderNaxmlClient';
import { findPeriodsForDate } from '../../src/modules/reconciliation/reconciliation-rules';

export interface TransactionSyncResult {
  periodFilename: string;
  ticketCount: number;
  imported: number;
  alreadyImported: number;
  voidCount: number;
}

export interface TransactionRow {
  id: string;
  pos_txn_id: string;
  txn_type: string;
  txn_at: string;
  subtotal: number;
  tax_total: number;
  total: number;
  source_raw: string | null;
}

export interface TransactionItemRow {
  id: string;
  transaction_id: string;
  pos_plu_id: string | null;
  description: string | null;
  quantity: number;
  unit_price: number;
  ext_price: number;
  is_fuel: number;
}

export class TransactionSyncService {
  constructor(
    private db: DatabaseService,
    private audit: AuditLogger
  ) {}

  /**
   * Imports the closed DAILY T-Log for `dateIso` (or the still-open
   * `current` period when `dateIso` is today). Returns null if no
   * matching Commander period exists yet.
   */
  async importDailyTransactions(
    client: CommanderNaxmlClient,
    storeId: string,
    userId: string,
    dateIso: string,
    todayIso: string
  ): Promise<TransactionSyncResult | null> {
    const periods = await client.getTlogPeriods();
    const [period] = findPeriodsForDate(periods, 2, dateIso, todayIso);
    if (!period) return null;

    const transSet = await client.getTransactionSet(period.filename, period.period);
    const now = new Date().toISOString();

    let imported = 0;
    let alreadyImported = 0;

    this.db.transaction(() => {
      for (const ticket of transSet.tickets) {
        if (!ticket.uniqueId) continue; // can't dedupe or reference this row later — skip rather than guess an id

        const txnId = uuidv4();
        const result = this.db.run(
          `INSERT INTO transactions(id, store_id, pos_txn_id, txn_type, txn_at, subtotal, discount_total, tax_total, total, source_raw, created_at)
           VALUES(?,?,?,?,?,?,?,?,?,?,?)
           ON CONFLICT(store_id, pos_txn_id) DO NOTHING`,
          [
            txnId, storeId, ticket.uniqueId, 'sale', ticket.date ?? now,
            ticket.totalNoTax, 0, ticket.totalTax, ticket.totalWithTax,
            JSON.stringify({ type: ticket.type, ticketNumber: ticket.ticketNumber, tenders: ticket.tenders }),
            now,
          ]
        );

        if (result.changes === 0) {
          alreadyImported += 1;
          continue;
        }
        imported += 1;

        for (const line of ticket.lines) {
          this.db.run(
            `INSERT INTO transaction_items(id, transaction_id, pos_plu_id, description, quantity, unit_price, ext_price, tax_amount, is_fuel, created_at)
             VALUES(?,?,?,?,?,?,?,?,?,?)`,
            [
              uuidv4(), txnId, line.upc, line.description, line.quantity,
              line.quantity !== 0 ? line.lineTotal / line.quantity : 0,
              line.lineTotal, 0, line.isFuel ? 1 : 0, now,
            ]
          );
        }
      }
    });

    this.audit.log({
      storeId, userId, eventType: 'commander', eventSubtype: 'tlog_imported',
      description: `Imported Commander T-Log for ${dateIso} (period ${period.filename}): ` +
        `${imported} new ticket(s), ${alreadyImported} already imported, ${transSet.voidCount} void(s).`,
    });

    return {
      periodFilename: period.filename,
      ticketCount: transSet.tickets.length,
      imported,
      alreadyImported,
      voidCount: transSet.voidCount,
    };
  }

  /** Tickets (with their line items) for a business date, newest first. */
  listTransactionsForDate(storeId: string, dateIso: string): Array<TransactionRow & { items: TransactionItemRow[] }> {
    const transactions = this.db.all<TransactionRow>(
      `SELECT id, pos_txn_id, txn_type, txn_at, subtotal, tax_total, total, source_raw
       FROM transactions WHERE store_id=? AND txn_at LIKE ? ORDER BY txn_at DESC`,
      [storeId, `${dateIso}%`]
    );

    return transactions.map((txn) => ({
      ...txn,
      items: this.db.all<TransactionItemRow>(
        `SELECT id, transaction_id, pos_plu_id, description, quantity, unit_price, ext_price, is_fuel
         FROM transaction_items WHERE transaction_id=?`,
        [txn.id]
      ),
    }));
  }
}
