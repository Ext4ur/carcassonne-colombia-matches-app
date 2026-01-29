import { useState, useEffect } from 'react';
import { DatabaseService } from '../services/database';
import { City } from '../types/city';
import Table from '../components/common/Table';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import { Column } from '../components/common/Table';
import { useNotifications } from '../contexts/NotificationContext';

export default function Cities() {
  const { addNotification } = useNotifications();
  const [cities, setCities] = useState<City[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCity, setEditingCity] = useState<City | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadCities();
  }, []);

  const loadCities = async () => {
    try {
      setIsLoading(true);
      const data = await DatabaseService.getAllCities();
      setCities(data);
    } catch (error) {
      console.error('Error loading cities:', error);
      addNotification({ message: 'Error al cargar las ciudades', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (city?: City) => {
    if (city) {
      setEditingCity(city);
      setFormData({ name: city.name || '' });
    } else {
      setEditingCity(null);
      setFormData({ name: '' });
    }
    setErrors({});
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingCity(null);
    setFormData({ name: '' });
    setErrors({});
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    try {
      setIsLoading(true);
      if (editingCity?.id) {
        await DatabaseService.updateCity(editingCity.id, { name: formData.name.trim() });
        addNotification({ message: 'Ciudad actualizada', type: 'success' });
      } else {
        await DatabaseService.createCity({ name: formData.name.trim() });
        addNotification({ message: 'Ciudad creada', type: 'success' });
      }
      handleCloseModal();
      loadCities();
    } catch (error) {
      console.error('Error saving city:', error);
      addNotification({
        message: error instanceof Error ? error.message : 'Error al guardar la ciudad',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (city: City) => {
    if (!city.id) return;
    if (!confirm(`¿Eliminar la ciudad "${city.name}"?`)) return;
    try {
      setIsLoading(true);
      await DatabaseService.deleteCity(city.id);
      addNotification({ message: 'Ciudad eliminada', type: 'success' });
      loadCities();
    } catch (error) {
      console.error('Error deleting city:', error);
      addNotification({
        message: error instanceof Error ? error.message : 'Error al eliminar la ciudad',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const columns: Column<City>[] = [
    { key: 'name', header: 'Nombre' },
    {
      key: 'actions',
      header: 'Acciones',
      render: (city) => (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => handleOpenModal(city)}>
            Editar
          </Button>
          <Button variant="danger" size="sm" onClick={() => handleDelete(city)}>
            Eliminar
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="px-4 py-6">
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Ciudades</h1>
          <Button onClick={() => handleOpenModal()}>Nueva Ciudad</Button>
        </div>

        {isLoading && cities.length === 0 ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">Cargando...</p>
        ) : (
          <Table
            columns={columns}
            data={cities}
            keyExtractor={(city) => city.id ?? Math.random()}
            emptyMessage="No hay ciudades registradas"
          />
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingCity ? 'Editar Ciudad' : 'Nueva Ciudad'}
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseModal}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} isLoading={isLoading}>
              {editingCity ? 'Actualizar' : 'Crear'}
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
        </div>
      </Modal>
    </div>
  );
}
