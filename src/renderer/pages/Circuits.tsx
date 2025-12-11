import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DatabaseService } from '../services/database';
import { CircuitService } from '../services/circuit';
import { Circuit, CircuitStandings } from '../types/circuit';
import Table from '../components/common/Table';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import Textarea from '../components/common/Textarea';
import { Column } from '../components/common/Table';

export default function Circuits() {
  const navigate = useNavigate();
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [standingsModalOpen, setStandingsModalOpen] = useState(false);
  const [editingCircuit, setEditingCircuit] = useState<Circuit | null>(null);
  const [selectedCircuit, setSelectedCircuit] = useState<Circuit | null>(null);
  const [standings, setStandings] = useState<CircuitStandings[]>([]);
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
      const data = await DatabaseService.getCircuitStandings(circuitId);
      setStandings(data);
      setStandingsModalOpen(true);
    } catch (error) {
      console.error('Error loading standings:', error);
      alert('Error al cargar el acumulado');
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
      key: 'description',
      header: 'Descripción',
      render: (circuit) => circuit.description || '-',
      className: 'max-w-md truncate',
    },
    {
      key: 'start_date',
      header: 'Fecha Inicio',
      render: (circuit) => circuit.start_date ? new Date(circuit.start_date).toLocaleDateString() : '-',
    },
    {
      key: 'end_date',
      header: 'Fecha Fin',
      render: (circuit) => circuit.end_date ? new Date(circuit.end_date).toLocaleDateString() : '-',
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (circuit) => (
        <div className="flex space-x-2">
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleViewStandings(circuit)}
          >
            Ver Acumulado
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleOpenModal(circuit)}
          >
            Editar
          </Button>
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
        title={`Acumulado - ${selectedCircuit?.name}`}
        size="lg"
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
          <Table
            columns={standingsColumns}
            data={standings}
            keyExtractor={(standing) => standing.player_id}
            emptyMessage="No hay datos de acumulado disponibles"
          />
        )}
      </Modal>
    </div>
  );
}
