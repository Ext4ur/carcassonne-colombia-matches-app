/* eslint-disable @typescript-eslint/no-explicit-any */
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
  private static sqlite = new SqliteClient();
  private static supabase = new SupabaseClient();
  private static isSyncing = false;
  private static syncInterval: NodeJS.Timeout | null = null;
  private static connectivityInterval: NodeJS.Timeout | null = null;
  private static _isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true;

  /**
   * Start the background sync process
   * @param intervalMs Check interval in milliseconds (default 30s)
   */
  static async startSync(intervalMs = 30000) {
    if (this.syncInterval) return;

    console.log('🔄 Sync Service Started');

    // Reset any stuck 'processing' items to 'pending' on startup
    try {
      const stuckItems = await this.sqlite.query<{ count: number }>(
        "SELECT COUNT(*) as count FROM sync_queue WHERE status = 'processing' OR (status = 'failed' AND retry_count >= 5)"
      );
      if (stuckItems[0]?.count > 0) {
        await this.sqlite.execute(
          "UPDATE sync_queue SET status = 'pending', retry_count = 0 WHERE status = 'processing' OR status = 'failed'"
        );
      }
    } catch (e) {
      console.error('❌ Failed to reset stuck sync items:', e);
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
      } else if (error) {
        const msg = error.message?.toLowerCase() || '';
        const isNetError =
          msg.includes('fetch') || msg.includes('network') || msg.includes('load failed');
        this._isOnline = !isNetError;
      } else {
        this._isOnline = navigator.onLine;
      }
    } catch (e: any) {
      const msg = e?.message?.toLowerCase() || '';
      if (msg.includes('fetch') || msg.includes('network')) {
        this._isOnline = false;
      }
    }
    return this._isOnline;
  }

  static async sync() {
    if (this.isSyncing) return;

    // Refresh status first
    await this.updateOnlineStatus();
    if (!this._isOnline) return;

    this.isSyncing = true;

    try {
      // 1. Pull remote changes first
      await this.pullChanges();

      // 2. Push local changes to Supabase
      await this.pushChanges();
    } catch (error) {
      console.error('❌ Sync failed:', error);
    } finally {
      this.isSyncing = false;
    }
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
  private static async resolveForeignKeys(table: string, data: any): Promise<any | null> {
    const definitions = this.FK_DEFINITIONS[table];
    if (!definitions) return data;

    const resolvedData = { ...data };

    for (const [fkColumn, targetTable] of Object.entries(definitions)) {
      const uuidColumn = fkColumn.replace('_id', '_uuid');
      const targetUuid = data[uuidColumn];

      if (targetUuid) {
        const targetRecord = await this.sqlite.query<{ id: number }>(
          `SELECT id FROM ${targetTable} WHERE uuid = ?`,
          [targetUuid]
        );

        if (targetRecord && targetRecord.length > 0) {
          resolvedData[fkColumn] = targetRecord[0].id;
        } else {
          // If dependency missing, skip this record for now
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
    const tablesToSync = [
      'circuits',
      'cities',
      'places',
      'players',
      'tournaments',
      'tournament_configs',
      'tournament_players',
      'rounds',
      'matches',
      'match_players',
      'match_results',
      'player_byes',
    ];

    for (const table of tablesToSync) {
      try {
        const { data: remoteRecords, error } = await this.supabase.client!.from(table).select('*');

        if (error) {
          console.error(`❌ Failed to pull ${table}:`, error);
          continue;
        }

        if (!remoteRecords || remoteRecords.length === 0) continue;

        const pendingChanges = await this.sqlite.query<{ payload: string }>(
          "SELECT payload FROM sync_queue WHERE table_name = ? AND status IN ('pending', 'processing')",
          [table]
        );

        const pendingUuids = new Set<string>();
        for (const item of pendingChanges) {
          try {
            const payload = JSON.parse(item.payload);
            if (payload.uuid) pendingUuids.add(payload.uuid);
          } catch {
            /* ignore */
          }
        }

        for (const remote of remoteRecords) {
          if (remote.uuid && pendingUuids.has(remote.uuid)) continue;

          const resolvedRemote = await this.resolveForeignKeys(table, remote);
          if (!resolvedRemote) continue;

          // Check if exists locally by UUID
          const localByUuid = await this.sqlite.query<any>(
            `SELECT * FROM ${table} WHERE uuid = ?`,
            [remote.uuid]
          );

          if (localByUuid.length > 0) {
            await this.updateLocalRecord(table, resolvedRemote);
            continue;
          }

          // Smart Merge: Natural Key Resolution
          const naturalKeys = this.NATURAL_KEYS[table];
          if (naturalKeys) {
            const conditions = naturalKeys.map((k) => `${k} = ?`).join(' AND ');
            const params = naturalKeys.map((k) => resolvedRemote[k]);

            if (params.every((p) => p !== undefined && p !== null)) {
              const localByNaturalKey = await this.sqlite.query<any>(
                `SELECT * FROM ${table} WHERE ${conditions}`,
                params
              );

              if (localByNaturalKey.length > 0) {
                const localId = localByNaturalKey[0].id;
                // Merge found record: Update UUID and content
                await this.sqlite.execute(`UPDATE ${table} SET uuid = ? WHERE id = ?`, [
                  remote.uuid,
                  localId,
                ]);
                await this.updateLocalRecord(table, resolvedRemote);
                continue;
              }
            }
          }

          // Insert new record
          await this.insertLocalRecord(table, resolvedRemote);
        }
      } catch (err) {
        console.error(`❌ Error pulling table ${table}:`, err);
      }
    }
  }

  private static sanitizeValue(value: any) {
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    return value;
  }

  private static async updateLocalRecord(table: string, data: any) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...fields } = data;
    const keys = Object.keys(fields).filter((k) => k !== 'uuid');
    if (keys.length === 0) return;

    const setClause = keys.map((k) => `${k} = ?`).join(', ');
    const values = keys.map((k) => this.sanitizeValue(fields[k]));
    values.push(data.uuid);

    try {
      await this.sqlite.execute(`UPDATE ${table} SET ${setClause} WHERE uuid = ?`, values);
    } catch (e) {
      console.error(`❌ Failed to update ${table}:`, e);
      throw e;
    }
  }

  private static async insertLocalRecord(table: string, data: any) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { id, ...fields } = data;
    const keys = Object.keys(fields);
    const placeholders = keys.map(() => '?').join(', ');
    const values = keys.map((k) => this.sanitizeValue(fields[k]));

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
    const queue = await this.sqlite.query<SyncQueueItem>(
      "SELECT * FROM sync_queue WHERE status IN ('pending', 'failed') AND retry_count < 5 ORDER BY id ASC LIMIT 50"
    );

    if (queue.length === 0) return;

    for (const item of queue) {
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
            result = await supabaseClient.from(table).delete().eq('uuid', payload.uuid).select();
          }
        }

        if (result && result.error) throw result.error;

        await this.sqlite.execute('DELETE FROM sync_queue WHERE id = ?', [item.id]);
      } catch (error: any) {
        let errorDetails = error.message || 'Unknown error';
        if (error.details) errorDetails += ` (${error.details})`;
        if (error.hint) errorDetails += ` [Hint: ${error.hint}]`;

        console.error(`❌ Failed to push item ${item.id}:`, errorDetails, error);
        await this.sqlite.execute(
          "UPDATE sync_queue SET status = 'failed', retry_count = retry_count + 1, last_error = ? WHERE id = ?",
          [errorDetails, item.id]
        );
      }
    }
  }

  /**
   * Queue a local change
   */
  static async addToQueue(table: string, operation: 'INSERT' | 'UPDATE' | 'DELETE', payload: any) {
    await this.sqlite.execute(
      "INSERT INTO sync_queue (table_name, operation, payload, status) VALUES (?, ?, ?, 'pending')",
      [table, operation, JSON.stringify(payload)]
    );
    if (navigator.onLine) {
      this.sync();
    }
  }
}
