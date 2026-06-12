import { useState, useEffect, useCallback } from 'react';
import { DatabaseService } from '../services/database';
import { City } from '../types/city';
import Table from '../components/common/Table';
import Button from '../components/common/Button';
import Modal from '../components/common/Modal';
import Input from '../components/common/Input';
import { Column } from '../components/common/Table';
import { useNotifications } from '../contexts/NotificationContext';
import { useTranslation } from 'react-i18next';
import { formatUserError } from '../utils/formatUserError';

export default function Cities() {
  const { t } = useTranslation();
  const { addNotification } = useNotifications();
  const [cities, setCities] = useState<City[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCity, setEditingCity] = useState<City | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({ name: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const loadCities = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await DatabaseService.getAllCities();
      setCities(data);
    } catch (error) {
      console.error('Error loading cities:', error);
      addNotification({
        message: formatUserError(error, t('cities.errors.load')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  }, [addNotification, t]);

  useEffect(() => {
    loadCities();
  }, [loadCities]);

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
      newErrors.name = t('cities.errors.name_required');
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
        addNotification({ message: t('cities.errors.save_success'), type: 'success' });
      } else {
        await DatabaseService.createCity({ name: formData.name.trim() });
        addNotification({ message: t('cities.errors.create_success'), type: 'success' });
      }
      handleCloseModal();
      loadCities();
    } catch (error) {
      console.error('Error saving city:', error);
      addNotification({
        message: formatUserError(error, t('cities.errors.save')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (city: City) => {
    if (!city.id) return;
    if (!confirm(t('cities.alerts.delete_confirm', { name: city.name }))) return;
    try {
      setIsLoading(true);
      await DatabaseService.deleteCity(city.id);
      addNotification({ message: t('cities.errors.delete_success'), type: 'success' });
      loadCities();
    } catch (error) {
      console.error('Error deleting city:', error);
      addNotification({
        message: formatUserError(error, t('cities.errors.delete')),
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const columns: Column<City>[] = [
    { key: 'name', header: t('cities.columns.name') },
    {
      key: 'actions',
      header: t('cities.columns.actions'),
      render: (city) => (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" onClick={() => handleOpenModal(city)}>
            {t('cities.actions.edit')}
          </Button>
          <Button variant="danger" size="sm" onClick={() => handleDelete(city)}>
            {t('cities.actions.delete')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="px-4 py-6">
      <div className="card">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">{t('cities.title')}</h1>
          <Button onClick={() => handleOpenModal()}>{t('cities.new')}</Button>
        </div>

        {isLoading && cities.length === 0 ? (
          <p className="text-center py-8 text-gray-500 dark:text-gray-400">{t('cities.loading')}</p>
        ) : (
          <Table
            columns={columns}
            data={cities}
            keyExtractor={(city) => city.id ?? Math.random()}
            emptyMessage={t('cities.empty_msg')}
          />
        )}
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        title={editingCity ? t('cities.modal.edit') : t('cities.modal.new')}
        footer={
          <>
            <Button variant="secondary" onClick={handleCloseModal}>
              {t('cities.modal.cancel_btn')}
            </Button>
            <Button onClick={handleSubmit} isLoading={isLoading}>
              {editingCity ? t('cities.modal.update_btn') : t('cities.modal.create_btn')}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input
            label={t('cities.form.name')}
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
