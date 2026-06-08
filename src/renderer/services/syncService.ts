import { SqliteClient } from '../api/clients/SqliteClient';
import { SupabaseClient } from '../api/clients/SupabaseClient';
import { isSupabaseConfigured } from '../api/clients/supabaseConfig';

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

  /** Max audit rows per pull query — avoids huge payloads and long single runs. */
  private static readonly PULL_LOG_BATCH_SIZE = 500;
  /** Max pull batches per sync() so catch-up drains without waiting for the next interval. */
  private static readonly MAX_PULL_ROUNDS_PER_SYNC = 40;
  /** UUIDs per Supabase `.in()` to avoid URL / PostgREST limits. */
  private static readonly PREFETCH_UUID_CHUNK_SIZE = 120;
  /**
   * Progress log every N logs during pull (1 = all). Default 100 keeps consoles usable.
   * Override: `localStorage.setItem('sync_pull_trace_every', '1')` then reload.
   */
  private static readonly PULL_LOG_PROGRESS_EVERY_DEFAULT = 100;

  /**
   * Dependency order for batch FK hydration (parents before children).
   * Must cover every table that appears as an FK target in FK_DEFINITIONS.
   */
  private static readonly HYDRATION_TABLE_ORDER: string[] = [
    'cities',
    'circuits',
    'players',
    'places',
    'tournaments',
    'tournament_configs',
    'rounds',
    'matches',
    'tournament_players',
    'match_players',
    'match_results',
    'player_byes',
  ];

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
  }

  /**
   * Start the background sync process
   * @param intervalMs Check interval in milliseconds (default 10s)
   */
  static async startSync(intervalMs = 10000) {
    if (this.syncInterval) return;

    console.log(`🔄 Sync Service Started (Instance: ${this.instanceId})`);

    if (!isSupabaseConfigured()) {
      console.log('ℹ️ Sync Service is disabled by configuration or user setting.');
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
      console.log('ℹ️ Sync queue not ready yet or stuck items check skipped.');
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

    if (!isSupabaseConfigured()) {
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
            console.warn(
              '⚠️ Supabase schema is not ready yet (tables missing). Sync will be deferred.'
            );
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
      console.log(`[${this.instanceId}] 🔁 Sync call skipped (invocation already active)`);
      return;
    }
    this.isSyncInvocationActive = true;
    try {
      console.log(
        `[${this.instanceId}] Entered sync() - isSyncing=${this.isSyncing}, isSchemaReady=${this.isSchemaReady}, isOnline=${this._isOnline}`
      );
      if (this.isSyncing) {
        console.log(`[${this.instanceId}] 🔒 Sync already in progress (flag)`);
        return;
      }

      // Refresh status first
      console.log(`[${this.instanceId}] Sync calling updateOnlineStatus...`);
      await this.updateOnlineStatus();
      console.log(
        `[${this.instanceId}] Sync updateOnlineStatus returned _isOnline=${this._isOnline}`
      );
      if (!this._isOnline) {
        console.log(`[${this.instanceId}] 🌐 Sync skipped: Offline`);
        return;
      }

      // Check if schema is ready
      if (!this.isSchemaReady) {
        console.log(`[${this.instanceId}] ⏳ Sync deferred: Supabase schema not yet initialized.`);
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
            console.log(`🔒 Sync already in progress by another instance (${lock.instanceId})`);
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
          console.warn(
            `🔒 Instance ${this.instanceId} lost the lock during wait (verifyLock.id=${verifyLock.instanceId}).`
          );
          return;
        }

        console.log(`👑 Instance ${this.instanceId} is now the SYNC MASTER.`);

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
        try {
          let pullRound = 0;
          let morePull = true;
          while (morePull && pullRound < this.MAX_PULL_ROUNDS_PER_SYNC) {
            morePull = await this.pullChanges();
            pullRound++;
          }
          if (morePull && pullRound >= this.MAX_PULL_ROUNDS_PER_SYNC) {
            console.log(
              `[${this.instanceId}] [Pull] Stopped after ${this.MAX_PULL_ROUNDS_PER_SYNC} batch(es); remaining backlog will continue on next sync.`
            );
          }
          await this.pushChanges();
        } catch (e: unknown) {
          console.error(
            `[${this.instanceId}] [Sync] Error during sync:`,
            (e as Error).message || e
          );
        } finally {
          this.isSyncing = false;
          console.log(`[${this.instanceId}] [Sync] Finished sync sequence.`);
          clearInterval(heartbeat);
        }
      } catch (e: unknown) {
        this.isSyncing = false;
        console.error(
          `[${this.instanceId}] [Sync] Master check failed:`,
          (e as Error).message || e
        );
      }
    } finally {
      this.isSyncInvocationActive = false;
    }
  }

  /**
   * Helper to reset the sync pointer from the console.
   * Usage: window.SyncService.resetSync()
   */
  static async resetSync() {
    console.log('🔄 Manually resetting sync pointer to 0...');
    await this.sqlite.execute(
      "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_audit_log_id', '0')"
    );
    console.log('✅ Local sync pointer reset. Restarting sync...');
    this.sync();
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
        const label = context === 'prefetch' ? 'Prefetch' : 'Batch hydration fetch';
        console.warn(`[${this.instanceId}] [Pull] ${label} failed for ${table}:`, error.message);
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

  private static async upsertLocalFromResolvedRow(
    table: string,
    resolved: Record<string, unknown>
  ): Promise<void> {
    const uuid = resolved.uuid;
    if (typeof uuid !== 'string') return;
    const existing = await this.sqlite.query<{ id: number }>(
      `SELECT id FROM ${table} WHERE uuid = ?`,
      [uuid]
    );
    if (existing.length > 0) await this.updateLocalRecord(table, resolved);
    else await this.insertLocalRecord(table, resolved);
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

    console.log(
      `[${this.instanceId}] [Pull] Prefetched ${totalRows} row(s) across ${byTable.size} table(s).`
    );
    return cache;
  }

  /**
   * Drain queued parent UUIDs fetched in bulk; re-queues nested parents until empty or max passes.
   */
  private static async flushParentHydrationQueue(queue: Map<string, Set<string>>): Promise<void> {
    if (!this.supabase.client) return;

    const maxPasses = 8;
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
          const resolved = await this.resolveForeignKeys(table, row, {
            attemptHydration: true,
            depth: 0,
            batchParentQueue: queue,
          });
          if (!resolved) continue;

          wroteAny = true;
          await this.upsertLocalFromResolvedRow(table, resolved);
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
      console.warn(
        `[${this.instanceId}] [Pull] Batch hydration stopped after ${maxPasses} pass(es); ${leftover} parent ref(s) still queued.`
      );
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

  /**
   * FK columns that are NOT NULL in SQLite; if still null/invalid after resolve, defer pull
   * (circuit_id / first_player_id are optional and omitted here).
   */
  private static readonly PULL_REQUIRED_INTEGER_FKS: Record<string, string[]> = {
    tournament_players: ['tournament_id', 'player_id'],
    match_players: ['match_id', 'player_id'],
    match_results: ['match_id', 'player_id'],
    player_byes: ['tournament_id', 'player_id'],
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
    matches: { round_id: 'rounds', first_player_id: 'players' },
    rounds: { tournament_id: 'tournaments' },
    tournament_players: { tournament_id: 'tournaments', player_id: 'players' },
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
    const maxDepth = 5;
    const batchQ = opts?.batchParentQueue;

    for (const [fkColumn, targetTable] of Object.entries(definitions)) {
      const uuidColumn = fkColumn.replace('_id', '_uuid');
      const targetUuid = this.fkTargetUuid(data, fkColumn, uuidColumn);

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
            return null;
          }
          await this.ensureRemoteRecordLocal(targetTable, targetUuid, depth + 1);
          targetRecord = await this.sqlite.query<{ id: number }>(
            `SELECT id FROM ${targetTable} WHERE uuid = ?`,
            [targetUuid]
          );
        }

        if (targetRecord && targetRecord.length > 0) {
          resolvedData[fkColumn] = targetRecord[0].id;
        } else {
          // If dependency missing, skip this record for now
          console.warn(
            `🔍 [Dependency Check] Table ${table} needs ${targetTable} (uuid: ${targetUuid}), but it was not found locally.`
          );
          return null;
        }
      } else {
        resolvedData[fkColumn] = null;
      }
    }

    return resolvedData;
  }

  private static async ensureRemoteRecordLocal(
    table: string,
    uuid: string,
    depth: number
  ): Promise<boolean> {
    const local = await this.sqlite.query<{ id: number }>(
      `SELECT id FROM ${table} WHERE uuid = ?`,
      [uuid]
    );
    if (local.length > 0) return true;
    if (!this.supabase.client) return false;

    const { data: remoteRecord, error } = await this.supabase
      .client!.from(table)
      .select('*')
      .eq('uuid', uuid)
      .maybeSingle();

    if (error || !remoteRecord) {
      console.warn(
        `⚠️ [Hydration] Could not fetch parent ${table} (${uuid}) from remote: ${error?.message || 'not found'}`
      );
      return false;
    }

    const resolved = await this.resolveForeignKeys(table, remoteRecord as Record<string, unknown>, {
      attemptHydration: true,
      depth,
    });
    if (!resolved) return false;

    await this.upsertLocalFromResolvedRow(table, resolved);
    return true;
  }

  private static async applyPullLog(
    log: SyncAuditLog,
    rowCache: RemoteRowCache,
    batchParentQueue: Map<string, Set<string>>
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
        console.warn(`⚠️ Record ${uuid} fallback fetch error in ${table}:`, recordError.message);
      }
      remoteRecord = (data as Record<string, unknown> | null) ?? null;
      if (remoteRecord) {
        this.putRowInRemoteCache(rowCache, table, uuid, remoteRecord);
      }
    }

    if (!remoteRecord) {
      // Common after cascades/deletes on related tables; keep quiet to avoid noisy logs.
      return 'processed';
    }

    const resolvedRecord = await this.resolveForeignKeys(table, remoteRecord, {
      attemptHydration: true,
      depth: 0,
      batchParentQueue,
    });

    if (!resolvedRecord) {
      return 'deferred';
    }

    if (this.resolvedRowMissingRequiredFks(table, resolvedRecord)) {
      return 'deferred';
    }

    // Check if exists locally
    const localByUuid = await this.sqlite.query<{ id: number }>(
      `SELECT id FROM ${table} WHERE uuid = ?`,
      [uuid]
    );

    const persistRow = async () => {
      if (localByUuid.length > 0) {
        await this.updateLocalRecord(table, resolvedRecord);
        return;
      }

      const naturalKeys = this.NATURAL_KEYS[table];
      let merged = false;

      if (naturalKeys) {
        const conditions = naturalKeys.map((k) => `${k} = ?`).join(' AND ');
        const params = naturalKeys.map((k) => resolvedRecord[k]);

        if (params.every((p) => p !== undefined && p !== null)) {
          const localByNaturalKey = await this.sqlite.query<{ id: number }>(
            `SELECT id FROM ${table} WHERE ${conditions}`,
            params
          );

          if (localByNaturalKey.length > 0) {
            const localId = localByNaturalKey[0].id;
            await this.sqlite.execute(`UPDATE ${table} SET uuid = ? WHERE id = ?`, [uuid, localId]);
            await this.updateLocalRecord(table, resolvedRecord);
            merged = true;
          }
        }
      }

      if (!merged) {
        await this.insertLocalRecord(table, resolvedRecord);
      }
    };

    try {
      await persistRow();
    } catch (e) {
      const msg = ((e as Error)?.message || '').toLowerCase();
      if (
        msg.includes('sqlite_constraint') ||
        msg.includes('constraint') ||
        msg.includes('not null')
      ) {
        console.warn(
          `[${this.instanceId}] [Pull] Log ${log.id} persist deferred (constraint): ${(e as Error).message?.slice(0, 160)}`
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
        console.warn('⚠️ sync_meta table not ready locally.');
        return false;
      }

      const checkpointBefore = lastAuditLogId;

      // 2. Fetch new audit logs
      console.log(`🔍 Checking for remote changes (since Log ID: ${lastAuditLogId})...`);
      const { data: logs, error: logsError } = await this.supabase
        .client!.from('sync_audit_logs')
        .select('*')
        .gt('id', lastAuditLogId)
        .order('id', { ascending: true })
        .limit(this.PULL_LOG_BATCH_SIZE);

      if (logsError) {
        console.error(`[${this.instanceId}] [Pull] Failed to fetch sync audit logs:`, logsError);
        return false;
      }

      console.log(
        `[${this.instanceId}] [Pull] Fetched ${logs?.length || 0} logs (batch max ${this.PULL_LOG_BATCH_SIZE}).`
      );

      // 2.1. Detect Remote Reset
      if ((!logs || logs.length === 0) && lastAuditLogId > 0) {
        const { data: maxIdData } = await this.supabase
          .client!.from('sync_audit_logs')
          .select('id')
          .order('id', { ascending: false })
          .limit(1);

        const remoteMaxId = maxIdData && maxIdData.length > 0 ? maxIdData[0].id : 0;
        if (remoteMaxId < lastAuditLogId) {
          console.warn(
            `🔄 Remote audit logs reset (Remote: ${remoteMaxId}, Local: ${lastAuditLogId}). Resetting pointer to 0.`
          );
          await this.sqlite.execute(
            "UPDATE sync_meta SET value = '0' WHERE key = 'last_audit_log_id'"
          );
          return true;
        }
      }

      if (!logs || logs.length === 0) {
        console.log(`✅ Remote is up to date (since Log ID: ${lastAuditLogId}).`);
        return false;
      }

      console.log(`📑 Processing ${logs.length} remote changes...`);

      const rowCache = await this.prefetchRemoteRowsForLogs(logs as SyncAuditLog[]);

      const pending = [...(logs as SyncAuditLog[])];
      const processedIds = new Set<number>();
      let totalProcessed = 0;
      let totalDeferred = 0;
      let round = 0;
      const MAX_ROUNDS = 5;

      while (pending.length > 0 && round < MAX_ROUNDS) {
        round++;
        const roundSize = pending.length;
        let roundProcessed = 0;
        const nextPending: SyncAuditLog[] = [];
        const batchParentQueue = new Map<string, Set<string>>();
        const progressEvery = this.pullLogProgressEvery();
        let deferredInRound = 0;

        const traceHint =
          import.meta.env?.MODE === 'test'
            ? ''
            : ` (progress cada ${progressEvery}; localStorage sync_pull_trace=1 para ver todos)`;
        console.log(
          `[${this.instanceId}] [Pull] Round ${round}: applying ${roundSize} log(s)${traceHint}.`
        );

        for (let i = 0; i < roundSize; i++) {
          const log = pending[i];
          if (
            progressEvery === 1 ||
            i === 0 ||
            i === roundSize - 1 ||
            (i + 1) % progressEvery === 0
          ) {
            console.log(
              `📑 [Round ${round}] (${i + 1}/${roundSize}) Log ${log.id}: ${log.operation} ${log.table_name} (${log.record_uuid || 'no-uuid'})`
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
            console.error(`❌ Error in Log ${log.id}:`, err);
            nextPending.push(log);
          }
        }

        if (deferredInRound > 0) {
          console.log(
            `[${this.instanceId}] [Pull] Round ${round}: ${deferredInRound} log(s) deferred (FK order); batch-hydrating parents…`
          );
        }

        await this.flushParentHydrationQueue(batchParentQueue);

        totalProcessed += roundProcessed;
        if (roundProcessed === 0) {
          totalDeferred = nextPending.length;
          console.warn(
            `⏳ [Pull] No progress in round ${round}. Deferred logs remaining: ${nextPending.length}.`
          );
          break;
        }

        pending.length = 0;
        pending.push(...nextPending);
      }

      // Advance checkpoint only through the processed prefix in fetched order.
      // (IDs may not always be strictly consecutive due to retention/cleanup policies.)
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

      console.log(
        `[${this.instanceId}] [Pull] Summary: processed=${totalProcessed}, deferred=${totalDeferred}, checkpoint=${checkpoint}, startedAt=${lastAuditLogId}`
      );

      const advanced = checkpoint > checkpointBefore;
      const batchFull = logs.length >= this.PULL_LOG_BATCH_SIZE;
      // Without checkpoint advance, do not chain: avoids spinning on the same stuck batch.
      return batchFull && advanced;
    } catch (err) {
      console.error('❌ Error in pullChanges:', err);
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

    try {
      await this.sqlite.execute(`UPDATE ${table} SET ${setClause} WHERE uuid = ?`, values);
    } catch (e) {
      console.error(`❌ Failed to update ${table}:`, e);
      throw e;
    }
  }

  private static async insertLocalRecord(table: string, data: Record<string, unknown>) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...fields } = data;
    const keys = Object.keys(fields);
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map((k) => this.sanitizeValue(fields[k as keyof typeof fields]));

    try {
      await this.sqlite.execute(
        `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`,
        values
      );
    } catch (e) {
      console.error(`❌ Failed to insert into ${table}:`, e);
      throw e;
    }
  }

  /**
   * Get current sync status
   */
  static getSyncStatus() {
    return {
      isSyncing: this.isSyncing,
      isOnline: this._isOnline,
      isConfigured: isSupabaseConfigured(),
    };
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
   * PUSH: Send pending local changes to Supabase
   */
  private static async pushChanges() {
    console.log(`[${this.instanceId}] [Push] Starting...`);
    let processedCount = 0;
    const MAX_PER_SYNC = 200;

    while (processedCount < MAX_PER_SYNC) {
      console.log(`[Push] calling query...`);
      const queue = await this.sqlite.query<SyncQueueItem>(
        "SELECT * FROM sync_queue WHERE status IN ('pending', 'failed') AND retry_count < 5 ORDER BY id ASC LIMIT 20"
      );
      console.log(`[Push] query returned queue of length ${queue?.length}`);

      if (queue.length === 0) {
        console.log('[Push] Queue is empty, nothing to sync.');
        break;
      }

      console.log(
        `⬆️ Pushing ${queue.length} items to Supabase (Total this run: ${processedCount})`
      );

      for (const item of queue) {
        processedCount++;
        try {
          await this.sqlite.execute("UPDATE sync_queue SET status = 'processing' WHERE id = ?", [
            item.id,
          ]);

          const payload = JSON.parse(item.payload);
          const table = item.table_name;
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

          // Convert any boolean values to integers (1/0) for Supabase compatibility
          for (const key of Object.keys(apiPayload)) {
            if (typeof apiPayload[key] === 'boolean') {
              apiPayload[key] = apiPayload[key] ? 1 : 0;
            }
          }
          if (!apiPayload.uuid && payload.uuid) apiPayload.uuid = payload.uuid;

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
              result = await supabaseClient.from(table).insert(apiPayload).select();
            }
          } else if (item.operation === 'UPDATE') {
            if (payload.uuid) {
              result = await supabaseClient
                .from(table)
                .update(apiPayload)
                .eq('uuid', payload.uuid)
                .select();
            }
          } else if (item.operation === 'DELETE') {
            if (payload.uuid) {
              console.log(
                `[${this.instanceId}] [Push] Syncing ${table} operation ${item.operation} for ${payload.uuid}`
              );
              result = await supabaseClient.from(table).delete().eq('uuid', payload.uuid).select();
            }
          }

          if (result && result.error) throw result.error;

          console.log(`✅ Successfully synced ${table} (item ${item.id})`);
          await this.sqlite.execute('DELETE FROM sync_queue WHERE id = ?', [item.id]);
        } catch (error: unknown) {
          const err = error as { message?: string; details?: string; hint?: string };
          let errorDetails = err.message || 'Unknown error';
          if (err.details) errorDetails += ` (${err.details})`;
          if (err.hint) errorDetails += ` [Hint: ${err.hint}]`;

          console.error(`❌ Failed to push item ${item.id}:`, errorDetails, error);
          await this.sqlite.execute(
            "UPDATE sync_queue SET status = 'failed', retry_count = retry_count + 1, last_error = ? WHERE id = ?",
            [errorDetails, item.id]
          );
        }
      }
    }

    if (processedCount >= MAX_PER_SYNC) {
      console.warn('⚠️ Sync reached MAX_PER_SYNC limit. Some items remain in queue.');
    }
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
