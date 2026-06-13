/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DatabaseService } from '../services/database';
import { SwissPairingService } from '../services/swiss';
import { RoundGenerationService, KnockoutPairingService } from '../services/roundGeneration';
import {
  countSwissRounds,
  computeSeriesState,
  canExportKnockoutBracket,
  isKnockoutPhaseActive,
  isSeriesMatch,
  resolveGameStarter,
  resultsForDisplay,
} from '../services/knockout';
import {
  isKnockoutSize,
  resolveEffectiveKnockoutSize,
  type CompetitionFormat,
} from '../types/knockout';
import { ReportService } from '../services/reports';
import { htmlDocumentToPngDataUrl } from '../utils/htmlToPng';
import {
  Tournament,
  Round,
  Match,
  PlayerStanding,
  TournamentConfig,
  BuchholzByeMode,
  normalizeBuchholzByeMode,
} from '../types/tournament';
import Table from '../components/common/Table';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import MatchResultForm from '../components/tournament/MatchResultForm';
import SeriesMatchGroup from '../components/tournament/SeriesMatchGroup';
import KnockoutBracket, { type BracketRoundColumn } from '../components/tournament/KnockoutBracket';
import TournamentStats from '../components/tournament/TournamentStats';
import TournamentMatrix from '../components/tournament/TournamentMatrix';
import TournamentRoundMatrix from '../components/tournament/TournamentRoundMatrix';
import RoundPreviewDialog from '../components/tournament/RoundPreviewDialog';
import ManualPairingDialog from '../components/tournament/ManualPairingDialog';
import AddPlayerDialog from '../components/tournament/AddPlayerDialog';
import TournamentConfigComponent from '../components/tournament/TournamentConfig';
import MultiSelect from '../components/common/MultiSelect';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import { Column } from '../components/common/Table';
import { Place } from '../types/place';
import { useNotifications } from '../contexts/NotificationContext';
import { calculateNumberOfRounds } from '../utils/tournament';
import { formatDateForDisplay } from '../utils/dateUtils';
import {
  formatPlayerStandingHeadToHeadText,
  renderPlayerStandingHeadToHeadCell,
} from '../utils/headToHeadDisplay';
import { getEffectiveTiebreakCriteria } from '../constants';
import { DEFAULT_TIEBREAK_CRITERIA } from '../utils/tiebreak';
import { getDefaultScoringSystem } from '../utils/scoring';
import { useTranslation } from 'react-i18next';
import { knockoutStageI18nKey } from '../types/knockout';
import type { KnockoutSeries } from '../types/knockout';
import { formatUserError } from '../utils/formatUserError';

export default function TournamentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { addNotification } = useNotifications();
  const [tournament, setTournament] = useState<Tournament | null>(null);
  const [rounds, setRounds] = useState<Round[]>([]);
  const [currentRound, setCurrentRound] = useState<Round | null>(null);
  const [matches, setMatches] = useState<Match[]>([]);
  const [standings, setStandings] = useState<PlayerStanding[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isMatchModalOpen, setIsMatchModalOpen] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState<Match | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);
  const [matrixView, setMatrixView] = useState<'byOpponent' | 'byRound'>('byOpponent');
  const [isLoadingStandings, setIsLoadingStandings] = useState(false);
  const [tournamentConfig, setTournamentConfig] = useState<TournamentConfig | null>(null);
  const [standingsView, setStandingsView] = useState<'live' | 'swiss_frozen' | 'bracket'>('live');
  const [bracketColumns, setBracketColumns] = useState<BracketRoundColumn[]>([]);

  // Preview State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isManualPairingOpen, setIsManualPairingOpen] = useState(false);
  const [previewData, setPreviewData] = useState<{
    matches: Array<{
      player1: any;
      player2?: any;
      startPlayerId?: number;
      reason?: string;
    }>;
    warnings: string[];
    startStats?: Record<number, { totalStarts: number; lastStartRound: number }>;
    previousOpponents?: Record<number, number[]>;
  } | null>(null);

  const [isRoundResultsModalOpen, setIsRoundResultsModalOpen] = useState(false);
  const [selectedRoundResults, setSelectedRoundResults] = useState<{
    round: Round;
    matches: Match[];
    results: Array<{
      match_number: number;
      results: Array<{ player_name: string; position: number; points: number }>;
    }>;
  } | null>(null);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([]);
  const [matchPlayersMap, setMatchPlayersMap] = useState<{ [matchId: number]: any[] }>({});
  const [matchResultsMap, setMatchResultsMap] = useState<{ [matchId: number]: any[] }>({});
  // const [tournamentConfig, setTournamentConfig] = useState<TournamentConfig | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editFormData, setEditFormData] = useState({ name: '', date: '', place_id: '' });
  const [places, setPlaces] = useState<Place[]>([]);
  const [tiebreakCriteria, setTiebreakCriteria] = useState<any[]>([]);
  const [isAddPlayerOpen, setIsAddPlayerOpen] = useState(false);
  const [isPrestartConfigOpen, setIsPrestartConfigOpen] = useState(false);
  const [prestartConfigLoading, setPrestartConfigLoading] = useState(false);
  const [prestartConfig, setPrestartConfig] = useState<TournamentConfig | null>(null);
  const [prestartNumRounds, setPrestartNumRounds] = useState('1');
  const [settingsCompetitionFormat, setSettingsCompetitionFormat] =
    useState<CompetitionFormat>('swiss');
  const [tournamentSettingsModalKey, setTournamentSettingsModalKey] = useState(0);
  const [buchholzByeMode, setBuchholzByeMode] = useState<BuchholzByeMode>('legacy');

  const loadTournament = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const data = await DatabaseService.getTournamentById(Number(id));
      setTournament(data as Tournament);
    } catch (error) {
      console.error('Error loading tournament:', error);
      addNotification({
        message: formatUserError(error, t('tournaments.detail.load_error')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [id, addNotification, t]);

  const loadMatchPlayersForMatches = useCallback(async (matchList: Match[]) => {
    if (matchList.length === 0) return;
    const ids = matchList.filter((m) => m.id).map((m) => m.id!);
    if (ids.length === 0) return;
    const map = await DatabaseService.getMatchPlayersBatch(ids);
    setMatchPlayersMap(map);
  }, []);
  const loadMatchResultsForMatches = useCallback(
    async (matchList: Match[], tournamentId?: number) => {
      const ids = matchList.filter((m) => m.id).map((m) => m.id!);
      if (ids.length === 0) return;
      const map = await DatabaseService.getMatchResultsBatch(ids, tournamentId);
      setMatchResultsMap(map);
    },
    []
  );

  const loadMatches = useCallback(
    async (roundId?: number) => {
      const id = roundId ?? currentRound?.id;
      if (!id) return;
      try {
        const data = await DatabaseService.getRoundMatches(id);
        setMatches(data);
        if (data.length > 0) {
          await loadMatchPlayersForMatches(data);
          await loadMatchResultsForMatches(data);
        }
      } catch (error) {
        console.error('Error loading matches:', error);
      }
    },
    [currentRound?.id, loadMatchPlayersForMatches, loadMatchResultsForMatches]
  );

  const loadRounds = useCallback(async (): Promise<Round[]> => {
    if (!tournament?.id) return [];
    try {
      const data = await DatabaseService.getTournamentRounds(tournament.id);
      setRounds(data);
      if (data.length > 0) {
        const inProgress = data.find((r) => r.status === 'in_progress');
        setCurrentRound(inProgress || data[data.length - 1]);
      } else {
        setCurrentRound(null);
      }
      return data;
    } catch (error) {
      console.error('Error loading rounds:', error);
      return [];
    }
  }, [tournament?.id]);

  /** Evita que una petición antigua de clasificación pise una más reciente (p. ej. tras editar resultados). */
  const standingsLoadSeqRef = useRef(0);

  const loadStandings = useCallback(
    async (_preFetchedRounds?: Round[], isCancelled?: () => boolean) => {
      if (!tournament?.id) return;
      const seq = ++standingsLoadSeqRef.current;
      setIsLoadingStandings(true);
      try {
        const config = await DatabaseService.getTournamentConfig(tournament.id);
        setTournamentConfig(config);
        setBuchholzByeMode(normalizeBuchholzByeMode(config?.buchholz_bye_mode));
        if (isCancelled?.()) return;
        const data = await ReportService.getStandings(tournament.id);
        if (isCancelled?.()) return;
        if (seq !== standingsLoadSeqRef.current) return;
        setStandings(data || []);
      } catch (error: any) {
        if (isCancelled?.()) return;
        if (seq !== standingsLoadSeqRef.current) return;
        console.error('Error loading standings:', error);
        addNotification({
          message: formatUserError(error, t('tournaments.detail.stats_error')),
          type: 'error',
        });
        setStandings([]);
      } finally {
        if (!isCancelled?.() && seq === standingsLoadSeqRef.current) {
          setIsLoadingStandings(false);
        }
      }
    },
    [tournament?.id, addNotification, t]
  );

  const loadTiebreakCriteria = useCallback(async () => {
    if (!tournament?.id) return;
    try {
      const config = await DatabaseService.getTournamentConfig(tournament.id);
      setBuchholzByeMode(normalizeBuchholzByeMode(config?.buchholz_bye_mode));
      setTiebreakCriteria(getEffectiveTiebreakCriteria(config?.tiebreak_criteria));
    } catch (error) {
      console.error('Error loading tiebreak criteria:', error);
    }
  }, [tournament?.id]);

  useEffect(() => {
    if (id) {
      loadTournament();
    }
  }, [id, loadTournament]);

  useEffect(() => {
    const tournamentId = tournament?.id;
    if (!isPrestartConfigOpen || tournamentId == null || !tournament) return;
    const ppm = tournament.players_per_match;
    const numRoundsHint = tournament.number_of_rounds;
    let cancelled = false;
    setPrestartConfigLoading(true);
    (async () => {
      try {
        const c = await DatabaseService.getTournamentConfig(tournamentId);
        if (cancelled) return;
        setPrestartConfig(
          c ?? {
            tournament_id: tournamentId,
            avoid_rematches: true,
            tiebreak_criteria: DEFAULT_TIEBREAK_CRITERIA,
            scoring_system: getDefaultScoringSystem(ppm),
            bye_selection: 'worst',
            player_display_mode: 'per_player',
            pairing_algorithm: 'greedy',
            buchholz_bye_mode: 'legacy',
          }
        );
        setPrestartNumRounds(
          String(numRoundsHint || calculateNumberOfRounds(standings.length || 0))
        );
      } finally {
        if (!cancelled) setPrestartConfigLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isPrestartConfigOpen, tournament, standings.length]);

  useEffect(() => {
    if (!isPrestartConfigOpen || !tournament) return;
    setSettingsCompetitionFormat(tournament.competition_format ?? 'swiss');
  }, [isPrestartConfigOpen, tournament?.competition_format, tournamentSettingsModalKey]);

  useEffect(() => {
    if (!tournament) return;
    let cancelled = false;
    const isCancelled = () => cancelled;
    (async () => {
      const roundsData = await loadRounds();
      if (cancelled) return;
      await loadStandings(roundsData, isCancelled);
    })();
    return () => {
      cancelled = true;
    };
  }, [tournament, loadRounds, loadStandings]);

  useEffect(() => {
    if (currentRound) {
      loadMatches();
    }
  }, [currentRound, loadMatches]);

  // Cargar estadísticas al abrir el panel solo si no hay datos (clasificación y estadísticas comparten cálculo)
  const loadedStandingsForStatsRef = useRef(false);
  useEffect(() => {
    if (!showStats) {
      loadedStandingsForStatsRef.current = false;
      return;
    }
    if (!tournament?.id || standings.length > 0 || isLoadingStandings) return;
    if (loadedStandingsForStatsRef.current) return;
    loadedStandingsForStatsRef.current = true;
    loadStandings();
  }, [showStats, tournament?.id, standings.length, isLoadingStandings, loadStandings]);

  const handleGenerateFirstRound = async () => {
    if (!tournament?.id) return;

    try {
      setIsLoading(true);
      const data = await SwissPairingService.previewFirstRound(tournament.id);
      setPreviewData(data);
      setIsPreviewOpen(true);
    } catch (error: any) {
      console.error('Error generating round:', error);
      addNotification({
        message: formatUserError(error, t('tournaments.detail.round_gen_error')),
        type: 'error',
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinalizeTournament = async () => {
    if (!tournament?.id) return;

    if (!confirm(t('tournaments.detail.finalize_confirm'))) {
      return;
    }

    try {
      setIsLoading(true);
      await DatabaseService.updateTournament(tournament.id, { status: 'completed' });
      await loadTournament(); // Reload tournament to get updated status
      addNotification({
        message: t('tournaments.detail.finalize_success'),
        type: 'success',
        duration: 5000,
      });
      setShowStats(true);
    } catch (error: any) {
      console.error('Error finalizing tournament:', error);
      addNotification({
        message: formatUserError(error, t('tournaments.detail.finalize_error')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartKnockout = async () => {
    if (!tournament?.id) return;
    try {
      setIsLoading(true);
      await KnockoutPairingService.startKnockoutPhase(tournament.id);
      await loadTournament();
      const roundsData = await loadRounds();
      const newRound = roundsData[roundsData.length - 1];
      if (newRound) {
        setCurrentRound(newRound);
        await loadMatches(newRound.id);
      }
      await loadStandings(roundsData);
      addNotification({ message: t('knockout.started'), type: 'success' });
    } catch (error: any) {
      addNotification({
        message: formatUserError(error, t('knockout.start_error')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const loadBracket = useCallback(async () => {
    if (!tournament?.id) return;
    const koRounds = rounds.filter((r) => r.phase === 'knockout');
    const cols: BracketRoundColumn[] = [];
    for (const round of koRounds) {
      if (!round.id) continue;
      const roundMatches = await DatabaseService.getRoundMatches(round.id);
      const nodes = await Promise.all(
        roundMatches.map(async (m) => {
          const players = await DatabaseService.getMatchPlayers(m.id!);
          const results = await DatabaseService.getMatchResults(m.id!);
          const winner = m.series_winner_id
            ? players.find((p) => p.id === m.series_winner_id)?.name
            : undefined;
          let seriesLabel: string | undefined;
          if ((m.series_target_wins ?? 1) > 1 && players.length === 2) {
            const pids = [players[0]!.id!, players[1]!.id!] as [number, number];
            const state = computeSeriesState(m, results, pids);
            seriesLabel = `${state.winsByPlayer[pids[0]] ?? 0}-${state.winsByPlayer[pids[1]] ?? 0}`;
          }
          return {
            match: m,
            player1Name: players[0]?.name ?? '—',
            player2Name: players[1]?.name ?? '—',
            winnerName: winner,
            seriesLabel,
          };
        })
      );
      cols.push({ round, matches: nodes });
    }
    setBracketColumns(cols);
  }, [tournament?.id, rounds, t]);

  useEffect(() => {
    if (tournament && isKnockoutPhaseActive(tournament, rounds)) {
      loadBracket();
    }
  }, [tournament, rounds, loadBracket]);

  const knockoutQualifierInfo = useMemo(() => {
    if (tournament?.competition_format !== 'swiss_knockout') return null;
    const configured = tournamentConfig?.knockout_size ?? 8;
    if (!isKnockoutSize(configured)) return null;
    const activeCount = standings.filter((s) => s.active).length;
    const effective = resolveEffectiveKnockoutSize(configured, activeCount);
    return { configured, effective, activeCount };
  }, [tournament?.competition_format, tournamentConfig?.knockout_size, standings]);

  const frozenSwissStandings = useMemo((): PlayerStanding[] => {
    if (!tournamentConfig?.swiss_standings_snapshot) return standings;
    try {
      return JSON.parse(tournamentConfig.swiss_standings_snapshot) as PlayerStanding[];
    } catch {
      return standings;
    }
  }, [tournamentConfig?.swiss_standings_snapshot, standings]);

  const handleGenerateNextRoundClick = async () => {
    if (!tournament?.id) return;

    // Check if we've reached the maximum number of rounds before proceeding
    const currentRounds = await DatabaseService.getTournamentRounds(tournament.id);
    const maxSwiss =
      tournament.number_of_rounds ||
      (await RoundGenerationService.getEffectiveMaxSwissRounds(tournament));

    if (
      countSwissRounds(currentRounds) >= maxSwiss &&
      !isKnockoutPhaseActive(tournament, currentRounds)
    ) {
      addNotification({
        message: t('tournaments.detail.max_rounds_reached', { max: maxSwiss }),
        type: 'info',
        duration: 5000,
      });
      setShowStats(true);
      return;
    }

    if (isKnockoutPhaseActive(tournament, currentRounds)) {
      try {
        setIsLoading(true);
        await RoundGenerationService.generateNextRound(tournament.id);
        const roundsData = await loadRounds();
        const newRound = roundsData[roundsData.length - 1];
        if (newRound) {
          setCurrentRound(newRound);
          await loadMatches(newRound.id);
        }
        await loadStandings(roundsData);
        await loadBracket();
        addNotification({ message: t('knockout.round_created'), type: 'success' });
      } catch (error: any) {
        addNotification({
          message: formatUserError(error, t('tournaments.detail.round_gen_error')),
          type: 'error',
        });
      } finally {
        setIsLoading(false);
      }
      return;
    }

    try {
      setIsLoading(true);
      const data = await RoundGenerationService.previewNextRound(tournament.id);
      setPreviewData(data);
      setIsPreviewOpen(true);
    } catch (error: any) {
      console.error('Error generating preview:', error);
      addNotification({
        message: formatUserError(error, t('tournaments.detail.preview_error')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmNextRound = async () => {
    if (!tournament?.id || !previewData) return;

    try {
      setIsLoading(true);

      const nextRoundNumber = rounds.length + 1;

      await RoundGenerationService.createRoundFromPairings(
        tournament.id,
        nextRoundNumber,
        previewData.matches
      );

      const roundsData = await loadRounds();
      const newRound = roundsData.length > 0 ? roundsData[roundsData.length - 1] : null;
      if (newRound) {
        setCurrentRound(newRound);
        await loadMatches(newRound.id);
      }
      await loadStandings();

      setIsPreviewOpen(false);
      setPreviewData(null);
      addNotification({
        message: t('tournaments.detail.round_gen_success'),
        type: 'success',
      });
    } catch (error: any) {
      console.error('Error generating round:', error);
      addNotification({
        message: formatUserError(error, t('tournaments.detail.round_gen_error')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmManualPairing = async (pairings: any[]) => {
    if (!tournament?.id) return;

    try {
      setIsLoading(true);

      const nextRoundNumber = rounds.length + 1;

      const startStats = await DatabaseService.getPlayerStartStatistics(tournament.id);
      const pairingsWithStarts = await Promise.all(
        pairings.map(async (p) => {
          if (!p.player2) return p;
          const id1 = (p.player1.player_id ?? p.player1.id) as number;
          const id2 = (p.player2.player_id ?? p.player2.id) as number;
          const startPlayerId = await SwissPairingService.pickStartPlayerForPair(
            id1,
            id2,
            startStats
          );
          return { ...p, startPlayerId };
        })
      );

      await RoundGenerationService.createRoundFromPairings(
        tournament.id,
        nextRoundNumber,
        pairingsWithStarts
      );

      const roundsData = await loadRounds();
      const newRound = roundsData.length > 0 ? roundsData[roundsData.length - 1] : null;
      if (newRound) {
        setCurrentRound(newRound);
        await loadMatches(newRound.id);
      }
      await loadStandings();

      setIsManualPairingOpen(false);
      addNotification({
        message: t('tournaments.detail.manual_round_success'),
        type: 'success',
      });
    } catch (error: any) {
      console.error('Error generating manual round:', error);
      addNotification({
        message: formatUserError(error, t('tournaments.detail.manual_round_error')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenMatchModal = (match: Match) => {
    // Set the match and open modal - MatchResultForm will reload data via useEffect
    setSelectedMatch(match);
    setIsMatchModalOpen(true);
  };

  const handleViewRoundResults = async (round: Round) => {
    try {
      setIsLoading(true);
      const roundMatches = await DatabaseService.getRoundMatches(round.id!);
      const matchesData: any[] = [];

      for (const match of roundMatches) {
        const [matchResults, matchPlayers] = await Promise.all([
          DatabaseService.getMatchResults(match.id!, tournament!.id!),
          DatabaseService.getMatchPlayers(match.id!),
        ]);
        const displayResults = isSeriesMatch(match)
          ? matchResults
          : resultsForDisplay(match, matchResults);

        const sortedResults = displayResults
          .map((result) => ({
            player_id: result.player_id,
            player_name:
              (result as { player_name?: string }).player_name ??
              t('tournaments.detail.unknown_player'),
            position: result.position,
            points: result.points,
            game_number: result.game_number ?? 1,
          }))
          .sort((a, b) => a.position - b.position);

        matchesData.push({
          match_number: match.match_number,
          match,
          players: matchPlayers,
          allResults: matchResults,
          first_player_id: resolveGameStarter(match, 1),
          results: sortedResults,
          isSeries: isSeriesMatch(match),
        });
      }

      // Sort matches by match number
      matchesData.sort((a, b) => a.match_number - b.match_number);

      setSelectedRoundResults({
        round,
        matches: roundMatches,
        results: matchesData,
      });
      setIsRoundResultsModalOpen(true);
    } catch (error) {
      console.error('Error loading round results:', error);
      addNotification({
        message: formatUserError(error, t('tournaments.detail.round_results_error')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleMatchResultSaved = async () => {
    setIsMatchModalOpen(false);
    setSelectedMatch(null);
    if (!currentRound?.id || !tournament?.id) return;

    // Refresh current round's matches and results
    const updatedMatches = await DatabaseService.getRoundMatches(currentRound.id);
    setMatches(updatedMatches);
    await loadMatchPlayersForMatches(updatedMatches);
    await loadMatchResultsForMatches(updatedMatches, tournament?.id);

    // Siempre recalcular clasificación tras guardar (puntos / Buchholz / H2H / último criterio).
    await loadStandings();

    if (tournament.knockout_phase_started_at) {
      await loadBracket();
    }

    const allCompleted = updatedMatches.every((m) => m.status === 'completed');

    // Ronda ya cerrada: solo actualizamos standings (arriba) y salimos
    if (currentRound.status === 'completed') {
      return;
    }

    if (!allCompleted) return;

    // Todas las partidas cerradas: marcar ronda completada y refrescar rondas en UI
    await DatabaseService.updateRound(currentRound.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
    });
    const roundsAfter = await loadRounds();

    const players = await DatabaseService.getTournamentPlayers(tournament.id);
    const effectiveMaxRounds =
      tournament.number_of_rounds || calculateNumberOfRounds(players.length);

    if (roundsAfter.length < effectiveMaxRounds) {
      addNotification({
        message: t('tournaments.detail.round_completed'),
        type: 'info',
        duration: 3000,
      });
    } else {
      addNotification({
        message: t('tournaments.detail.last_round_completed'),
        type: 'success',
        duration: 5000,
      });
    }
  };

  const tournamentConfigReadOnly = useMemo(() => rounds.length > 0, [rounds.length]);

  const canOfferDeleteLastRound = useMemo(() => {
    if (!tournament || tournament.status === 'completed' || rounds.length === 0) return false;
    const last = rounds[rounds.length - 1];
    if (!last?.id || last.status !== 'pending' || currentRound?.id !== last.id) return false;
    // Bye: solo 1 fila de resultado (auto); no cuenta como “ronda con resultados guardados”.
    return !matches.some((m) => m.id && (matchResultsMap[m.id]?.length ?? 0) >= 2);
  }, [tournament, rounds, currentRound?.id, matches, matchResultsMap]);

  const handlePrestartConfigSave = async (
    cfg: Partial<TournamentConfig> & {
      bye_selection?: 'worst' | 'random' | 'round_robin';
      player_display_mode?: 'per_player' | 'names_only' | 'usernames_only';
      pairing_algorithm?: 'greedy' | 'backtracking';
      buchholz_bye_mode?: BuchholzByeMode;
    }
  ) => {
    if (!tournament?.id) return;
    setIsLoading(true);
    try {
      const koNotStarted = !tournament.knockout_phase_started_at;

      if (!tournamentConfigReadOnly) {
        const n = Math.max(1, Math.min(99, parseInt(String(prestartNumRounds), 10) || 1));
        await DatabaseService.updateTournament(tournament.id, { number_of_rounds: n });
      }

      if (
        koNotStarted &&
        settingsCompetitionFormat !== (tournament.competition_format ?? 'swiss')
      ) {
        await DatabaseService.updateTournament(tournament.id, {
          competition_format: settingsCompetitionFormat,
        });
      }

      const existing = await DatabaseService.getTournamentConfig(tournament.id);
      const configUpdates: Parameters<typeof DatabaseService.updateTournamentConfig>[1] = {};

      if (!tournamentConfigReadOnly) {
        Object.assign(configUpdates, {
          avoid_rematches: cfg.avoid_rematches,
          tiebreak_criteria: cfg.tiebreak_criteria,
          scoring_system: cfg.scoring_system,
          bye_selection: cfg.bye_selection,
          player_display_mode: cfg.player_display_mode,
          pairing_algorithm: cfg.pairing_algorithm,
          buchholz_bye_mode: cfg.buchholz_bye_mode,
        });
      }

      if (settingsCompetitionFormat === 'swiss_knockout' && koNotStarted) {
        Object.assign(configUpdates, {
          knockout_size: cfg.knockout_size,
          knockout_series: cfg.knockout_series,
          knockout_play_bronze_match: cfg.knockout_play_bronze_match,
          knockout_match_starter: cfg.knockout_match_starter,
          knockout_series_starter_mode: cfg.knockout_series_starter_mode,
          knockout_series_alternate_starter: cfg.knockout_series_alternate_starter,
        });
      }

      if (!existing) {
        await DatabaseService.createTournamentConfig({
          tournament_id: tournament.id,
          avoid_rematches: cfg.avoid_rematches ?? true,
          tiebreak_criteria: cfg.tiebreak_criteria ?? DEFAULT_TIEBREAK_CRITERIA,
          scoring_system:
            cfg.scoring_system ?? getDefaultScoringSystem(tournament.players_per_match),
          bye_selection: cfg.bye_selection ?? 'worst',
          player_display_mode: cfg.player_display_mode ?? 'per_player',
          pairing_algorithm: cfg.pairing_algorithm ?? 'greedy',
          buchholz_bye_mode: cfg.buchholz_bye_mode ?? 'legacy',
          knockout_size: cfg.knockout_size ?? 8,
          knockout_series: cfg.knockout_series ?? 'best_of_1',
          knockout_play_bronze_match: cfg.knockout_play_bronze_match ?? false,
          knockout_match_starter: cfg.knockout_match_starter ?? 'higher_swiss_seed',
          knockout_series_starter_mode: cfg.knockout_series_starter_mode ?? 'alternate',
          knockout_series_alternate_starter: cfg.knockout_series_alternate_starter ?? false,
        });
      } else if (Object.keys(configUpdates).length > 0) {
        await DatabaseService.updateTournamentConfig(tournament.id, configUpdates);
      }

      addNotification({
        message: t('tournaments.detail.prestart_config_success'),
        type: 'success',
      });
      setIsPrestartConfigOpen(false);
      await loadTournament();
      const roundsData = await loadRounds();
      await loadStandings(roundsData);
      await loadTiebreakCriteria();
    } catch (e) {
      console.error(e);
      addNotification({
        message: formatUserError(e, t('tournaments.detail.prestart_config_error')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteLastRound = async () => {
    if (!tournament?.id || !currentRound?.id || !canOfferDeleteLastRound) return;
    if (!confirm(t('tournaments.detail.delete_last_round_confirm'))) return;
    setIsLoading(true);
    try {
      const res = await DatabaseService.deleteLastPendingRoundWithoutResults(
        currentRound.id,
        tournament.id
      );
      if (!res.deleted) {
        const key =
          res.reason === 'has_results'
            ? 'tournaments.detail.delete_last_round_error_has_results'
            : 'tournaments.detail.delete_last_round_error_generic';
        addNotification({ message: t(key), type: 'error' });
        return;
      }
      addNotification({
        message: t('tournaments.detail.delete_last_round_success'),
        type: 'success',
      });
      await loadTournament();
      const roundsData = await loadRounds();
      setMatches([]);
      setMatchResultsMap({});
      setMatchPlayersMap({});
      await loadStandings(roundsData);
    } catch (e) {
      console.error(e);
      addNotification({
        message: formatUserError(e, t('tournaments.detail.delete_last_round_error_generic')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenEditModal = async () => {
    if (!tournament) return;
    const dateStr = tournament.date?.includes('T')
      ? tournament.date.split('T')[0]
      : (tournament.date ?? '');
    setEditFormData({
      name: tournament.name ?? '',
      date: dateStr,
      place_id: tournament.place_id?.toString() ?? '',
    });
    try {
      const data = await DatabaseService.getAllPlaces();
      setPlaces(data);
    } catch (e) {
      console.error('Error loading places:', e);
    }
    setIsEditModalOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!tournament?.id) return;
    if (!editFormData.name.trim()) {
      addNotification({ message: t('tournaments.form.name_req'), type: 'error' });
      return;
    }
    try {
      setIsLoading(true);
      await DatabaseService.updateTournament(tournament.id, {
        name: editFormData.name.trim(),
        date: editFormData.date || undefined,
        place_id: editFormData.place_id ? Number(editFormData.place_id) : undefined,
      });
      addNotification({ message: t('tournaments.detail.update_success'), type: 'success' });
      setIsEditModalOpen(false);
      await loadTournament();
    } catch (error) {
      console.error('Error updating tournament:', error);
      addNotification({
        message: formatUserError(error, t('tournaments.detail.update_error')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const saveTournamentPng = async (html: string, filenameSuffix: string) => {
    if (!tournament?.id) return;

    try {
      setIsLoading(true);
      const dataUrl = await htmlDocumentToPngDataUrl(html);
      const filename = `${tournament.name.replace(/[^a-z0-9]/gi, '_')}_${filenameSuffix}.png`;
      const result = await window.electronAPI.saveFile(dataUrl, filename, 'image');
      if (result.success) {
        addNotification({
          message: t('tournaments.reports.export_image_success'),
          type: 'success',
        });
      } else if (!result.canceled) {
        addNotification({
          message:
            t('tournaments.reports.export_image_error') +
            ': ' +
            (result.error || t('common.error_unknown')),
          type: 'error',
        });
      }
    } catch (error) {
      console.error('Error exporting tournament image:', error);
      addNotification({
        message: formatUserError(error, t('tournaments.reports.export_image_error')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleExportPodiumImage = async () => {
    if (!tournament?.id) return;
    const html = await ReportService.generateTournamentImage(tournament.id);
    await saveTournamentPng(html, 'podio');
  };

  const handleExportStandingsImage = async () => {
    if (!tournament?.id) return;
    const html = await ReportService.generateStandingsTableImage(tournament.id);
    await saveTournamentPng(html, 'clasificacion');
  };

  const handleExportKnockoutBracketImage = async () => {
    if (!tournament?.id) return;
    const html = await ReportService.generateKnockoutBracketImage(tournament.id);
    await saveTournamentPng(html, 'cuadro_ko');
  };

  const isSwissKnockoutFormat = tournament?.competition_format === 'swiss_knockout';
  const showKnockoutBracketExport =
    tournament != null && canExportKnockoutBracket(tournament, rounds);
  const showKnockoutBracketExportDisabled =
    isSwissKnockoutFormat && !showKnockoutBracketExport && standings.length > 0;

  const pngExportMenu = (
    <>
      {tournament?.type === 'qualifier' && (
        <button
          type="button"
          onClick={handleExportPodiumImage}
          disabled={standings.length === 0}
          className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
        >
          {t('tournaments.reports.export_image')}
        </button>
      )}
      <button
        type="button"
        onClick={handleExportStandingsImage}
        disabled={standings.length === 0}
        className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent dark:disabled:hover:bg-transparent"
      >
        {t('tournaments.reports.export_image_standings')}
      </button>
      {showKnockoutBracketExport && (
        <button
          type="button"
          onClick={handleExportKnockoutBracketImage}
          className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
        >
          {t('tournaments.reports.export_image_ko_bracket')}
        </button>
      )}
      {showKnockoutBracketExportDisabled && (
        <div
          className="block w-full text-left px-4 py-2 text-sm text-gray-400 dark:text-gray-500 cursor-not-allowed"
          title={t('tournaments.reports.export_image_ko_bracket_disabled')}
        >
          {t('tournaments.reports.export_image_ko_bracket_disabled')}
        </div>
      )}
    </>
  );

  const handleGenerateReport = async (
    type: 'excel' | 'csv-standings' | 'csv-matches' | 'csv-stats'
  ) => {
    if (!tournament?.id) return;

    try {
      setIsLoading(true);
      let data: any;
      let filename = `${tournament.name.replace(/[^a-z0-9]/gi, '_')}`;

      switch (type) {
        case 'excel':
          data = await ReportService.generateTournamentExcel(tournament.id);
          filename += '.xlsx';
          break;
        case 'csv-standings':
        case 'csv-matches':
        case 'csv-stats':
          data = await ReportService.generateTournamentCSV(tournament.id, type);
          filename += `_${type}.csv`;
          break;
      }

      const result = await window.electronAPI.saveFile(
        data,
        filename,
        type.startsWith('csv') ? 'csv' : 'excel'
      );
      if (result.success) {
        addNotification({
          message: t('reports.export_success'),
          type: 'success',
        });
      } else if (!result.canceled) {
        addNotification({
          message: t('reports.export_error') + ': ' + (result.error || t('common.error_unknown')),
          type: 'error',
        });
      }
    } catch (error) {
      console.error('Error generating report:', error);
      addNotification({
        message: formatUserError(error, t('reports.export_error')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (tournament?.id) {
      loadTiebreakCriteria();
    }
  }, [tournament, loadTiebreakCriteria]);

  const getTiebreakValue = (standing: PlayerStanding, criterionId: string): string => {
    if (criterionId === 'head_to_head') {
      const text = formatPlayerStandingHeadToHeadText(standing, t);
      return text || '\u2014';
    }

    const value = standing.tiebreak_values[criterionId];
    if (value === undefined || value === null) return '-';

    if (criterionId === 'wins') {
      return value.toString();
    } else if (
      criterionId === 'opponent_points_drop_worst' ||
      criterionId === 'opponent_points_drop_best_worst'
    ) {
      return Number(value.toFixed(2)).toString();
    } else if (criterionId === 'point_difference') {
      return value > 0 ? `+${value.toFixed(0)}` : value.toFixed(0);
    }
    return value.toString();
  };

  const getTiebreakLabel = (criterionId: string): string => {
    const criterion = tiebreakCriteria.find((c) => c.id === criterionId);
    if (!criterion) return criterionId;

    // Short labels for table
    return t(`tiebreaks_short.${criterionId}`, { defaultValue: criterion.name });
  };

  const handleDropout = async (playerStanding: PlayerStanding) => {
    if (!tournament?.id) return;

    const isUnstarted = rounds.length === 0;

    if (isUnstarted) {
      const newPlayerCount = standings.length - 1;
      const newCalculatedRounds = calculateNumberOfRounds(newPlayerCount);
      const currentRoundsVal =
        tournament.number_of_rounds || calculateNumberOfRounds(standings.length);

      if (newCalculatedRounds < currentRoundsVal) {
        if (
          !confirm(
            t('tournaments.registration.remove_reduces_rounds', {
              current: currentRoundsVal,
              new: newCalculatedRounds,
            })
          )
        )
          return;
      } else {
        if (
          !confirm(
            t('tournaments.registration.remove_confirm', { name: playerStanding.player_name })
          )
        )
          return;
      }

      try {
        setIsLoading(true);
        await DatabaseService.removePlayerFromTournament(tournament.id, playerStanding.player_id);
        if (newCalculatedRounds < currentRoundsVal) {
          await DatabaseService.updateTournament(tournament.id, {
            number_of_rounds: newCalculatedRounds,
          });
          loadTournament();
        }
        addNotification({
          message: t('tournaments.registration.remove_success'),
          type: 'success',
        });
        await loadStandings();
      } catch (error) {
        console.error('Error removing player:', error);
        addNotification({
          message: formatUserError(error, t('tournaments.registration.remove_error')),
          type: 'error',
        });
      } finally {
        setIsLoading(false);
      }
    } else {
      if (!currentRound) return;
      if (
        !confirm(t('tournaments.registration.remove_dropout', { name: playerStanding.player_name }))
      )
        return;

      try {
        setIsLoading(true);
        await DatabaseService.updateTournamentPlayerStatus(
          tournament.id,
          playerStanding.player_id,
          {
            active: false,
            dropout_round: currentRound.round_number,
          }
        );
        addNotification({
          message: t('tournaments.detail.dropout_success'),
          type: 'success',
        });
        await loadStandings();
      } catch (error) {
        console.error('Error dropping player:', error);
        addNotification({
          message: formatUserError(error, t('tournaments.detail.dropout_error')),
          type: 'error',
        });
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleRestore = async (playerStanding: PlayerStanding) => {
    if (!tournament?.id) return;
    if (
      !confirm(
        t('tournaments.registration.reincorporate_confirm', { name: playerStanding.player_name })
      )
    )
      return;

    try {
      setIsLoading(true);
      await DatabaseService.updateTournamentPlayerStatus(tournament.id, playerStanding.player_id, {
        active: true,
        dropout_round: null,
      });
      addNotification({
        message: t('tournaments.registration.reactivate_success'),
        type: 'success',
      });
      await loadStandings();
    } catch (error) {
      console.error('Error restoring player:', error);
      addNotification({
        message: formatUserError(error, t('tournaments.registration.reactivate_error')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlayerAdded = async () => {
    if (!tournament?.id) return;
    await loadStandings();
    // Also reload rounds if needed? Usually adding player doesn't change rounds unless we regenerate.
    // But we might want to update preview if open?
    addNotification({
      message: t('tournaments.detail.player_added_success'),
      type: 'success',
    });
  };

  const standingsColumns: Column<PlayerStanding>[] = [
    {
      key: 'position',
      header: '#',
      render: (_, index) => (index ?? 0) + 1,
    },
    {
      key: 'player_name',
      header: t('players.name'), // 'Nombre' or 'Player'
    },
    {
      key: 'wins',
      header: t('tiebreaks_short.wins'),
      render: (standing) => standing.wins,
    },
    ...tiebreakCriteria
      .filter((c) => c.enabled && c.id !== 'wins')
      .map((criterion) => ({
        key: `tiebreak_${criterion.id}`,
        header: getTiebreakLabel(criterion.id),
        title: criterion.id === 'head_to_head' ? t('stats.h2h_column_hint') : undefined,
        render: (standing: PlayerStanding) =>
          criterion.id === 'head_to_head'
            ? renderPlayerStandingHeadToHeadCell(standing, t)
            : getTiebreakValue(standing, criterion.id),
      })),
    {
      key: 'starts_count',
      header: `🎲 ${t('tournaments.detail.starts_count')}`,
      render: (standing) => standing.starts_count ?? 0,
    },
    {
      key: 'status',
      header: t('tournaments.columns.status'),
      render: (standing) => {
        if (standing.active) {
          return (
            <span className="px-2 py-1 rounded text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
              {t('tournaments.statuses.active')}
            </span>
          );
        }
        return (
          <span className="px-2 py-1 rounded text-xs font-medium bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200">
            {t('tournaments.statuses.dropped', { round: standing.dropout_round })}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      width: '1%',
      className: 'whitespace-nowrap w-1 text-right',
      render: (standing) => {
        if (standing.active) {
          return (
            <Button
              variant="danger"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleDropout(standing);
              }}
              title={t('tournaments.detail.dropout_btn')}
              disabled={tournament?.status === 'completed'}
            >
              x
            </Button>
          );
        }
        // Restore only allowed if dropped in current round and round not completed (per user rule)
        // OR if admin allows it? User said "dropouts can only be undone if the current round has not yet finished".
        const canRestore =
          tournament?.status !== 'completed' &&
          currentRound &&
          currentRound.status !== 'completed' &&
          standing.dropout_round === currentRound.round_number;

        if (canRestore) {
          return (
            <Button
              variant="success"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleRestore(standing);
              }}
              title={t('tournaments.detail.restore_btn')}
            >
              {t('tournaments.detail.restore_btn_short')}
            </Button>
          );
        }
        return null;
      },
    },
  ];

  const standingsForTable = standingsView === 'swiss_frozen' ? frozenSwissStandings : standings;
  const filteredStandings =
    selectedPlayerIds.length > 0
      ? standingsForTable.filter((s) => selectedPlayerIds.includes(s.player_id))
      : standingsForTable;

  // Partidas en las que participan los jugadores seleccionados (por match_players o match_results), de la ronda actual
  const filteredMatches =
    selectedPlayerIds.length > 0
      ? matches.filter((m) => {
          const playerIdsInMatch = (matchPlayersMap[m.id!] || []).map(
            (mp: { player_id?: number; id?: number }) => mp.player_id ?? mp.id
          );
          const playerIdsInResults = (matchResultsMap[m.id!] || []).map(
            (r: { player_id?: number }) => r.player_id
          );
          const participantIds = [...new Set([...playerIdsInMatch, ...playerIdsInResults])].filter(
            (id): id is number => id != null
          );
          return participantIds.some((pid) => selectedPlayerIds.includes(pid));
        })
      : matches;

  // Jugadores y resultados de partidas se cargan solo en loadMatches() y handleMatchResultSaved
  // (no en useEffect por matches para evitar queries duplicadas)

  // Check if match is a bye (1 result, completed, typically 0 players in match_players)
  const isByeMatch = (match: Match): boolean => {
    if (match.status !== 'completed') return false;
    const results = matchResultsMap[match.id!] || [];
    const players = matchPlayersMap[match.id!] || [];
    // Bye matches have exactly 1 result and typically 0 players in match_players
    // (though sometimes they might have 1 player if it was added)
    return results.length === 1 && players.length <= 1;
  };

  // Get position color classes
  const getPositionColor = (position: number, playersPerMatch: number): string => {
    // For 2-player matches, only 1st place has style, 2nd place has no style
    if (playersPerMatch === 2 && position === 2) {
      return ''; // No style for 2nd place in 2-player matches
    }

    const colors: { [key: number]: string } = {
      1: 'text-green-600 dark:text-green-400 font-bold', // Ganador
      2: 'text-yellow-600 dark:text-yellow-400 font-bold', // 2do lugar (for 3+ players)
      3: 'text-blue-600 dark:text-blue-400 font-bold', // 3er lugar
      4: 'text-purple-600 dark:text-purple-400 font-bold', // 4to lugar
      5: 'text-pink-600 dark:text-pink-400 font-bold', // 5to lugar (si hay 5 jugadores)
    };
    // Always return a styled color, defaulting to gray with bold for unknown positions
    return colors[position] || 'text-gray-600 dark:text-gray-400 font-bold';
  };

  // Get legend items based on players per match
  const getLegendItems = (playersPerMatch: number) => {
    const items = [];
    const labels = [
      t('tournaments.detail.winner'),
      t('tournaments.detail.second_place'),
      t('tournaments.detail.third_place'),
      t('tournaments.detail.fourth_place'),
      t('tournaments.detail.fifth_place'),
    ];
    const colors = [
      'text-green-600 dark:text-green-400',
      'text-yellow-600 dark:text-yellow-400',
      'text-blue-600 dark:text-blue-400',
      'text-purple-600 dark:text-purple-400',
      'text-pink-600 dark:text-pink-400',
    ];

    for (let i = 1; i <= playersPerMatch && i <= 5; i++) {
      // For 2-player matches, skip 2nd place in legend (it has no style)
      if (playersPerMatch === 2 && i === 2) {
        continue;
      }
      items.push({
        position: i,
        label: labels[i - 1] || t('tournaments.detail.position_n_short', { n: i }),
        color: colors[i - 1] || 'text-gray-600 dark:text-gray-400',
      });
    }
    return items;
  };

  const matchesColumns: Column<Match>[] = [
    {
      key: 'match_number',
      header: t('tournaments.columns.match'),
    },
    {
      key: 'players',
      header: t('tournaments.columns.players'),
      render: (match) => {
        const players = matchPlayersMap[match.id!] || [];
        const results = matchResultsMap[match.id!] || [];

        // Check if it's a bye match first (before checking if players.length === 0)
        const isBye = isByeMatch(match);

        if (isBye) {
          // Bye match - show player in orange bold
          // Get player name from results (bye matches typically don't have players in match_players)
          let playerName = t('tournaments.detail.unknown_player');
          if (results.length > 0) {
            // Get player name from result
            const result = results[0];
            playerName = result.player_name || t('tournaments.detail.unknown_player');
          } else if (players.length > 0) {
            // Fallback to match_players if results not loaded yet
            playerName = players[0].name;
          }
          return (
            <span className="text-orange-600 dark:text-orange-400 font-bold">{playerName}</span>
          );
        }

        // Not a bye match, check if players are assigned
        if (players.length === 0) return t('tournaments.detail.unassigned');

        if (isSeriesMatch(match) && players.length === 2) {
          return (
            <SeriesMatchGroup
              match={match}
              players={players}
              results={results}
              getPositionColor={(pos) => getPositionColor(pos, tournament?.players_per_match ?? 2)}
            />
          );
        }

        const gameStarter = resolveGameStarter(match, 1);

        // Normal match - show players with position colors
        if (match.status === 'completed') {
          const allResults = matchResultsMap[match.id!] || [];
          const displayResults = isSeriesMatch(match)
            ? allResults
            : resultsForDisplay(match, allResults);
          const playersWithResults = players
            .map((p: any) => {
              const result = displayResults.find((r: any) => r.player_id === p.id);
              return {
                ...p,
                position: result?.position || players.length,
                points: result?.points,
              };
            })
            .sort((a: any, b: any) => a.position - b.position);

          return (
            <div className="flex flex-row items-center gap-3">
              {playersWithResults.map((p: any, idx: number) => (
                <span
                  key={p.id || idx}
                  className={`flex items-center gap-1 ${getPositionColor(
                    p.position,
                    tournament?.players_per_match ?? 2
                  )}`}
                >
                  {idx > 0 && (
                    <span className="text-gray-300 dark:text-gray-600 font-normal mr-1">
                      {t('common.versus')}
                    </span>
                  )}
                  {p.name}
                  {p.points !== undefined && (
                    <span className="text-xs font-semibold ml-0.5 opacity-80">({p.points})</span>
                  )}
                  {gameStarter != null && Number(gameStarter) === Number(p.id) && (
                    <span
                      className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1 rounded border border-blue-200 dark:border-blue-700 cursor-help"
                      title={t('tournaments.detail.first_player_tooltip')}
                    >
                      🎲
                    </span>
                  )}
                </span>
              ))}
            </div>
          );
        }

        // Pending match - show players normally
        return (
          <div className="flex flex-row items-center gap-3">
            {players.map((p: any, index: number) => (
              <span key={p.id} className="flex items-center gap-1">
                {index > 0 && (
                  <span className="text-gray-300 dark:text-gray-600">{t('common.versus')}</span>
                )}
                <span className="font-medium">{p.name}</span>
                {gameStarter != null && Number(gameStarter) === Number(p.id) && (
                  <span
                    className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1 rounded border border-blue-200 dark:border-blue-700 cursor-help"
                    title={t('tournaments.detail.first_player_tooltip')}
                  >
                    🎲
                  </span>
                )}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      key: 'status',
      header: t('tournaments.columns.status'),
      width: '1%',
      className: 'whitespace-nowrap w-1',
      render: (match) => {
        const isBye = isByeMatch(match);
        if (isBye) {
          return (
            <span className="px-2 py-1 rounded text-xs font-medium bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200">
              {t('tournaments.detail.bye_badge')}
            </span>
          );
        }
        return (
          <span
            className={`px-2 py-1 rounded text-xs font-medium ${
              match.status === 'completed'
                ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
            }`}
          >
            {match.status === 'completed'
              ? t('tournaments.statuses.completed')
              : t('tournaments.statuses.pending')}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: t('tournaments.columns.actions'),
      width: '1%',
      className: 'whitespace-nowrap w-1 text-right',
      render: (match) => {
        const isBye = isByeMatch(match);
        // Don't show button for bye matches
        if (isBye) {
          return (
            <span className="text-sm text-gray-500 dark:text-gray-400 italic">
              {t('tournaments.detail.bye_not_editable')}
            </span>
          );
        }

        return (
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleOpenMatchModal(match)}
            disabled={tournament?.status === 'completed'}
            className="whitespace-nowrap"
          >
            {match.status === 'completed' ? t('common.edit') : t('common.play')}
          </Button>
        );
      },
    },
  ];

  if (!tournament) {
    return (
      <div className="px-4 py-6">
        <p className="text-center py-8 text-gray-500 dark:text-gray-400">{t('common.loading')}</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <div className="mb-4">
        <Button variant="secondary" onClick={() => navigate('/tournaments')}>
          ← {t('common.back')}
        </Button>
      </div>

      <div className="card mb-6 relative z-20 overflow-visible">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold mb-2">
              {tournament.place_name ?? '?'} - {tournament.name}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {t(`tournaments.types.${tournament.type}`)} • {formatDateForDisplay(tournament.date)}
              {(() => {
                const planned =
                  tournament.number_of_rounds || calculateNumberOfRounds(standings.length || 0);
                const safePlanned = Math.max(1, planned);
                const cur =
                  currentRound?.round_number ??
                  (rounds.length > 0 ? rounds[rounds.length - 1].round_number : 0);
                return (
                  <>
                    {' • '}
                    {safePlanned === 1
                      ? t('tournaments.detail.rounds_planned_one', { count: safePlanned })
                      : t('tournaments.detail.rounds_planned_other', { count: safePlanned })}
                    {rounds.length > 0 && cur > 0 && (
                      <>
                        {' • '}
                        {t('tournaments.detail.rounds_progress', {
                          current: cur,
                          total: safePlanned,
                        })}
                      </>
                    )}
                  </>
                );
              })()}
              {tournament.status === 'completed' && (
                <span className="ml-2 px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-sm font-medium">
                  {t('tournaments.statuses.completed')}
                </span>
              )}
            </p>
            {knockoutQualifierInfo && (
              <p className="text-sm text-amber-800 dark:text-amber-200 mt-1">
                {t('knockout.qualifiers_configured', {
                  count: knockoutQualifierInfo.configured,
                })}
                {knockoutQualifierInfo.effective != null &&
                  knockoutQualifierInfo.effective < knockoutQualifierInfo.configured && (
                    <span className="text-gray-600 dark:text-gray-400">
                      {' '}
                      —{' '}
                      {t('knockout.qualifiers_effective', {
                        count: knockoutQualifierInfo.effective,
                        active: knockoutQualifierInfo.activeCount,
                      })}
                    </span>
                  )}
              </p>
            )}
          </div>
          <div className="flex space-x-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setIsAddPlayerOpen(true)}
              disabled={tournament?.status === 'completed' || rounds.length > 1}
              title={
                rounds.length > 1
                  ? t('tournaments.detail.add_player_blocked_title')
                  : t('tournaments.detail.add_player_title')
              }
            >
              + {t('players.new')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setTournamentSettingsModalKey((k) => k + 1);
                setIsPrestartConfigOpen(true);
              }}
              title={
                tournamentConfigReadOnly
                  ? t('tournaments.detail.tournament_settings_view_hint')
                  : t('tournaments.detail.prestart_settings_hint')
              }
            >
              {t('tournaments.detail.prestart_settings')}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleOpenEditModal}>
              {t('common.edit')}
            </Button>
            <Button
              variant={showMatrix ? 'primary' : 'secondary'}
              onClick={() => setShowMatrix(!showMatrix)}
              title={t('tournaments.detail.view_matrix_title')}
            >
              📊 {t('tournaments.detail.matrix_btn')}
            </Button>
            <Button
              variant={showStats ? 'primary' : 'secondary'}
              onClick={() => setShowStats(!showStats)}
              title={t('tournaments.detail.close_stats')}
            >
              📊 {showStats ? t('tournaments.detail.close_stats') : t('tournaments.detail.stats')}
            </Button>
            <div className="relative z-50 group">
              <Button variant="primary">{t('tournaments.export_btn')} ▼</Button>
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50 overflow-hidden">
                <button
                  onClick={() => handleGenerateReport('excel')}
                  className="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 font-semibold"
                >
                  {t('tournaments.reports.export_excel')}
                </button>
                <div className="px-4 py-2 text-xs text-gray-400 font-semibold uppercase tracking-wider border-t border-gray-200 dark:border-gray-700">
                  {t('tournaments.reports.export_csv_title')}
                </div>
                <button
                  onClick={() => handleGenerateReport('csv-standings')}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {t('tournaments.reports.export_csv_standings')}
                </button>
                <button
                  onClick={() => handleGenerateReport('csv-matches')}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {t('tournaments.reports.export_csv_matches')}
                </button>
                <button
                  onClick={() => handleGenerateReport('csv-stats')}
                  className="block w-full text-left px-4 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                >
                  {t('tournaments.reports.export_csv_stats')}
                </button>
                <div className="px-4 py-2 text-xs text-gray-400 font-semibold uppercase tracking-wider border-t border-gray-200 dark:border-gray-700">
                  {t('tournaments.reports.export_image_title')}
                </div>
                {pngExportMenu}
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title={t('tournaments.detail.edit_tournament_title')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsEditModalOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={handleSaveEdit} isLoading={isLoading}>
              {t('common.save')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('tournaments.form.name_label')}
            value={editFormData.name}
            onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
            required
          />
          <Input
            label={t('common.date')}
            type="date"
            value={editFormData.date}
            onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
          />
          <Select
            label={t('common.place')}
            value={editFormData.place_id}
            onChange={(e) => setEditFormData({ ...editFormData, place_id: e.target.value })}
            options={[
              { value: '', label: t('tournaments.form.select_place') },
              ...places.map((p) => ({ value: p.id!.toString(), label: p.name })),
            ]}
          />
        </div>
      </Modal>

      {/* Filtro por jugador: aplica a estadísticas (excepto podio), clasificación y partidas */}
      {standings.length > 0 && (
        <div className="card mb-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('tournaments.detail.filter_by_player')}
          </h3>
          <MultiSelect
            label=""
            options={standings.map((s) => ({ value: s.player_id, label: s.player_name }))}
            value={selectedPlayerIds}
            onChange={(v) => setSelectedPlayerIds(v as number[])}
            placeholder={t('tournaments.detail.all_players')}
            className="max-w-xs"
          />
          {selectedPlayerIds.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              {t('tournaments.detail.filter_info')}
            </p>
          )}
        </div>
      )}

      {showMatrix && (
        <div className="mb-8">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-2xl font-bold">{t('tournaments.detail.matrix_title')}</h2>
            <div className="flex items-center gap-2">
              <Button
                variant={matrixView === 'byOpponent' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setMatrixView('byOpponent')}
              >
                {t('tournaments.detail.matrix_view_by_opponent')}
              </Button>
              <Button
                variant={matrixView === 'byRound' ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setMatrixView('byRound')}
              >
                {t('tournaments.detail.matrix_view_by_round')}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setShowMatrix(false)}>
                {t('common.close')}
              </Button>
            </div>
          </div>
          <div className="card">
            {matrixView === 'byOpponent' ? (
              <TournamentMatrix tournamentId={Number(id)} standings={standings} />
            ) : (
              <TournamentRoundMatrix tournamentId={Number(id)} standings={standings} />
            )}
          </div>
        </div>
      )}

      {showStats && (
        <div className="mb-6">
          {isLoadingStandings ? (
            <div className="card p-8 text-center text-gray-600 dark:text-gray-400">
              {t('tournaments.detail.loading_stats')}
            </div>
          ) : standings.length === 0 ? (
            <div className="card p-8 text-center text-gray-600 dark:text-gray-400">
              {t('tournaments.detail.no_standings_yet')}
            </div>
          ) : (
            <TournamentStats
              tournament={tournament}
              standingsForPodium={standings}
              standings={filteredStandings}
              tiebreakCriteria={tiebreakCriteria}
              buchholzByeMode={buchholzByeMode}
            />
          )}
        </div>
      )}

      {/* Clasificación / standings: mismo filtro que estadísticas y partidas */}
      <div className="card mb-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <h2 className="text-xl font-bold">{t('tournaments.standings')}</h2>
          {tournament.competition_format === 'swiss_knockout' &&
            tournament.knockout_phase_started_at && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant={standingsView === 'live' ? 'primary' : 'secondary'}
                  onClick={() => setStandingsView('live')}
                >
                  {tournament.knockout_phase_started_at
                    ? t('knockout.view.final')
                    : t('knockout.view.live')}
                </Button>
                <Button
                  size="sm"
                  variant={standingsView === 'swiss_frozen' ? 'primary' : 'secondary'}
                  onClick={() => setStandingsView('swiss_frozen')}
                >
                  {t('knockout.view.swiss_frozen')}
                </Button>
                <Button
                  size="sm"
                  variant={standingsView === 'bracket' ? 'primary' : 'secondary'}
                  onClick={() => setStandingsView('bracket')}
                >
                  {t('knockout.view.bracket')}
                </Button>
              </div>
            )}
        </div>
        {tournament.competition_format === 'swiss_knockout' &&
          !tournament.knockout_phase_started_at &&
          rounds.length > 0 && (
            <p className="mb-4 text-sm text-gray-600 dark:text-gray-400">
              {t('knockout.edit_in_settings')}{' '}
              <button
                type="button"
                className="text-blue-600 dark:text-blue-400 underline"
                onClick={() => {
                  setTournamentSettingsModalKey((k) => k + 1);
                  setIsPrestartConfigOpen(true);
                }}
              >
                {t('tournaments.detail.tournament_settings_view_title')}
              </button>
            </p>
          )}
        {standingsView === 'bracket' ? (
          <div>
            {showKnockoutBracketExport && (
              <div className="mb-4 flex justify-end">
                <Button size="sm" variant="secondary" onClick={handleExportKnockoutBracketImage}>
                  {t('tournaments.reports.export_image_ko_bracket')}
                </Button>
              </div>
            )}
            <KnockoutBracket columns={bracketColumns} />
          </div>
        ) : isLoadingStandings && standingsForTable.length === 0 ? (
          <div className="p-6 text-center text-gray-600 dark:text-gray-400">
            {t('common.loading')}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table
              columns={standingsColumns}
              data={filteredStandings}
              keyExtractor={(standing) => standing.player_id}
              emptyMessage={t('tournaments.detail.no_standings_yet')}
            />
          </div>
        )}
      </div>

      {/* Rounds and Matches - Side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        <div className="card lg:col-span-1">
          <div className="flex flex-col gap-3 mb-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-xl font-bold">{t('tournaments.detail.rounds')}</h2>
              {canOfferDeleteLastRound && (
                <Button
                  variant="secondary"
                  size="sm"
                  className="text-red-700 dark:text-red-300 border-red-200 dark:border-red-800"
                  onClick={handleDeleteLastRound}
                  disabled={isLoading}
                  title={t('tournaments.detail.delete_last_round_title')}
                >
                  {t('tournaments.detail.delete_last_round')}
                </Button>
              )}
            </div>
            {rounds.length === 0 ? (
              <div className="flex flex-col gap-2">
                <Button
                  onClick={handleGenerateFirstRound}
                  isLoading={isLoading}
                  disabled={tournament?.status === 'completed'}
                >
                  {t('tournaments.detail.generate_first_round')}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setIsManualPairingOpen(true)}
                  disabled={tournament?.status === 'completed' || isLoading}
                >
                  {t('tournaments.detail.manual_pairings')}
                </Button>
              </div>
            ) : tournament.status === 'completed' ? (
              <Button
                onClick={() => setShowStats(true)}
                variant="primary"
                className="w-full"
                disabled
              >
                {t('tournaments.detail.tournament_finished')}
              </Button>
            ) : (
              (() => {
                const isSwissKo = tournament.competition_format === 'swiss_knockout';
                const koActive = isKnockoutPhaseActive(tournament, rounds);
                const maxSwiss = tournament.number_of_rounds || 1;
                const swissCount = countSwissRounds(rounds);
                const swissRounds = rounds.filter((r) => (r.phase ?? 'swiss') === 'swiss');
                const allSwissCompleted =
                  swissRounds.length >= maxSwiss &&
                  swissRounds.every((r) => r.status === 'completed');

                if (isSwissKo && !koActive && allSwissCompleted) {
                  return (
                    <Button
                      onClick={handleStartKnockout}
                      variant="success"
                      isLoading={isLoading}
                      className="w-full"
                    >
                      {t('knockout.start_phase')}
                    </Button>
                  );
                }

                if (koActive) {
                  const koRounds = rounds.filter((r) => r.phase === 'knockout');
                  const lastKo = koRounds[koRounds.length - 1];
                  const koDone =
                    lastKo?.knockout_stage === 'final' && lastKo.status === 'completed';
                  if (koDone && rounds.every((r) => r.status === 'completed')) {
                    return (
                      <Button
                        onClick={handleFinalizeTournament}
                        variant="success"
                        isLoading={isLoading}
                        className="w-full"
                      >
                        {t('tournaments.detail.finish_tournament')}
                      </Button>
                    );
                  }
                  if (lastKo?.status === 'completed' && !koDone) {
                    return (
                      <Button onClick={handleGenerateNextRoundClick} isLoading={isLoading}>
                        {t('knockout.generate_next_round')}
                      </Button>
                    );
                  }
                  if (currentRound?.status !== 'completed') {
                    return (
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {t('tournaments.detail.complete_current_round')}
                      </div>
                    );
                  }
                  return null;
                }

                const atLastSwiss = swissCount >= maxSwiss;
                if (atLastSwiss && allSwissCompleted && !isSwissKo) {
                  return (
                    <Button
                      onClick={handleFinalizeTournament}
                      variant="success"
                      isLoading={isLoading}
                      className="w-full"
                    >
                      {t('tournaments.detail.finish_tournament')}
                    </Button>
                  );
                }
                if (atLastSwiss && !allSwissCompleted) {
                  return (
                    <Button onClick={() => setShowStats(true)} variant="primary" className="w-full">
                      {t('tournaments.detail.view_results')}
                    </Button>
                  );
                }
                if (currentRound?.status === 'completed') {
                  return (
                    <div className="flex flex-col gap-2">
                      <Button onClick={handleGenerateNextRoundClick} isLoading={isLoading}>
                        {t('tournaments.detail.generate_next_round')}
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setIsManualPairingOpen(true)}
                        disabled={isLoading}
                      >
                        {t('tournaments.detail.manual_pairings')}
                      </Button>
                    </div>
                  );
                }
                return (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    {t('tournaments.detail.complete_current_round')}
                  </div>
                );
              })()
            )}
          </div>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {rounds.map((round) => (
              <div
                key={round.id}
                className={`p-3 rounded-lg transition-colors ${
                  currentRound?.id === round.id
                    ? 'bg-primary-100 dark:bg-primary-900 border-2 border-primary-500'
                    : 'bg-gray-50 dark:bg-gray-700 border-2 border-transparent hover:bg-gray-100 dark:hover:bg-gray-600'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div className="flex-1 cursor-pointer" onClick={() => setCurrentRound(round)}>
                    <span className="font-medium">
                      {round.phase === 'knockout' && round.knockout_stage
                        ? t(knockoutStageI18nKey(round.knockout_stage))
                        : t('tournaments.round_n', { n: round.round_number })}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-xs px-2 py-1 rounded font-medium ${
                        round.status === 'completed'
                          ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200'
                          : round.status === 'in_progress'
                            ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                            : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                      }`}
                    >
                      {round.status === 'completed'
                        ? t('tournaments.detail.round_status_completed')
                        : round.status === 'in_progress'
                          ? t('tournaments.statuses.in_progress')
                          : t('tournaments.statuses.pending')}
                    </span>
                    {round.status === 'completed' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewRoundResults(round);
                        }}
                        className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                        title={t('tournaments.detail.view_round_results')}
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                          />
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
                          />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Matches */}
        <div className="card lg:col-span-3">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">
              {currentRound
                ? t('tournaments.detail.matches_round', { round: currentRound.round_number })
                : t('tournaments.detail.matches')}
            </h2>
            {currentRound && (
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {t('tournaments.detail.matches_completed_count', {
                  completed: filteredMatches.filter((m) => m.status === 'completed').length,
                  total: filteredMatches.length,
                })}
                {selectedPlayerIds.length > 0 && t('tournaments.detail.matches_filtered_hint')}
              </span>
            )}
          </div>

          {/* Legend */}
          {currentRound && tournament && (
            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="flex flex-wrap gap-4 text-sm">
                {getLegendItems(tournament.players_per_match).map((item) => (
                  <div key={item.position} className="flex items-center gap-1">
                    <span className={`${item.color} font-bold`}>{item.label}</span>
                  </div>
                ))}
                <div className="flex items-center gap-1">
                  <span className="text-orange-600 dark:text-orange-400 font-bold">
                    {t('tournaments.detail.bye_badge')}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            {currentRound ? (
              <Table
                columns={matchesColumns}
                data={filteredMatches}
                keyExtractor={(match) => match.id || Math.random()}
                emptyMessage={
                  selectedPlayerIds.length > 0 && filteredMatches.length === 0
                    ? t('tournaments.detail.matches_empty_filtered')
                    : t('tournaments.detail.matches_empty_round')
                }
              />
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                {t('tournaments.detail.select_round')}
              </div>
            )}
          </div>
        </div>
      </div>

      {selectedMatch && (
        <Modal
          isOpen={isMatchModalOpen}
          onClose={() => {
            setIsMatchModalOpen(false);
            setSelectedMatch(null);
          }}
          title={t('tournaments.detail.match_results_title')}
          size="lg"
        >
          <MatchResultForm
            match={selectedMatch}
            tournamentId={tournament.id!}
            playersPerMatch={
              selectedMatch.is_knockout || currentRound?.phase === 'knockout'
                ? 2
                : tournament.players_per_match
            }
            isKnockout={Boolean(selectedMatch.is_knockout || currentRound?.phase === 'knockout')}
            knockoutSeries={(tournamentConfig?.knockout_series as KnockoutSeries) ?? 'best_of_1'}
            tournamentStatus={tournament.status}
            roundStatus={currentRound?.status}
            onSave={handleMatchResultSaved}
            onCancel={() => {
              setIsMatchModalOpen(false);
              setSelectedMatch(null);
            }}
          />
        </Modal>
      )}

      {/* Round Results Modal */}
      <Modal
        isOpen={isRoundResultsModalOpen}
        onClose={() => {
          setIsRoundResultsModalOpen(false);
          setSelectedRoundResults(null);
        }}
        title={
          selectedRoundResults
            ? t('tournaments.detail.round_results_title', {
                number: selectedRoundResults.round.round_number,
              })
            : ''
        }
        size="xl"
      >
        {selectedRoundResults && tournament && (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              {selectedRoundResults.results.some((m: any) => m.isSeries) ? (
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('tournaments.columns.match')}
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('knockout.series.encounter')}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {selectedRoundResults.results.map((matchData: any, index: number) => (
                      <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100 align-top">
                          {matchData.match_number}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                          {matchData.isSeries ? (
                            <SeriesMatchGroup
                              match={matchData.match}
                              players={matchData.players ?? []}
                              results={matchData.allResults ?? []}
                            />
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {matchData.results.map((r: any) => (
                                <span key={r.player_id} className="font-medium">
                                  {r.player_name} ({r.points})
                                </span>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        {t('tournaments.columns.match')}
                      </th>
                      {Array.from({ length: tournament.players_per_match }, (_, i) => {
                        const position = i + 1;
                        const emoji =
                          position === 1
                            ? '🥇'
                            : position === 2
                              ? '🥈'
                              : position === 3
                                ? '🥉'
                                : '';
                        const label =
                          position === 1
                            ? t('tournaments.detail.winner')
                            : position === 2
                              ? t('tournaments.detail.second_place')
                              : position === 3
                                ? t('tournaments.detail.third_place')
                                : position === 4
                                  ? t('tournaments.detail.fourth_place')
                                  : t('tournaments.detail.fifth_place');
                        return (
                          <th
                            key={position}
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                          >
                            {emoji} {label}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {selectedRoundResults.results.map((matchData: any, index: number) => (
                      <tr key={index} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                          {matchData.match_number}
                        </td>
                        {Array.from({ length: tournament.players_per_match }, (_, i) => {
                          const position = i + 1;
                          const result = matchData.results.find(
                            (r: any) => r.position === position
                          );
                          return (
                            <td
                              key={position}
                              className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100"
                            >
                              {result ? (
                                <div className="space-y-1">
                                  <div className="font-medium flex items-center gap-1">
                                    {result.player_name}
                                    {matchData.first_player_id != null &&
                                      Number(matchData.first_player_id) ===
                                        Number(result.player_id) && (
                                        <span
                                          className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1 rounded border border-blue-200 dark:border-blue-700"
                                          title={t('tournaments.detail.first_player_tooltip')}
                                        >
                                          🎲
                                        </span>
                                      )}
                                  </div>
                                  <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {result.points} {t('tournaments.detail.pts')}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-gray-400 dark:text-gray-600">-</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="flex justify-end pt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setIsRoundResultsModalOpen(false);
                  setSelectedRoundResults(null);
                }}
              >
                {t('tournaments.detail.close_btn')}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Round Preview Dialog */}
      <RoundPreviewDialog
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        onConfirm={handleConfirmNextRound}
        onManualPairing={() => {
          setIsPreviewOpen(false);
          setIsManualPairingOpen(true);
        }}
        isLoading={isLoading}
        previewData={previewData}
      />

      {tournament?.id && (
        <Modal
          isOpen={isPrestartConfigOpen}
          onClose={() => {
            if (!isLoading) setIsPrestartConfigOpen(false);
          }}
          title={
            tournamentConfigReadOnly
              ? t('tournaments.detail.tournament_settings_view_title')
              : t('tournaments.detail.prestart_settings_title')
          }
          size="lg"
        >
          {prestartConfigLoading || !prestartConfig ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-6">
              {t('common.loading')}
            </p>
          ) : (
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
              {tournamentConfigReadOnly && (
                <p
                  className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-900/30 border border-amber-200/80 dark:border-amber-800/50 rounded-lg px-3 py-2"
                  role="status"
                >
                  {t('tournaments.detail.tournament_settings_readonly_notice')}
                </p>
              )}
              <Select
                label={t('tournaments.form.competition_format_label')}
                value={settingsCompetitionFormat}
                disabled={Boolean(tournament.knockout_phase_started_at)}
                onChange={(e) => setSettingsCompetitionFormat(e.target.value as CompetitionFormat)}
                options={[
                  { value: 'swiss', label: t('tournaments.form.competition_format.swiss') },
                  {
                    value: 'swiss_knockout',
                    label: t('tournaments.form.competition_format.swiss_knockout'),
                  },
                ]}
                helperText={
                  settingsCompetitionFormat !== 'swiss_knockout'
                    ? t('knockout.format_required_hint')
                    : undefined
                }
              />
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  {t('tournaments.form.rounds_label')}
                </label>
                <Input
                  type="number"
                  min={1}
                  max={99}
                  value={prestartNumRounds}
                  disabled={tournamentConfigReadOnly}
                  onChange={(e) => setPrestartNumRounds(e.target.value)}
                />
              </div>
              <TournamentConfigComponent
                key={`tournament-settings-${tournamentSettingsModalKey}-${settingsCompetitionFormat}`}
                tournamentId={tournament.id}
                playersPerMatch={tournament.players_per_match}
                config={prestartConfig}
                readOnly={tournamentConfigReadOnly}
                showKnockoutOptions={settingsCompetitionFormat === 'swiss_knockout'}
                registeredPlayerCount={standings.length}
                knockoutReadOnly={Boolean(tournament.knockout_phase_started_at)}
                cancelLabel={tournamentConfigReadOnly ? t('common.close') : undefined}
                onSave={handlePrestartConfigSave}
                onCancel={() => {
                  if (!isLoading) setIsPrestartConfigOpen(false);
                }}
              />
            </div>
          )}
        </Modal>
      )}
      {tournament?.id && (
        <AddPlayerDialog
          isOpen={isAddPlayerOpen}
          onClose={() => setIsAddPlayerOpen(false)}
          onPlayerAdded={handlePlayerAdded}
          tournamentId={tournament.id}
          existingPlayerIds={standings.map((s) => s.player_id)}
          currentRoundsVal={
            tournament.number_of_rounds || calculateNumberOfRounds(standings.length)
          }
          isUnstarted={rounds.length === 0}
        />
      )}
      {tournament && isManualPairingOpen && (
        <ManualPairingDialog
          isOpen={isManualPairingOpen}
          onClose={() => setIsManualPairingOpen(false)}
          onConfirm={handleConfirmManualPairing}
          isLoading={isLoading}
          players={standings.filter((p) => p.active)}
          roundNumber={rounds.length + 1}
          previousOpponents={previewData?.previousOpponents}
        />
      )}
    </div>
  );
}
