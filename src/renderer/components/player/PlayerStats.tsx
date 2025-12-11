import { useEffect, useState } from 'react';
import { PlayerStatistics, PlayerStatsService } from '../../services/playerStats';
import { Player } from '../../types/player';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

interface PlayerStatsProps {
  player: Player;
  onClose: () => void;
}

export default function PlayerStats({ player, onClose }: PlayerStatsProps) {
  const [stats, setStats] = useState<PlayerStatistics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStats();
  }, [player.id]);

  const loadStats = async () => {
    if (!player.id) return;
    try {
      setIsLoading(true);
      const playerStats = await PlayerStatsService.getPlayerStatistics(player.id);
      setStats(playerStats);
    } catch (error) {
      console.error('Error loading player stats:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="text-center">Cargando estadísticas...</div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-6">
        <div className="text-center text-gray-500">No hay estadísticas disponibles</div>
      </div>
    );
  }

  const positionData = {
    labels: stats.recentTournaments.map((t) => t.tournament.name),
    datasets: [
      {
        label: 'Posición',
        data: stats.recentTournaments.map((t) => t.position),
        borderColor: 'rgb(59, 130, 246)',
        backgroundColor: 'rgba(59, 130, 246, 0.5)',
        tension: 0.1,
      },
    ],
  };

  const tournamentTypeData = {
    labels: ['Clasificatorios', 'Circuitos'],
    datasets: [
      {
        label: 'Torneos',
        data: [stats.qualifierStats.tournaments, stats.circuitStats.tournaments],
        backgroundColor: ['rgba(34, 197, 94, 0.5)', 'rgba(251, 191, 36, 0.5)'],
        borderColor: ['rgba(34, 197, 94, 1)', 'rgba(251, 191, 36, 1)'],
        borderWidth: 1,
      },
    ],
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-2xl font-bold">Estadísticas de {player.name}</h2>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          ✕
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card">
          <div className="text-sm text-gray-600 dark:text-gray-400">Torneos Totales</div>
          <div className="text-2xl font-bold">{stats.totalTournaments}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-600 dark:text-gray-400">Victorias</div>
          <div className="text-2xl font-bold text-yellow-600">{stats.totalWins}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-600 dark:text-gray-400">Posición Promedio</div>
          <div className="text-2xl font-bold">{stats.averagePosition.toFixed(1)}</div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-600 dark:text-gray-400">Partidas Totales</div>
          <div className="text-2xl font-bold">{stats.totalMatches}</div>
        </div>
      </div>

      {/* Best/Worst Position */}
      <div className="grid grid-cols-2 gap-4">
        <div className="card">
          <div className="text-sm text-gray-600 dark:text-gray-400">Mejor Posición</div>
          <div className="text-3xl font-bold text-green-600">
            {stats.bestPosition > 0 ? `#${stats.bestPosition}` : '-'}
          </div>
        </div>
        <div className="card">
          <div className="text-sm text-gray-600 dark:text-gray-400">Peor Posición</div>
          <div className="text-3xl font-bold text-red-600">
            {stats.worstPosition > 0 ? `#${stats.worstPosition}` : '-'}
          </div>
        </div>
      </div>

      {/* Tournament Type Stats */}
      <div className="card">
        <h3 className="text-lg font-bold mb-4">Estadísticas por Tipo de Torneo</h3>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <h4 className="font-medium mb-2">Clasificatorios</h4>
            <p>Torneos: {stats.qualifierStats.tournaments}</p>
            <p>Victorias: {stats.qualifierStats.wins}</p>
            <p>Posición Promedio: {stats.qualifierStats.averagePosition.toFixed(1)}</p>
          </div>
          <div>
            <h4 className="font-medium mb-2">Circuitos</h4>
            <p>Torneos: {stats.circuitStats.tournaments}</p>
            <p>Victorias: {stats.circuitStats.wins}</p>
            <p>Posición Promedio: {stats.circuitStats.averagePosition.toFixed(1)}</p>
          </div>
        </div>
        <Bar data={tournamentTypeData} options={{ responsive: true }} />
      </div>

      {/* Recent Tournaments */}
      {stats.recentTournaments.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-bold mb-4">Últimos Torneos</h3>
          <Line 
            data={positionData} 
            options={{ 
              responsive: true,
              scales: {
                y: {
                  reverse: true,
                  beginAtZero: false,
                },
              },
            }} 
          />
          <div className="mt-4 space-y-2">
            {stats.recentTournaments.map((t, index) => (
              <div key={index} className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded">
                <span className="font-medium">{t.tournament.name}</span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Posición #{t.position} • {t.points.toFixed(2)} pts
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


