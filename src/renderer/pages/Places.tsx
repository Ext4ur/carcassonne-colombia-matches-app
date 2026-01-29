import { useState, useEffect } from 'react';
import { DatabaseService } from '../services/database';
import { Place } from '../types/place';
import { City } from '../types/city';
import Table from '../components/common/Table';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import Select from '../components/common/Select';
import { Column } from '../components/common/Table';
import { useNotifications } from '../contexts/NotificationContext';
import { DEFAULT_PLACE_NAME } from '../constants';

export default function Places() {
  const { addNotification } = useNotifications();
  const [places, setPlaces] = useState<Place[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', city_id: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadPlaces();
    DatabaseService.getAllCities().then(setCities).catch(() => {});
  }, []);

  useEffect(() => {
    if (!editingPlace && isModalOpen && cities.length > 0 && !formData.city_id) {
      setFormData((prev) => ({ ...prev, city_id: cities[0].id!.toString() }));
    }
  }, [isModalOpen, editingPlace, cities]);

  const loadPlaces = async () => {
    try {
      setIsLoading(true);
      const data = await DatabaseService.getAllPlaces();
      setPlaces(data);
    } catch (error) {
      console.error('Error loading places:', error);
      addNotification({ message: 'Error al cargar los lugares', type: 'error' });
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (place?: Place) => {
    if (place) {
      setEditingPlace(place);
      setFormData({ name: place.name || '', city_id: place.city_id?.toString() ?? '' });
    } else {
      setEditingPlace(null);
      setFormData({ name: '', city_id: cities[0]?.id?.toString() ?? '' });
    }
    setErrors({});
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingPlace(null);
    setFormData({ name: '', city_id: '' });
    setErrors({});
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }
    if (!formData.city_id) {
      newErrors.city_id = 'Debes seleccionar una ciudad';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async () => {
    if (!validateForm()) return;
    try {
      setIsLoading(true);
      const cityId = formData.city_id ? Number(formData.city_id) : undefined;
      if (editingPlace?.id) {
        await DatabaseService.updatePlace(editingPlace.id, { name: formData.name.trim(), city_id: cityId });
        addNotification({ message: 'Lugar actualizado', type: 'success' });
      } else {
        if (cityId == null) {
          addNotification({ message: 'Debes seleccionar una ciudad', type: 'error' });
          return;
        }
        await DatabaseService.createPlace({ name: formData.name.trim(), city_id: cityId });
        addNotification({ message: 'Lugar creado', type: 'success' });
      }
      handleCloseModal();
      loadPlaces();
    } catch (error) {
      console.error('Error saving place:', error);
      addNotification({
        message: error instanceof Error ? error.message : 'Error al guardar el lugar',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (place: Place) => {
    if (!place.id) return;
    if (place.name === DEFAULT_PLACE_NAME) {
      addNotification({ message: `No se puede eliminar el lugar por defecto "${DEFAULT_PLACE_NAME}".`, type: 'error' });
      return;
    }
    if (!confirm(`¿Eliminar el lugar "${place.name}"?`)) return;
    try {
      setIsLoading(true);
      await DatabaseService.deletePlace(place.id);
      addNotification({ message: 'Lugar eliminado', type: 'success' });
      loadPlaces();
    } catch (error) {
      console.error('Error deleting place:', error);
      addNotification({
        message: error instanceof Error ? error.message : 'Error al eliminar el lugar',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const columns: Column<Place>[] = [
    { key: 'name', header: 'Nombre' },
    {
      key: 'city_name',
      header: 'Ciudad',
      render: (place) => (place as Place & { city_name?: string }).city_name ?? '-',
    },
    {
      key: 'actions',
      header: 'Acciones',
      render: (place) => (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => handleOpenModal(place)}>
            Editar
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleDelete(place)}
            disabled={place.name === DEFAULT_PLACE_NAME}
            title={place.name === DEFAULT_PLACE_NAME ? 'No se puede eliminar el lugar por defecto' : undefined}
          >
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
          <h1 className="text-2xl font-bold">Lugares</h1>
          <Button onClick={() => handleOpenModal()}>Nuevo Lugar</Button>
        </div>

        {isLoading && places.length === 0 ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">Cargando...</p>
        ) : (
          <Table
            columns={columns}
            data={places}
            keyExtractor={(place) => place.id ?? Math.random()}
            emptyMessage="No hay lugares registrados"
          />
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingPlace ? 'Editar Lugar' : 'Nuevo Lugar'}
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseModal}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} isLoading={isLoading}>
              {editingPlace ? 'Actualizar' : 'Crear'}
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
          <Select
            label="Ciudad *"
            value={formData.city_id}
            onChange={(e) => setFormData({ ...formData, city_id: e.target.value })}
            options={[
              { value: '', label: 'Seleccionar ciudad...' },
              ...cities.map((c) => ({ value: c.id!.toString(), label: c.name })),
            ]}
            error={errors.city_id}
          />
        </div>
      </Modal>
    </div>
  );
}
