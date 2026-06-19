import { SqliteClient } from '../api/clients/SqliteClient';
import { SupabaseClient } from '../api/clients/SupabaseClient';
import { isSupabaseConfigured, isRemoteSyncReady } from '../api/clients/supabaseConfig';
import { shouldSkipPullLogInStoreMode } from './storePullFilter';
import { filterRecordForLocalSQLite } from './syncLocalSchema';
import { formatSyncError, syncLog } from '../utils/syncLogger';
import { invalidateAllLists } from './dbCache';
import { SYSTEM_CITY_UUIDS } from '../constants';
import { isStoreMode } from '../utils/storeMode';

export interface SyncQueueItem {
  id: number;
  table_name: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  payload: string; // JSON string
  status: 'pending' | 'processing' | 'failed';
  retry_count: number;
  last_error?: string;
  created_at: string;
}

interface SyncAuditLog {
  id: number;
  table_name: string;
  operation: 'INSERT' | 'UPDATE' | 'DELETE';
  record_uuid: string | null;
}

type PullProcessResult = 'processed' | 'deferred';

/** table name -> uuid -> remote row (pull batch prefetch) */
type RemoteRowCache = Map<string, Map<string, Record<string, unknown>>>;

export interface SyncProgress {
  /** 0–100 when estimable; null if unknown (e.g. remote max not fetched yet). */
  percent: number | null;
  phase: 'idle' | 'pull' | 'push';
  pullCheckpoint: number;
  pullRemoteMax: number | null;
  pushPending: number;
  pushProcessedThisSession: number;
  isSyncing: boolean;
}

export class SyncService {
  private static _sqlite: SqliteClient | null = null;
  private static _supabase: SupabaseClient | null = null;
  private static isSyncing = false;
  private static isSyncInvocationActive = false;
  private static syncInterval: NodeJS.Timeout | null = null;
  private static connectivityInterval: NodeJS.Timeout | null = null;
  private static _isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private static isSchemaReady = true;
  public static instanceId = Math.random().toString(36).substring(7);

  /** Max wall-clock time for one sync() burst when backlog is detected. */
  private static readonly SYNC_BURST_MAX_MS = 55_000;
  /** Max audit rows per pull query — avoids huge payloads and long single runs. */
  private static readonly PULL_LOG_BATCH_SIZE = 500;
  /** Max pull batches per sync() so catch-up drains without waiting for the next interval. */
  private static readonly MAX_PULL_ROUNDS_PER_SYNC = 40;
  /** Inner FK-deferral rounds per pull batch (batch hydrate → retry). */
  private static readonly MAX_PULL_DEFERRAL_ROUNDS = 8;
  /** Max push items per sync() burst (safety cap alongside time budget). */
  private static readonly MAX_PUSH_ITEMS_PER_SYNC = 600;
  /** Rows fetched from sync_queue per push inner query. */
  private static readonly PUSH_QUERY_BATCH_SIZE = 40;

  private static _syncProgress: SyncProgress = {
    percent: null,
    phase: 'idle',
    pullCheckpoint: 0,
    pullRemoteMax: null,
    pushPending: 0,
    pushProcessedThisSession: 0,
    isSyncing: false,
  };
  private static _pushQueueAtSessionStart = 0;
  /** Filas aplicadas en pull durante el burst actual (para invalidar caché UI). */
  private static _pullRowsAppliedThisSession = 0;
  /** Evita reintentar hidratar el mismo padre ausente en cada pasada del pull. */
  private static hydrateMissCache = new Set<string>();
  private static lastDeferredWarnSignature = '';
  /** UUIDs per Supabase `.in()` to avoid URL / PostgREST limits. */
  private static readonly PREFETCH_UUID_CHUNK_SIZE = 120;
  /**
   * Progress log every N logs during pull (1 = all). Default 100 keeps consoles usable.
   * Override: `localStorage.setItem('sync_pull_trace_every', '1')` then reload.
   */
  private static readonly PULL_LOG_PROGRESS_EVERY_DEFAULT = 100;

  /**
   * Orden de dependencias para pull (padres antes que hijos).
   * Ciudades → lugares → circuitos/jugadores → torneos → rondas → partidas → resultados.
   */
  private static readonly PULL_TABLE_ORDER: string[] = [
    'cities',
    'places',
    'circuits',
    'players',
    'tournaments',
    'tournament_configs',
    'tournament_knockout_seeds',
    'tournament_players',
    'player_byes',
    'rounds',
    'matches',
    'match_players',
    'match_results',
  ];

  /** @deprecated alias — usar PULL_TABLE_ORDER */
  private static readonly HYDRATION_TABLE_ORDER = SyncService.PULL_TABLE_ORDER;

  private static get sqlite() {
    if (!this._sqlite) this._sqlite = new SqliteClient();
    return this._sqlite;
  }

  private static get supabase() {
    if (!this._supabase) this._supabase = new SupabaseClient();
    return this._supabase;
  }

  /** `localStorage.sync_pull_trace_every` = positive integer, or full trace with `sync_pull_trace` = '1'. */
  private static pullLogProgressEvery(): number {
    if (import.meta.env?.MODE === 'test') return 10_000;
    try {
      if (typeof localStorage !== 'undefined' && localStorage.getItem('sync_pull_trace') === '1') {
        return 1;
      }
      if (typeof localStorage !== 'undefined' && localStorage.getItem('sync_log_verbose') === '1') {
        return 1;
      }
      const raw =
        typeof localStorage !== 'undefined' ? localStorage.getItem('sync_pull_trace_every') : null;
      const n = raw ? parseInt(raw, 10) : NaN;
      if (Number.isFinite(n) && n >= 1) return n;
    } catch {
      /* ignore */
    }
    return this.PULL_LOG_PROGRESS_EVERY_DEFAULT;
  }

  /**
   * Reset the service state (useful for tests)
   */
  public static reset() {
    this.stopSync();
    if (this.connectivityInterval) clearInterval(this.connectivityInterval);
    this.connectivityInterval = null;
    this.isSyncing = false;
    this.isSyncInvocationActive = false;
    this.isSchemaReady = true;
    this._isOnline = true;
    this._sqlite = null; // Forces re-instantiation with mocks
    this._supabase = null;
    this._syncProgress = {
      percent: null,
      phase: 'idle',
      pullCheckpoint: 0,
      pullRemoteMax: null,
      pushPending: 0,
      pushProcessedThisSession: 0,
      isSyncing: false,
    };
    this.hydrateMissCache.clear();
    this.lastDeferredWarnSignature = '';
    this._pushQueueAtSessionStart = 0;
    this._pullRowsAppliedThisSession = 0;
  }

  /**
   * Start the background sync process
   * @param intervalMs Check interval in milliseconds (default 10s)
   */
  static async startSync(intervalMs = 10000) {
    if (this.syncInterval) return;

    syncLog.debug(`iniciado (${this.instanceId})`);

    if (!isRemoteSyncReady()) {
      syncLog.debug('desactivado (config, auth o ajuste de usuario)');
      return;
    }

    // Reset any stuck 'processing' items to 'pending' on startup
    try {
      const stuckItems = await this.sqlite
        .query<{
          count: number;
        }>(
          "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'processing' OR (status = 'failed' AND retry_count >= 5)"
        )
        .catch(() => [{ count: 0 }]); // Safety if table doesn't exist yet

      if (stuckItems[0]?.count > 0) {
        await this.sqlite.execute(
          "UPDATE sync_queue SET status = 'pending', retry_count = 0 WHERE status = 'processing' OR status = 'failed'"
        );
      }
    } catch {
      syncLog.debug('cola sync no lista; omitiendo revisión de atascados');
    }

    // Initial checks
    await this.updateOnlineStatus();
    this.sync();

    // Periodic sync (heavy)
    this.syncInterval = setInterval(() => {
      this.sync();
    }, intervalMs);

    // Periodic connectivity check (light) - Every 5 seconds as requested
    this.connectivityInterval = setInterval(() => {
      this.updateOnlineStatus();
    }, 5000);

    // Listen to online events
    window.addEventListener('online', () => {
      this._isOnline = true;
      this.updateOnlineStatus().then((online) => {
        if (online) this.sync();
      });
    });
    window.addEventListener('offline', () => {
      this._isOnline = false;
    });
  }

  static stopSync() {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
    if (this.connectivityInterval) {
      clearInterval(this.connectivityInterval);
      this.connectivityInterval = null;
    }
  }

  /**
   * Performs a lightweight ping to Supabase to verify REAL connectivity.
   * Updates the internal _isOnline flag.
   */
  static async updateOnlineStatus(): Promise<boolean> {
    if (!navigator.onLine) {
      this._isOnline = false;
      return false;
    }

    if (!isRemoteSyncReady()) {
      this._isOnline = false;
      return false;
    }

    try {
      // lightweight head call
      const { error, status } = await this.supabase
        .client!.from('players')
        .select('id', { head: true })
        .limit(1);

      if (status && status > 0) {
        this._isOnline = true;
        // If we get a 404/PGRST205, the schema is not initialized
        if (status === 404 || (error as { code?: string })?.code === 'PGRST205') {
          if (this.isSchemaReady) {
            syncLog.warn('esquema Supabase incompleto; sync aplazado');
          }
          this.isSchemaReady = false;
        } else {
          this.isSchemaReady = true;
        }
      } else if (error) {
        const msg = error.message?.toLowerCase() || '';
        const isNetError =
          msg.includes('fetch') || msg.includes('network') || msg.includes('load failed');
        this._isOnline = !isNetError;
      } else {
        this._isOnline = navigator.onLine;
      }
    } catch (e: unknown) {
      const msg = (e as Error)?.message?.toLowerCase() || '';
      if (msg.includes('fetch') || msg.includes('network')) {
        this._isOnline = false;
      }
    }
    return this._isOnline;
  }

  static async sync() {
    if (this.isSyncInvocationActive) {
      syncLog.debug('sync omitido (invocación activa)');
      return;
    }
    this.isSyncInvocationActive = true;
    try {
      syncLog.debug(
        `sync() online=${this._isOnline} schema=${this.isSchemaReady} syncing=${this.isSyncing}`
      );
      if (this.isSyncing) {
        syncLog.debug('sync omitido (ya en curso)');
        return;
      }

      await this.updateOnlineStatus();
      if (!this._isOnline) {
        syncLog.debug('sync omitido (sin conexión)');
        return;
      }

      if (!this.isSchemaReady) {
        syncLog.debug('sync aplazado (esquema no listo)');
        return;
      }

      // ROBUST MULTI-WINDOW LOCK (Leader Election)
      try {
        const now = Date.now();
        const lockKey = 'sync_service_lock';
        const lockStr = localStorage.getItem(lockKey);

        if (lockStr) {
          const lock = JSON.parse(lockStr);
          // If master is another instance and it's fresh (< 25s), we yield
          // In test environment, we allow multiple if it's the same class copy (determined by being in test)
          if (
            lock.instanceId !== this.instanceId &&
            now - lock.timestamp < 25000 &&
            import.meta.env?.MODE !== 'test'
          ) {
            syncLog.debug(`sync omitido (otra ventana: ${lock.instanceId})`);
            return;
          }
        }

        // Try to become master
        localStorage.setItem(
          lockKey,
          JSON.stringify({
            instanceId: this.instanceId,
            timestamp: now,
          })
        );

        // Wait 200ms and verify we are still the master (prevents race on startup)
        if (import.meta.env?.MODE !== 'test') {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
        const verifyLockStr = localStorage.getItem(lockKey);
        const verifyLock = JSON.parse(verifyLockStr || '{}');
        if (verifyLock.instanceId !== this.instanceId && import.meta.env?.MODE !== 'test') {
          syncLog.debug(`lock perdido ante ${verifyLock.instanceId}`);
          return;
        }

        syncLog.debug(`master (${this.instanceId})`);

        // Si pull y push están al día, no bloquear SQLite ni marcar "Sincronizando…".
        await this.refreshPullProgress();
        const queueSizeBeforeBurst = await this.getQueueSize();
        if (queueSizeBeforeBurst === 0 && this.isPullFullyCaughtUp()) {
          syncLog.debug('sync idle: pull al día y cola vacía');
          this._syncProgress.phase = 'idle';
          this._syncProgress.isSyncing = false;
          this._syncProgress.pushPending = 0;
          this._syncProgress.percent = 100;
          return;
        }

        // HEARTBEAT: Keep the lock while syncing
        const heartbeat = setInterval(() => {
          localStorage.setItem(
            lockKey,
            JSON.stringify({
              instanceId: this.instanceId,
              timestamp: Date.now(),
            })
          );
        }, 5000);

        this.isSyncing = true;
        this._syncProgress.isSyncing = true;
        this._syncProgress.pushProcessedThisSession = 0;
        this._pullRowsAppliedThisSession = 0;
        this._pushQueueAtSessionStart = await this.getQueueSize();
        this._syncProgress.pushPending = this._pushQueueAtSessionStart;
        const burstDeadline = Date.now() + this.SYNC_BURST_MAX_MS;
        try {
          let pullRound = 0;
          let morePull = true;
          this._syncProgress.phase = 'pull';
          await this.refreshPullProgress();
          while (
            morePull &&
            pullRound < this.MAX_PULL_ROUNDS_PER_SYNC &&
            Date.now() < burstDeadline
          ) {
            morePull = await this.pullChanges();
            pullRound++;
            await this.refreshPullProgress();
          }
          if (morePull && pullRound >= this.MAX_PULL_ROUNDS_PER_SYNC) {
            syncLog.debug(
              `pull: límite ${this.MAX_PULL_ROUNDS_PER_SYNC} lotes; continúa en próximo ciclo`
            );
          }

          this._syncProgress.phase = 'push';
          let morePush = true;
          while (morePush && Date.now() < burstDeadline) {
            morePush = await this.pushChanges(burstDeadline);
            this._syncProgress.pushPending = await this.getQueueSize();
            this._syncProgress.percent = this.computeProgressPercent();
          }

          // Tras subir datos locales, re-pull: padres recién pusheados desbloquean logs aplazados.
          if (this._syncProgress.pushProcessedThisSession > 0 && Date.now() < burstDeadline) {
            this._syncProgress.phase = 'pull';
            let pullAfterPush = true;
            let pullAfterPushRound = 0;
            while (
              pullAfterPush &&
              pullAfterPushRound < this.MAX_PULL_ROUNDS_PER_SYNC &&
              Date.now() < burstDeadline
            ) {
              pullAfterPush = await this.pullChanges();
              pullAfterPushRound++;
              await this.refreshPullProgress();
            }
          }
        } catch (e: unknown) {
          syncLog.error('sync interrumpido', e);
        } finally {
          this.isSyncing = false;
          this._syncProgress.isSyncing = false;
          this._syncProgress.phase = 'idle';
          await this.refreshPullProgress();
          this._syncProgress.pushPending = await this.getQueueSize();
          this._syncProgress.percent = this.computeProgressPercent();
          if (
            this._pullRowsAppliedThisSession > 0 ||
            this._syncProgress.pushProcessedThisSession > 0
          ) {
            invalidateAllLists();
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('sync:data-changed'));
            }
          }
          syncLog.debug('sync finalizado');
          clearInterval(heartbeat);
        }
      } catch (e: unknown) {
        this.isSyncing = false;
        syncLog.error('lock master falló', e);
      }
    } finally {
      this.isSyncInvocationActive = false;
    }
  }

  /**
   * Modo tienda: si el checkpoint avanzó sin catálogo de jugadores (p. ej. sync previo al canje),
   * reinicia pull y vuelve a sincronizar.
   */
  static async recoverStoreCatalogIfEmpty(): Promise<void> {
    if (!isStoreMode()) return;
    try {
      const rows = await this.sqlite.query<{ count: number }>(
        'SELECT COUNT(*) as count FROM players'
      );
      const playerCount = rows[0]?.count ?? 0;
      if (playerCount > 0) return;
      const checkpoint = await this.readPullCheckpoint();
      if (checkpoint === 0) return;
      syncLog.warn('modo tienda: jugadores vacíos con checkpoint>0; reiniciando pull del catálogo');
      await this.sqlite.execute("UPDATE sync_meta SET value = '0' WHERE key = 'last_audit_log_id'");
      await this.sqlite.execute("DELETE FROM sync_meta WHERE key = 'pull_skipped_log_ids'");
      await this.sync();
    } catch (e) {
      syncLog.error('recoverStoreCatalogIfEmpty', e);
    }
  }

  /**
   * Helper to reset the sync pointer from the console.
   * Usage: window.SyncService.resetSync()
   */
  static async resetSync() {
    syncLog.warn('pointer audit reseteado a 0; re-sincronizando');
    await this.sqlite.execute(
      "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_audit_log_id', '0')"
    );
    this.sync();
  }

  private static async loadPullSkippedLogIds(): Promise<Set<number>> {
    try {
      const rows = await this.sqlite.query<{ value: string }>(
        "SELECT value FROM sync_meta WHERE key = 'pull_skipped_log_ids'"
      );
      if (rows.length === 0) return new Set();
      const parsed = JSON.parse(rows[0].value) as unknown;
      if (!Array.isArray(parsed)) return new Set();
      return new Set(
        parsed.filter((n): n is number => typeof n === 'number' && Number.isFinite(n))
      );
    } catch {
      return new Set();
    }
  }

  private static async addPullSkippedLogIds(ids: number[]): Promise<void> {
    if (ids.length === 0) return;
    const set = await this.loadPullSkippedLogIds();
    for (const id of ids) set.add(id);
    const capped = [...set].sort((a, b) => a - b).slice(-5000);
    await this.sqlite.execute(
      "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('pull_skipped_log_ids', ?)",
      [JSON.stringify(capped)]
    );
  }

  /**
   * Borra datos locales de torneos/jugadores/etc., vacía la cola de push y vuelve a pull desde id 0.
   * Destructivo: solo datos de dominio sync; no toca ajustes de UI ni activaciones tienda.
   */
  static async resetLocalDataForCloudResync(): Promise<{ ok: boolean; error?: string }> {
    if (!isRemoteSyncReady()) {
      return { ok: false, error: 'sync_not_configured' };
    }
    try {
      this.stopSync();
      await this.sqlite.execute('PRAGMA foreign_keys = OFF');
      for (const table of [...this.PULL_TABLE_ORDER].reverse()) {
        try {
          await this.sqlite.execute(`DELETE FROM ${table}`);
        } catch {
          /* tabla ausente en esquemas antiguos */
        }
      }
      await this.sqlite.execute('DELETE FROM sync_queue');
      await this.sqlite.execute(
        "DELETE FROM sync_meta WHERE key IN ('last_audit_log_id', 'pull_skipped_log_ids')"
      );
      await this.sqlite.execute(
        "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_audit_log_id', '0')"
      );
      await this.sqlite.execute('PRAGMA foreign_keys = ON');
      await this.ensureSystemCitiesAndPlaces();
      invalidateAllLists();
      this.hydrateMissCache.clear();
      this.lastDeferredWarnSignature = '';
      syncLog.warn('datos locales borrados; pull completo desde la nube');
      await this.startSync(30000);
      await this.sync();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: (e as Error).message || String(e) };
    }
  }

  private static chunkArray<T>(items: T[], chunkSize: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < items.length; i += chunkSize) {
      out.push(items.slice(i, i + chunkSize));
    }
    return out;
  }

  /** Shared PostgREST pattern for pull prefetch and batch FK hydration. */
  private static async fetchRemoteRowsByUuids(
    table: string,
    uuids: string[],
    context: 'prefetch' | 'hydration'
  ): Promise<Record<string, unknown>[]> {
    if (!this.supabase.client || uuids.length === 0) return [];
    const out: Record<string, unknown>[] = [];
    for (const chunk of this.chunkArray(uuids, this.PREFETCH_UUID_CHUNK_SIZE)) {
      const { data, error } = await this.supabase.client.from(table).select('*').in('uuid', chunk);
      if (error) {
        const label = context === 'prefetch' ? 'prefetch' : 'hydrate';
        syncLog.warn(`pull ${label} ${table}: ${error.message}`);
        continue;
      }
      for (const row of data || []) out.push(row as Record<string, unknown>);
    }
    return out;
  }

  private static putRowInRemoteCache(
    cache: RemoteRowCache,
    table: string,
    uuid: string,
    row: Record<string, unknown>
  ) {
    let inner = cache.get(table);
    if (!inner) {
      inner = new Map();
      cache.set(table, inner);
    }
    inner.set(uuid, row);
  }

  private static async persistLocalRow(
    table: string,
    uuid: string,
    resolvedRecord: Record<string, unknown>
  ): Promise<void> {
    const localData = filterRecordForLocalSQLite(table, resolvedRecord);
    const localByUuid = await this.sqlite.query<{ id: number }>(
      `SELECT id FROM ${table} WHERE uuid = ?`,
      [uuid]
    );

    if (localByUuid.length > 0) {
      await this.updateLocalRecord(table, localData);
      return;
    }

    const naturalKeys = this.NATURAL_KEYS[table];
    if (naturalKeys) {
      const conditions = naturalKeys.map((k) => `${k} = ?`).join(' AND ');
      const params = naturalKeys.map((k) => localData[k]);

      if (params.every((p) => p !== undefined && p !== null)) {
        const localByNaturalKey = await this.sqlite.query<{ id: number }>(
          `SELECT id FROM ${table} WHERE ${conditions}`,
          params
        );

        if (localByNaturalKey.length > 0) {
          const localId = localByNaturalKey[0].id;
          await this.sqlite.execute(`UPDATE ${table} SET uuid = ? WHERE id = ?`, [uuid, localId]);
          await this.updateLocalRecord(table, localData);
          return;
        }
      }
    }

    await this.insertLocalRecord(table, localData);
  }

  private static async upsertLocalFromResolvedRow(
    table: string,
    resolved: Record<string, unknown>
  ): Promise<void> {
    const uuid = resolved.uuid;
    if (typeof uuid !== 'string') return;
    await this.persistLocalRow(table, uuid, resolved);
  }

  /** INSERT/UPDATE logs only — DELETE does not need a remote row fetch. */
  private static groupUuidsByTableForPrefetch(logs: SyncAuditLog[]): Map<string, Set<string>> {
    const byTable = new Map<string, Set<string>>();
    for (const log of logs) {
      if (log.operation === 'DELETE') continue;
      const uuid = log.record_uuid;
      if (!uuid) continue;
      let set = byTable.get(log.table_name);
      if (!set) {
        set = new Set();
        byTable.set(log.table_name, set);
      }
      set.add(uuid);
    }
    return byTable;
  }

  private static async prefetchRemoteRowsForLogs(logs: SyncAuditLog[]): Promise<RemoteRowCache> {
    const cache: RemoteRowCache = new Map();
    if (!this.supabase.client) return cache;

    const byTable = this.groupUuidsByTableForPrefetch(logs);
    let totalRows = 0;

    for (const [table, uuidSet] of byTable) {
      const rows = await this.fetchRemoteRowsByUuids(table, [...uuidSet], 'prefetch');
      for (const r of rows) {
        const u = r.uuid;
        if (typeof u === 'string') {
          this.putRowInRemoteCache(cache, table, u, r);
          totalRows++;
        }
      }
    }

    syncLog.debug(`pull prefetch: ${totalRows} fila(s), ${byTable.size} tabla(s)`);
    return cache;
  }

  private static pullLogTablePriority(tableName: string): number {
    const idx = this.PULL_TABLE_ORDER.indexOf(tableName);
    return idx >= 0 ? idx : 500;
  }

  /** Padres antes que hijos dentro del mismo batch (checkpoint sigue por id de audit log). */
  private static sortPullLogsByDependency(logs: SyncAuditLog[]): SyncAuditLog[] {
    return [...logs].sort((a, b) => {
      const pa = this.pullLogTablePriority(a.table_name);
      const pb = this.pullLogTablePriority(b.table_name);
      if (pa !== pb) return pa - pb;
      return a.id - b.id;
    });
  }

  /** Encola padres FK ausentes en SQLite a partir de filas ya prefetched. */
  private static async collectMissingFkParentsFromRowCache(
    cache: RemoteRowCache
  ): Promise<Map<string, Set<string>>> {
    const queue = new Map<string, Set<string>>();

    for (const [table, inner] of cache) {
      const defs = this.FK_DEFINITIONS[table];
      if (!defs) continue;

      for (const row of inner.values()) {
        for (const [fkColumn, targetTable] of Object.entries(defs)) {
          const uuidColumn = fkColumn.replace('_id', '_uuid');
          const parentUuid = await this.resolveFkTargetUuid(row, fkColumn, uuidColumn, targetTable);
          if (!parentUuid) continue;

          const local = await this.sqlite.query<{ id: number }>(
            `SELECT id FROM ${targetTable} WHERE uuid = ?`,
            [parentUuid]
          );
          if (local.length > 0) continue;

          let st = queue.get(targetTable);
          if (!st) {
            st = new Set();
            queue.set(targetTable, st);
          }
          st.add(parentUuid);

          if (!cache.get(targetTable)?.has(parentUuid)) {
            const rows = await this.fetchRemoteRowsByUuids(targetTable, [parentUuid], 'prefetch');
            for (const r of rows) {
              const u = r.uuid;
              if (typeof u === 'string') {
                this.putRowInRemoteCache(cache, targetTable, u, r);
              }
            }
          }
        }
      }
    }

    return queue;
  }

  /** Hidrata padres referenciados por el batch antes de aplicar logs hijos. */
  private static async prefetchFkParentsForBatch(rowCache: RemoteRowCache): Promise<void> {
    for (let pass = 0; pass < 6; pass++) {
      const queue = await this.collectMissingFkParentsFromRowCache(rowCache);
      let pending = 0;
      for (const s of queue.values()) pending += s.size;
      if (pending === 0) return;

      syncLog.debug(`pull prefetch FK: ${pending} padre(s), pasada ${pass + 1}`);
      await this.flushParentHydrationQueue(queue, rowCache);
    }
  }

  /**
   * Drain queued parent UUIDs fetched in bulk; re-queues nested parents until empty or max passes.
   */
  private static async flushParentHydrationQueue(
    queue: Map<string, Set<string>>,
    rowCache?: RemoteRowCache
  ): Promise<void> {
    if (!this.supabase.client) return;

    const maxPasses = 12;
    for (let pass = 0; pass < maxPasses; pass++) {
      let pending = 0;
      for (const s of queue.values()) pending += s.size;
      if (pending === 0) return;

      const snapshot = new Map<string, Set<string>>();
      for (const [table, set] of queue) {
        if (set.size === 0) continue;
        snapshot.set(table, new Set(set));
        set.clear();
      }

      const orderedTables = [
        ...this.HYDRATION_TABLE_ORDER,
        ...[...snapshot.keys()].filter((t) => !this.HYDRATION_TABLE_ORDER.includes(t)),
      ];

      let wroteAny = false;
      for (const table of orderedTables) {
        const uuids = [...(snapshot.get(table) || [])];
        if (uuids.length === 0) continue;

        const rows = await this.fetchRemoteRowsByUuids(table, uuids, 'hydration');
        for (const row of rows) {
          const rowUuid = row.uuid;
          if (typeof rowUuid !== 'string') continue;

          const localExists = await this.sqlite.query<{ id: number }>(
            `SELECT id FROM ${table} WHERE uuid = ?`,
            [rowUuid]
          );
          if (localExists.length > 0) continue;

          const resolved = await this.resolveForeignKeys(table, row, {
            attemptHydration: true,
            depth: 0,
            batchParentQueue: queue,
          });
          if (resolved) {
            wroteAny = true;
            await this.upsertLocalFromResolvedRow(table, resolved);
            continue;
          }

          const ok = await this.ensureRemoteRecordLocal(table, rowUuid, 0, rowCache);
          if (ok) wroteAny = true;
        }
      }

      if (!wroteAny) {
        let requeued = 0;
        for (const s of queue.values()) requeued += s.size;
        if (requeued === 0) return;
      }
    }

    let leftover = 0;
    for (const s of queue.values()) leftover += s.size;
    if (leftover > 0) {
      syncLog.warn(`pull: ${leftover} FK padre sin resolver tras ${maxPasses} pasadas`);
    }
  }

  private static looksLikeUuid(value: unknown): value is string {
    if (typeof value !== 'string') return false;
    const s = value.trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
  }

  /**
   * Prefer explicit *_uuid columns; some remotes expose the UUID in *_id (Postgres uuid FK).
   */
  private static fkTargetUuid(
    data: Record<string, unknown>,
    fkColumn: string,
    uuidColumn: string
  ): string | undefined {
    const u = data[uuidColumn];
    if (typeof u === 'string' && u.trim().length > 0) return u.trim();
    const alt = data[fkColumn];
    if (this.looksLikeUuid(alt)) return (alt as string).trim();
    return undefined;
  }

  /** Resuelve UUID del padre: columna *_uuid, UUID en *_id, o lookup por id entero remoto. */
  private static async resolveFkTargetUuid(
    data: Record<string, unknown>,
    fkColumn: string,
    uuidColumn: string,
    targetTable: string
  ): Promise<string | undefined> {
    const direct = this.fkTargetUuid(data, fkColumn, uuidColumn);
    if (direct) return direct;

    const remoteId = data[fkColumn];
    if (typeof remoteId !== 'number' || !Number.isFinite(remoteId) || !this.supabase.client) {
      return undefined;
    }

    const { data: row, error } = await this.supabase.client
      .from(targetTable)
      .select('uuid')
      .eq('id', remoteId)
      .maybeSingle();
    if (error || !row?.uuid) return undefined;
    return String(row.uuid);
  }

  /**
   * FK columns that are NOT NULL in SQLite; if still null/invalid after resolve, defer pull
   * (circuit_id / first_player_id are optional and omitted here).
   */
  private static readonly PULL_REQUIRED_INTEGER_FKS: Record<string, string[]> = {
    tournament_players: ['tournament_id', 'player_id'],
    match_players: ['match_id', 'player_id'],
    match_results: ['match_id', 'player_id'],
    player_byes: ['tournament_id', 'player_id'],
    tournament_knockout_seeds: ['tournament_id', 'player_id'],
    rounds: ['tournament_id'],
    tournament_configs: ['tournament_id'],
    matches: ['round_id'],
    places: ['city_id'],
  };

  private static resolvedRowMissingRequiredFks(
    table: string,
    row: Record<string, unknown>
  ): boolean {
    const required = this.PULL_REQUIRED_INTEGER_FKS[table];
    if (!required) return false;
    for (const fkCol of required) {
      const v = row[fkCol];
      if (typeof v !== 'number' || !Number.isFinite(v)) return true;
    }
    return false;
  }

  /**
   * Map of table -> FK column -> Target table
   */
  private static readonly FK_DEFINITIONS: Record<string, Record<string, string>> = {
    tournaments: { circuit_id: 'circuits', place_id: 'places' },
    places: { city_id: 'cities' },
    matches: { round_id: 'rounds', first_player_id: 'players', series_winner_id: 'players' },
    rounds: { tournament_id: 'tournaments' },
    tournament_players: { tournament_id: 'tournaments', player_id: 'players' },
    tournament_knockout_seeds: { tournament_id: 'tournaments', player_id: 'players' },
    match_players: { match_id: 'matches', player_id: 'players' },
    match_results: { match_id: 'matches', player_id: 'players' },
    player_byes: { tournament_id: 'tournaments', player_id: 'players' },
    tournament_configs: { tournament_id: 'tournaments' },
  };

  /**
   * Resolve Foreign Keys: Replace remote UUIDs with local INTEGER IDs.
   */
  private static async resolveForeignKeys(
    table: string,
    data: Record<string, unknown>,
    opts?: {
      attemptHydration?: boolean;
      depth?: number;
      /** When set, missing parents are queued for batch fetch instead of ensureRemoteRecordLocal. */
      batchParentQueue?: Map<string, Set<string>>;
    }
  ): Promise<Record<string, unknown> | null> {
    const definitions = this.FK_DEFINITIONS[table];
    if (!definitions) return data;

    const resolvedData: Record<string, unknown> = { ...data };
    const attemptHydration = opts?.attemptHydration === true;
    const depth = opts?.depth ?? 0;
    const maxDepth = 10;
    const batchQ = opts?.batchParentQueue;
    let needsBatchDefer = false;

    for (const [fkColumn, targetTable] of Object.entries(definitions)) {
      const uuidColumn = fkColumn.replace('_id', '_uuid');
      const targetUuid = await this.resolveFkTargetUuid(data, fkColumn, uuidColumn, targetTable);

      if (targetUuid) {
        let targetRecord = await this.sqlite.query<{ id: number }>(
          `SELECT id FROM ${targetTable} WHERE uuid = ?`,
          [targetUuid]
        );

        if (
          targetRecord.length === 0 &&
          attemptHydration &&
          depth < maxDepth &&
          this.supabase.client
        ) {
          if (batchQ) {
            let st = batchQ.get(targetTable);
            if (!st) {
              st = new Set();
              batchQ.set(targetTable, st);
            }
            st.add(targetUuid);
            needsBatchDefer = true;
            continue;
          }
          await this.ensureRemoteRecordLocal(targetTable, targetUuid, depth + 1);
          targetRecord = await this.sqlite.query<{ id: number }>(
            `SELECT id FROM ${targetTable} WHERE uuid = ?`,
            [targetUuid]
          );
        }

        if (targetRecord && targetRecord.length > 0) {
          resolvedData[fkColumn] = targetRecord[0].id;
        } else if (needsBatchDefer && batchQ) {
          continue;
        } else {
          syncLog.debug(`pull ${table}: falta ${targetTable} (${targetUuid.slice(0, 8)}…)`);
          return null;
        }
      } else {
        resolvedData[fkColumn] = null;
      }
    }

    if (needsBatchDefer && batchQ) return null;

    return resolvedData;
  }

  /** FKs NOT NULL en Supabase que el push debe resolver antes de INSERT. */
  private static readonly PUSH_REQUIRED_FKS: Record<string, string[]> = {
    tournament_knockout_seeds: ['tournament_id', 'player_id'],
  };

  /**
   * Rellena *_uuid en el payload desde la fila local (p. ej. seeds en cola antigua sin UUIDs).
   */
  private static async enrichPushPayloadFromLocal(
    table: string,
    payload: Record<string, unknown>
  ): Promise<Record<string, unknown>> {
    const fkDefs = this.FK_DEFINITIONS[table];
    if (!fkDefs) return payload;

    const out = { ...payload };
    let localRow: Record<string, unknown> | null = null;

    if (table === 'tournament_knockout_seeds' && typeof out.uuid === 'string') {
      const rows = await this.sqlite.query<{ tournament_id: number; player_id: number }>(
        'SELECT tournament_id, player_id FROM tournament_knockout_seeds WHERE uuid = ?',
        [out.uuid]
      );
      localRow = rows[0] ?? null;
    }

    for (const [fkColumn, targetTable] of Object.entries(fkDefs)) {
      const uuidColumn = fkColumn.replace('_id', '_uuid');
      if (out[uuidColumn]) continue;

      let localId = out[fkColumn] as number | undefined;
      if (localId == null && localRow) {
        localId = localRow[fkColumn] as number | undefined;
      }
      if (localId == null) continue;

      const related = await this.sqlite.query<{ uuid: string }>(
        `SELECT uuid FROM ${targetTable} WHERE id = ?`,
        [localId]
      );
      if (related[0]?.uuid) {
        out[uuidColumn] = related[0].uuid;
      }
    }

    return out;
  }

  /**
   * Resuelve IDs enteros en Supabase a partir de *_uuid (IDs locales ≠ IDs remotos).
   * Necesario cuando el trigger remoto no hidrata o tablas nuevas (KO seeds).
   */
  private static async hydrateRemotePayloadFromUuids(
    table: string,
    payload: Record<string, unknown>
  ): Promise<{ payload: Record<string, unknown>; ready: boolean }> {
    const definitions = this.FK_DEFINITIONS[table];
    const client = this.supabase.client;
    if (!definitions || !client) return { payload, ready: true };

    const out: Record<string, unknown> = { ...payload };
    let ready = true;

    for (const [fkColumn, targetTable] of Object.entries(definitions)) {
      if (out[fkColumn] != null) continue;
      const uuidColumn = fkColumn.replace('_id', '_uuid');
      const targetUuid = this.fkTargetUuid(out, fkColumn, uuidColumn);
      if (!targetUuid) {
        ready = false;
        continue;
      }

      const { data, error } = await client
        .from(targetTable)
        .select('id')
        .eq('uuid', targetUuid)
        .maybeSingle();

      if (error) {
        syncLog.debug(`push hydrate ${table}.${fkColumn}: ${error.message}`);
        ready = false;
        continue;
      }
      if (data?.id != null) {
        out[fkColumn] = data.id;
      } else {
        ready = false;
      }
    }

    const required = this.PUSH_REQUIRED_FKS[table];
    if (required) {
      for (const col of required) {
        if (out[col] == null) ready = false;
      }
    }

    return { payload: out, ready };
  }

  private static async getLocalRowByUuid(
    table: string,
    uuid: string
  ): Promise<Record<string, unknown> | null> {
    try {
      const rows = await this.sqlite.query<Record<string, unknown>>(
        `SELECT * FROM ${table} WHERE uuid = ?`,
        [uuid]
      );
      return rows[0] ?? null;
    } catch {
      return null;
    }
  }

  /** Local primero (pendiente de push), remoto después. */
  private static async getRowForPullResolution(
    table: string,
    uuid: string,
    rowCache: RemoteRowCache
  ): Promise<Record<string, unknown> | null> {
    const cached = rowCache.get(table)?.get(uuid);
    if (cached) return cached;

    const local = await this.getLocalRowByUuid(table, uuid);
    if (local) {
      this.putRowInRemoteCache(rowCache, table, uuid, local);
      return local;
    }

    return this.fetchRemoteRowForHydration(table, uuid, rowCache);
  }

  private static async fetchRemoteRowForHydration(
    table: string,
    uuid: string,
    rowCache: RemoteRowCache
  ): Promise<Record<string, unknown> | null> {
    const cached = rowCache.get(table)?.get(uuid);
    if (cached) return cached;
    if (!this.supabase.client) return null;

    const { data, error } = await this.supabase.client
      .from(table)
      .select('*')
      .eq('uuid', uuid)
      .maybeSingle();
    if (error || !data) return null;

    const row = data as Record<string, unknown>;
    this.putRowInRemoteCache(rowCache, table, uuid, row);
    return row;
  }

  private static async collectAncestorUuids(
    table: string,
    record: Record<string, unknown>,
    rowCache: RemoteRowCache,
    out: Map<string, Set<string>>,
    visited: Set<string>
  ): Promise<void> {
    const defs = this.FK_DEFINITIONS[table];
    if (!defs) return;

    for (const [fkColumn, targetTable] of Object.entries(defs)) {
      const uuidColumn = fkColumn.replace('_id', '_uuid');
      const parentUuid = await this.resolveFkTargetUuid(record, fkColumn, uuidColumn, targetTable);
      if (!parentUuid) continue;

      const visitKey = `${targetTable}:${parentUuid}`;
      if (visited.has(visitKey)) continue;
      visited.add(visitKey);

      let set = out.get(targetTable);
      if (!set) {
        set = new Set();
        out.set(targetTable, set);
      }
      set.add(parentUuid);

      const parentRow = await this.getRowForPullResolution(targetTable, parentUuid, rowCache);
      if (parentRow) {
        await this.collectAncestorUuids(targetTable, parentRow, rowCache, out, visited);
      }
    }
  }

  private static async hydrateFullAncestorChain(
    table: string,
    remoteRecord: Record<string, unknown>,
    rowCache: RemoteRowCache
  ): Promise<void> {
    const ancestors = new Map<string, Set<string>>();
    await this.collectAncestorUuids(table, remoteRecord, rowCache, ancestors, new Set());

    const orderedTables = [
      ...this.PULL_TABLE_ORDER.filter((t) => ancestors.has(t)),
      ...[...ancestors.keys()].filter((t) => !this.PULL_TABLE_ORDER.includes(t)),
    ];

    for (const ancestorTable of orderedTables) {
      for (const uuid of ancestors.get(ancestorTable) || []) {
        const local = await this.sqlite.query<{ id: number }>(
          `SELECT id FROM ${ancestorTable} WHERE uuid = ?`,
          [uuid]
        );
        if (local.length === 0) {
          await this.ensureRemoteRecordLocal(ancestorTable, uuid, 0, rowCache);
        }
      }
    }
  }

  private static async isPullLogStaleOnRemote(
    table: string,
    remoteRecord: Record<string, unknown>,
    rowCache: RemoteRowCache,
    visited: Set<string> = new Set()
  ): Promise<boolean> {
    const defs = this.FK_DEFINITIONS[table];
    if (!defs || !this.supabase.client) return false;

    for (const [fkColumn, targetTable] of Object.entries(defs)) {
      const uuidColumn = fkColumn.replace('_id', '_uuid');
      const parentUuid = await this.resolveFkTargetUuid(
        remoteRecord,
        fkColumn,
        uuidColumn,
        targetTable
      );
      if (!parentUuid) continue;

      const visitKey = `${targetTable}:${parentUuid}`;
      if (visited.has(visitKey)) continue;
      visited.add(visitKey);

      const local = await this.sqlite.query<{ id: number }>(
        `SELECT id FROM ${targetTable} WHERE uuid = ?`,
        [parentUuid]
      );
      if (local.length > 0) {
        const localRow = await this.getLocalRowByUuid(targetTable, parentUuid);
        if (
          localRow &&
          (await this.isPullLogStaleOnRemote(targetTable, localRow, rowCache, visited))
        ) {
          return true;
        }
        continue;
      }

      const remote = await this.fetchRemoteRowForHydration(targetTable, parentUuid, rowCache);
      if (!remote) {
        syncLog.debug(
          `pull ${table}: ancestro ${targetTable}:${parentUuid.slice(0, 8)} ni local ni remoto (log huérfano)`
        );
        return true;
      }

      if (await this.isPullLogStaleOnRemote(targetTable, remote, rowCache, visited)) {
        return true;
      }
    }

    return false;
  }

  /** Hidrata recursivamente padres NOT NULL antes de aplicar un log hijo. */
  private static async ensureRequiredParentsLocal(
    table: string,
    remoteRecord: Record<string, unknown>,
    rowCache?: RemoteRowCache
  ): Promise<void> {
    if (rowCache) {
      await this.hydrateFullAncestorChain(table, remoteRecord, rowCache);
      return;
    }

    const required = this.PULL_REQUIRED_INTEGER_FKS[table];
    const definitions = this.FK_DEFINITIONS[table];
    if (!required || !definitions) return;

    for (const fkColumn of required) {
      const targetTable = definitions[fkColumn];
      if (!targetTable) continue;
      const uuidColumn = fkColumn.replace('_id', '_uuid');
      const parentUuid = await this.resolveFkTargetUuid(
        remoteRecord,
        fkColumn,
        uuidColumn,
        targetTable
      );
      if (!parentUuid) continue;

      const local = await this.sqlite.query<{ id: number }>(
        `SELECT id FROM ${targetTable} WHERE uuid = ?`,
        [parentUuid]
      );
      if (local.length === 0) {
        await this.ensureRemoteRecordLocal(targetTable, parentUuid, 0);
      }
    }
  }

  private static async ensureRemoteRecordLocal(
    table: string,
    uuid: string,
    depth: number,
    rowCache?: RemoteRowCache
  ): Promise<boolean> {
    const local = await this.sqlite.query<{ id: number }>(
      `SELECT id FROM ${table} WHERE uuid = ?`,
      [uuid]
    );
    if (local.length > 0) return true;
    if (!this.supabase.client) return false;

    const missKey = `${table}:${uuid}`;
    if (this.hydrateMissCache.has(missKey)) return false;

    const { data: remoteRecord, error } = await this.supabase
      .client!.from(table)
      .select('*')
      .eq('uuid', uuid)
      .maybeSingle();

    if (error || !remoteRecord) {
      const localRow = await this.getLocalRowByUuid(table, uuid);
      if (localRow) return true;
      this.hydrateMissCache.add(missKey);
      syncLog.debug(`pull hydrate ${table} ${uuid.slice(0, 8)}…: ausente (local y remoto)`);
      return false;
    }

    if (rowCache) {
      this.putRowInRemoteCache(rowCache, table, uuid, remoteRecord as Record<string, unknown>);
      await this.hydrateFullAncestorChain(table, remoteRecord as Record<string, unknown>, rowCache);
    }

    const resolved = await this.resolveForeignKeys(table, remoteRecord as Record<string, unknown>, {
      attemptHydration: true,
      depth,
    });
    let resolvedRow = resolved;
    if (!resolvedRow) {
      await this.ensureRequiredParentsLocal(
        table,
        remoteRecord as Record<string, unknown>,
        rowCache
      );
      resolvedRow = await this.resolveForeignKeys(table, remoteRecord as Record<string, unknown>, {
        attemptHydration: true,
        depth: 0,
      });
    }
    if (!resolvedRow) return false;

    try {
      await this.upsertLocalFromResolvedRow(table, resolvedRow);
    } catch (e) {
      syncLog.debug(
        `pull hydrate upsert ${table} ${uuid.slice(0, 8)}…: ${(e as Error).message?.slice(0, 80)}`
      );
      return false;
    }
    return true;
  }

  private static async getRemoteRowForPullLog(
    log: SyncAuditLog,
    rowCache: RemoteRowCache
  ): Promise<Record<string, unknown> | null> {
    const table = log.table_name;
    const uuid = log.record_uuid;
    if (!uuid) return null;

    let remoteRecord: Record<string, unknown> | null = rowCache.get(table)?.get(uuid) ?? null;
    if (remoteRecord || !this.supabase.client) return remoteRecord;

    const { data } = await this.supabase.client
      .from(table)
      .select('*')
      .eq('uuid', uuid)
      .maybeSingle();
    remoteRecord = (data as Record<string, unknown> | null) ?? null;
    if (remoteRecord) {
      this.putRowInRemoteCache(rowCache, table, uuid, remoteRecord);
    }
    return remoteRecord;
  }

  /**
   * Audit logs que no se pueden aplicar (padre borrado en remoto, datos ajenos en tienda).
   * Se marcan procesados para desbloquear el checkpoint.
   */
  private static async shouldAdvancePastPullLog(
    log: SyncAuditLog,
    rowCache: RemoteRowCache
  ): Promise<boolean> {
    if (!log.record_uuid || log.operation === 'DELETE') return false;

    const remoteRecord = await this.getRemoteRowForPullLog(log, rowCache);
    if (!remoteRecord) return true;

    if (
      await shouldSkipPullLogInStoreMode(
        this.sqlite,
        this.supabase,
        log.table_name,
        remoteRecord,
        rowCache
      )
    ) {
      return true;
    }

    if (await this.isPullLogStaleOnRemote(log.table_name, remoteRecord, rowCache)) {
      return true;
    }

    return this.isPullLogUnrecoverable(log.table_name, remoteRecord, rowCache);
  }

  /** Padre requerido ausente en SQLite y en Supabase → audit log irrecuperable. */
  private static async isPullLogUnrecoverable(
    table: string,
    remoteRecord: Record<string, unknown>,
    rowCache: RemoteRowCache
  ): Promise<boolean> {
    if (await this.isPullLogStaleOnRemote(table, remoteRecord, rowCache)) return true;

    const required = this.PULL_REQUIRED_INTEGER_FKS[table];
    const definitions = this.FK_DEFINITIONS[table];
    if (!required || !definitions) return false;

    let anyRequiredMissing = false;
    for (const fkColumn of required) {
      const targetTable = definitions[fkColumn];
      if (!targetTable) continue;
      const uuidColumn = fkColumn.replace('_id', '_uuid');
      const parentUuid = await this.resolveFkTargetUuid(
        remoteRecord,
        fkColumn,
        uuidColumn,
        targetTable
      );
      if (!parentUuid) continue;

      const local = await this.sqlite.query<{ id: number }>(
        `SELECT id FROM ${targetTable} WHERE uuid = ?`,
        [parentUuid]
      );
      if (local.length > 0) return false;

      const remote = await this.fetchRemoteRowForHydration(targetTable, parentUuid, rowCache);
      if (remote) return false;

      anyRequiredMissing = true;
    }

    return anyRequiredMissing;
  }

  private static async describePullDeferralReason(
    table: string,
    remoteRecord: Record<string, unknown>
  ): Promise<string | undefined> {
    const required = this.PULL_REQUIRED_INTEGER_FKS[table];
    const definitions = this.FK_DEFINITIONS[table];
    if (!required || !definitions) return undefined;

    const missing: string[] = [];
    for (const fkColumn of required) {
      const targetTable = definitions[fkColumn];
      if (!targetTable) continue;
      const uuidColumn = fkColumn.replace('_id', '_uuid');
      const parentUuid = await this.resolveFkTargetUuid(
        remoteRecord,
        fkColumn,
        uuidColumn,
        targetTable
      );
      if (!parentUuid) {
        missing.push(`${fkColumn}(?)`);
        continue;
      }
      const local = await this.sqlite.query<{ id: number }>(
        `SELECT id FROM ${targetTable} WHERE uuid = ?`,
        [parentUuid]
      );
      if (local.length === 0) {
        missing.push(`${targetTable}:${parentUuid.slice(0, 8)}`);
      }
    }
    return missing.length > 0 ? missing.join(', ') : undefined;
  }

  private static summarizeDeferredLogs(logs: SyncAuditLog[]): string {
    const counts = new Map<string, number>();
    for (const log of logs) {
      counts.set(log.table_name, (counts.get(log.table_name) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([table, n]) => `${table}:${n}`)
      .join(', ');
  }

  private static async applyPullLog(
    log: SyncAuditLog,
    rowCache: RemoteRowCache,
    batchParentQueue?: Map<string, Set<string>>
  ): Promise<PullProcessResult> {
    const table = log.table_name;
    const uuid = log.record_uuid;
    if (!uuid) return 'processed';

    if (log.operation === 'DELETE') {
      await this.sqlite.execute(`DELETE FROM ${table} WHERE uuid = ?`, [uuid]);
      return 'processed';
    }

    let remoteRecord: Record<string, unknown> | null = rowCache.get(table)?.get(uuid) ?? null;

    if (!remoteRecord && this.supabase.client) {
      const { data, error: recordError } = await this.supabase
        .client!.from(table)
        .select('*')
        .eq('uuid', uuid)
        .maybeSingle();
      if (recordError) {
        syncLog.debug(`pull fetch ${table} ${uuid.slice(0, 8)}…: ${recordError.message}`);
      }
      remoteRecord = (data as Record<string, unknown> | null) ?? null;
      if (remoteRecord) {
        this.putRowInRemoteCache(rowCache, table, uuid, remoteRecord);
      }
    }

    if (!remoteRecord) {
      return 'processed';
    }

    // Store mode: skip foreign tournaments before FK resolution (avoids deferral loops).
    if (
      await shouldSkipPullLogInStoreMode(this.sqlite, this.supabase, table, remoteRecord, rowCache)
    ) {
      return 'processed';
    }

    if (await this.isPullLogStaleOnRemote(table, remoteRecord, rowCache)) {
      syncLog.debug(`pull ${table} omitido: cadena FK ausente en remoto`);
      return 'processed';
    }

    if (!batchParentQueue) {
      await this.hydrateFullAncestorChain(table, remoteRecord, rowCache);
    }

    let resolvedRecord = await this.resolveForeignKeys(table, remoteRecord, {
      attemptHydration: true,
      depth: 0,
      batchParentQueue,
    });

    if (!resolvedRecord && !batchParentQueue) {
      await this.ensureRequiredParentsLocal(table, remoteRecord, rowCache);
      resolvedRecord = await this.resolveForeignKeys(table, remoteRecord, {
        attemptHydration: true,
        depth: 0,
      });
    }

    if (!resolvedRecord) {
      const reason = await this.describePullDeferralReason(table, remoteRecord);
      if (reason) syncLog.debug(`pull ${table} aplazado: falta ${reason}`);
      return 'deferred';
    }

    if (this.resolvedRowMissingRequiredFks(table, resolvedRecord)) {
      await this.ensureRequiredParentsLocal(table, remoteRecord, rowCache);
      resolvedRecord = await this.resolveForeignKeys(table, remoteRecord, {
        attemptHydration: true,
        depth: 0,
      });
      if (!resolvedRecord || this.resolvedRowMissingRequiredFks(table, resolvedRecord)) {
        return 'deferred';
      }
    }

    try {
      await this.persistLocalRow(table, uuid, resolvedRecord);
    } catch (e) {
      const msg = ((e as Error)?.message || '').toLowerCase();
      if (
        msg.includes('sqlite_constraint') ||
        msg.includes('constraint') ||
        msg.includes('not null')
      ) {
        syncLog.debug(
          `pull log ${log.id} aplazado (constraint): ${(e as Error).message?.slice(0, 120)}`
        );
        return 'deferred';
      }
      throw e;
    }

    return 'processed';
  }

  private static readonly NATURAL_KEYS: Record<string, string[]> = {
    circuits: ['name'],
    cities: ['name'],
    players: ['name'],
    places: ['name', 'city_id'],
    tournaments: ['circuit_id', 'place_id', 'date'],
    tournament_configs: ['tournament_id'],
    tournament_players: ['tournament_id', 'player_id'],
    tournament_knockout_seeds: ['tournament_id', 'player_id'],
    rounds: ['tournament_id', 'round_number'],
    matches: ['round_id', 'match_number'],
    match_players: ['match_id', 'player_id'],
    match_results: ['match_id', 'player_id'],
    player_byes: ['tournament_id', 'player_id', 'round_number'],
  };

  /**
   * Pulls one batch of audit logs. Returns true if the caller should run another batch
   * in the same sync (more rows likely exist on the server and we advanced the checkpoint).
   */
  private static async pullChanges(): Promise<boolean> {
    try {
      // 1. Get last processed audit log ID
      let lastAuditLogId = 0;
      try {
        const meta = await this.sqlite.query<{ value: string }>(
          "SELECT value FROM sync_meta WHERE key = 'last_audit_log_id'"
        );
        if (meta.length > 0) lastAuditLogId = parseInt(meta[0].value);
      } catch {
        syncLog.warn('sync_meta local no disponible');
        return false;
      }

      const checkpointBefore = lastAuditLogId;

      const { data: logs, error: logsError } = await this.supabase
        .client!.from('sync_audit_logs')
        .select('*')
        .gt('id', lastAuditLogId)
        .order('id', { ascending: true })
        .limit(this.PULL_LOG_BATCH_SIZE);

      if (logsError) {
        syncLog.error('pull audit logs', logsError);
        return false;
      }

      syncLog.debug(`pull: ${logs?.length || 0} log(s) desde id ${lastAuditLogId}`);

      // 2.1. Detect Remote Reset
      if ((!logs || logs.length === 0) && lastAuditLogId > 0) {
        const { data: maxIdData } = await this.supabase
          .client!.from('sync_audit_logs')
          .select('id')
          .order('id', { ascending: false })
          .limit(1);

        const remoteMaxId = maxIdData && maxIdData.length > 0 ? maxIdData[0].id : 0;
        if (remoteMaxId < lastAuditLogId) {
          syncLog.warn(
            `audit remoto reseteado (remoto=${remoteMaxId}, local=${lastAuditLogId}); pointer→0`
          );
          await this.sqlite.execute(
            "UPDATE sync_meta SET value = '0' WHERE key = 'last_audit_log_id'"
          );
          return true;
        }
      }

      if (!logs || logs.length === 0) {
        syncLog.debug(`pull al día (desde id ${lastAuditLogId})`);
        return false;
      }

      syncLog.debug(`pull: aplicando ${logs.length} cambio(s)`);

      const skippedLogIds = await this.loadPullSkippedLogIds();
      const rowCache = await this.prefetchRemoteRowsForLogs(logs as SyncAuditLog[]);
      await this.prefetchFkParentsForBatch(rowCache);

      let pending = this.sortPullLogsByDependency(
        (logs as SyncAuditLog[]).filter((log) => !skippedLogIds.has(log.id))
      );
      const processedIds = new Set<number>();
      for (const log of logs as SyncAuditLog[]) {
        if (skippedLogIds.has(log.id)) processedIds.add(log.id);
      }
      let totalProcessed = 0;
      let totalDeferred = 0;
      let round = 0;

      while (pending.length > 0 && round < this.MAX_PULL_DEFERRAL_ROUNDS) {
        round++;
        const roundSize = pending.length;
        let roundProcessed = 0;
        const nextPending: SyncAuditLog[] = [];
        const batchParentQueue = new Map<string, Set<string>>();
        const progressEvery = this.pullLogProgressEvery();
        let deferredInRound = 0;

        syncLog.debug(`pull ronda ${round}: ${roundSize} log(s)`);

        for (let i = 0; i < roundSize; i++) {
          const log = pending[i];
          if (
            progressEvery === 1 ||
            i === 0 ||
            i === roundSize - 1 ||
            (i + 1) % progressEvery === 0
          ) {
            syncLog.debug(
              `pull [${round}] ${i + 1}/${roundSize} #${log.id} ${log.operation} ${log.table_name}`
            );
          }
          try {
            const result = await this.applyPullLog(log, rowCache, batchParentQueue);
            if (result === 'processed') {
              processedIds.add(log.id);
              roundProcessed++;
            } else {
              nextPending.push(log);
              deferredInRound++;
            }
          } catch (err) {
            syncLog.error(`pull log #${log.id} ${log.table_name} ${log.operation}`, err);
            nextPending.push(log);
          }
        }

        if (deferredInRound > 0) {
          syncLog.debug(`pull ronda ${round}: ${deferredInRound} aplazado(s) por FK`);
        }

        await this.flushParentHydrationQueue(batchParentQueue, rowCache);

        totalProcessed += roundProcessed;
        if (roundProcessed === 0) {
          totalDeferred = nextPending.length;
          syncLog.debug(
            `pull ronda ${round} sin avance; ${nextPending.length} log(s) pendiente(s)`
          );
          break;
        }

        pending.length = 0;
        pending.push(...this.sortPullLogsByDependency(nextPending));
      }

      // Fallback: recursive parent hydration (no batch queue) for stubborn deferrals.
      if (pending.length > 0) {
        await this.prefetchFkParentsForBatch(rowCache);
        pending = this.sortPullLogsByDependency(pending);
        syncLog.debug(`pull: reintento directo para ${pending.length} log(s) aplazado(s)`);
        const stillPending: SyncAuditLog[] = [];
        for (const log of pending) {
          try {
            const result = await this.applyPullLog(log, rowCache);
            if (result === 'processed') {
              processedIds.add(log.id);
              totalProcessed++;
            } else {
              stillPending.push(log);
            }
          } catch (err) {
            syncLog.error(`pull log #${log.id} ${log.table_name} ${log.operation}`, err);
            stillPending.push(log);
          }
        }
        pending.length = 0;
        pending.push(...stillPending);
        totalDeferred = stillPending.length;

        if (stillPending.length > 0) {
          const advancedPast: SyncAuditLog[] = [];
          const newlySkipped: number[] = [];
          for (const log of stillPending) {
            if (await this.shouldAdvancePastPullLog(log, rowCache)) {
              processedIds.add(log.id);
              newlySkipped.push(log.id);
              totalProcessed++;
            } else {
              advancedPast.push(log);
            }
          }
          if (newlySkipped.length > 0) {
            await this.addPullSkippedLogIds(newlySkipped);
            syncLog.warn(
              `pull: ${newlySkipped.length} log(s) huérfanos omitidos (${this.summarizeDeferredLogs(
                stillPending.filter((l) => newlySkipped.includes(l.id))
              )})`
            );
          }
          pending.length = 0;
          pending.push(...advancedPast);
          totalDeferred = advancedPast.length;

          if (advancedPast.length > 0) {
            const sig = advancedPast
              .map((l) => l.id)
              .sort((a, b) => a - b)
              .join(',');
            if (sig !== this.lastDeferredWarnSignature) {
              this.lastDeferredWarnSignature = sig;
              syncLog.warn(
                `pull: ${advancedPast.length} log(s) aplazados (${this.summarizeDeferredLogs(advancedPast)}); reintento en próximo sync`
              );
            }
          }
        }
      }

      // Advance checkpoint: procesados + omitidos cuentan (prefijo consecutivo).
      let checkpoint = lastAuditLogId;
      for (const log of logs as SyncAuditLog[]) {
        if (processedIds.has(log.id)) checkpoint = log.id;
        else break;
      }
      if (checkpoint > lastAuditLogId) {
        await this.sqlite.execute(
          "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_audit_log_id', ?)",
          [checkpoint.toString()]
        );
      }

      if (pending.length > 0 && totalDeferred === 0) {
        totalDeferred = pending.length;
      }

      syncLog.debug(
        `pull resumen: +${totalProcessed} aplazados=${totalDeferred} checkpoint=${checkpoint}`
      );

      if (totalProcessed > 0) {
        this._pullRowsAppliedThisSession += totalProcessed;
      }

      const advanced = checkpoint > checkpointBefore;
      const batchFull = logs.length >= this.PULL_LOG_BATCH_SIZE;
      // Without checkpoint advance, do not chain: avoids spinning on the same stuck batch.
      return batchFull && advanced;
    } catch (err) {
      syncLog.error('pullChanges', err);
      return false;
    }
  }

  private static sanitizeValue(value: unknown) {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value;
  }

  private static async updateLocalRecord(table: string, data: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...fields } = data;
    const keys = Object.keys(fields).filter((k) => k !== 'uuid');
    if (keys.length === 0) return;

    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => this.sanitizeValue(fields[k as keyof typeof fields]));
    values.push(data.uuid as string);

    await this.sqlite.execute(`UPDATE ${table} SET ${setClause} WHERE uuid = ?`, values);
  }

  private static async insertLocalRecord(table: string, data: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...fields } = data;
    const keys = Object.keys(fields);
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map((k) => this.sanitizeValue(fields[k as keyof typeof fields]));

    await this.sqlite.execute(
      `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
      values
    );
  }

  /**
   * Get current sync status (sync fields + last known progress snapshot).
   */
  static getSyncStatus() {
    return {
      isSyncing: this.isSyncing,
      isOnline: this._isOnline,
      isConfigured: isRemoteSyncReady(),
      progress: { ...this._syncProgress },
    };
  }

  /** Fetch remote audit max id (cached briefly during active sync). */
  private static async fetchRemoteAuditMaxId(): Promise<number | null> {
    if (!this.supabase.client) return null;
    try {
      const { data, error } = await this.supabase.client
        .from('sync_audit_logs')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);
      if (error) return null;
      return data && data.length > 0 ? (data[0].id as number) : 0;
    } catch {
      return null;
    }
  }

  private static async readPullCheckpoint(): Promise<number> {
    try {
      const meta = await this.sqlite.query<{ value: string }>(
        "SELECT value FROM sync_meta WHERE key = 'last_audit_log_id'"
      );
      if (meta.length > 0) return parseInt(meta[0].value, 10) || 0;
    } catch {
      /* ignore */
    }
    return 0;
  }

  /** true cuando el checkpoint local alcanzó el último audit id remoto. */
  private static isPullFullyCaughtUp(): boolean {
    const pullMax = this._syncProgress.pullRemoteMax;
    const checkpoint = this._syncProgress.pullCheckpoint;
    return pullMax != null && checkpoint >= pullMax;
  }

  /** Re-inserta Online/Offline tras borrar datos locales (migración main no re-corre). */
  private static async ensureSystemCitiesAndPlaces(): Promise<void> {
    const systemCities = [
      { uuid: SYSTEM_CITY_UUIDS.online, name: 'Online' },
      { uuid: SYSTEM_CITY_UUIDS.offline, name: 'Offline' },
    ];
    for (const city of systemCities) {
      await this.sqlite.execute('INSERT OR IGNORE INTO cities (uuid, name) VALUES (?, ?)', [
        city.uuid,
        city.name,
      ]);
    }
    const places = [
      {
        uuid: '00000000-0000-0000-0000-100000000001',
        name: 'Online',
        cityUuid: SYSTEM_CITY_UUIDS.online,
      },
      {
        uuid: '00000000-0000-0000-0000-100000000002',
        name: 'Offline',
        cityUuid: SYSTEM_CITY_UUIDS.offline,
      },
    ];
    for (const place of places) {
      const cityRows = await this.sqlite.query<{ id: number }>(
        'SELECT id FROM cities WHERE uuid = ? LIMIT 1',
        [place.cityUuid]
      );
      if (cityRows.length === 0) continue;
      await this.sqlite.execute(
        'INSERT OR IGNORE INTO places (uuid, name, city_id) VALUES (?, ?, ?)',
        [place.uuid, place.name, cityRows[0].id]
      );
    }
  }

  private static computeProgressPercent(): number | null {
    const pullMax = this._syncProgress.pullRemoteMax;
    const checkpoint = this._syncProgress.pullCheckpoint;
    const pullPart =
      pullMax != null && pullMax > 0
        ? Math.min(100, Math.round((checkpoint / pullMax) * 100))
        : null;

    const pushStart = this._pushQueueAtSessionStart;
    const pushDone = this._syncProgress.pushProcessedThisSession;
    const pushRemaining = this._syncProgress.pushPending;
    const pushPart =
      pushStart > 0
        ? Math.min(100, Math.round((pushDone / pushStart) * 100))
        : pushRemaining === 0
          ? 100
          : null;

    if (
      pullPart != null &&
      pushPart != null &&
      pushStart > 0 &&
      pullMax != null &&
      checkpoint < pullMax
    ) {
      return Math.round((pullPart + pushPart) / 2);
    }
    if (pushStart > 0 && pushRemaining > 0 && pushPart != null) return pushPart;
    if (pullPart != null && (pullMax == null || checkpoint < pullMax)) return pullPart;
    if (pushRemaining === 0 && (pullMax == null || checkpoint >= pullMax)) return 100;
    if (pushPart != null) return pushPart;
    return pullPart;
  }

  private static async refreshPullProgress(): Promise<void> {
    this._syncProgress.pullCheckpoint = await this.readPullCheckpoint();
    this._syncProgress.pullRemoteMax = await this.fetchRemoteAuditMaxId();
    this._syncProgress.percent = this.computeProgressPercent();
  }

  /**
   * Live sync progress for UI (pull checkpoint vs remote tail, push queue drain).
   */
  static async getSyncProgress(): Promise<SyncProgress> {
    await this.refreshPullProgress();
    this._syncProgress.pushPending = await this.getQueueSize();
    this._syncProgress.isSyncing = this.isSyncing;
    this._syncProgress.percent = this.computeProgressPercent();
    return { ...this._syncProgress };
  }

  /**
   * Get pending queue size
   */
  static async getQueueSize(): Promise<number> {
    const result = await this.sqlite.query<{ count: number }>(
      "SELECT COUNT(*) as count FROM sync_queue WHERE status IN ('pending', 'failed')"
    );
    return result[0]?.count || 0;
  }

  /**
   * PUSH: Send pending local changes to Supabase.
   * @returns true when more items remain in queue (caller may continue until deadline).
   */
  private static async pushChanges(deadlineMs?: number): Promise<boolean> {
    syncLog.debug('push iniciado');
    await this.supabase.ensureSyncSession();
    let processedCount = 0;
    let hitItemCap = false;

    while (processedCount < this.MAX_PUSH_ITEMS_PER_SYNC) {
      if (deadlineMs != null && Date.now() >= deadlineMs) {
        syncLog.debug('push: tiempo de burst agotado');
        break;
      }

      const queue = await this.sqlite.query<SyncQueueItem>(
        `SELECT * FROM sync_queue
         WHERE status IN ('pending', 'failed') AND retry_count < 5
         ORDER BY
           CASE table_name
             WHEN 'cities' THEN 10
             WHEN 'circuits' THEN 20
             WHEN 'players' THEN 30
             WHEN 'places' THEN 40
             WHEN 'tournaments' THEN 50
             WHEN 'tournament_configs' THEN 60
             WHEN 'tournament_players' THEN 70
             WHEN 'rounds' THEN 80
             WHEN 'matches' THEN 90
             WHEN 'match_players' THEN 100
             WHEN 'match_results' THEN 110
             WHEN 'player_byes' THEN 120
             WHEN 'tournament_knockout_seeds' THEN 130
             ELSE 500
           END,
           id ASC
         LIMIT ${this.PUSH_QUERY_BATCH_SIZE}`
      );
      if (queue.length === 0) {
        syncLog.debug('push: cola vacía');
        return false;
      }

      syncLog.debug(`push: ${queue.length} ítem(s) (run=${processedCount})`);

      for (const item of queue) {
        if (deadlineMs != null && Date.now() >= deadlineMs) break;
        if (processedCount >= this.MAX_PUSH_ITEMS_PER_SYNC) {
          hitItemCap = true;
          break;
        }

        processedCount++;
        try {
          await this.sqlite.execute("UPDATE sync_queue SET status = 'processing' WHERE id = ?", [
            item.id,
          ]);

          const table = item.table_name;
          let payload = JSON.parse(item.payload) as Record<string, unknown>;
          payload = await this.enrichPushPayloadFromLocal(table, payload);
          const supabaseClient = this.supabase.client;

          if (!supabaseClient) throw new Error('Supabase client not initialized');

          // Hydration logic
          const fkDefs = this.FK_DEFINITIONS[table];
          let payloadModified = false;

          if (fkDefs) {
            for (const [fkColumn, targetTable] of Object.entries(fkDefs)) {
              const uuidColumn = fkColumn.replace('_id', '_uuid');
              if (payload[fkColumn] && !payload[uuidColumn]) {
                const related = await this.sqlite.query<{ uuid: string }>(
                  `SELECT uuid FROM ${targetTable} WHERE id = ?`,
                  [payload[fkColumn]]
                );
                if (related && related.length > 0 && related[0].uuid) {
                  payload[uuidColumn] = related[0].uuid;
                  payloadModified = true;
                }
              }
            }
          }

          if (payloadModified) {
            await this.sqlite.execute('UPDATE sync_queue SET payload = ? WHERE id = ?', [
              JSON.stringify(payload),
              item.id,
            ]);
          }

          const apiPayload = { ...payload };
          delete apiPayload.id;
          if (fkDefs) {
            for (const fkColumn of Object.keys(fkDefs)) {
              delete apiPayload[fkColumn];
            }
          }

          const { payload: remotePayload, ready: remoteReady } =
            await this.hydrateRemotePayloadFromUuids(table, apiPayload);

          if (!remoteReady && item.operation === 'INSERT') {
            syncLog.debug(`push ${table}#${item.id}: aplazado (padre no en remoto)`);
            await this.sqlite.execute("UPDATE sync_queue SET status = 'pending' WHERE id = ?", [
              item.id,
            ]);
            continue;
          }

          // Convert any boolean values to integers (1/0) for Supabase compatibility
          for (const key of Object.keys(remotePayload)) {
            if (typeof remotePayload[key] === 'boolean') {
              remotePayload[key] = remotePayload[key] ? 1 : 0;
            }
          }
          if (!remotePayload.uuid && payload.uuid) remotePayload.uuid = payload.uuid;

          let result;
          if (item.operation === 'INSERT') {
            const { data: existing } = await supabaseClient
              .from(table)
              .select('id')
              .eq('uuid', payload.uuid)
              .maybeSingle();
            if (existing) {
              // Success (already exists)
            } else {
              result = await supabaseClient.from(table).insert(remotePayload).select();
            }
          } else if (item.operation === 'UPDATE') {
            if (payload.uuid) {
              result = await supabaseClient
                .from(table)
                .update(remotePayload)
                .eq('uuid', payload.uuid)
                .select();
            }
          } else if (item.operation === 'DELETE') {
            if (payload.uuid) {
              syncLog.debug(`push DELETE ${table} ${payload.uuid}`);
              result = await supabaseClient.from(table).delete().eq('uuid', payload.uuid).select();
            }
          }

          if (result && result.error) throw result.error;

          syncLog.debug(`push ok ${table}#${item.id}`);
          await this.sqlite.execute('DELETE FROM sync_queue WHERE id = ?', [item.id]);
          this._syncProgress.pushProcessedThisSession++;
          this._syncProgress.percent = this.computeProgressPercent();
        } catch (error: unknown) {
          const err = error as { message?: string; details?: string; hint?: string };
          let errorDetails = formatSyncError(err);
          if (err.details && !errorDetails.includes(err.details)) {
            errorDetails += ` — ${err.details}`;
          }
          if (err.hint && !errorDetails.includes(err.hint)) {
            errorDetails += ` (${err.hint})`;
          }

          syncLog.error(`push ${item.table_name}#${item.id}: ${errorDetails}`);
          await this.sqlite.execute(
            "UPDATE sync_queue SET status = 'failed', retry_count = retry_count + 1, last_error = ? WHERE id = ?",
            [errorDetails, item.id]
          );
        }
      }

      if (deadlineMs != null && Date.now() >= deadlineMs) break;
      if (hitItemCap) break;
    }

    const remaining = await this.getQueueSize();
    if (hitItemCap || processedCount >= this.MAX_PUSH_ITEMS_PER_SYNC) {
      syncLog.warn(
        `push: límite ${this.MAX_PUSH_ITEMS_PER_SYNC} ítems/ciclo; quedan ${remaining} en cola`
      );
    }
    return remaining > 0;
  }

  /**
   * Queue a local change
   */
  static async addToQueue(
    table: string,
    operation: 'INSERT' | 'UPDATE' | 'DELETE',
    payload: Record<string, unknown>
  ) {
    if (!isSupabaseConfigured()) {
      console.debug('ℹ️ Skipping Sync Queue: Sync is disabled.');
      return;
    }

    await this.sqlite.execute(
      "INSERT INTO sync_queue (table_name, operation, payload, status) VALUES (?, ?, ?, 'pending')",
      [table, operation, JSON.stringify(payload)]
    );
    if (navigator.onLine) {
      this.sync();
    }
  }
}
