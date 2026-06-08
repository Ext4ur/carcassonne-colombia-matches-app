/* eslint-disable @typescript-eslint/no-explicit-any */
import { DatabaseService } from './database';
import { Player } from '../types/player';
import i18n from '../i18n/config';
import { DEFAULT_TIEBREAK_CRITERIA } from '../constants';
import { collectPlayersOnlyFromSnapshots } from '../utils/exportImportHelpers';

/**
 * Respaldo JSON (`ExportService`). `version` ≥ 1.1 puede incluir en cada torneo
 * `standings_snapshot` (clasificación calculada al exportar); la importación lo ignora
 * y reconstruye estado desde rondas/partidas.
 *
 * Lista `tournaments` puede ser parcial si el archivo fue generado por exportación selectiva.
 */
export interface BackupImportData {
  version: string;
  exportDate: string;
  data: {
    players: Player[];
    tournaments: any[];
    circuits: any[];
  };
}

function collectPlayersByOldId(data: BackupImportData): Map<number, Player> {
  const byId = new Map<number, Player>();
  for (const p of data.data.players || []) {
    if (p.id != null) byId.set(p.id, p);
  }
  return collectPlayersOnlyFromSnapshots(data.data.tournaments || [], byId);
}

/** Mapa jugadores solo necesarios para `tournamentIndices` (estructuras anidadas + enriquecer desde lista global exportada). */
function collectPlayersByOldIdSubset(
  data: BackupImportData,
  tournamentIndices: number[]
): Map<number, Player> {
  const subset = tournamentIndices.map((i) => data.data.tournaments[i]).filter(Boolean);
  const trimmed: BackupImportData = {
    ...data,
    data: {
      players: [],
      tournaments: subset,
      circuits: [],
    },
  };
  const byId = collectPlayersByOldId(trimmed);
  for (const p of data.data.players || []) {
    if (p?.id != null && byId.has(p.id)) {
      const cur = byId.get(p.id)!;
      byId.set(p.id, { ...cur, ...p });
    }
  }
  return byId;
}

export function parseBackupJson(raw: string): BackupImportData {
  let parsed: BackupImportData;
  try {
    parsed = JSON.parse(raw) as BackupImportData;
  } catch {
    throw new SyntaxError('INVALID_JSON');
  }
  if (
    !parsed.data ||
    !Array.isArray(parsed.data.players) ||
    !Array.isArray(parsed.data.tournaments)
  ) {
    throw new Error('BAD_BACKUP_STRUCTURE');
  }
  if (!Array.isArray(parsed.data.circuits)) {
    parsed.data.circuits = [];
  }
  return parsed;
}

async function resolvePlaceId(tournament: any): Promise<number> {
  const placeName = tournament.place_name as string | undefined;
  if (placeName) {
    const places = await DatabaseService.getAllPlaces();
    const hit = places.find((p) => p.name.trim() === placeName.trim());
    if (hit?.id) return hit.id;
  }
  if (tournament.place_id != null) {
    const p = await DatabaseService.getPlaceById(Number(tournament.place_id));
    if (p?.id) return p.id;
  }
  return DatabaseService.getDefaultPlaceId();
}

async function pickUniqueImportName(
  baseName: string,
  date: string,
  placeId: number
): Promise<string> {
  let name = `${baseName} (imported)`;
  let n = 0;
  for (;;) {
    const rows = await DatabaseService.getTournamentByNameDateAndPlace(name, date, placeId);
    if (rows.length === 0) return name;
    n++;
    name = `${baseName} (imported ${n})`;
  }
}

async function resolvePlayerId(
  oldId: number,
  playerByOldId: Map<number, Player>,
  map: Map<number, number>,
  stats: { created: number }
): Promise<number> {
  if (map.has(oldId)) return map.get(oldId)!;
  const exported = playerByOldId.get(oldId);
  if (!exported) {
    throw new Error(i18n.t('settings.import_missing_player', { id: oldId }));
  }

  if (exported.bga_username) {
    const rows = await DatabaseService.getPlayerByBGAUsername(exported.bga_username);
    if (rows.length > 0) {
      map.set(oldId, rows[0].id!);
      return rows[0].id!;
    }
  }
  const byName = await DatabaseService.getPlayersByExactName(exported.name || '');
  if (byName.length === 1) {
    map.set(oldId, byName[0].id!);
    return byName[0].id!;
  }

  stats.created++;
  const newId = Number(
    await DatabaseService.createPlayer({
      name: exported.name,
      bga_username: exported.bga_username,
      phone: exported.phone,
      email: exported.email,
      age: exported.age,
    })
  );
  map.set(oldId, newId);
  return newId;
}

async function importTournamentDeep(
  tournament: any,
  importName: string,
  placeId: number,
  circuitId: number | undefined,
  playerByOldId: Map<number, Player>,
  playerMap: Map<number, number>,
  stats: { created: number }
): Promise<void> {
  const create = async (cid?: number) =>
    Number(
      await DatabaseService.createTournament({
        name: importName,
        type: tournament.type === 'circuit' ? 'circuit' : 'qualifier',
        circuit_id: cid,
        date: tournament.date,
        players_per_match: tournament.players_per_match ?? 2,
        number_of_rounds: tournament.number_of_rounds ?? undefined,
        place_id: placeId,
      })
    );

  let tournamentId: number;
  try {
    tournamentId = await create(circuitId);
  } catch {
    tournamentId = await create(undefined);
  }

  const cfg = tournament.config || {};
  await DatabaseService.createTournamentConfig({
    tournament_id: tournamentId,
    avoid_rematches: cfg.avoid_rematches ?? true,
    tiebreak_criteria: cfg.tiebreak_criteria ?? DEFAULT_TIEBREAK_CRITERIA,
    scoring_system: cfg.scoring_system ?? { 1: 1, 2: 0 },
    bye_selection: cfg.bye_selection ?? 'worst',
    player_display_mode: cfg.player_display_mode ?? 'per_player',
    pairing_algorithm: cfg.pairing_algorithm ?? 'greedy',
    buchholz_bye_mode: cfg.buchholz_bye_mode ?? 'legacy',
  });

  const rp = (oid: number) => resolvePlayerId(oid, playerByOldId, playerMap, stats);

  for (const tp of tournament.players || []) {
    if (tp.id == null) continue;
    const pid = await rp(tp.id);
    await DatabaseService.registerPlayerToTournament(tournamentId, pid);
    const active = tp.active !== false;
    const dr = tp.dropout_round ?? null;
    if (!active || dr != null) {
      await DatabaseService.updateTournamentPlayerStatus(tournamentId, pid, {
        active,
        dropout_round: dr,
      });
    }
  }

  const rounds = [...(tournament.rounds || [])].sort(
    (a: any, b: any) => a.round_number - b.round_number
  );

  for (const round of rounds) {
    const roundId = Number(
      await DatabaseService.createRound({
        tournament_id: tournamentId,
        round_number: round.round_number,
        status: round.status || 'pending',
      })
    );

    if (round.started_at != null || round.completed_at != null) {
      await DatabaseService.updateRound(roundId, {
        started_at: round.started_at,
        completed_at: round.completed_at,
      });
    }

    const matches = [...(round.matches || [])].sort(
      (a: any, b: any) => a.match_number - b.match_number
    );

    for (const match of matches) {
      const results = match.results || [];
      const isBye = results.length === 1;

      let firstPid: number | undefined;
      if (match.first_player_id != null) {
        firstPid = await rp(match.first_player_id);
      }

      const matchId = Number(
        await DatabaseService.createMatch({
          round_id: roundId,
          match_number: match.match_number,
          status: 'pending',
          first_player_id: firstPid,
        })
      );

      if (!isBye) {
        const pids: number[] = [];
        if (match.players?.length) {
          for (const pl of match.players) {
            if (pl?.id != null) pids.push(await rp(pl.id));
          }
        }
        if (pids.length === 0 && results.length >= 2) {
          for (const r of results) {
            pids.push(await rp(r.player_id));
          }
        }
        if (pids.length > 0) {
          await DatabaseService.setMatchPlayers(matchId, pids);
        }
      }

      for (const r of results) {
        await DatabaseService.createMatchResult({
          match_id: matchId,
          player_id: await rp(r.player_id),
          position: r.position,
          points: r.points ?? 0,
          tournament_points: r.tournament_points ?? 0,
        });
      }

      if (match.status === 'completed' || isBye) {
        await DatabaseService.updateMatch(matchId, {
          status: 'completed',
          completed_at: match.completed_at || new Date().toISOString(),
        });
      }
    }

    if (round.status === 'completed') {
      await DatabaseService.updateRound(roundId, {
        status: 'completed',
        completed_at: round.completed_at,
      });
    }
  }

  if (tournament.status) {
    await DatabaseService.updateTournament(tournamentId, { status: tournament.status });
  }
}

export class ImportService {
  /** Abre archivo y valida; no modifica BD. */
  static async pickFileAndParse(): Promise<{
    success: boolean;
    canceled?: boolean;
    importData?: BackupImportData;
    error?: string;
  }> {
    try {
      const result = await window.electronAPI.openFile([
        { name: 'JSON Files', extensions: ['json'] },
      ]);

      if (!result.success || result.canceled || !result.data) {
        return {
          success: false,
          canceled: !!result.canceled,
          error: i18n.t('settings.import_no_file'),
        };
      }

      try {
        const importData = parseBackupJson(result.data);
        return { success: true, importData };
      } catch (e: unknown) {
        const code = e instanceof Error ? e.message : '';
        if (code === 'BAD_BACKUP_STRUCTURE') {
          return { success: false, error: i18n.t('settings.import_bad_structure') };
        }
        return { success: false, error: i18n.t('settings.import_invalid_json') };
      }
    } catch (error) {
      console.error('Error reading import:', error);
      return { success: false, error: String(error) };
    }
  }

  /** Por índice en `data.tournaments`, marca si ya existe igual nombre + fecha + lugar. */
  static async peekTournamentDuplicates(
    importData: BackupImportData
  ): Promise<{ index: number; existsInDb: boolean }[]> {
    const rows = await Promise.all(
      importData.data.tournaments.map(async (tournament, index) => {
        try {
          const placeId = await resolvePlaceId(tournament);
          const dup = await DatabaseService.getTournamentByNameDateAndPlace(
            tournament.name,
            tournament.date,
            placeId
          );
          return { index, existsInDb: dup.length > 0 };
        } catch {
          return { index, existsInDb: false };
        }
      })
    );
    return rows;
  }

  /** Importación completa (todos los torneos del archivo). Compatible con llamadas existentes. */
  static async importAll(): Promise<{ success: boolean; error?: string; summary?: string }> {
    const picked = await this.pickFileAndParse();
    if (!picked.success || !picked.importData) {
      return { success: false, error: picked.error };
    }
    const n = picked.importData.data.tournaments.length;
    const indices = Array.from({ length: n }, (_, i) => i);
    return this.importSelected(picked.importData, indices);
  }

  /** Importa solo índices en `data.tournaments`. Duplicados (mismo nombre+fecha+lugar) se importan con nombre único tipo "(imported)" sin prompts. */
  static async importSelected(
    importData: BackupImportData,
    tournamentIndices: number[]
  ): Promise<{ success: boolean; error?: string; summary?: string }> {
    try {
      const uniq = [...new Set(tournamentIndices)].filter(
        (i) => Number.isInteger(i) && i >= 0 && i < importData.data.tournaments.length
      );
      uniq.sort((a, b) => a - b);

      if (uniq.length === 0) {
        return { success: true, summary: i18n.t('settings.import_summary_none') };
      }

      const summary: string[] = [];
      const playerByOldId = collectPlayersByOldIdSubset(importData, uniq);
      const playerMap = new Map<number, number>();
      const playerStats = { created: 0 };

      for (const oldId of playerByOldId.keys()) {
        try {
          await resolvePlayerId(oldId, playerByOldId, playerMap, playerStats);
        } catch (error) {
          console.error('Error importing player:', error);
        }
      }

      if (playerStats.created > 0) {
        summary.push(i18n.t('settings.import_summary_players', { count: playerStats.created }));
      }

      const circuitOldIdsNeeded = new Set<number>();
      for (const idx of uniq) {
        const cid = importData.data.tournaments[idx]?.circuit_id as number | undefined;
        if (cid != null) circuitOldIdsNeeded.add(cid);
      }

      const circuitIdMap = new Map<number, number>();
      let circuitsImported = 0;
      for (const circuit of importData.data.circuits || []) {
        try {
          const oid = circuit.id as number | undefined;
          if (oid == null || !circuitOldIdsNeeded.has(oid)) continue;
          const existing = await DatabaseService.getCircuitByName(circuit.name);
          if (existing?.id != null) {
            circuitIdMap.set(oid, existing.id);
          } else {
            const newCid = Number(
              await DatabaseService.createCircuit({
                name: circuit.name,
                description: circuit.description,
                start_date: circuit.start_date,
                end_date: circuit.end_date,
                status: circuit.status || 'active',
              })
            );
            circuitIdMap.set(oid, newCid);
            circuitsImported++;
          }
        } catch (error) {
          console.error('Error importing circuit:', error);
        }
      }
      if (circuitsImported > 0) {
        summary.push(i18n.t('settings.import_summary_circuits', { count: circuitsImported }));
      }

      let tournamentsImported = 0;
      for (const idx of uniq) {
        const tournament = importData.data.tournaments[idx];
        try {
          const placeId = await resolvePlaceId(tournament);
          const dup = await DatabaseService.getTournamentByNameDateAndPlace(
            tournament.name,
            tournament.date,
            placeId
          );

          let importName = tournament.name as string;
          if (dup.length > 0) {
            importName = await pickUniqueImportName(tournament.name, tournament.date, placeId);
          }

          const oldCid = tournament.circuit_id as number | undefined;
          const newCid =
            oldCid != null && circuitIdMap.has(oldCid) ? circuitIdMap.get(oldCid) : undefined;

          await importTournamentDeep(
            tournament,
            importName,
            placeId,
            newCid,
            playerByOldId,
            playerMap,
            playerStats
          );
          tournamentsImported++;
        } catch (error) {
          console.error('Error importing tournament:', error);
        }
      }

      if (tournamentsImported > 0) {
        summary.push(i18n.t('settings.import_summary_tournaments', { count: tournamentsImported }));
      }

      if (summary.length === 0) {
        return { success: true, summary: i18n.t('settings.import_summary_none') };
      }

      return { success: true, summary: summary.join(', ') };
    } catch (error) {
      console.error('Error importing:', error);
      return { success: false, error: String(error) };
    }
  }
}
