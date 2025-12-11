import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { DatabaseService } from '../services/database';
import { SwissPairingService } from '../services/swiss';
import { ReportService } from '../services/reports';
import { Tournament, Round, Match, MatchResult, PlayerStanding } from '../types/tournament';
import { Player } from '../types/player';
import Table from '../components/common/Table';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import MatchResultForm from '../components/tournament/MatchResultForm';
import TournamentStats from '../components/tournament/TournamentStats';
import { Column } from '../components/common/Table';
import { useNotifications } from '../contexts/NotificationContext';

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
  const [isRoundResultsModalOpen, setIsRoundResultsModalOpen] = useState(false);
  const [selectedRoundResults, setSelectedRoundResults] = useState<{ 
    round: Round; 
    matches: Match[]; 
    results: Array<{ match_number: number; results: Array<{ player_name: string; position: number; points: number }> }> 
  } | null>(null);

  useEffect(() => {
    if (id) {
      loadTournament();
    }
  }, [id]);

  useEffect(() => {
    if (tournament) {
      loadRounds();
      loadStandings();
    }
  }, [tournament]);

  useEffect(() => {
    if (currentRound) {
      loadMatches();
    }
  }, [currentRound]);

  const loadTournament = async () => {
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
  };

  const loadRounds = async () => {
    if (!tournament?.id) return;
    try {
      const data = await DatabaseService.getTournamentRounds(tournament.id);
      setRounds(data);
      if (data.length > 0) {
        const inProgress = data.find((r) => r.status === 'in_progress');
        setCurrentRound(inProgress || data[data.length - 1]);
      }
    } catch (error) {
      console.error('Error loading rounds:', error);
    }
  };

  const loadMatches = async () => {
    if (!currentRound?.id) return;
    try {
      const data = await DatabaseService.getRoundMatches(currentRound.id);
      setMatches(data);
    } catch (error) {
      console.error('Error loading matches:', error);
    }
  };

  const loadStandings = async () => {
    if (!tournament?.id) return;
    try {
      const config = await DatabaseService.getTournamentConfig(tournament.id);
      const data = await SwissPairingService.calculateStandings(
        tournament.id,
        config?.tiebreak_criteria || []
      );
      setStandings(data);
    } catch (error) {
      console.error('Error loading standings:', error);
    }
  };

  const handleGenerateFirstRound = async () => {
    if (!tournament?.id) return;
    if (!confirm('¿Generar la primera ronda? Los emparejamientos serán aleatorios.')) return;

    try {
      setIsLoading(true);
      await SwissPairingService.generateFirstRound(tournament.id);
      await loadRounds();
      // Set current round to the newly created one
      const updatedRounds = await DatabaseService.getTournamentRounds(tournament.id);
      if (updatedRounds.length > 0) {
        setCurrentRound(updatedRounds[0]);
      }
      await loadMatches();
      await loadStandings();
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

  const handleGenerateNextRound = async () => {
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
    
    if (!confirm('¿Generar la siguiente ronda?')) return;

    try {
      setIsLoading(true);
      await SwissPairingService.generateNextRound(tournament.id);
      await loadRounds();
      // Set current round to the newly created one
      const updatedRounds = await DatabaseService.getTournamentRounds(tournament.id);
      if (updatedRounds.length > 0) {
        setCurrentRound(updatedRounds[updatedRounds.length - 1]);
      }
      await loadMatches();
      await loadStandings();
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
    setSelectedMatch(match);
    setIsMatchModalOpen(true);
  };

  const handleViewRoundResults = async (round: Round) => {
    try {
      setIsLoading(true);
      const roundMatches = await DatabaseService.getRoundMatches(round.id!);
      const matchesData: any[] = [];

      for (const match of roundMatches) {
        const matchResults = await DatabaseService.getMatchResults(match.id!);
        const matchPlayers = await DatabaseService.getMatchPlayers(match.id!);
        
        // Sort results by position
        const sortedResults = matchResults
          .map((result) => {
            const player = matchPlayers.find((p) => p.id === result.player_id);
            return {
              player_name: player?.name || 'Desconocido',
              position: result.position,
              points: result.points,
            };
          })
          .sort((a, b) => a.position - b.position);

        matchesData.push({
          match_number: match.match_number,
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
    await loadMatches();
    await loadStandings();
    
    // Check if all matches in current round are completed
    if (currentRound) {
      const allMatches = await DatabaseService.getRoundMatches(currentRound.id!);
      const allCompleted = allMatches.every((m) => m.status === 'completed');
      
      if (allCompleted && currentRound.status !== 'completed') {
        // Update round status
        await DatabaseService.updateRound(currentRound.id!, {
          status: 'completed',
          completed_at: new Date().toISOString(),
        });
        await loadRounds();
        
        // Check if we can generate next round
        const tournament = await DatabaseService.getTournamentById(tournament.id!) as Tournament;
        const numberOfRounds = tournament.number_of_rounds || 0;
        const rounds = await DatabaseService.getTournamentRounds(tournament.id!);
        
        if (numberOfRounds === 0 || rounds.length < numberOfRounds) {
          // Show option to generate next round
          if (confirm('Todas las partidas de esta ronda están completadas. ¿Deseas generar la siguiente ronda?')) {
            await handleGenerateNextRound();
          }
        } else if (rounds.length >= numberOfRounds) {
          // Tournament completed - show message and final standings
          await DatabaseService.updateTournament(tournament.id!, { status: 'completed' });
          addNotification({
            message: `¡Torneo completado! Se alcanzó el número máximo de rondas (${numberOfRounds}).`,
            type: 'success',
            duration: 5000,
          });
          await loadStandings();
          setShowStats(true); // Show stats automatically
        }
      }
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

  const [tiebreakCriteria, setTiebreakCriteria] = useState<any[]>([]);

  useEffect(() => {
    if (tournament?.id) {
      loadTiebreakCriteria();
    }
  }, [tournament]);

  const loadTiebreakCriteria = async () => {
    if (!tournament?.id) return;
    try {
      const config = await DatabaseService.getTournamentConfig(tournament.id);
      setTiebreakCriteria(config?.tiebreak_criteria || []);
    } catch (error) {
      console.error('Error loading tiebreak criteria:', error);
    }
  };

  const getTiebreakValue = (standing: PlayerStanding, criterionId: string): string => {
    const value = standing.tiebreak_values[criterionId];
    if (value === undefined || value === null) return '-';
    
    // Format based on criterion type
    if (criterionId === 'wins') {
      return value.toString();
    } else if (criterionId === 'opponent_points_drop_worst' || criterionId === 'opponent_points_drop_best_worst') {
      return value.toFixed(2);
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
      'wins': '🏆 Victorias',
      'opponent_points_drop_worst': '📊 Pts Oponentes (-peor)',
      'opponent_points_drop_best_worst': '📈 Pts Oponentes (-mejor/peor)',
      'head_to_head': '⚔️ Directo',
      'point_difference': '📉 Diferencia',
    };
    return shortLabels[criterionId] || criterion.name;
  };

  const standingsColumns: Column<PlayerStanding>[] = [
    {
      key: 'position',
      header: '#',
      render: (_, index) => index + 1,
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
  ];

  const [matchPlayersMap, setMatchPlayersMap] = useState<{ [matchId: number]: any[] }>({});

  useEffect(() => {
    if (matches.length > 0) {
      loadMatchPlayers();
    }
  }, [matches]);

  const loadMatchPlayers = async () => {
    const map: { [matchId: number]: any[] } = {};
    for (const match of matches) {
      if (match.id) {
        const players = await DatabaseService.getMatchPlayers(match.id);
        map[match.id] = players;
      }
    }
    setMatchPlayersMap(map);
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
        if (players.length === 0) return 'Sin asignar';
        return players.map((p: any) => p.name).join(', ');
      },
    },
    {
      key: 'status',
      header: 'Estado',
      render: (match) => (
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          match.status === 'completed' 
            ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' 
            : 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
        }`}>
          {match.status === 'completed' ? 'Completada' : 'Pendiente'}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (match) => (
        <Button
          variant="primary"
          size="sm"
          onClick={() => handleOpenMatchModal(match)}
        >
          {match.status === 'completed' ? 'Ver/Editar' : 'Ingresar Resultados'}
        </Button>
      ),
    },
  ];

  if (!tournament) {
    return (
      <div className="px-4 py-6">
        <p className="text-center py-8 text-gray-500">Cargando...</p>
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
            <h1 className="text-2xl font-bold mb-2">{tournament.name}</h1>
            <p className="text-gray-600 dark:text-gray-400">
              {tournament.type === 'circuit' ? 'Circuito' : 'Clasificatorio'} • {new Date(tournament.date).toLocaleDateString()}
            </p>
          </div>
          <div className="flex space-x-2">
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

      {showStats && (
        <div className="mb-6">
          <TournamentStats tournament={tournament} standings={standings} tiebreakCriteria={tiebreakCriteria} />
        </div>
      )}

      {/* Leaderboard - Full width */}
      <div className="card mb-6">
        <h2 className="text-xl font-bold mb-4">Leaderboard</h2>
        <div className="overflow-x-auto">
          <Table
            columns={standingsColumns}
            data={standings}
            keyExtractor={(standing) => standing.player_id}
            emptyMessage="No hay datos disponibles"
          />
        </div>
      </div>

      {/* Rounds and Matches - Side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">Rondas</h2>
            {rounds.length === 0 ? (
              <Button onClick={handleGenerateFirstRound} isLoading={isLoading}>
                Generar Primera Ronda
              </Button>
            ) : (
              // Check if max rounds reached
              rounds.length >= (tournament.number_of_rounds || 999) ? (
                <Button 
                  onClick={() => setShowStats(true)} 
                  variant="primary"
                >
                  Ver Resultados
                </Button>
              ) : (
                // Show generate next round button only if current round is completed
                currentRound?.status === 'completed' && (
                  <Button onClick={handleGenerateNextRound} isLoading={isLoading}>
                    Generar Siguiente Ronda
                  </Button>
                )
              )
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
                  <div 
                    className="flex-1 cursor-pointer"
                    onClick={() => setCurrentRound(round)}
                  >
                    <span className="font-medium">Ronda {round.round_number}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded font-medium ${
                      round.status === 'completed' 
                        ? 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200' 
                        : round.status === 'in_progress'
                        ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                    }`}>
                      {round.status === 'completed' ? 'Completada' : round.status === 'in_progress' ? 'En Progreso' : 'Pendiente'}
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
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
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
        <div className="card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold">
              {currentRound ? `Partidas - Ronda ${currentRound.round_number}` : 'Partidas'}
            </h2>
            {currentRound && (
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {matches.filter((m) => m.status === 'completed').length} / {matches.length} completadas
              </span>
            )}
          </div>
          <div className="overflow-x-auto">
            {currentRound ? (
              <Table
                columns={matchesColumns}
                data={matches}
                keyExtractor={(match) => match.id || Math.random()}
                emptyMessage="No hay partidas en esta ronda"
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
        title={selectedRoundResults ? `Resultados - Ronda ${selectedRoundResults.round.round_number}` : ''}
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
                      const emoji = position === 1 ? '🥇' : position === 2 ? '🥈' : position === 3 ? '🥉' : '';
                      const label = position === 1 ? '1er' : position === 2 ? '2do' : position === 3 ? '3er' : `${position}to`;
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
                          <td key={position} className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100">
                            {result ? (
                              <div className="space-y-1">
                                <div className="font-medium">{result.player_name}</div>
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
              <Button variant="secondary" onClick={() => {
                setIsRoundResultsModalOpen(false);
                setSelectedRoundResults(null);
              }}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

