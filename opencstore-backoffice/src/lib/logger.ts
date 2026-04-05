/**
 * src/lib/logger.ts
 *
 * Tiny structured logger for both renderer and main-process code.
 * In the renderer all output goes to the DevTools console.
 * In the main process it writes to stdout / stderr.
 *
 * Do NOT use this for the audit trail – use AuditLogger for that.
 * This is operational / debug logging only.
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  level: Level;
  module: string;
  message: string;
  data?: unknown;
  ts: string;
}

function emit(entry: LogEntry): void {
  const prefix = `[${entry.ts}] [${entry.level.toUpperCase()}] [${entry.module}]`;
  const msg    = entry.data
    ? `${prefix} ${entry.message} ${JSON.stringify(entry.data)}`
    : `${prefix} ${entry.message}`;

  switch (entry.level) {
    case 'debug': console.debug(msg); break;
    case 'info':  console.info(msg);  break;
    case 'warn':  console.warn(msg);  break;
    case 'error': console.error(msg); break;
  }
}

function makeLogger(module: string) {
  const log = (level: Level, message: string, data?: unknown) =>
    emit({ level, module, message, data, ts: new Date().toISOString() });

  return {
    debug: (msg: string, data?: unknown) => log('debug', msg, data),
    info:  (msg: string, data?: unknown) => log('info',  msg, data),
    warn:  (msg: string, data?: unknown) => log('warn',  msg, data),
    error: (msg: string, data?: unknown) => log('error', msg, data),
  };
}

export const createLogger = makeLogger;
export type Logger = ReturnType<typeof createLogger>;

/** Default app-level logger */
export const logger = makeLogger('app');
