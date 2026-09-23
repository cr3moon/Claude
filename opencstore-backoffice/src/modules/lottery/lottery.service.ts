/**
 * src/modules/lottery/lottery.service.ts
 *
 * Renderer-side facade for the Lottery IPC handlers. Mirrors
 * src/modules/inventory/inventory.service.ts: every write returns either a
 * success shape or { error } — never throws over IPC — so unwrap() turns
 * that into a thrown Error for callers to catch.
 */

export interface LotteryGame {
  id: string;
  store_id: string;
  game_number: string;
  name: string;
  ticket_price: number;
  book_size: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export interface GameInput {
  gameNumber: string;
  name: string;
  ticketPrice: number;
  bookSize: number;
}

export type BookStatus = 'received' | 'active' | 'settled' | 'returned';

export interface LotteryBook {
  id: string;
  store_id: string;
  game_id: string;
  game_number: string;
  game_name: string;
  ticket_price: number;
  book_size: number;
  book_number: string;
  status: BookStatus;
  current_ticket_number: number;
  received_at: string;
  activated_at: string | null;
  settled_at: string | null;
  created_at: string;
}

type Result<T> = T | { error: string };

function unwrap<T>(result: Result<T>): T {
  if (result && typeof result === 'object' && 'error' in result) {
    throw new Error((result as { error: string }).error);
  }
  return result as T;
}

export const LotteryService = {
  async listGames(): Promise<LotteryGame[]> {
    return window.electronAPI.lotteryListGames() as Promise<LotteryGame[]>;
  },

  async createGame(data: GameInput): Promise<string> {
    const result = await window.electronAPI.lotteryCreateGame(data);
    return unwrap(result as Result<{ success: true; id: string }>).id;
  },

  async receiveBook(gameId: string, bookNumber: string): Promise<string> {
    const result = await window.electronAPI.lotteryReceiveBook({ gameId, bookNumber });
    return unwrap(result as Result<{ success: true; id: string }>).id;
  },

  async activateBook(bookId: string): Promise<void> {
    unwrap(await window.electronAPI.lotteryActivateBook(bookId));
  },

  async recordCount(bookId: string, ticketNumber: number): Promise<void> {
    unwrap(await window.electronAPI.lotteryRecordCount({ bookId, ticketNumber }));
  },

  async returnBook(bookId: string): Promise<void> {
    unwrap(await window.electronAPI.lotteryReturnBook(bookId));
  },

  async listBooks(): Promise<LotteryBook[]> {
    return window.electronAPI.lotteryListBooks() as Promise<LotteryBook[]>;
  },
};
