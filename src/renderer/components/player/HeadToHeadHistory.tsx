import { useEffect, useState } from 'react';
import { HeadToHeadRecord, HeadToHeadService } from '../../services/headToHead';
import { Player } from '../../types/player';
import Modal from '../common/Modal';

interface HeadToHeadHistoryProps {
  player1: Player;
  player2: Player;
  onClose: () => void;
}

export default function HeadToHeadHistory({ player1, player2, onClose }: HeadToHeadHistoryProps) {
  const [record, setRecord] = useState<HeadToHeadRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadHeadToHead();
  }, [player1.id, player2.id]);

  const loadHeadToHead = async () => {
    if (!player1.id || !player2.id) return;
    try {
      setIsLoading(true);
      const h2h = await HeadToHeadService.getHeadToHead(player1.id, player2.id);
      setRecord(h2h);
    } catch (error) {
      console.error('Error loading head-to-head:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} title={`Enfrentamiento: ${player1.name} vs ${player2.name}`} size="xl">
      {isLoading ? (
        <div className="text-center py-8">Cargando...</div>
      ) : !record ? (
        <div className="text-center py-8 text-gray-500">No hay enfrentamientos registrados</div>
      ) : (
        <div className="space-y-6">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card text-center">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">{player1.name}</div>
              <div className="text-2xl font-bold text-green-600">{record.player1Wins}</div>
              <div className="text-xs text-gray-500">Victorias</div>
            </div>
            <div className="card text-center">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Empates</div>
              <div className="text-2xl font-bold">{record.ties}</div>
              <div className="text-xs text-gray-500">Partidas</div>
            </div>
            <div className="card text-center">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">{player2.name}</div>
              <div className="text-2xl font-bold text-green-600">{record.player2Wins}</div>
              <div className="text-xs text-gray-500">Victorias</div>
            </div>
          </div>

          {/* Points Summary */}
          <div className="grid grid-cols-2 gap-4">
            <div className="card">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">{player1.name}</div>
              <div className="text-xl font-bold">{record.player1TotalPoints}</div>
              <div className="text-xs text-gray-500">Puntos Totales</div>
            </div>
            <div className="card">
              <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">{player2.name}</div>
              <div className="text-xl font-bold">{record.player2TotalPoints}</div>
              <div className="text-xs text-gray-500">Puntos Totales</div>
            </div>
          </div>

          {/* Match History */}
          {record.matches.length > 0 && (
            <div className="card">
              <h3 className="text-lg font-bold mb-4">Historial de Partidas</h3>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-gray-800">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Torneo</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Ronda</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">{player1.name}</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">{player2.name}</th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 dark:text-gray-400">Resultado</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {record.matches.map((match, index) => (
                      <tr key={index}>
                        <td className="px-4 py-2 text-sm">{match.tournament}</td>
                        <td className="px-4 py-2 text-sm">Ronda {match.round}</td>
                        <td className="px-4 py-2 text-sm">
                          Pos {match.player1Position} • {match.player1Points} pts
                        </td>
                        <td className="px-4 py-2 text-sm">
                          Pos {match.player2Position} • {match.player2Points} pts
                        </td>
                        <td className="px-4 py-2 text-sm">
                          {match.player1Position < match.player2Position ? (
                            <span className="text-green-600 font-medium">{player1.name} ganó</span>
                          ) : match.player2Position < match.player1Position ? (
                            <span className="text-green-600 font-medium">{player2.name} ganó</span>
                          ) : (
                            <span className="text-gray-500">Empate</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}


