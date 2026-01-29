import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DatabaseService } from '../services/database';
import { CircuitService, CircuitPositionEvolution, CircuitPointsEvolution } from '../services/circuit';
import { Circuit, CircuitStandings } from '../types/circuit';
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
  const navigate = useNavigate();
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [standingsModalOpen, setStandingsModalOpen] = useState(false);
  const [editingCircuit, setEditingCircuit] = useState<Circuit | null>(null);
  const [selectedCircuit, setSelectedCircuit] = useState<Circuit | null>(null);
  const [standings, setStandings] = useState<CircuitStandings[]>([]);
  const [positionEvolution, setPositionEvolution] = useState<CircuitPositionEvolution | null>(null);
  const [pointsEvolution, setPointsEvolution] = useState<CircuitPointsEvolution | null>(null);
  const [circuitTournaments, setCircuitTournaments] = useState<Array<{ id: number; name: string }>>([]);
  const [selectedStopIds, setSelectedStopIds] = useState<number[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    start_date: '',
    end_date: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadCircuits();
  }, []);

  const loadCircuits = async () => {
    try {
      setIsLoading(true);
      const data = await DatabaseService.getAllCircuits();
      setCircuits(data);
    } catch (error) {
      console.error('Error loading circuits:', error);
      alert('Error al cargar los circuitos');
    } finally {
      setIsLoading(false);
    }
  };

  const loadStandings = async (circuitId: number) => {
    try {
      setIsLoading(true);
      const [data, posEvo, ptsEvo, stops] = await Promise.all([
        DatabaseService.getCircuitStandings(circuitId),
        CircuitService.getCircuitPositionEvolution(circuitId),
        CircuitService.getCircuitPointsEvolution(circuitId),
        DatabaseService.getCircuitTournaments(circuitId),
      ]);
      setStandings(data);
      setPositionEvolution(posEvo);
      setPointsEvolution(ptsEvo);
      setCircuitTournaments(stops.map((t: { id: number; name: string }) => ({ id: t.id, name: t.name })));
      setSelectedStopIds([]);
      setSelectedPlayerIds([]);
      setStandingsModalOpen(true);
    } catch (error) {
      console.error('Error loading standings:', error);
      alert('Error al cargar el acumulado');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinalizeCircuit = async (circuit: Circuit) => {
    if (!circuit.id) return;
    if (!confirm(`¿Finalizar el circuito "${circuit.name}"? No se podrán agregar más torneos.`)) return;
    try {
      setIsLoading(true);
      await DatabaseService.updateCircuit(circuit.id, { status: 'finalized' });
      loadCircuits();
    } catch (error) {
      console.error('Error finalizing circuit:', error);
      alert('Error al finalizar el circuito');
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
      });
    } else {
      setEditingCircuit(null);
      setFormData({
        name: '',
        description: '',
        start_date: '',
        end_date: '',
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
    });
    setErrors({});
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }

    if (formData.start_date && formData.end_date && formData.start_date > formData.end_date) {
      newErrors.end_date = 'La fecha de fin debe ser posterior a la fecha de inicio';
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
        });
      } else {
        await DatabaseService.createCircuit({
          name: formData.name.trim(),
          description: formData.description.trim() || undefined,
          start_date: formData.start_date || undefined,
          end_date: formData.end_date || undefined,
        });
      }
      handleCloseModal();
      loadCircuits();
    } catch (error) {
      console.error('Error saving circuit:', error);
      alert('Error al guardar el circuito');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (circuit: Circuit) => {
    if (!circuit.id) return;
    if (!confirm(`¿Estás seguro de eliminar el circuito "${circuit.name}"?`)) return;

    try {
      setIsLoading(true);
      await DatabaseService.deleteCircuit(circuit.id);
      loadCircuits();
    } catch (error) {
      console.error('Error deleting circuit:', error);
      alert('Error al eliminar el circuito');
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
        alert('Reporte generado exitosamente');
      } else if (!result.canceled) {
        alert('Error al generar el reporte: ' + (result.error || 'Error desconocido'));
      }
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Error al generar el reporte');
    } finally {
      setIsLoading(false);
    }
  };

  const columns: Column<Circuit>[] = [
    {
      key: 'name',
      header: 'Nombre',
    },
    {
      key: 'status',
      header: 'Estado',
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
            {isFinalized ? 'Finalizado' : 'Activo'}
          </span>
        );
      },
    },
    {
      key: 'start_date',
      header: 'Fecha Inicio',
      width: '10%',
      render: (circuit) => {
        if (!circuit.start_date) return '-';
        const dateStr = circuit.start_date.includes('T') ? circuit.start_date.split('T')[0] : circuit.start_date;
        return dateStr.split('-').reverse().join('/');
      },
    },
    {
      key: 'end_date',
      header: 'Fecha Fin',
      width: '10%',
      render: (circuit) => {
        if (!circuit.end_date) return '-';
        const dateStr = circuit.end_date.includes('T') ? circuit.end_date.split('T')[0] : circuit.end_date;
        return dateStr.split('-').reverse().join('/');
      },
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (circuit) => (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleViewStandings(circuit)}
          >
            Ver
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleOpenModal(circuit)}
          >
            Editar
          </Button>
          {circuit.status !== 'finalized' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleFinalizeCircuit(circuit)}
              title="No se podrán agregar más torneos"
            >
              Finalizar
            </Button>
          )}
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleDelete(circuit)}
          >
            Eliminar
          </Button>
        </div>
      ),
    },
  ];

  const standingsColumns: Column<CircuitStandings>[] = [
    {
      key: 'position',
      header: 'Pos.',
      render: (_standing, index) => (index != null ? index + 1 : 1),
    },
    {
      key: 'player_name',
      header: 'Jugador',
    },
    {
      key: 'total_points',
      header: 'Puntos Totales',
      render: (standing) => standing.total_points.toFixed(2),
    },
    {
      key: 'tournaments_played',
      header: 'Torneos',
    },
    {
      key: 'wins',
      header: 'Victorias',
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
      title: { display: true, text: 'Posición en cada parada del circuito' },
      tooltip: { padding: 12 },
    },
    scales: {
      y: {
        reverse: true,
        min: 1,
        title: { display: true, text: 'Posición' },
        grid: { color: 'rgba(0,0,0,0.06)' },
      },
      x: {
        title: { display: true, text: 'Parada' },
        grid: { display: false },
      },
    },
  };

  const pointsChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'top' as const },
      title: { display: true, text: 'Puntos acumulados por parada' },
      tooltip: { padding: 12 },
    },
    scales: {
      y: {
        min: 0,
        title: { display: true, text: 'Puntos acumulados' },
        grid: { color: 'rgba(0,0,0,0.06)' },
      },
      x: {
        title: { display: true, text: 'Parada' },
        grid: { display: false },
      },
    },
  };

  // Apply filters to standings and chart data
  const filteredStandings =
    selectedPlayerIds.length > 0
      ? standings.filter((s) => selectedPlayerIds.includes(s.player_id))
      : standings;

  const stopIndices =
    selectedStopIds.length > 0 && circuitTournaments.length > 0
      ? circuitTournaments
          .map((t, i) => (selectedStopIds.includes(t.id) ? i : -1))
          .filter((i) => i >= 0)
      : null;

  const filteredPositionEvolution =
    positionEvolution && (stopIndices !== null || selectedPlayerIds.length > 0)
      ? {
          stops:
            stopIndices !== null
              ? stopIndices.map((i) => positionEvolution.stops[i])
              : positionEvolution.stops,
          players: (selectedPlayerIds.length > 0
            ? positionEvolution.players.filter((p) => selectedPlayerIds.includes(p.player_id))
            : positionEvolution.players
          ).map((p) => ({
            ...p,
            positions:
              stopIndices !== null
                ? stopIndices.map((i) => p.positions[i])
                : p.positions,
          })),
        }
      : positionEvolution;

  const filteredPointsEvolution =
    pointsEvolution && (stopIndices !== null || selectedPlayerIds.length > 0)
      ? {
          stops:
            stopIndices !== null
              ? stopIndices.map((i) => pointsEvolution.stops[i])
              : pointsEvolution.stops,
          players: (selectedPlayerIds.length > 0
            ? pointsEvolution.players.filter((p) => selectedPlayerIds.includes(p.player_id))
            : pointsEvolution.players
          ).map((p) => ({
            ...p,
            pointsCumulative:
              stopIndices !== null
                ? stopIndices.map((i) => p.pointsCumulative[i])
                : p.pointsCumulative,
          })),
        }
      : pointsEvolution;

  return (
    <div className="px-4 py-6">
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Circuitos</h1>
          <Button onClick={() => handleOpenModal()}>Nuevo Circuito</Button>
        </div>

        {isLoading && circuits.length === 0 ? (
          <p className="text-center py-8 text-gray-500">Cargando...</p>
        ) : (
          <Table
            columns={columns}
            data={circuits}
            keyExtractor={(circuit) => circuit.id || Math.random()}
            emptyMessage="No hay circuitos registrados"
          />
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingCircuit ? 'Editar Circuito' : 'Nuevo Circuito'}
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseModal}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} isLoading={isLoading}>
              {editingCircuit ? 'Actualizar' : 'Crear'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label="Nombre *"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={errors.name}
            required
          />
          <Textarea
            label="Descripción"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            rows={3}
          />
          <Input
            label="Fecha de Inicio"
            type="date"
            value={formData.start_date}
            onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
          />
          <Input
            label="Fecha de Fin"
            type="date"
            value={formData.end_date}
            onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
            error={errors.end_date}
          />
        </div>
      </Modal>

      <Modal
        isOpen={standingsModalOpen}
        onClose={() => setStandingsModalOpen(false)}
        title={
          selectedCircuit?.status === 'finalized'
            ? `Estadísticas finales - ${selectedCircuit?.name}`
            : `Acumulado - ${selectedCircuit?.name}`
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
                Exportar Excel
              </Button>
              <Button
                variant="secondary"
                onClick={() => handleGenerateReport(selectedCircuit, 'csv')}
                isLoading={isLoading}
              >
                Exportar CSV
              </Button>
              <Button variant="primary" onClick={() => setStandingsModalOpen(false)}>
                Cerrar
              </Button>
            </div>
          )
        }
      >
        {isLoading ? (
          <p className="text-center py-8 text-gray-500">Cargando...</p>
        ) : (
          <div className="space-y-6">
            {/* Filters */}
            {(circuitTournaments.length > 0 || standings.length > 0) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 col-span-full">Filtros</h3>
                {circuitTournaments.length > 0 && (
                  <MultiSelect
                    label="Por parada"
                    options={circuitTournaments.map((t) => ({ value: t.id, label: t.name }))}
                    value={selectedStopIds}
                    onChange={(v) => setSelectedStopIds(v as number[])}
                    placeholder="Todas las paradas"
                  />
                )}
                {standings.length > 0 && (
                  <MultiSelect
                    label="Por jugador"
                    options={standings.map((s) => ({ value: s.player_id, label: s.player_name }))}
                    value={selectedPlayerIds}
                    onChange={(v) => setSelectedPlayerIds(v as number[])}
                    placeholder="Todos los jugadores"
                  />
                )}
              </div>
            )}

            {selectedCircuit?.status === 'finalized' && standings.length > 0 && (
              <div className="rounded-lg bg-gray-50 dark:bg-gray-800/50 p-4">
                <h3 className="text-lg font-semibold mb-3">Podio final</h3>
                <div className="flex flex-wrap gap-4 justify-center items-end">
                  {standings[1] && (
                    <div className="flex flex-col items-center order-2 md:order-1">
                      <span className="text-2xl" aria-hidden>🥈</span>
                      <div className="font-bold text-gray-700 dark:text-gray-300">{standings[1].player_name}</div>
                      <div className="text-sm text-gray-500">{standings[1].total_points.toFixed(2)} pts</div>
                    </div>
                  )}
                  {standings[0] && (
                    <div className="flex flex-col items-center order-1 md:order-2">
                      <span className="text-3xl" aria-hidden>🥇</span>
                      <div className="font-bold text-gray-900 dark:text-white">{standings[0].player_name}</div>
                      <div className="text-sm text-gray-500">{standings[0].total_points.toFixed(2)} pts</div>
                    </div>
                  )}
                  {standings[2] && (
                    <div className="flex flex-col items-center order-3">
                      <span className="text-2xl" aria-hidden>🥉</span>
                      <div className="font-bold text-gray-700 dark:text-gray-300">{standings[2].player_name}</div>
                      <div className="text-sm text-gray-500">{standings[2].total_points.toFixed(2)} pts</div>
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
              <h3 className="text-lg font-semibold mb-2">Tabla de posiciones</h3>
              <Table
                columns={standingsColumns}
                data={filteredStandings}
                keyExtractor={(standing) => standing.player_id}
                emptyMessage="No hay datos de acumulado disponibles"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
