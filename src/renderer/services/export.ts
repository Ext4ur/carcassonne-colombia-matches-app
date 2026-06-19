import { DatabaseService } from './database';
import { ReportService } from './reports';
import { getLocalDateString } from '../utils/dateUtils';
import { Tournament } from '../types/tournament';
import { Circuit } from '../types/circuit';
import { Player } from '../types/player';
import { City } from '../types/city';
import { Place } from '../types/place';
import { collectPlayerIdsFromTournamentSnapshots } from '../utils/exportImportHelpers';

/** Subconjunto de exportación vacío; usar `instanceof ExportSubsetError` en la UI. */
export class ExportSubsetError extends Error {
  static readonly code = 'NO_TOURNAMENTS_SELECTED' as const;

  constructor() {
    super(ExportSubsetError.code);
    this.name = 'ExportSubsetError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export function isExportSubsetError(err: unknown): err is ExportSubsetError {
  return err instanceof ExportSubsetError;
}

async function buildExportedTournamentPayload(tournament: Tournament) {
  const config = await DatabaseService.getTournamentConfig(tournament.id!);
  const tournamentPlayers = await DatabaseService.getTournamentPlayers(tournament.id!);
  const knockoutSeeds = await DatabaseService.getKnockoutSeeds(tournament.id!);
  const rounds = await DatabaseService.getTournamentRounds(tournament.id!);

  const roundsWithData = await Promise.all(
    rounds.map(async (round) => {
      const matches = await DatabaseService.getRoundMatches(round.id!);
      const matchesWithData = await Promise.all(
        matches.map(async (match) => {
          const results = await DatabaseService.getMatchResults(match.id!, tournament.id!);
          const matchPlayers = await DatabaseService.getMatchPlayers(match.id!);
          return {
            ...match,
            results,
            players: matchPlayers,
          };
        })
      );
      return {
        ...round,
        matches: matchesWithData,
      };
    })
  );

  let standings_snapshot:
    | {
        exported_at: string;
        locale?: string;
        standings: Awaited<ReturnType<typeof ReportService.getStandings>>;
      }
    | undefined;
  try {
    const standings = await ReportService.getStandings(tournament.id!);
    standings_snapshot = {
      exported_at: new Date().toISOString(),
      locale: typeof navigator !== 'undefined' ? navigator.language : undefined,
      standings,
    };
  } catch (err) {
    console.error(
      '[ExportService] No se pudo calcular standings_snapshot; el resto del torneo se exporta igual.',
      tournament.id,
      tournament.name,
      err
    );
  }

  return {
    ...tournament,
    config,
    players: tournamentPlayers,
    rounds: roundsWithData,
    knockout_seeds: knockoutSeeds.map((s) => ({ player_id: s.player_id, seed: s.seed })),
    ...(standings_snapshot ? { standings_snapshot } : {}),
  };
}

async function collectReferencedGeo(tournaments: Tournament[]): Promise<{
  cities: City[];
  places: Place[];
}> {
  const placeIds = new Set<number>();
  for (const t of tournaments) {
    if (t.place_id) placeIds.add(t.place_id);
  }
  const [allPlaces, allCities] = await Promise.all([
    DatabaseService.getAllPlaces(),
    DatabaseService.getAllCities(),
  ]);
  const places = allPlaces.filter((p) => p.id != null && placeIds.has(p.id));
  const cityIds = new Set(places.map((p) => p.city_id));
  const cities = allCities.filter((c) => c.id != null && cityIds.has(c.id));
  return { cities, places };
}

function buildCircuitsPayload(
  allCircuits: Circuit[],
  allTournamentsSummaries: Tournament[],
  exportedTournamentIds: Set<number>
) {
  return allCircuits
    .map((circuit: Circuit) => {
      const circuitTournaments = allTournamentsSummaries.filter(
        (t: Tournament) => t.circuit_id === circuit.id && exportedTournamentIds.has(t.id!)
      );
      return {
        ...circuit,
        tournaments: circuitTournaments.map((t: Tournament) => t.id),
      };
    })
    .filter((c) => Array.isArray(c.tournaments) && c.tournaments.length > 0);
}

export class ExportService {
  /** Respaldo completo de la BD (jugadores + torneos + circuitos). */
  static async exportAll(): Promise<void> {
    const players = await DatabaseService.getAllPlayers();
    const tournaments = await DatabaseService.getAllTournaments();
    const circuits = await DatabaseService.getAllCircuits();

    const tournamentsWithData = await Promise.all(
      tournaments.map((tournament: Tournament) => buildExportedTournamentPayload(tournament))
    );

    const exportedIds = new Set(tournaments.map((t) => t.id!).filter(Boolean));
    const circuitsWithData = buildCircuitsPayload(circuits, tournaments, exportedIds);
    const geo = await collectReferencedGeo(tournaments);

    const exportData = {
      version: '1.2',
      exportDate: new Date().toISOString(),
      data: {
        players,
        tournaments: tournamentsWithData,
        circuits: circuitsWithData,
        cities: geo.cities,
        places: geo.places,
      },
    };

    const data = JSON.stringify(exportData, null, 2);
    const filename = `carcassonne_backup_${getLocalDateString()}.json`;

    await window.electronAPI.saveFile(data, filename, 'json');
  }

  /**
   * Solo los torneos indicados + jugadores que aparecen en ellos +
   * circuitos que tienen al menos uno de esos torneos (solo IDs incluidos en el JSON).
   * @throws {ExportSubsetError} si la lista efectiva está vacía
   */
  static async exportSubsetToFile(
    tournamentIds: number[]
  ): Promise<{ success: boolean; canceled?: boolean; error?: string }> {
    const idSet = new Set(tournamentIds.filter((id) => id != null && id > 0));
    if (idSet.size === 0) {
      throw new ExportSubsetError();
    }

    const allPlayers = await DatabaseService.getAllPlayers();
    const allTournamentsSummaries = await DatabaseService.getAllTournaments();
    const circuits = await DatabaseService.getAllCircuits();

    const selectedSummaries = allTournamentsSummaries.filter(
      (t) => t.id != null && idSet.has(t.id)
    );

    const tournamentsWithData = await Promise.all(
      selectedSummaries.map((tournament: Tournament) => buildExportedTournamentPayload(tournament))
    );

    const neededIds = collectPlayerIdsFromTournamentSnapshots(tournamentsWithData);
    const players: Player[] = allPlayers.filter((p) => p.id != null && neededIds.has(p.id));

    const circuitsWithData = buildCircuitsPayload(circuits, allTournamentsSummaries, idSet);
    const geo = await collectReferencedGeo(selectedSummaries);

    const exportData = {
      version: '1.2',
      exportDate: new Date().toISOString(),
      data: {
        players,
        tournaments: tournamentsWithData,
        circuits: circuitsWithData,
        cities: geo.cities,
        places: geo.places,
      },
    };

    const data = JSON.stringify(exportData, null, 2);
    const filename = `carcassonne_backup_${getLocalDateString()}_${idSet.size}t.json`;

    const result = await window.electronAPI.saveFile(data, filename, 'json');
    if (result.canceled) return { success: false, canceled: true };
    if (!result.success) return { success: false, error: result.error || 'save_failed' };
    return { success: true };
  }

  static async exportSubset(tournamentIds: number[]): Promise<void> {
    const r = await this.exportSubsetToFile(tournamentIds);
    if (r.canceled) return;
    if (!r.success) throw new Error(r.error || 'export_failed');
  }
}
