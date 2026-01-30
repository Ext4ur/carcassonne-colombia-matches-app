import { useEffect, useState, useMemo } from 'react';
import {
  PlayerStatistics,
  PlayerStatsService,
  PlayerStatsFilters,
  PlayerStatsRaw,
  computeStatsFromResults,
} from '../../services/playerStats';
import { Player } from '../../types/player';
import { Place } from '../../types/place';
import { DatabaseService } from '../../services/database';
import MultiSelect from '../common/MultiSelect';
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

const QUALIFIER_OPTION = { value: 'qualifier' as const, label: 'Clasificatorio' };

export default function PlayerStats({ player, onClose }: PlayerStatsProps) {
  const [raw, setRaw] = useState<PlayerStatsRaw | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedTournamentIds, setSelectedTournamentIds] = useState<number[]>([]);
  const [selectedCircuitIds, setSelectedCircuitIds] = useState<(string | number)[]>([]);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<number[]>([]);

  // Load once (no filters); cache used by getAllTournaments, getTournamentConfig, etc.
  useEffect(() => {
    if (!player.id) return;
    let cancelled = false;
    (async () => {
      try {
        setIsLoading(true);
        const data = await PlayerStatsService.getPlayerStatisticsRaw(player.id!);
        if (!cancelled) setRaw(data ?? null);
      } catch (error) {
        if (!cancelled) console.error('Error loading player stats:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [player.id]);

  useEffect(() => {
    DatabaseService.getAllPlaces()
      .then(setPlaces)
      .catch(() => {});
  }, []);

  // Filter client-side: no extra queries when user changes filters
  const stats = useMemo<PlayerStatistics | null>(() => {
    if (!raw) return null;
    const filters: PlayerStatsFilters = {
      tournamentIds: selectedTournamentIds.length ? selectedTournamentIds : undefined,
      circuitIds: selectedCircuitIds.length ? selectedCircuitIds : undefined,
      placeIds: selectedPlaceIds.length ? selectedPlaceIds : undefined,
    };
    return computeStatsFromResults(raw.player, raw, filters);
  }, [raw, selectedTournamentIds, selectedCircuitIds, selectedPlaceIds]);

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
        <div className="text-center text-gray-500 dark:text-gray-400">
          No hay estadísticas disponibles
        </div>
      </div>
    );
  }

  const positionData = {
    labels: stats.recentTournaments.map((t) => t.tournament.name),
    datasets: [
      {
        label: 'Posición',
        data: stats.recentTournaments.map((t) => t.position),
        borderColor: '#3b82f6',
        backgroundColor: '#3b82f6',
        borderWidth: 3,
        tension: 0.3,
        fill: false,
        pointBackgroundColor: '#3b82f6',
        pointBorderColor: '#1e40af',
        pointBorderWidth: 2,
        pointRadius: 5,
      },
    ],
  };

  const tournamentTypeData = {
    labels: ['Clasificatorios', 'Circuitos'],
    datasets: [
      {
        label: 'Torneos',
        data: [stats.qualifierStats.tournaments, stats.circuitStats.tournaments],
        backgroundColor: ['#22c55e', '#f59e0b'],
        borderColor: ['#16a34a', '#d97706'],
        borderWidth: 2,
        borderRadius: 6,
      },
    ],
  };

  const tournamentOptions = (raw?.filterOptions?.tournaments ?? []).map((t) => ({
    value: t.id!,
    label: t.name,
  }));
  const circuitOptions = [
    QUALIFIER_OPTION,
    ...(raw?.filterOptions?.circuits ?? []).map((c) => ({ value: c.id, label: c.name })),
  ];
  const placeOptions = places.map((p) => ({ value: p.id!, label: p.name }));

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

      {/* Filters */}
      {(tournamentOptions.length > 0 || circuitOptions.length > 1 || placeOptions.length > 0) && (
        <div className="card grid grid-cols-1 md:grid-cols-2 gap-4">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 col-span-full">
            Filtros
          </h3>
          {tournamentOptions.length > 0 && (
            <MultiSelect
              label="Por torneo"
              options={tournamentOptions}
              value={selectedTournamentIds}
              onChange={(v) => setSelectedTournamentIds(v as number[])}
              placeholder="Todos los torneos"
            />
          )}
          <MultiSelect
            label="Por circuito"
            options={circuitOptions}
            value={selectedCircuitIds}
            onChange={setSelectedCircuitIds}
            placeholder="Todos (clasificatorios y circuitos)"
          />
          {placeOptions.length > 0 && (
            <MultiSelect
              label="Por lugar"
              options={placeOptions}
              value={selectedPlaceIds}
              onChange={(v) => setSelectedPlaceIds(v as number[])}
              placeholder="Todos los lugares"
            />
          )}
        </div>
      )}

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
        <Bar
          data={tournamentTypeData}
          options={{
            responsive: true,
            plugins: {
              legend: { display: true, position: 'top' },
              tooltip: { padding: 12 },
            },
            scales: {
              y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' } },
              x: { grid: { display: false } },
            },
          }}
        />
      </div>

      {/* Recent Tournaments */}
      {stats.recentTournaments.length > 0 && (
        <div className="card">
          <h3 className="text-lg font-bold mb-4">Últimos Torneos</h3>
          <Line
            data={positionData}
            options={{
              responsive: true,
              plugins: {
                legend: { display: true, position: 'top' },
                tooltip: { padding: 12 },
              },
              scales: {
                y: {
                  reverse: true,
                  beginAtZero: false,
                  grid: { color: 'rgba(0,0,0,0.06)' },
                },
                x: { grid: { display: false } },
              },
            }}
          />
          <div className="mt-4 space-y-2">
            {stats.recentTournaments.map((t, index) => (
              <div
                key={index}
                className="flex justify-between items-center p-2 bg-gray-50 dark:bg-gray-700 rounded"
              >
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
