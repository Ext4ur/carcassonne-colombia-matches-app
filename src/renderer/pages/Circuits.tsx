/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from 'react';

import { DatabaseService } from '../services/database';
import {
  CircuitService,
  CircuitPositionEvolution,
  CircuitPointsEvolution,
} from '../services/circuit';
import { Circuit, CircuitStandings } from '../types/circuit';
import { Place } from '../types/place';
import { formatDateForDisplay } from '../utils/dateUtils';
import { useNotifications } from '../contexts/NotificationContext';
import { useTranslation } from 'react-i18next';
import { formatUserError } from '../utils/formatUserError';
import { getCircuitPodiumRowClass } from '../utils/circuitPodiumStyles';
import Table from '../components/common/Table';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import Textarea from '../components/common/Textarea';
import { Column } from '../components/common/Table';
import MultiSelect from '../components/common/MultiSelect';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function Circuits() {
  const { t } = useTranslation();
  const { addNotification } = useNotifications();
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [standingsModalOpen, setStandingsModalOpen] = useState(false);
  const [editingCircuit, setEditingCircuit] = useState<Circuit | null>(null);
  const [selectedCircuit, setSelectedCircuit] = useState<Circuit | null>(null);
  const [standings, setStandings] = useState<CircuitStandings[]>([]);
  const [positionEvolution, setPositionEvolution] = useState<CircuitPositionEvolution | null>(null);
  const [pointsEvolution, setPointsEvolution] = useState<CircuitPointsEvolution | null>(null);
  const [circuitTournaments, setCircuitTournaments] = useState<
    Array<{ id: number; name: string; place_id?: number; place_name?: string }>
  >([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [selectedPlaceIds, setSelectedPlaceIds] = useState<number[]>([]);
  const [selectedStopIds, setSelectedStopIds] = useState<number[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
    status: 'active' as 'active' | 'finalized',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [searchTerm, setSearchTerm] = useState('');

  const loadCircuits = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await DatabaseService.getAllCircuits();
      setCircuits(data);
    } catch (error) {
      console.error('Error loading circuits:', error);
      addNotification({
        message: formatUserError(error, t('circuits.errors.load')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, t]);

  useEffect(() => {
    loadCircuits();
  }, [loadCircuits]);

  const loadStandings = async (circuitId: number) => {
    try {
      setIsLoading(true);
      const [data, posEvo, ptsEvo, stops, placesData] = await Promise.all([
        CircuitService.getCircuitStandings(circuitId),
        CircuitService.getCircuitPositionEvolution(circuitId),
        CircuitService.getCircuitPointsEvolution(circuitId),
        DatabaseService.getCircuitTournaments(circuitId),
        DatabaseService.getAllPlaces(),
      ]);
      setStandings(data);
      setPositionEvolution(posEvo);
      setPointsEvolution(ptsEvo);
      setCircuitTournaments(
        (stops as any[]).map((t: any) => ({
          id: t.id,
          name: t.name,
          place_id: t.place_id,
          place_name: t.place_name,
        }))
      );
      setPlaces(placesData);
      setSelectedPlaceIds([]);
      setSelectedStopIds([]);
      setSelectedPlayerIds([]);
      setStandingsModalOpen(true);
    } catch (error) {
      console.error('Error loading standings:', error);
      addNotification({
        message: formatUserError(error, t('circuits.errors.load_standings')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinalizeCircuit = async (circuit: Circuit) => {
    if (!circuit.id) return;
    if (!confirm(t('circuits.alerts.finalize_confirm', { name: circuit.name }))) return;
    try {
      setIsLoading(true);
      await DatabaseService.updateCircuit(circuit.id, { status: 'finalized' });
      loadCircuits();
    } catch (error) {
      console.error('Error finalizing circuit:', error);
      addNotification({
        message: formatUserError(error, t('circuits.errors.finalize')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (circuit?: Circuit) => {
    if (circuit) {
      setEditingCircuit(circuit);
      setFormData({
        name: circuit.name || '',
        description: circuit.description || '',
        start_date: circuit.start_date || '',
        end_date: circuit.end_date || '',
        status: (circuit.status ?? 'active') as 'active' | 'finalized',
      });
    } else {
      setEditingCircuit(null);
      setFormData({
        name: '',
        description: '',
        start_date: '',
        end_date: '',
        status: 'active',
      });
    }
    setErrors({});
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCircuit(null);
    setFormData({
      name: '',
      description: '',
      start_date: '',
      end_date: '',
      status: 'active',
    });
    setErrors({});
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = t('circuits.errors.name_required');
    }

    if (formData.start_date && formData.end_date && formData.start_date > formData.end_date) {
      newErrors.end_date = t('circuits.errors.date_order');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;

    try {
      setIsLoading(true);
      if (editingCircuit?.id) {
        await DatabaseService.updateCircuit(editingCircuit.id, {
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          start_date: formData.start_date || undefined,
          end_date: formData.end_date || undefined,
          status: formData.status,
        });
      } else {
        await DatabaseService.createCircuit({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          start_date: formData.start_date || undefined,
          end_date: formData.end_date || undefined,
          status: formData.status,
        });
      }
      handleCloseModal();
      loadCircuits();
    } catch (error) {
      console.error('Error saving circuit:', error);
      addNotification({
        message: formatUserError(error, t('circuits.errors.save')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (circuit: Circuit) => {
    if (!circuit.id) return;
    if (!confirm(t('circuits.alerts.delete_confirm', { name: circuit.name }))) return;

    try {
      setIsLoading(true);
      await DatabaseService.deleteCircuit(circuit.id);
      loadCircuits();
    } catch (error) {
      console.error('Error deleting circuit:', error);
      addNotification({
        message: formatUserError(error, t('circuits.errors.delete')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleViewStandings = async (circuit: Circuit) => {
    if (!circuit.id) return;
    setSelectedCircuit(circuit);
    await loadStandings(circuit.id);
  };

  const handleGenerateReport = async (circuit: Circuit, type: 'excel' | 'csv') => {
    if (!circuit.id) return;

    try {
      setIsLoading(true);
      let data: any;
      let filename = `${circuit.name.replace(/[^a-z0-9]/gi, '_')}_acumulado`;

      if (type === 'excel') {
        data = await CircuitService.generateCircuitExcel(circuit.id);
        filename += '.xlsx';
      } else {
        data = await CircuitService.generateCircuitCSV(circuit.id);
        filename += '.csv';
      }

      const result = await window.electronAPI.saveFile(data, filename, type);
      if (result.success) {
        addNotification({ message: t('circuits.errors.report_success'), type: 'success' });
      } else if (!result.canceled) {
        addNotification({
          message: t('circuits.errors.report') + ': ' + (result.error || t('common.error_unknown')),
          type: 'error',
        });
      }
    } catch (error) {
      console.error('Error generating report:', error);
      addNotification({
        message: formatUserError(error, t('circuits.errors.report')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const columns: Column<Circuit>[] = [
    {
      key: 'name',
      header: t('circuits.columns.name'),
    },
    {
      key: 'status',
      header: t('circuits.columns.status'),
      width: '8%',
      render: (circuit) => {
        const isFinalized = circuit.status === 'finalized';
        return (
          <span
            className={`inline-flex px-2 py-0.5 rounded text-xs font-medium ${
              isFinalized
                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200'
                : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200'
            }`}
          >
            {isFinalized ? t('circuits.form.status_finalized') : t('circuits.form.status_active')}
          </span>
        );
      },
    },
    {
      key: 'start_date',
      header: t('circuits.columns.start_date'),
      width: '10%',
      render: (circuit) => formatDateForDisplay(circuit.start_date),
    },
    {
      key: 'end_date',
      header: t('circuits.columns.end_date'),
      width: '10%',
      render: (circuit) => formatDateForDisplay(circuit.end_date),
    },
    {
      key: 'actions',
      header: t('circuits.columns.actions'),
      render: (circuit) => (
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" size="sm" onClick={() => handleViewStandings(circuit)}>
            {t('circuits.actions.view')}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => handleOpenModal(circuit)}>
            {t('circuits.actions.edit')}
          </Button>
          {circuit.status !== 'finalized' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleFinalizeCircuit(circuit)}
              title={t('circuits.alerts.finalize_title')}
            >
              {t('circuits.actions.finalize')}
            </Button>
          )}
          <Button variant="danger" size="sm" onClick={() => handleDelete(circuit)}>
            {t('circuits.actions.delete')}
          </Button>
        </div>
      ),
    },
  ];

  const standingsColumns: Column<CircuitStandings>[] = [
    {
      key: 'position',
      header: t('circuits.standings.columns.position'),
      render: (_standing, index) => (index != null ? index + 1 : 1),
      width: '8%',
    },
    {
      key: 'player_name',
      header: t('circuits.standings.columns.player'),
      className: 'whitespace-nowrap font-medium',
      width: '40%',
    },
    {
      key: 'total_points',
      header: t('circuits.standings.columns.total_points'),
      render: (standing) => standing.total_points.toFixed(0),
      className: 'text-center',
      width: '13%',
    },
    {
      key: 'tournaments_played',
      header: t('circuits.standings.columns.tournaments'),
      className: 'text-center',
      width: '13%',
    },
    {
      key: 'wins',
      header: t('circuits.standings.columns.wins'),
      className: 'text-center',
      width: '13%',
    },
    {
      key: 'sos',
      header: t('circuits.standings.columns.sos'),
      render: (standing) => standing.sos.toFixed(0),
      title: t('circuits.standings.columns.sos_title'),
      className: 'text-center',
      width: '13%',
    },
  ];

  // Paleta sólida (sin transparencia) para líneas del circuito
  const CHART_COLORS = [
    '#3b82f6',
    '#22c55e',
    '#f59e0b',
    '#ef4444',
    '#a855f7',
    '#14b8a6',
    '#f97316',
  ];

  const positionChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: t('circuits.standings.chart_pos_title') },
      tooltip: { padding: 12 },
    },
    scales: {
      y: {
        reverse: true,
        min: 1,
        title: { display: true, text: t('circuits.standings.chart_pos_y') },
        grid: { color: 'rgba(0,0,0,0.06)' },
      },
      x: {
        title: { display: true, text: t('circuits.standings.chart_pos_x') },
        grid: { display: false },
      },
    },
  };

  const pointsChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: t('circuits.standings.chart_pts_title') },
      tooltip: { padding: 12 },
    },
    scales: {
      y: {
        min: 0,
        title: { display: true, text: t('circuits.standings.chart_pts_y') },
        grid: { color: 'rgba(0,0,0,0.06)' },
      },
      x: {
        title: { display: true, text: t('circuits.standings.chart_pts_x') },
        grid: { display: false },
      },
    },
  };

  // Stop indices: by place filter and/or by parada (stop) filter.
  // When the filter matches zero tournaments, stopIndices is [] - we treat that as "no filter" for consistency.
  let stopIndices: number[] | null = null;
  if (
    circuitTournaments.length > 0 &&
    (selectedPlaceIds.length > 0 || selectedStopIds.length > 0)
  ) {
    const indices = circuitTournaments
      .map((t, i) => {
        if (
          selectedPlaceIds.length > 0 &&
          (t.place_id == null || !selectedPlaceIds.includes(t.place_id))
        )
          return -1;
        if (selectedStopIds.length > 0 && !selectedStopIds.includes(t.id)) return -1;
        return i;
      })
      .filter((i) => i >= 0);
    stopIndices = indices.length > 0 ? indices : null;
  }

  const hasStopFilter = stopIndices !== null && stopIndices.length > 0;

  // When filtering by place/parada, recompute standings by calling CircuitService with the filtered IDs
  const [filteredStandings, setFilteredStandings] = useState<CircuitStandings[]>([]);

  useEffect(() => {
    if (!selectedCircuit?.id) return;

    const stopIds = hasStopFilter ? stopIndices!.map((i) => circuitTournaments[i].id) : undefined;

    CircuitService.getCircuitStandings(selectedCircuit.id, stopIds).then((data) => {
      let final = data;
      if (selectedPlayerIds.length > 0) {
        final = data.filter((s) => selectedPlayerIds.includes(s.player_id));
      }
      setFilteredStandings(final);
    });
  }, [
    selectedCircuit,
    selectedStopIds,
    selectedPlaceIds,
    selectedPlayerIds,
    circuitTournaments,
    hasStopFilter,
    stopIndices,
  ]);

  const filteredPositionEvolution =
    positionEvolution && (hasStopFilter || selectedPlayerIds.length > 0)
      ? {
          stops: hasStopFilter
            ? stopIndices!.map((i) => positionEvolution.stops[i])
            : positionEvolution.stops,
          players: (selectedPlayerIds.length > 0
            ? positionEvolution.players.filter((p) => selectedPlayerIds.includes(p.player_id))
            : positionEvolution.players
          ).map((p) => ({
            ...p,
            positions: hasStopFilter ? stopIndices!.map((i) => p.positions[i]) : p.positions,
          })),
        }
      : positionEvolution;

  // Cumulative points chart: when filtering by stops, show cumulative *only from selected stops*
  // (not the original cumulative values at those indices, which would include points from excluded stops).
  const filteredPointsEvolution =
    pointsEvolution && (hasStopFilter || selectedPlayerIds.length > 0)
      ? {
          stops: hasStopFilter
            ? stopIndices!.map((i) => pointsEvolution.stops[i])
            : pointsEvolution.stops,
          players: (selectedPlayerIds.length > 0
            ? pointsEvolution.players.filter((p) => selectedPlayerIds.includes(p.player_id))
            : pointsEvolution.players
          ).map((p) => ({
            ...p,
            pointsCumulative: hasStopFilter
              ? (() => {
                  const newCumulative: number[] = [];
                  let running = 0;
                  for (let j = 0; j < stopIndices!.length; j++) {
                    const idx = stopIndices![j];
                    const prevCum = idx > 0 ? p.pointsCumulative[idx - 1] : 0;
                    running += p.pointsCumulative[idx] - prevCum;
                    newCumulative.push(running);
                  }
                  return newCumulative;
                })()
              : p.pointsCumulative,
          })),
        }
      : pointsEvolution;

  const filteredCircuits = searchTerm.trim()
    ? circuits.filter((c) => {
        const term = searchTerm.toLowerCase();
        const name = (c.name ?? '').toLowerCase();
        const desc = (c.description ?? '').toLowerCase();
        return name.includes(term) || desc.includes(term);
      })
    : circuits;

  return (
    <div className="px-4 py-6">
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">{t('circuits.title')}</h1>
          <Button onClick={() => handleOpenModal()}>{t('circuits.new_circuit')}</Button>
        </div>

        <div className="mb-4 max-w-xs">
          <Input
            placeholder={t('circuits.search_placeholder')}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        {isLoading && circuits.length === 0 ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">
            {t('circuits.loading')}
          </p>
        ) : (
          <Table
            columns={columns}
            data={filteredCircuits}
            keyExtractor={(circuit) => circuit.id || Math.random()}
            emptyMessage={t('circuits.empty_msg')}
          />
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingCircuit ? t('circuits.modal.edit') : t('circuits.modal.new')}
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseModal}>
              {t('circuits.modal.cancel_btn')}
            </Button>
            <Button onClick={handleSubmit} isLoading={isLoading}>
              {editingCircuit ? t('circuits.modal.update_btn') : t('circuits.modal.create_btn')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('circuits.form.name')}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={errors.name}
            required
          />
          <Textarea
            label={t('circuits.form.description')}
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
          />
          <Input
            label={t('circuits.form.start_date')}
            type="date"
            value={formData.start_date}
            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
          />
          <Input
            label={t('circuits.form.end_date')}
            type="date"
            value={formData.end_date}
            onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
            error={errors.end_date}
          />
          {editingCircuit && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                {t('circuits.form.status')}
              </label>
              <select
                value={formData.status}
                onChange={(e) =>
                  setFormData({ ...formData, status: e.target.value as 'active' | 'finalized' })
                }
                className="input w-full"
              >
                <option value="active">{t('circuits.form.status_active')}</option>
                <option value="finalized">{t('circuits.form.status_finalized')}</option>
              </select>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {t('circuits.form.status_help')}
              </p>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={standingsModalOpen}
        onClose={() => setStandingsModalOpen(false)}
        title={
          selectedCircuit?.status === 'finalized'
            ? t('circuits.standings.title_final', { name: selectedCircuit?.name })
            : t('circuits.standings.title_active', { name: selectedCircuit?.name })
        }
        size="xl"
        footer={
          selectedCircuit && (
            <div className="flex space-x-2">
              <Button
                variant="secondary"
                onClick={() => handleGenerateReport(selectedCircuit, 'excel')}
                isLoading={isLoading}
              >
                {t('circuits.standings.export_excel')}
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleGenerateReport(selectedCircuit, 'csv')}
                isLoading={isLoading}
              >
                {t('circuits.standings.export_csv')}
              </Button>
              <Button variant="primary" onClick={() => setStandingsModalOpen(false)}>
                {t('circuits.standings.close')}
              </Button>
            </div>
          )
        }
      >
        {isLoading ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">
            {t('circuits.loading')}
          </p>
        ) : (
          <div className="space-y-6">
            {/* Filters */}
            {(circuitTournaments.length > 0 || standings.length > 0 || places.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 col-span-full">
                  {t('circuits.standings.filters')}
                </h3>
                {places.length > 0 && (
                  <MultiSelect
                    label={t('circuits.standings.filter_place')}
                    options={places
                      .filter((p) => p.id !== undefined)
                      .map((p) => ({ value: p.id!, label: p.name }))}
                    value={selectedPlaceIds}
                    onChange={(v) => setSelectedPlaceIds(v as number[])}
                    placeholder={t('circuits.standings.all_places')}
                  />
                )}
                {circuitTournaments.length > 0 && (
                  <MultiSelect
                    label={t('circuits.standings.filter_stop')}
                    options={circuitTournaments.map((t) => ({ value: t.id, label: t.name }))}
                    value={selectedStopIds}
                    onChange={(v) => setSelectedStopIds(v as number[])}
                    placeholder={t('circuits.standings.all_stops')}
                  />
                )}
                {standings.length > 0 && (
                  <MultiSelect
                    label={t('circuits.standings.filter_player')}
                    options={standings.map((s) => ({ value: s.player_id, label: s.player_name }))}
                    value={selectedPlayerIds}
                    onChange={(v) => setSelectedPlayerIds(v as number[])}
                    placeholder={t('circuits.standings.all_players')}
                  />
                )}
              </div>
            )}

            {selectedCircuit?.status === 'finalized' && filteredStandings.length > 0 && (
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4">
                <h3 className="text-lg font-semibold mb-3">
                  {t('circuits.standings.final_podium')}
                </h3>
                <div className="flex flex-wrap gap-4 justify-center items-end">
                  {filteredStandings[1] && (
                    <div className="flex flex-col items-center order-2 md:order-1">
                      <span className="text-2xl" aria-hidden>
                        🥈
                      </span>
                      <div className="font-bold text-gray-700 dark:text-gray-300">
                        {filteredStandings[1].player_name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {filteredStandings[1].total_points.toFixed(0)} {t('circuits.standings.pts')}
                      </div>
                    </div>
                  )}
                  {filteredStandings[0] && (
                    <div className="flex flex-col items-center order-1 md:order-2">
                      <span className="text-3xl" aria-hidden>
                        🥇
                      </span>
                      <div className="font-bold text-gray-900 dark:text-white">
                        {filteredStandings[0].player_name}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {filteredStandings[0].total_points.toFixed(0)} {t('circuits.standings.pts')}
                      </div>
                    </div>
                  )}
                  {filteredStandings[2] && (
                    <div className="flex flex-col items-center order-3">
                      <span className="text-2xl" aria-hidden>
                        🥉
                      </span>
                      <div className="font-bold text-gray-700 dark:text-gray-300">
                        {filteredStandings[2].player_name}
                      </div>
                      <div className="text-sm text-gray-500 dark:text-gray-400">
                        {filteredStandings[2].total_points.toFixed(0)} {t('circuits.standings.pts')}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {filteredPositionEvolution && filteredPositionEvolution.stops.length > 0 && (
              <div className="h-64">
                <Line
                  data={{
                    labels: filteredPositionEvolution.stops,
                    datasets: filteredPositionEvolution.players.slice(0, 10).map((p, i) => {
                      const color = CHART_COLORS[i % CHART_COLORS.length];
                      return {
                        label: p.player_name,
                        data: p.positions.map((pos) => (pos === null ? undefined : pos)),
                        borderColor: color,
                        backgroundColor: color,
                        borderWidth: 3,
                        tension: 0.3,
                        spanGaps: true,
                        fill: false,
                        pointBackgroundColor: color,
                        pointBorderColor: '#1f2937',
                        pointBorderWidth: 1,
                        pointRadius: 4,
                      };
                    }),
                  }}
                  options={positionChartOptions}
                />
              </div>
            )}

            {filteredPointsEvolution && filteredPointsEvolution.stops.length > 0 && (
              <div className="h-64">
                <Line
                  data={{
                    labels: filteredPointsEvolution.stops,
                    datasets: filteredPointsEvolution.players.slice(0, 10).map((p, i) => {
                      const color = CHART_COLORS[i % CHART_COLORS.length];
                      return {
                        label: p.player_name,
                        data: p.pointsCumulative,
                        borderColor: color,
                        backgroundColor: color,
                        borderWidth: 3,
                        tension: 0.3,
                        fill: false,
                        pointBackgroundColor: color,
                        pointBorderColor: '#1f2937',
                        pointBorderWidth: 1,
                        pointRadius: 4,
                      };
                    }),
                  }}
                  options={pointsChartOptions}
                />
              </div>
            )}

            <div>
              <h3 className="text-lg font-semibold mb-1">{t('circuits.standings.table_title')}</h3>
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">
                {t('circuits.standings.podium_row_hint')}
              </p>
              <Table
                columns={standingsColumns}
                data={filteredStandings}
                keyExtractor={(standing) => standing.player_id}
                emptyMessage={t('circuits.standings.empty_data')}
                getRowClassName={(_item, index) => getCircuitPodiumRowClass(index + 1)}
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
