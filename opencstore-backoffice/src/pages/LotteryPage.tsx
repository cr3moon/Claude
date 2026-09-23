import React, { useEffect, useState } from 'react';
import PageHeader from '../components/common/PageHeader';
import StatusBadge from '../components/common/StatusBadge';
import EmptyState from '../components/common/EmptyState';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { fmtMoney } from '../lib/currency';
import { bookRemainingValue } from '../modules/lottery/lottery-rules';
import {
  LotteryService,
  type LotteryGame,
  type LotteryBook,
  type GameInput,
} from '../modules/lottery/lottery.service';

type Tab = 'books' | 'games';

export default function LotteryPage() {
  const [tab, setTab] = useState<Tab>('books');

  return (
    <>
      <PageHeader title="Lottery" subtitle="Instant ticket books and games" />

      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(['books', 'games'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-blue-600 text-blue-700' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'books' ? 'Books' : 'Games'}
          </button>
        ))}
      </div>

      {tab === 'books' && <BooksTab />}
      {tab === 'games' && <GamesTab />}
    </>
  );
}

// ─── Books ──────────────────────────────────────────────────────────────────

function BooksTab() {
  const [books, setBooks] = useState<LotteryBook[] | null>(null);
  const [games, setGames] = useState<LotteryGame[]>([]);
  const [receiving, setReceiving] = useState(false);
  const [countingBook, setCountingBook] = useState<LotteryBook | null>(null);
  const [confirmReturn, setConfirmReturn] = useState<LotteryBook | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const [b, g] = await Promise.all([LotteryService.listBooks(), LotteryService.listGames()]);
    setBooks(b);
    setGames(g);
  }

  useEffect(() => { load(); }, []);

  async function activate(book: LotteryBook) {
    setError(null);
    try {
      await LotteryService.activateBook(book.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function doReturn(book: LotteryBook) {
    setConfirmReturn(null);
    setError(null);
    try {
      await LotteryService.returnBook(book.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const activeCount = books?.filter(b => b.status === 'active').length ?? 0;
  const receivedCount = books?.filter(b => b.status === 'received').length ?? 0;
  const remainingValue = (books ?? [])
    .filter(b => b.status === 'active')
    .reduce((sum, b) => sum + bookRemainingValue(b.current_ticket_number, b.book_size, b.ticket_price), 0);

  if (!books) {
    return <div className="animate-pulse space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}</div>;
  }

  return (
    <>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="card">
          <p className="text-xs text-gray-500">Active Books</p>
          <p className="text-xl font-bold text-gray-900">{activeCount}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">Received, Not Activated</p>
          <p className="text-xl font-bold text-gray-900">{receivedCount}</p>
        </div>
        <div className="card">
          <p className="text-xs text-gray-500">Unsold Value (Active Books)</p>
          <p className="text-xl font-bold text-gray-900">{fmtMoney(remainingValue)}</p>
        </div>
      </div>

      <div className="mb-4">
        {receiving ? (
          <ReceiveBookForm games={games} onCancel={() => setReceiving(false)} onReceived={() => { setReceiving(false); load(); }} />
        ) : (
          <button className="btn-primary" onClick={() => setReceiving(true)} disabled={games.length === 0}>
            Receive Book
          </button>
        )}
        {games.length === 0 && !receiving && (
          <p className="text-xs text-gray-400 mt-1">Add a game first, on the Games tab.</p>
        )}
        {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
      </div>

      {books.length === 0 ? (
        <EmptyState title="No books yet" description="Books you receive will show up here." icon="★" />
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="table-base w-full text-xs">
            <thead>
              <tr>
                <th className="text-left">Game</th>
                <th className="text-left">Book #</th>
                <th className="text-right">Sold / Size</th>
                <th className="text-right">Remaining Value</th>
                <th className="text-left">Status</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {books.map(b => (
                <tr key={b.id}>
                  <td>{b.game_number} — {b.game_name}</td>
                  <td className="font-mono">{b.book_number}</td>
                  <td className="text-right tabular-nums">{b.current_ticket_number} / {b.book_size}</td>
                  <td className="text-right tabular-nums">{fmtMoney(bookRemainingValue(b.current_ticket_number, b.book_size, b.ticket_price))}</td>
                  <td>
                    <StatusBadge label={b.status} status={b.status === 'settled' ? 'approved' : b.status === 'active' ? 'ok' : b.status === 'returned' ? 'rejected' : 'pending'} />
                  </td>
                  <td className="text-right">
                    <div className="flex justify-end gap-2">
                      {b.status === 'received' && (
                        <button className="text-blue-600 hover:underline" onClick={() => activate(b)}>Activate</button>
                      )}
                      {b.status === 'active' && (
                        <>
                          <button className="text-blue-600 hover:underline" onClick={() => setCountingBook(b)}>Count</button>
                          <button className="text-red-600 hover:underline" onClick={() => setConfirmReturn(b)}>Return</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {countingBook && (
        <CountDialog book={countingBook} onClose={() => setCountingBook(null)} onSaved={() => { setCountingBook(null); load(); }} />
      )}

      <ConfirmDialog
        open={confirmReturn !== null}
        title="Return this book?"
        message="Marks the book as returned to the distributor. This cannot be undone from here."
        variant="danger"
        confirmLabel="Return"
        onConfirm={() => confirmReturn && doReturn(confirmReturn)}
        onCancel={() => setConfirmReturn(null)}
      />
    </>
  );
}

function ReceiveBookForm({ games, onCancel, onReceived }: { games: LotteryGame[]; onCancel: () => void; onReceived: () => void }) {
  const [gameId, setGameId] = useState(games[0]?.id ?? '');
  const [bookNumber, setBookNumber] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!gameId) { setError('Choose a game.'); return; }
    if (!bookNumber.trim()) { setError('Enter the book number.'); return; }
    setSaving(true);
    setError(null);
    try {
      await LotteryService.receiveBook(gameId, bookNumber.trim());
      onReceived();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="card space-y-3 max-w-md">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Game</label>
        <select className="input w-full" value={gameId} onChange={e => setGameId(e.target.value)}>
          {games.map(g => <option key={g.id} value={g.id}>{g.game_number} — {g.name}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Book Number</label>
        <input type="text" className="input w-full" value={bookNumber} onChange={e => setBookNumber(e.target.value)} />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      <div className="flex gap-3">
        <button className="btn-primary disabled:opacity-50" disabled={saving} onClick={save}>
          {saving ? 'Saving…' : 'Receive Book'}
        </button>
        <button className="text-sm text-gray-500" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function CountDialog({ book, onClose, onSaved }: { book: LotteryBook; onClose: () => void; onSaved: () => void }) {
  const [ticketNumber, setTicketNumber] = useState(String(book.current_ticket_number));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    const n = Number(ticketNumber);
    if (!Number.isFinite(n)) { setError('Enter a valid ticket number.'); return; }
    setSaving(true);
    setError(null);
    try {
      await LotteryService.recordCount(book.id, n);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div className="relative z-10 w-full max-w-sm rounded-xl bg-white shadow-xl p-6 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Count: {book.game_name} #{book.book_number}</h2>
        <p className="text-xs text-gray-500">Last recorded: {book.current_ticket_number} of {book.book_size} sold</p>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Current Ticket Count</label>
          <input
            type="number" step="1" min={book.current_ticket_number} max={book.book_size}
            className="input w-full" value={ticketNumber} onChange={e => setTicketNumber(e.target.value)}
          />
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-3 pt-2">
          <button className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary disabled:opacity-50" disabled={saving} onClick={save}>
            {saving ? 'Saving…' : 'Save Count'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Games ──────────────────────────────────────────────────────────────────

function GamesTab() {
  const [games, setGames] = useState<LotteryGame[] | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<GameInput>({ gameNumber: '', name: '', ticketPrice: 1, bookSize: 60 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setGames(await LotteryService.listGames());
  }

  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await LotteryService.createGame(form);
      setForm({ gameNumber: '', name: '', ticketPrice: 1, bookSize: 60 });
      setAdding(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (!games) {
    return <div className="animate-pulse space-y-2">{[1, 2].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}</div>;
  }

  return (
    <>
      <div className="mb-4">
        {adding ? (
          <div className="card space-y-3 max-w-md">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Game Number</label>
              <input type="text" className="input w-full" value={form.gameNumber} onChange={e => setForm(f => ({ ...f, gameNumber: e.target.value }))} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Game Name</label>
              <input type="text" className="input w-full" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ticket Price</label>
                <input type="number" step="0.01" min="0" className="input w-full" value={form.ticketPrice}
                  onChange={e => setForm(f => ({ ...f, ticketPrice: Number(e.target.value) }))} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tickets Per Book</label>
                <input type="number" step="1" min="1" className="input w-full" value={form.bookSize}
                  onChange={e => setForm(f => ({ ...f, bookSize: Number(e.target.value) }))} />
              </div>
            </div>
            {error && <p className="text-xs text-red-600">{error}</p>}
            <div className="flex gap-3">
              <button className="btn-primary disabled:opacity-50" disabled={saving} onClick={save}>
                {saving ? 'Saving…' : 'Add Game'}
              </button>
              <button className="text-sm text-gray-500" onClick={() => setAdding(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn-primary" onClick={() => setAdding(true)}>Add Game</button>
        )}
      </div>

      {games.length === 0 ? (
        <EmptyState title="No games yet" description="Add a game to start receiving books." icon="★" />
      ) : (
        <div className="card p-0 overflow-hidden">
          <table className="table-base w-full text-xs">
            <thead>
              <tr>
                <th className="text-left">Game #</th>
                <th className="text-left">Name</th>
                <th className="text-right">Ticket Price</th>
                <th className="text-right">Book Size</th>
                <th className="text-right">Book Value</th>
              </tr>
            </thead>
            <tbody>
              {games.map(g => (
                <tr key={g.id}>
                  <td className="font-mono">{g.game_number}</td>
                  <td>{g.name}</td>
                  <td className="text-right tabular-nums">{fmtMoney(g.ticket_price)}</td>
                  <td className="text-right tabular-nums">{g.book_size}</td>
                  <td className="text-right tabular-nums">{fmtMoney(g.ticket_price * g.book_size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
