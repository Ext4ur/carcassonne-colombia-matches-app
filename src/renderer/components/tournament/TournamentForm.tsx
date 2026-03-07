import { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import { DatabaseService } from '../../services/database';
import { Tournament, TournamentType } from '../../types/tournament';
import { Circuit } from '../../types/circuit';
import { Place } from '../../types/place';
import { DEFAULT_PLACE_NAME } from '../../constants';
import { getLocalDateString } from '../../utils/dateUtils';
import Input from '../common/Input';
import Select from '../common/Select';
import Button from '../common/Button';
import { useTranslation } from 'react-i18next';

export interface TournamentFormRef {
  submit: () => void;
}

interface TournamentFormProps {
  tournament?: Tournament;
  onSave: (tournament: Partial<Tournament>) => void;
  onCancel: () => void;
  mode?: 'quick' | 'advanced';
  /** When true, buttons are not rendered (e.g. when parent puts them in modal footer). */
  hideActions?: boolean;
}

const TournamentForm = forwardRef<TournamentFormRef, TournamentFormProps>(function TournamentForm(
  {
    tournament,
    onSave, // eslint-disable-next-line @typescript-eslint/no-unused-vars
    onCancel: _onCancel,
    mode = 'quick',
    hideActions = false,
  },
  ref
) {
  const { t } = useTranslation();
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [formData, setFormData] = useState({
    name: tournament?.name || '',
    type: (tournament?.type || 'qualifier') as TournamentType,
    circuit_id: tournament?.circuit_id?.toString() || '',
    date: tournament?.date || getLocalDateString(),
    players_per_match: tournament?.players_per_match || 2,
    number_of_rounds: tournament?.number_of_rounds?.toString() || '',
    place_id: tournament?.place_id?.toString() || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    loadCircuits();
    loadPlaces();
  }, []);

  useEffect(() => {
    if (places.length > 0 && !formData.place_id) {
      const defaultPlace = places.find((p) => p.name === DEFAULT_PLACE_NAME);
      if (defaultPlace?.id)
        setFormData((prev) => ({ ...prev, place_id: defaultPlace.id!.toString() }));
    }
  }, [places, formData.place_id]);

  const loadCircuits = async () => {
    try {
      const data = await DatabaseService.getAllCircuits();
      setCircuits(data);
    } catch (error) {
      console.error('Error loading circuits:', error);
    }
  };

  const loadPlaces = async () => {
    try {
      const data = await DatabaseService.getAllPlaces();
      setPlaces(data);
    } catch (error) {
      console.error('Error loading places:', error);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = t('tournaments.form.name_req');
    }

    if (formData.type === 'circuit' && !formData.circuit_id) {
      newErrors.circuit_id = t('tournaments.form.circuit_req');
    }

    if (!formData.date) {
      newErrors.date = t('tournaments.form.date_req');
    }

    if (!formData.place_id) {
      newErrors.place_id = t('tournaments.form.place_req');
    }

    if (formData.players_per_match < 2 || formData.players_per_match > 4) {
      newErrors.players_per_match = t('tournaments.form.players_range');
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    onSave({
      name: formData.name.trim(),
      type: formData.type,
      circuit_id:
        formData.type === 'circuit' && formData.circuit_id
          ? Number(formData.circuit_id)
          : undefined,
      date: formData.date,
      players_per_match: formData.players_per_match,
      number_of_rounds: formData.number_of_rounds ? Number(formData.number_of_rounds) : undefined,
      place_id: formData.place_id ? Number(formData.place_id) : undefined,
    });
  };

  useImperativeHandle(ref, () => ({
    submit: handleSubmit,
  }));

  return (
    <div className="space-y-4">
      <Input
        label={t('tournaments.form.name_label')}
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        error={errors.name}
        required
      />

      <Select
        label={t('tournaments.form.type_label')}
        value={formData.type}
        onChange={(e) =>
          setFormData({ ...formData, type: e.target.value as TournamentType, circuit_id: '' })
        }
        options={[
          { value: 'qualifier', label: t('tournaments.types.qualifier') },
          { value: 'circuit', label: t('tournaments.types.circuit') },
        ]}
      />

      {formData.type === 'circuit' && (
        <Select
          label={t('tournaments.form.circuit_label')}
          value={formData.circuit_id}
          onChange={(e) => setFormData({ ...formData, circuit_id: e.target.value })}
          options={[
            { value: '', label: t('tournaments.form.select_circuit') },
            ...circuits
              .filter((c) => c.status !== 'finalized')
              .map((c) => ({ value: c.id!.toString(), label: c.name })),
          ]}
          error={errors.circuit_id}
        />
      )}

      <Select
        label={t('tournaments.form.place_label')}
        value={formData.place_id}
        onChange={(e) => setFormData({ ...formData, place_id: e.target.value })}
        options={[
          { value: '', label: t('tournaments.form.select_place') },
          ...places.map((p) => ({ value: p.id!.toString(), label: p.name })),
        ]}
        error={errors.place_id}
      />

      <Input
        label={t('tournaments.form.date_label')}
        type="date"
        value={formData.date}
        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
        error={errors.date}
        required
      />

      {mode === 'advanced' && (
        <>
          <Select
            label={t('tournaments.form.players_label')}
            value={formData.players_per_match.toString()}
            onChange={(e) =>
              setFormData({ ...formData, players_per_match: Number(e.target.value) })
            }
            options={[
              { value: '2', label: t('tournaments.form.n_players', { count: 2 }) },
              { value: '3', label: t('tournaments.form.n_players', { count: 3 }) },
              { value: '4', label: t('tournaments.form.n_players', { count: 4 }) },
            ]}
            error={errors.players_per_match}
          />
          <Input
            label={t('tournaments.form.rounds_label')}
            type="number"
            value={formData.number_of_rounds}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '') {
                setFormData({ ...formData, number_of_rounds: '' });
              } else {
                const numValue = parseInt(value, 10);
                if (!isNaN(numValue) && numValue >= 1) {
                  setFormData({ ...formData, number_of_rounds: value });
                }
              }
            }}
            helperText={t('tournaments.form.rounds_help')}
          />
        </>
      )}

      {!hideActions && (
        <div className="flex justify-end space-x-2 pt-4">
          <Button onClick={handleSubmit}>
            {tournament ? t('common.update') : t('common.continue')}
          </Button>
        </div>
      )}
    </div>
  );
});

export default TournamentForm;
