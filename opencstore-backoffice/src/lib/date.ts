/**
 * src/lib/date.ts
 *
 * Date / time helpers used throughout the app.
 * Wraps the native Date API with consistent ISO-8601 UTC output.
 * Uses no external dependencies so it works in both renderer and main process.
 */

/** Return today's date as 'YYYY-MM-DD' */
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** N days ago as 'YYYY-MM-DD' */
export function daysAgoIso(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

/** Start of ISO date as UTC datetime string */
export function startOfDay(isoDate: string): string {
  return `${isoDate}T00:00:00.000Z`;
}

/** End of ISO date as UTC datetime string */
export function endOfDay(isoDate: string): string {
  return `${isoDate}T23:59:59.999Z`;
}

/** Human-readable relative time: "3 min ago", "2 days ago" */
export function relativeTime(isoString: string | null): string {
  if (!isoString) return 'Never';
  const diff   = Date.now() - new Date(isoString).getTime();
  const secs   = Math.floor(diff / 1000);
  const mins   = Math.floor(secs   / 60);
  const hours  = Math.floor(mins   / 60);
  const days   = Math.floor(hours  / 24);
  if (secs  < 60)  return 'Just now';
  if (mins  < 60)  return `${mins} min ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days  < 7)   return `${days}d ago`;
  return new Date(isoString).toLocaleDateString();
}

/** Format ISO datetime for display: "Jan 5 2025, 3:42 PM" */
export function fmtDateTime(isoString: string | null): string {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

/** Format ISO date for display: "Jan 5, 2025" */
export function fmtDate(isoString: string | null): string {
  if (!isoString) return '—';
  return new Date(isoString).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

/** Parse a "YYYY-MM-DD" string to a local midnight Date object */
export function parseIsoDate(isoDate: string): Date {
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** How many days between two ISO date strings */
export function daysBetween(startIso: string, endIso: string): number {
  const a = parseIsoDate(startIso).getTime();
  const b = parseIsoDate(endIso).getTime();
  return Math.round(Math.abs(b - a) / 86_400_000);
}

/** First day of the current month as 'YYYY-MM-DD' */
export function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** First day of the current year as 'YYYY-MM-DD' */
export function firstOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}
