/* eslint-disable @typescript-eslint/no-explicit-any */
import { Tournament, PlayerStanding, BuchholzByeMode } from '../../types/tournament';
import { Bar } from 'react-chartjs-2';
import { useTranslation } from 'react-i18next';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { getBuchholzModeMeta } from '../../utils/buchholzModeMeta';

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

interface TournamentStatsProps {
  tournament: Tournament;
  standingsForPodium: PlayerStanding[];
  standings: PlayerStanding[];
  tiebreakCriteria: any[];
  buchholzByeMode: BuchholzByeMode;
}

export default function TournamentStats({
  standingsForPodium,
  standings,
  tiebreakCriteria,
  buchholzByeMode,
}: TournamentStatsProps) {
  const { t } = useTranslation();
  const modeMeta = getBuchholzModeMeta(buchholzByeMode);
  const top4 = standingsForPodium.slice(0, 4);
  const enabledCriteria = tiebreakCriteria.filter((c) => c.enabled && c.id !== 'wins');
  const chartCriteria = enabledCriteria.filter((c) => c.id !== 'head_to_head');
  const CHART_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#a855f7'];

  const getCriterionData = (criterionId: string) => {
    const labels = standings.map((s) => s.player_name);
    const data = standings.map((s) => {
      const value = s.tiebreak_values[criterionId];
      return value !== undefined && value !== null ? value : 0;
    });
    const color =
      CHART_COLORS[chartCriteria.findIndex((c) => c.id === criterionId) % CHART_COLORS.length];
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
      wins: t('players.wins'),
      opponent_points: t('stats.opponent_points'),
      opponent_points_drop_worst: t('stats.opponent_points'),
      opponent_points_drop_best_worst: t('stats.opponent_points_full'),
      head_to_head: t('stats.h2h'),
      point_difference: t('stats.diff'),
    };
    return labels[criterionId] || criterion.name;
  };

  const winsData = {
    labels: standings.map((s) => s.player_name),
    datasets: [
      {
        label: t('players.wins'),
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
      <div className="card">
        <h3 className="text-xl font-bold mb-4">{t('stats.podium')}</h3>
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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="text-lg font-bold mb-2">{t('stats.buchholz_mode_title')}</h3>
          <p className="text-sm text-gray-700 dark:text-gray-300">{t(modeMeta.modeLabelI18nKey)}</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
            {modeMeta.usesVirtualOpponent
              ? t('stats.buchholz_virtual_yes')
              : t('stats.buchholz_virtual_no')}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {modeMeta.virtualKind === 'field_avg'
              ? t('stats.buchholz_virtual_kind_avg')
              : modeMeta.virtualKind === 'round_worst'
                ? t('stats.buchholz_virtual_kind_worst')
                : t('stats.buchholz_virtual_kind_none')}
          </p>
        </div>
        <div className="card">
          <h3 className="text-lg font-bold mb-4">🏆 {t('stats.wins_distribution')}</h3>
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

        {chartCriteria.map((criterion) => (
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
