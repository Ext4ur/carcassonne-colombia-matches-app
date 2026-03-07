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

export class SyncService {
  private static _sqlite: SqliteClient | null = null;
  private static _supabase: SupabaseClient | null = null;
  private static isSyncing = false;
  private static syncInterval: NodeJS.Timeout | null = null;
  private static connectivityInterval: NodeJS.Timeout | null = null;
  private static _isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;
  private static isSchemaReady = true;
  public static instanceId = Math.random().toString(36).substring(7);

  private static get sqlite() {
    if (!this._sqlite) this._sqlite = new SqliteClient();
    return this._sqlite;
  }

  private static get supabase() {
    if (!this._supabase) this._supabase = new SupabaseClient();
    return this._supabase;
  }

  /**
   * Reset the service state (useful for tests)
   */
  public static reset() {
    this.stopSync();
    if (this.connectivityInterval) clearInterval(this.connectivityInterval);
    this.connectivityInterval = null;
    this.isSyncing = false;
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
        await this.pullChanges();
        await this.pushChanges();
      } catch (e: unknown) {
        console.error(`[${this.instanceId}] [Sync] Error during sync:`, (e as Error).message || e);
      } finally {
        this.isSyncing = false;
        console.log(`[${this.instanceId}] [Sync] Finished sync sequence.`);
        clearInterval(heartbeat);
      }
    } catch (e: unknown) {
      this.isSyncing = false;
      console.error(`[${this.instanceId}] [Sync] Master check failed:`, (e as Error).message || e);
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
    data: Record<string, unknown>
  ): Promise<Record<string, unknown> | null> {
    const definitions = this.FK_DEFINITIONS[table];
    if (!definitions) return data;

    const resolvedData: Record<string, unknown> = { ...data };

    for (const [fkColumn, targetTable] of Object.entries(definitions)) {
      const uuidColumn = fkColumn.replace('_id', '_uuid');
      const targetUuid = data[uuidColumn] as string | undefined;

      if (targetUuid) {
        const targetRecord = await this.sqlite.query<{ id: number }>(
          `SELECT id FROM ${targetTable} WHERE uuid = ?`,
          [targetUuid]
        );

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

  private static async pullChanges() {
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
        return;
      }

      // 2. Fetch new audit logs
      console.log(`🔍 Checking for remote changes (since Log ID: ${lastAuditLogId})...`);
      const { data: logs, error: logsError } = await this.supabase
        .client!.from('sync_audit_logs')
        .select('*')
        .gt('id', lastAuditLogId)
        .order('id', { ascending: true });

      if (logsError) {
        console.error(`[${this.instanceId}] [Pull] Failed to fetch sync audit logs:`, logsError);
        return;
      }

      console.log(`[${this.instanceId}] [Pull] Fetched ${logs?.length || 0} logs.`);

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
          return;
        }
      }

      if (!logs || logs.length === 0) {
        console.log(`✅ Remote is up to date (since Log ID: ${lastAuditLogId}).`);
        return;
      }

      console.log(`📑 Processing ${logs.length} remote changes...`);

      // 3. Process logs in order
      let processedCount = 0;
      for (const log of logs) {
        processedCount++;
        const { table_name: table, record_uuid: uuid, operation } = log;

        if (!uuid) continue;

        console.log(
          `📑 [${processedCount}/${logs.length}] (Log ${log.id}) Syncing ${operation} on ${table} (${uuid})...`
        );

        try {
          if (operation === 'DELETE') {
            await this.sqlite.execute(`DELETE FROM ${table} WHERE uuid = ?`, [uuid]);
          } else {
            const { data: remoteRecord, error: recordError } = await this.supabase
              .client!.from(table)
              .select('*')
              .eq('uuid', uuid)
              .maybeSingle();

            console.log(
              `[Pull] Fetched remote record for ${table} (${uuid}): ${remoteRecord ? 'FOUND' : 'NOT FOUND'}`
            );
            if (recordError || !remoteRecord) {
              console.warn(`⚠️ Record ${uuid} not found in ${table}, skipping.`);
              continue;
            }

            const resolvedRecord = await this.resolveForeignKeys(table, remoteRecord);
            if (!resolvedRecord) {
              console.warn(
                `⏳ [Log ${log.id}] Sync Stalled: Waiting for parent of ${table} (${uuid}). Will retry.`
              );
              break;
            }

            // Check if exists locally
            const localByUuid = await this.sqlite.query<{ id: number }>(
              `SELECT id FROM ${table} WHERE uuid = ?`,
              [uuid]
            );

            if (localByUuid.length > 0) {
              await this.updateLocalRecord(table, resolvedRecord);
            } else {
              // Smart Merge
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
                    await this.sqlite.execute(`UPDATE ${table} SET uuid = ? WHERE id = ?`, [
                      uuid,
                      localId,
                    ]);
                    await this.updateLocalRecord(table, resolvedRecord);
                    merged = true;
                  }
                }
              }

              if (!merged) {
                await this.insertLocalRecord(table, resolvedRecord);
              }
            }
          }

          // Update checkpoint after each successful record processing
          await this.sqlite.execute(
            "INSERT OR REPLACE INTO sync_meta (key, value) VALUES ('last_audit_log_id', ?)",
            [log.id.toString()]
          );
        } catch (err) {
          console.error(`❌ Error in Log ${log.id}:`, err);
          break;
        }
      }
    } catch (err) {
      console.error('❌ Error in pullChanges:', err);
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
    await this.sqlite.execute(
      "INSERT INTO sync_queue (table_name, operation, payload, status) VALUES (?, ?, ?, 'pending')",
      [table, operation, JSON.stringify(payload)]
    );
    if (navigator.onLine) {
      this.sync();
    }
  }
}
