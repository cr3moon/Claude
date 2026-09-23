/**
 * LotteryService
 *
 * Instant/scratch-off ticket tracking: games catalog, physical books
 * (received → active → settled/returned), and count-based sales
 * reconciliation. A book's current_ticket_number is a derived running
 * total, advanced only by recordCount() — never edited directly, same
 * pattern as InventoryService's on_hand_qty.
 */

import { v4 as uuidv4 } from 'uuid';
import type { DatabaseService } from './DatabaseService';
import type { AuditLogger } from '../../audit/AuditLogger';
import { computeCount, type BookStatus } from '../../src/modules/lottery/lottery-rules';

export interface GameInput {
  gameNumber: string;
  name: string;
  ticketPrice: number;
  bookSize: number;
}

export interface LotterySalesSummaryRow {
  game_id: string;
  game_number: string;
  game_name: string;
  tickets_sold: number;
  sales_amount: number;
}

export class LotteryService {
  constructor(
    private db: DatabaseService,
    private audit: AuditLogger
  ) {}

  // ─── Games ──────────────────────────────────────────────────────────────

  listGames(storeId: string): unknown[] {
    return this.db.all(
      `SELECT * FROM lottery_games WHERE store_id=? AND is_active=1 ORDER BY game_number`,
      [storeId]
    );
  }

  createGame(storeId: string, userId: string, data: GameInput): string {
    if (!data.gameNumber?.trim()) throw new Error('Game number is required.');
    if (!data.name?.trim()) throw new Error('Game name is required.');
    if (!(data.ticketPrice > 0)) throw new Error('Ticket price must be greater than zero.');
    if (!(data.bookSize > 0)) throw new Error('Book size must be greater than zero.');

    const id = uuidv4();
    const now = new Date().toISOString();
    this.db.run(
      `INSERT INTO lottery_games(id,store_id,game_number,name,ticket_price,book_size,is_active,created_at,updated_at)
       VALUES(?,?,?,?,?,?,1,?,?)`,
      [id, storeId, data.gameNumber.trim(), data.name.trim(), data.ticketPrice, data.bookSize, now, now]
    );
    this.audit.log({
      storeId, userId,
      eventType: 'lottery', eventSubtype: 'game_created',
      description: `Lottery game #${data.gameNumber.trim()} "${data.name.trim()}" added.`,
    });
    return id;
  }

  // ─── Books ──────────────────────────────────────────────────────────────

  receiveBook(storeId: string, userId: string, gameId: string, bookNumber: string): string {
    const game = this.db.get<{ id: string }>('SELECT id FROM lottery_games WHERE id=? AND store_id=?', [gameId, storeId]);
    if (!game) throw new Error('Game not found.');
    if (!bookNumber?.trim()) throw new Error('Book number is required.');

    const id = uuidv4();
    const now = new Date().toISOString();
    try {
      this.db.run(
        `INSERT INTO lottery_books(id,store_id,game_id,book_number,status,current_ticket_number,received_at,created_by,created_at,updated_at)
         VALUES(?,?,?,?,'received',0,?,?,?,?)`,
        [id, storeId, gameId, bookNumber.trim(), now, userId, now, now]
      );
    } catch (err) {
      throw new Error(`Book ${bookNumber.trim()} already exists for this game.`);
    }
    return id;
  }

  activateBook(bookId: string, storeId: string, userId: string): void {
    const book = this.db.get<{ status: BookStatus }>('SELECT status FROM lottery_books WHERE id=? AND store_id=?', [bookId, storeId]);
    if (!book) throw new Error('Book not found.');
    if (book.status !== 'received') throw new Error(`Only a received book can be activated (this one is ${book.status}).`);

    const now = new Date().toISOString();
    this.db.run(`UPDATE lottery_books SET status='active', activated_at=?, updated_at=? WHERE id=?`, [now, now, bookId]);
    this.audit.log({
      storeId, userId,
      eventType: 'lottery', eventSubtype: 'book_activated',
      description: `Lottery book ${bookId} activated.`, entityId: bookId,
    });
  }

  /**
   * Records a ticket count for an active book: validates the count against
   * the book's last recorded number and size, writes the count row, and
   * advances the book's running total — auto-settling it if the count
   * reaches book size.
   */
  recordCount(bookId: string, storeId: string, userId: string, ticketNumber: number): void {
    const book = this.db.get<{
      status: BookStatus; current_ticket_number: number; game_id: string;
    }>('SELECT status, current_ticket_number, game_id FROM lottery_books WHERE id=? AND store_id=?', [bookId, storeId]);
    if (!book) throw new Error('Book not found.');
    if (book.status !== 'active') throw new Error(`Only an active book can be counted (this one is ${book.status}).`);

    const game = this.db.get<{ book_size: number; ticket_price: number }>(
      'SELECT book_size, ticket_price FROM lottery_games WHERE id=?', [book.game_id]
    );
    if (!game) throw new Error('Game not found.');

    const result = computeCount(book.current_ticket_number, ticketNumber, game.book_size, game.ticket_price);
    const now = new Date().toISOString();

    this.db.transaction(() => {
      this.db.run(
        `INSERT INTO lottery_counts(id,store_id,book_id,ticket_number,tickets_sold,sales_amount,counted_by,counted_at)
         VALUES(?,?,?,?,?,?,?,?)`,
        [uuidv4(), storeId, bookId, ticketNumber, result.ticketsSold, result.salesAmount, userId, now]
      );
      if (result.isComplete) {
        this.db.run(`UPDATE lottery_books SET current_ticket_number=?, status='settled', settled_at=?, updated_at=? WHERE id=?`,
          [ticketNumber, now, now, bookId]);
      } else {
        this.db.run(`UPDATE lottery_books SET current_ticket_number=?, updated_at=? WHERE id=?`,
          [ticketNumber, now, bookId]);
      }
    });

    this.audit.log({
      storeId, userId,
      eventType: 'lottery', eventSubtype: 'count_recorded',
      description: `Lottery book ${bookId} counted: ${result.ticketsSold} ticket(s) sold ($${result.salesAmount.toFixed(2)})${result.isComplete ? ' — book settled.' : ''}`,
      entityId: bookId,
    });
  }

  returnBook(bookId: string, storeId: string, userId: string): void {
    const book = this.db.get<{ status: BookStatus }>('SELECT status FROM lottery_books WHERE id=? AND store_id=?', [bookId, storeId]);
    if (!book) throw new Error('Book not found.');
    if (book.status === 'settled' || book.status === 'returned') throw new Error(`Book is already ${book.status}.`);

    const now = new Date().toISOString();
    this.db.run(`UPDATE lottery_books SET status='returned', updated_at=? WHERE id=?`, [now, bookId]);
    this.audit.log({
      storeId, userId,
      eventType: 'lottery', eventSubtype: 'book_returned',
      description: `Lottery book ${bookId} returned to distributor.`, entityId: bookId,
    });
  }

  listBooks(storeId: string): unknown[] {
    return this.db.all(
      `SELECT b.*, g.game_number, g.name as game_name, g.ticket_price, g.book_size
       FROM lottery_books b JOIN lottery_games g ON g.id = b.game_id
       WHERE b.store_id=? ORDER BY b.created_at DESC`,
      [storeId]
    );
  }

  // ─── Reporting ──────────────────────────────────────────────────────────

  getSalesSummary(storeId: string, startDate: string, endDate: string): LotterySalesSummaryRow[] {
    return this.db.all<LotterySalesSummaryRow>(
      `SELECT g.id as game_id, g.game_number, g.name as game_name,
              COALESCE(SUM(c.tickets_sold), 0) as tickets_sold,
              COALESCE(SUM(c.sales_amount), 0) as sales_amount
       FROM lottery_games g
       LEFT JOIN lottery_books b ON b.game_id = g.id
       LEFT JOIN lottery_counts c ON c.book_id = b.id AND c.counted_at BETWEEN ? AND ?
       WHERE g.store_id=?
       GROUP BY g.id
       HAVING tickets_sold > 0
       ORDER BY g.game_number`,
      [startDate, endDate, storeId]
    );
  }
}
