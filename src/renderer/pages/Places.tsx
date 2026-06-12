import { useState, useEffect, useCallback } from 'react';
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
import { useTranslation } from 'react-i18next';
import { formatUserError } from '../utils/formatUserError';

export default function Places() {
  const { t } = useTranslation();
  const { addNotification } = useNotifications();
  const [places, setPlaces] = useState<Place[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlace, setEditingPlace] = useState<Place | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '', city_id: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const loadPlaces = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await DatabaseService.getAllPlaces();
      setPlaces(data);
    } catch (error) {
      console.error('Error loading places:', error);
      addNotification({
        message: formatUserError(error, t('places.errors.load')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, t]);

  useEffect(() => {
    loadPlaces();
    DatabaseService.getAllCities()
      .then(setCities)
      .catch(() => {});
  }, [loadPlaces]);

  useEffect(() => {
    if (!editingPlace && isModalOpen && cities.length > 0 && !formData.city_id) {
      setFormData((prev) => ({ ...prev, city_id: cities[0].id!.toString() }));
    }
  }, [isModalOpen, editingPlace, cities, formData.city_id]);

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
      newErrors.name = t('places.errors.name_required');
    }
    if (!formData.city_id) {
      newErrors.city_id = t('places.errors.city_required');
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
        await DatabaseService.updatePlace(editingPlace.id, {
          name: formData.name.trim(),
          city_id: cityId,
        });
        addNotification({ message: t('places.errors.save_success'), type: 'success' });
      } else {
        if (cityId == null) {
          addNotification({ message: t('places.errors.city_required'), type: 'error' });
          return;
        }
        await DatabaseService.createPlace({ name: formData.name.trim(), city_id: cityId });
        addNotification({ message: t('places.errors.create_success'), type: 'success' });
      }
      handleCloseModal();
      loadPlaces();
    } catch (error) {
      console.error('Error saving place:', error);
      addNotification({
        message: formatUserError(error, t('places.errors.save')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (place: Place) => {
    if (!place.id) return;
    if (place.name === DEFAULT_PLACE_NAME) {
      addNotification({
        message: t('places.errors.delete_default', { name: DEFAULT_PLACE_NAME }),
        type: 'error',
      });
      return;
    }
    if (!confirm(t('places.alerts.delete_confirm', { name: place.name }))) return;
    try {
      setIsLoading(true);
      await DatabaseService.deletePlace(place.id);
      addNotification({ message: t('places.errors.delete_success'), type: 'success' });
      loadPlaces();
    } catch (error) {
      console.error('Error deleting place:', error);
      addNotification({
        message: formatUserError(error, t('places.errors.delete')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const columns: Column<Place>[] = [
    { key: 'name', header: t('places.columns.name') },
    {
      key: 'city_name',
      header: t('places.columns.city'),
      render: (place) => (place as Place & { city_name?: string }).city_name ?? '-',
    },
    {
      key: 'actions',
      header: t('places.columns.actions'),
      render: (place) => (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => handleOpenModal(place)}>
            {t('places.actions.edit')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            onClick={() => handleDelete(place)}
            disabled={place.name === DEFAULT_PLACE_NAME}
            title={
              place.name === DEFAULT_PLACE_NAME
                ? t('places.actions.delete_default_tooltip')
                : undefined
            }
          >
            {t('places.actions.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="px-4 py-6">
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">{t('places.title')}</h1>
          <Button onClick={() => handleOpenModal()}>{t('places.new')}</Button>
        </div>

        {isLoading && places.length === 0 ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">{t('places.loading')}</p>
        ) : (
          <Table
            columns={columns}
            data={places}
            keyExtractor={(place) => place.id ?? Math.random()}
            emptyMessage={t('places.empty_msg')}
          />
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingPlace ? t('places.modal.edit') : t('places.modal.new')}
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseModal}>
              {t('places.modal.cancel_btn')}
            </Button>
            <Button onClick={handleSubmit} isLoading={isLoading}>
              {editingPlace ? t('places.modal.update_btn') : t('places.modal.create_btn')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('places.form.name')}
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            error={errors.name}
            required
          />
          <Select
            label={t('places.form.city')}
            value={formData.city_id}
            onChange={(e) => setFormData({ ...formData, city_id: e.target.value })}
            options={[
              { value: '', label: t('places.form.select_city') },
              ...cities.map((c) => ({ value: c.id!.toString(), label: c.name })),
            ]}
            error={errors.city_id}
          />
        </div>
      </Modal>
    </div>
  );
}
