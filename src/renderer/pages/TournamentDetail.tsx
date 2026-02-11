/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DatabaseService } from '../services/database';
import { SwissPairingService } from '../services/swiss';
import { ReportService } from '../services/reports';
import { Tournament, Round, Match, PlayerStanding } from '../types/tournament';
import Table from '../components/common/Table';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import MatchResultForm from '../components/tournament/MatchResultForm';
import TournamentStats from '../components/tournament/TournamentStats';
import RoundPreviewDialog from '../components/tournament/RoundPreviewDialog';
import MultiSelect from '../components/common/MultiSelect';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import { Column } from '../components/common/Table';
import { Place } from '../types/place';
import { useNotifications } from '../contexts/NotificationContext';
import { calculateNumberOfRounds } from '../utils/tournament';
import { formatDateForDisplay } from '../utils/dateUtils';

export default function TournamentDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
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
  const [isLoadingStandings, setIsLoadingStandings] = useState(false);

  // Preview State
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<{
    matches: Array<{
      player1: any;
      player2?: any;
      startPlayerId?: number;
      reason?: string;
    }>;
    warnings: string[];
    startStats?: Record<number, { totalStarts: number; lastStartRound: number }>;
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

  const loadTournament = useCallback(async () => {
    if (!id) return;
    try {
      setIsLoading(true);
      const data = await DatabaseService.getTournamentById(Number(id));
      setTournament(data as Tournament);
    } catch (error) {
      console.error('Error loading tournament:', error);
      addNotification({
        message: 'Error al cargar el torneo',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [id, addNotification]);

  const loadMatchPlayersForMatches = useCallback(async (matchList: Match[]) => {
    if (matchList.length === 0) return;
    const list = matchList.filter((m) => m.id);
    const results = await Promise.all(list.map((m) => DatabaseService.getMatchPlayers(m.id!)));
    const map: { [matchId: number]: any[] } = {};
    list.forEach((m, i) => {
      map[m.id!] = results[i] || [];
    });
    setMatchPlayersMap(map);
  }, []);

  const loadMatchResultsForMatches = useCallback(
    async (matchList: Match[], tournamentId?: number) => {
      if (matchList.length === 0) return;
      const list = matchList.filter((m) => m.id);
      const results = await Promise.all(
        list.map((m) => DatabaseService.getMatchResults(m.id!, tournamentId))
      );
      const map: { [matchId: number]: any[] } = {};
      list.forEach((m, i) => {
        const r = results[i] || [];
        if (r.length > 0) map[m.id!] = r;
      });
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
      }
      return data;
    } catch (error) {
      console.error('Error loading rounds:', error);
      return [];
    }
  }, [tournament?.id]);

  const loadStandings = useCallback(
    async (preFetchedRounds?: Round[], isCancelled?: () => boolean) => {
      if (!tournament?.id) return;
      setIsLoadingStandings(true);
      try {
        const config = await DatabaseService.getTournamentConfig(tournament.id);
        if (isCancelled?.()) return;
        // setTournamentConfig(config || null);
        const data = await SwissPairingService.calculateStandings(
          tournament.id,
          config?.tiebreak_criteria || [],
          preFetchedRounds?.length ? { rounds: preFetchedRounds } : undefined,
          config?.player_display_mode
        );
        if (isCancelled?.()) return;
        setStandings(data || []);
      } catch (error: any) {
        if (isCancelled?.()) return;
        console.error('Error loading standings:', error);
        addNotification({
          message: error?.message || 'Error al cargar las estadísticas',
          type: 'error',
        });
        setStandings([]);
      } finally {
        if (!isCancelled?.()) setIsLoadingStandings(false);
      }
    },
    [tournament?.id, addNotification]
  );

  const loadTiebreakCriteria = useCallback(async () => {
    if (!tournament?.id) return;
    try {
      const config = await DatabaseService.getTournamentConfig(tournament.id);
      setTiebreakCriteria(config?.tiebreak_criteria || []);
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

  // Cargar estadísticas al abrir el panel solo si no hay datos (Leaderboard y estadísticas usan los mismos)
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
        message: error.message || 'Error al generar la ronda',
        type: 'error',
        duration: 5000,
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinalizeTournament = async () => {
    if (!tournament?.id) return;

    if (
      !confirm(
        '¿Estás seguro de finalizar el torneo? Una vez finalizado, no se podrán hacer más cambios.'
      )
    ) {
      return;
    }

    try {
      setIsLoading(true);
      await DatabaseService.updateTournament(tournament.id, { status: 'completed' });
      await loadTournament(); // Reload tournament to get updated status
      addNotification({
        message: 'Torneo finalizado exitosamente. Ya no se pueden realizar más cambios.',
        type: 'success',
        duration: 5000,
      });
      setShowStats(true);
    } catch (error: any) {
      console.error('Error finalizing tournament:', error);
      addNotification({
        message: 'Error al finalizar el torneo',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateNextRoundClick = async () => {
    if (!tournament?.id) return;

    // Check if we've reached the maximum number of rounds before proceeding
    const currentRounds = await DatabaseService.getTournamentRounds(tournament.id);
    const numberOfRounds = tournament.number_of_rounds || 999;

    if (currentRounds.length >= numberOfRounds) {
      addNotification({
        message: `Se ha alcanzado el número máximo de rondas (${numberOfRounds}). El torneo está completo.`,
        type: 'info',
        duration: 5000,
      });
      setShowStats(true);
      return;
    }

    try {
      setIsLoading(true);
      const data = await SwissPairingService.previewNextRound(tournament.id);
      setPreviewData(data);
      setIsPreviewOpen(true);
    } catch (error: any) {
      console.error('Error generating preview:', error);
      addNotification({
        message: error.message || 'Error al generar la previsualización',
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

      await SwissPairingService.createRoundFromPairings(
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
        message: 'Ronda generada exitosamente',
        type: 'success',
      });
    } catch (error: any) {
      console.error('Error generating round:', error);
      addNotification({
        message: error.message || 'Error al generar la ronda',
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
        const matchResults = await DatabaseService.getMatchResults(match.id!, tournament!.id!);

        // Sort results by position (player_name already resolved by getMatchResults with tournament config)
        const sortedResults = matchResults
          .map((result) => ({
            player_id: result.player_id,
            player_name: result.player_name ?? 'Desconocido',
            position: result.position,
            points: result.points,
          }))
          .sort((a, b) => a.position - b.position);

        matchesData.push({
          match_number: match.match_number,
          first_player_id: match.first_player_id,
          results: sortedResults,
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
        message: 'Error al cargar los resultados de la ronda',
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

    // Una sola petición para obtener partidas actualizadas
    const matches = await DatabaseService.getRoundMatches(currentRound.id);
    setMatches(matches);
    await loadMatchPlayersForMatches(matches);
    await loadMatchResultsForMatches(matches, tournament?.id);

    const allCompleted = matches.every((m) => m.status === 'completed');
    if (!allCompleted || currentRound.status === 'completed') return;

    // Marcar ronda completada y refrescar lista de rondas
    await DatabaseService.updateRound(currentRound.id, {
      status: 'completed',
      completed_at: new Date().toISOString(),
    });
    const roundsAfter = await loadRounds();
    await loadStandings();

    const players = await DatabaseService.getTournamentPlayers(tournament.id);
    const effectiveMaxRounds =
      tournament.number_of_rounds || calculateNumberOfRounds(players.length);

    if (roundsAfter.length < effectiveMaxRounds) {
      addNotification({
        message: 'Ronda completada. Puedes generar la siguiente ronda cuando estés listo.',
        type: 'info',
        duration: 3000,
      });
    } else {
      addNotification({
        message: 'Has completado la última ronda. Puedes finalizar el torneo cuando estés listo.',
        type: 'success',
        duration: 5000,
      });
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
      addNotification({ message: 'El nombre es requerido', type: 'error' });
      return;
    }
    try {
      setIsLoading(true);
      await DatabaseService.updateTournament(tournament.id, {
        name: editFormData.name.trim(),
        date: editFormData.date || undefined,
        place_id: editFormData.place_id ? Number(editFormData.place_id) : undefined,
      });
      addNotification({ message: 'Torneo actualizado', type: 'success' });
      setIsEditModalOpen(false);
      await loadTournament();
    } catch (error) {
      console.error('Error updating tournament:', error);
      addNotification({ message: 'Error al actualizar el torneo', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateReport = async (type: 'excel' | 'csv') => {
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
        case 'csv':
          data = await ReportService.generateTournamentCSV(tournament.id);
          filename += '.csv';
          break;
      }

      const result = await window.electronAPI.saveFile(data, filename, type);
      if (result.success) {
        addNotification({
          message: 'Reporte generado exitosamente',
          type: 'success',
        });
      } else if (!result.canceled) {
        addNotification({
          message: 'Error al generar el reporte: ' + (result.error || 'Error desconocido'),
          type: 'error',
        });
      }
    } catch (error) {
      console.error('Error generating report:', error);
      addNotification({
        message: 'Error al generar el reporte',
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
    const value = standing.tiebreak_values[criterionId];
    if (value === undefined || value === null) return '-';

    // Format based on criterion type
    if (criterionId === 'wins') {
      return value.toString();
    } else if (
      criterionId === 'opponent_points_drop_worst' ||
      criterionId === 'opponent_points_drop_best_worst'
    ) {
      return Number(value.toFixed(2)).toString();
    } else if (criterionId === 'head_to_head') {
      return value > 0 ? '✅' : value < 0 ? '❌' : '-';
    } else if (criterionId === 'point_difference') {
      return value > 0 ? `+${value.toFixed(0)}` : value.toFixed(0);
    }
    return value.toString();
  };

  const getTiebreakLabel = (criterionId: string): string => {
    const criterion = tiebreakCriteria.find((c) => c.id === criterionId);
    if (!criterion) return criterionId;

    // Short labels for table
    const shortLabels: { [key: string]: string } = {
      wins: '🏆 Victorias',
      opponent_points_drop_worst: '📊 Pts Oponentes (-peor)',
      opponent_points_drop_best_worst: '📈 Pts Oponentes (-mejor/peor)',
      head_to_head: '⚔️ Directo',
      point_difference: '📉 Diferencia',
    };
    return shortLabels[criterionId] || criterion.name;
  };

  const standingsColumns: Column<PlayerStanding>[] = [
    {
      key: 'position',
      header: '#',
      render: (_, index) => (index ?? 0) + 1,
    },
    {
      key: 'player_name',
      header: 'Jugador',
    },
    {
      key: 'wins',
      header: '🏆 Victorias',
      render: (standing) => standing.wins,
    },
    ...tiebreakCriteria
      .filter((c) => c.enabled && c.id !== 'wins')
      .map((criterion) => ({
        key: `tiebreak_${criterion.id}`,
        header: getTiebreakLabel(criterion.id),
        render: (standing: PlayerStanding) => getTiebreakValue(standing, criterion.id),
      })),
    {
      key: 'starts_count',
      header: '🎲 Inicios',
      render: (standing) => standing.starts_count ?? 0,
    },
  ];

  const filteredStandings =
    selectedPlayerIds.length > 0
      ? standings.filter((s) => selectedPlayerIds.includes(s.player_id))
      : standings;

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
    const labels = ['Ganador', '2do Lugar', '3er Lugar', '4to Lugar', '5to Lugar'];
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
        label: labels[i - 1] || `${i}° Lugar`,
        color: colors[i - 1] || 'text-gray-600 dark:text-gray-400',
      });
    }
    return items;
  };

  const matchesColumns: Column<Match>[] = [
    {
      key: 'match_number',
      header: 'Partida',
    },
    {
      key: 'players',
      header: 'Jugadores',
      render: (match) => {
        const players = matchPlayersMap[match.id!] || [];
        const results = matchResultsMap[match.id!] || [];

        // Check if it's a bye match first (before checking if players.length === 0)
        const isBye = isByeMatch(match);

        if (isBye) {
          // Bye match - show player in orange bold
          // Get player name from results (bye matches typically don't have players in match_players)
          let playerName = 'Jugador desconocido';
          if (results.length > 0) {
            // Get player name from result
            const result = results[0];
            playerName = result.player_name || 'Jugador desconocido';
          } else if (players.length > 0) {
            // Fallback to match_players if results not loaded yet
            playerName = players[0].name;
          }
          return (
            <span className="text-orange-600 dark:text-orange-400 font-bold">{playerName}</span>
          );
        }

        // Not a bye match, check if players are assigned
        if (players.length === 0) return 'Sin asignar';

        // Normal match - show players with position colors
        if (match.status === 'completed') {
          const results = matchResultsMap[match.id!] || [];
          const playersWithResults = players
            .map((p: any) => {
              const result = results.find((r: any) => r.player_id === p.id);
              return {
                ...p,
                position: result?.position || players.length, // Default to last position if no result
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
                    <span className="text-gray-300 dark:text-gray-600 font-normal mr-1">vs</span>
                  )}
                  {p.name}
                  {match.first_player_id === p.id && (
                    <span
                      className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1 rounded border border-blue-200 dark:border-blue-700"
                      title="Jugador Inicial"
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
                {index > 0 && <span className="text-gray-300 dark:text-gray-600">vs</span>}
                <span className="font-medium">{p.name}</span>
                {match.first_player_id === p.id && (
                  <span
                    className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1 rounded border border-blue-200 dark:border-blue-700 cursor-help"
                    title="Jugador Inicial"
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
      header: 'Estado',
      width: '1%',
      className: 'whitespace-nowrap w-1',
      render: (match) => {
        const isBye = isByeMatch(match);
        if (isBye) {
          return (
            <span className="px-2 py-1 rounded text-xs font-medium bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200">
              Bye
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
            {match.status === 'completed' ? 'Completada' : 'Pendiente'}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Acciones',
      width: '1%',
      className: 'whitespace-nowrap w-1 text-right',
      render: (match) => {
        const isBye = isByeMatch(match);
        // Don't show button for bye matches
        if (isBye) {
          return (
            <span className="text-sm text-gray-500 dark:text-gray-400 italic">
              Bye - No editable
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
            {match.status === 'completed' ? 'Editar' : 'Jugar'}
          </Button>
        );
      },
    },
  ];

  if (!tournament) {
    return (
      <div className="px-4 py-6">
        <p className="text-center py-8 text-gray-500 dark:text-gray-400">Cargando...</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-6">
      <div className="mb-4">
        <Button variant="secondary" onClick={() => navigate('/tournaments')}>
          ← Volver
        </Button>
      </div>

      <div className="card mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold mb-2">
              {tournament.place_name ?? '?'} - {tournament.name}
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              {tournament.type === 'circuit' ? 'Circuito' : 'Clasificatorio'} •{' '}
              {formatDateForDisplay(tournament.date)}
              {tournament.status === 'completed' && (
                <span className="ml-2 px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-sm font-medium">
                  Finalizado
                </span>
              )}
            </p>
          </div>
          <div className="flex space-x-2">
            <Button variant="secondary" size="sm" onClick={handleOpenEditModal}>
              Editar datos
            </Button>
            <Button variant="secondary" onClick={() => setShowStats(!showStats)}>
              {showStats ? 'Ocultar' : 'Ver'} Estadísticas
            </Button>
            <div className="relative group">
              <Button variant="primary">Generar Reporte ▼</Button>
              <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                <button
                  onClick={() => handleGenerateReport('excel')}
                  className="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-t-lg"
                >
                  Excel
                </button>
                <button
                  onClick={() => handleGenerateReport('csv')}
                  className="block w-full text-left px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-b-lg"
                >
                  CSV
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Modal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        title="Editar datos del torneo"
        footer={
          <>
            <Button variant="secondary" onClick={() => setIsEditModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSaveEdit} isLoading={isLoading}>
              Guardar
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nombre *"
            value={editFormData.name}
            onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })}
            required
          />
          <Input
            label="Fecha"
            type="date"
            value={editFormData.date}
            onChange={(e) => setEditFormData({ ...editFormData, date: e.target.value })}
          />
          <Select
            label="Lugar"
            value={editFormData.place_id}
            onChange={(e) => setEditFormData({ ...editFormData, place_id: e.target.value })}
            options={[
              { value: '', label: 'Seleccionar lugar...' },
              ...places.map((p) => ({ value: p.id!.toString(), label: p.name })),
            ]}
          />
        </div>
      </Modal>

      {/* Filtro por jugador: al inicio, aplica a estadísticas (excepto podio), leaderboard y partidas */}
      {standings.length > 0 && (
        <div className="card mb-6">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Filtrar por jugador
          </h3>
          <MultiSelect
            label=""
            options={standings.map((s) => ({ value: s.player_id, label: s.player_name }))}
            value={selectedPlayerIds}
            onChange={(v) => setSelectedPlayerIds(v as number[])}
            placeholder="Todos los jugadores"
            className="max-w-xs"
          />
          {selectedPlayerIds.length > 0 && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
              El filtro aplica a distribuciones, leaderboard y partidas. El podio siempre muestra el
              resultado completo.
            </p>
          )}
        </div>
      )}

      {showStats && (
        <div className="mb-6">
          {isLoadingStandings ? (
            <div className="card p-8 text-center text-gray-600 dark:text-gray-400">
              Cargando estadísticas…
            </div>
          ) : standings.length === 0 ? (
            <div className="card p-8 text-center text-gray-600 dark:text-gray-400">
              No hay datos de posiciones aún. Completa al menos una ronda con resultados para ver
              estadísticas.
            </div>
          ) : (
            <TournamentStats
              tournament={tournament}
              standingsForPodium={standings}
              standings={filteredStandings}
              tiebreakCriteria={tiebreakCriteria}
            />
          )}
        </div>
      )}

      {/* Leaderboard - usa el mismo filtro del inicio */}
      <div className="card mb-6">
        <h2 className="text-xl font-bold mb-4">Leaderboard</h2>
        {isLoadingStandings && standings.length === 0 ? (
          <div className="p-6 text-center text-gray-600 dark:text-gray-400">
            Cargando leaderboard…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table
              columns={standingsColumns}
              data={filteredStandings}
              keyExtractor={(standing) => standing.player_id}
              emptyMessage="No hay datos disponibles. Completa al menos una ronda con resultados."
            />
          </div>
        )}
      </div>

      {/* Rounds and Matches - Side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 mb-6">
        <div className="card lg:col-span-1">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Rondas</h2>
            {rounds.length === 0 ? (
              <Button
                onClick={handleGenerateFirstRound}
                isLoading={isLoading}
                disabled={tournament?.status === 'completed'}
              >
                Generar Primera Ronda
              </Button>
            ) : tournament.status === 'completed' ? (
              <Button onClick={() => setShowStats(true)} variant="primary" disabled>
                Torneo Finalizado
              </Button>
            ) : (
              (() => {
                const effectiveMaxRounds = tournament.number_of_rounds || 1;
                const atLastRound = rounds.length >= effectiveMaxRounds;
                const allRoundsCompleted = rounds.every((r) => r.status === 'completed');
                if (atLastRound && allRoundsCompleted) {
                  return (
                    <Button
                      onClick={handleFinalizeTournament}
                      variant="success"
                      isLoading={isLoading}
                    >
                      Finalizar Torneo
                    </Button>
                  );
                }
                if (atLastRound && !allRoundsCompleted) {
                  return (
                    <Button onClick={() => setShowStats(true)} variant="primary">
                      Ver Resultados
                    </Button>
                  );
                }
                if (currentRound?.status === 'completed') {
                  return (
                    <Button onClick={handleGenerateNextRoundClick} isLoading={isLoading}>
                      Generar Siguiente Ronda
                    </Button>
                  );
                }
                return (
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Completa la ronda actual para continuar
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
                    <span className="font-medium">Ronda {round.round_number}</span>
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
                        ? 'Completada'
                        : round.status === 'in_progress'
                          ? 'En Progreso'
                          : 'Pendiente'}
                    </span>
                    {round.status === 'completed' && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewRoundResults(round);
                        }}
                        className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-primary-600 dark:hover:text-primary-400 hover:bg-gray-100 dark:hover:bg-gray-600 rounded transition-colors"
                        title="Ver resultados de la ronda"
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
              {currentRound ? `Partidas - Ronda ${currentRound.round_number}` : 'Partidas'}
            </h2>
            {currentRound && (
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {filteredMatches.filter((m) => m.status === 'completed').length} /{' '}
                {filteredMatches.length} completadas
                {selectedPlayerIds.length > 0 && ' (filtrado por jugador)'}
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
                  <span className="text-orange-600 dark:text-orange-400 font-bold">Bye</span>
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
                    ? 'Ninguna partida con los jugadores seleccionados'
                    : 'No hay partidas en esta ronda'
                }
              />
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                Selecciona una ronda para ver las partidas
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
          title="Resultados de Partida"
          size="lg"
        >
          <MatchResultForm
            match={selectedMatch}
            tournamentId={tournament.id!}
            playersPerMatch={tournament.players_per_match}
            tournamentStatus={tournament.status}
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
            ? `Resultados - Ronda ${selectedRoundResults.round.round_number}`
            : ''
        }
        size="xl"
      >
        {selectedRoundResults && tournament && (
          <div className="space-y-4">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                      Partida
                    </th>
                    {Array.from({ length: tournament.players_per_match }, (_, i) => {
                      const position = i + 1;
                      const emoji =
                        position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : '';
                      const label =
                        position === 1
                          ? '1er'
                          : position === 2
                            ? '2do'
                            : position === 3
                              ? '3er'
                              : `${position}to`;
                      return (
                        <th
                          key={position}
                          className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                        >
                          {emoji} {label} Lugar
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
                        const result = matchData.results.find((r: any) => r.position === position);
                        return (
                          <td
                            key={position}
                            className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100"
                          >
                            {result ? (
                              <div className="space-y-1">
                                <div className="font-medium flex items-center gap-1">
                                  {result.player_name}
                                  {matchData.first_player_id === result.player_id && (
                                    <span
                                      className="text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-1 rounded border border-blue-200 dark:border-blue-700"
                                      title="Jugador Inicial"
                                    >
                                      🎲
                                    </span>
                                  )}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                  {result.points} pts
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
            </div>
            <div className="flex justify-end pt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setIsRoundResultsModalOpen(false);
                  setSelectedRoundResults(null);
                }}
              >
                Cerrar
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
        isLoading={isLoading}
        previewData={previewData}
      />
    </div>
  );
}
