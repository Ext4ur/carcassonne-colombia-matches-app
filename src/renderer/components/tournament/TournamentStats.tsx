/* eslint-disable @typescript-eslint/no-explicit-any */
import { Tournament, PlayerStanding } from '../../types/tournament';
import { Bar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface TournamentStatsProps {
  tournament: Tournament;
  /** Full standings for podium (not filtered). */
  standingsForPodium: PlayerStanding[];
  /** Filtered standings for charts (victories, tiebreak criteria). */
  standings: PlayerStanding[];
  tiebreakCriteria: any[];
}

export default function TournamentStats({
  standingsForPodium,
  standings,
  tiebreakCriteria,
}: TournamentStatsProps) {
  const top4 = standingsForPodium.slice(0, 4);

  // Get enabled criteria (excluding wins which is already shown)
  const enabledCriteria = tiebreakCriteria.filter((c) => c.enabled && c.id !== 'wins');

  // Paleta sólida para gráficos (sin transparencia)
  const CHART_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7'];

  // Chart data for each criterion
  const getCriterionData = (criterionId: string) => {
    const labels = standings.map((s) => s.player_name);
    const data = standings.map((s) => {
      const value = s.tiebreak_values[criterionId];
      return value !== undefined && value !== null ? value : 0;
    });
    const color =
      CHART_COLORS[enabledCriteria.findIndex((c) => c.id === criterionId) % CHART_COLORS.length];
    return {
      labels,
      datasets: [
        {
          label: getCriterionLabel(criterionId),
          data,
          backgroundColor: color,
          borderColor: color,
          borderWidth: 2,
          borderRadius: 6,
        },
      ],
    };
  };

  const getCriterionLabel = (criterionId: string): string => {
    const criterion = tiebreakCriteria.find((c) => c.id === criterionId);
    if (!criterion) return criterionId;

    const labels: { [key: string]: string } = {
      wins: 'Victorias',
      opponent_points_drop_worst: 'Puntos Oponentes (-peor)',
      opponent_points_drop_best_worst: 'Puntos Oponentes (-mejor/peor)',
      head_to_head: 'Enfrentamiento Directo',
      point_difference: 'Diferencia de Puntos',
    };
    return labels[criterionId] || criterion.name;
  };

  const winsData = {
    labels: standings.map((s) => s.player_name),
    datasets: [
      {
        label: 'Victorias',
        data: standings.map((s) => s.wins),
        backgroundColor: '#3b82f6',
        borderColor: '#2563eb',
        borderWidth: 2,
        borderRadius: 6,
      },
    ],
  };

  return (
    <div className="space-y-6">
      {/* Podium */}
      <div className="card">
        <h3 className="text-xl font-bold mb-4">Podio</h3>
        <div className="flex items-end justify-center space-x-4">
          {top4[1] && (
            <div className="flex flex-col items-center">
              <div className="bg-gray-300 dark:bg-gray-600 w-24 h-32 rounded-t-lg flex items-center justify-center mb-2">
                <span className="text-2xl font-bold">🥈 2</span>
              </div>
              <p className="font-medium">{top4[1].player_name}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{top4[1].wins} 🏆</p>
            </div>
          )}
          {top4[0] && (
            <div className="flex flex-col items-center">
              <div className="bg-yellow-400 w-24 h-40 rounded-t-lg flex items-center justify-center mb-2">
                <span className="text-2xl font-bold">🥇 1</span>
              </div>
              <p className="font-medium">{top4[0].player_name}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{top4[0].wins} 🏆</p>
            </div>
          )}
          {top4[2] && (
            <div className="flex flex-col items-center">
              <div className="bg-orange-300 dark:bg-orange-600 w-24 h-24 rounded-t-lg flex items-center justify-center mb-2">
                <span className="text-2xl font-bold">🥉 3</span>
              </div>
              <p className="font-medium">{top4[2].player_name}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{top4[2].wins} 🏆</p>
            </div>
          )}
          {top4[3] && (
            <div className="flex flex-col items-center">
              <div className="bg-blue-300 dark:bg-blue-600 w-24 h-20 rounded-t-lg flex items-center justify-center mb-2">
                <span className="text-xl font-bold">4</span>
              </div>
              <p className="font-medium text-sm">{top4[3].player_name}</p>
              <p className="text-xs text-gray-600 dark:text-gray-400">{top4[3].wins} 🏆</p>
            </div>
          )}
        </div>
      </div>

      {/* Charts - One for each tiebreak criterion */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Wins chart */}
        <div className="card">
          <h3 className="text-lg font-bold mb-4">🏆 Distribución de Victorias</h3>
          <Bar
            data={winsData}
            options={{
              responsive: true,
              maintainAspectRatio: true,
              plugins: {
                legend: { display: true, position: 'top' },
                tooltip: { padding: 12, titleFont: { size: 14 } },
              },
              scales: {
                y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' } },
                x: { grid: { display: false } },
              },
            }}
          />
        </div>

        {/* Charts for each enabled tiebreak criterion */}
        {enabledCriteria.map((criterion) => (
          <div key={criterion.id} className="card">
            <h3 className="text-lg font-bold mb-4">{getCriterionLabel(criterion.id)}</h3>
            <Bar
              data={getCriterionData(criterion.id)}
              options={{
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                  legend: { display: true, position: 'top' },
                  tooltip: { padding: 12, titleFont: { size: 14 } },
                },
                scales: {
                  y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' } },
                  x: { grid: { display: false } },
                },
              }}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
