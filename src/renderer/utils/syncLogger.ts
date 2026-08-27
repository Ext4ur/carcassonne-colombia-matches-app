/** Logs de sync: por defecto solo warn/error. Verbose: localStorage.sync_log_verbose = '1' */

export function isSyncLogVerbose(): boolean {
  if (import.meta.env?.MODE === 'test') return false;
  try {
    return localStorage.getItem('sync_log_verbose') === '1';
  } catch {
    return false;
  }
}

export function formatSyncError(err: unknown): string {
  if (err == null) return 'error desconocido';
  if (typeof err === 'string') return err;
  if (err instanceof Error) return err.message;
  if (typeof err === 'object' && 'message' in err) {
    const e = err as { message?: string; code?: string; details?: string };
    let msg = e.message ?? 'error';
    if (e.code) msg += ` [${e.code}]`;
    if (e.details) msg += ` — ${e.details}`;
    return msg;
  }
  return String(err);
}

export const syncLog = {
  debug(...args: unknown[]): void {
    if (isSyncLogVerbose()) console.log('[Sync]', ...args);
  },

  warn(message: string): void {
    console.warn('[Sync]', message);
  },

  error(message: string, err?: unknown): void {
    const detail = err !== undefined ? formatSyncError(err) : '';
    if (detail && !message.includes(detail)) {
      console.error('[Sync]', message, detail);
    } else {
      console.error('[Sync]', message);
    }
  },
};
