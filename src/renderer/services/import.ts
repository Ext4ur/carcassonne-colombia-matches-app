/* eslint-disable @typescript-eslint/no-explicit-any */
import { DatabaseService } from './database';
import { Player } from '../types/player';
import i18n from '../i18n/config';
import { DEFAULT_TIEBREAK_CRITERIA } from '../constants';

interface ImportData {
  version: string;
  exportDate: string;
  data: {
    players: Player[];
    tournaments: any[];
    circuits: any[];
  };
}

function collectPlayersByOldId(data: ImportData): Map<number, Player> {
  const byId = new Map<number, Player>();
  for (const p of data.data.players || []) {
    if (p.id != null) byId.set(p.id, p);
  }
  for (const t of data.data.tournaments || []) {
    for (const p of t.players || []) {
      if (p?.id != null && !byId.has(p.id)) byId.set(p.id, p);
    }
    for (const r of t.rounds || []) {
      for (const m of r.matches || []) {
        for (const p of m.players || []) {
          if (p?.id != null && !byId.has(p.id)) byId.set(p.id, p as Player);
        }
        for (const res of m.results || []) {
          const pid = res.player_id as number | undefined;
          if (pid != null && !byId.has(pid)) {
            byId.set(pid, { id: pid, name: `Player ${pid}` } as Player);
          }
        }
      }
    }
  }
  return byId;
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
  static async importAll(): Promise<{ success: boolean; error?: string; summary?: string }> {
    try {
      const result = await window.electronAPI.openFile([
        { name: 'JSON Files', extensions: ['json'] },
      ]);

      if (!result.success || result.canceled || !result.data) {
        return { success: false, error: i18n.t('settings.import_no_file') };
      }

      let importData: ImportData;
      try {
        importData = JSON.parse(result.data);
      } catch {
        return { success: false, error: i18n.t('settings.import_invalid_json') };
      }

      if (
        !importData.data ||
        !importData.data.players ||
        !importData.data.tournaments ||
        !importData.data.circuits
      ) {
        return { success: false, error: i18n.t('settings.import_bad_structure') };
      }

      const summary: string[] = [];
      const playerByOldId = collectPlayersByOldId(importData);
      const playerMap = new Map<number, number>();
      const playerStats = { created: 0 };

      for (const player of importData.data.players) {
        try {
          if (player.id != null) {
            await resolvePlayerId(player.id, playerByOldId, playerMap, playerStats);
          }
        } catch (error) {
          console.error('Error importing player:', error);
        }
      }

      if (playerStats.created > 0) {
        summary.push(i18n.t('settings.import_summary_players', { count: playerStats.created }));
      }

      const circuitIdMap = new Map<number, number>();
      let circuitsImported = 0;
      for (const circuit of importData.data.circuits) {
        try {
          const oid = circuit.id as number | undefined;
          if (oid == null) continue;
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
      for (const tournament of importData.data.tournaments) {
        try {
          const placeId = await resolvePlaceId(tournament);
          const dup = await DatabaseService.getTournamentByNameDateAndPlace(
            tournament.name,
            tournament.date,
            placeId
          );

          let importName = tournament.name as string;
          if (dup.length > 0) {
            const ok = window.confirm(
              i18n.t('settings.import_duplicate_prompt', {
                name: tournament.name,
                date: tournament.date,
              })
            );
            if (!ok) continue;
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
