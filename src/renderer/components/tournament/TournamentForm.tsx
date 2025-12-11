import { useState, useEffect } from 'react';
import { DatabaseService } from '../../services/database';
import { Tournament, TournamentType } from '../../types/tournament';
import { Circuit } from '../../types/circuit';
import { calculateNumberOfRounds } from '../../utils/tournament';
import Input from '../common/Input';
import Select from '../common/Select';
import Button from '../common/Button';

interface TournamentFormProps {
  tournament?: Tournament;
  onSave: (tournament: Partial<Tournament>) => void;
  onCancel: () => void;
  mode?: 'quick' | 'advanced';
}

export default function TournamentForm({ tournament, onSave, onCancel, mode = 'quick' }: TournamentFormProps) {
  const [circuits, setCircuits] = useState<Circuit[]>([]);
  const [formData, setFormData] = useState({
    name: tournament?.name || '',
    type: (tournament?.type || 'qualifier') as TournamentType,
    circuit_id: tournament?.circuit_id?.toString() || '',
    date: tournament?.date || new Date().toISOString().split('T')[0],
    players_per_match: tournament?.players_per_match || 2,
    number_of_rounds: tournament?.number_of_rounds?.toString() || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [estimatedRounds, setEstimatedRounds] = useState<number>(0);

  useEffect(() => {
    loadCircuits();
  }, []);

  // Calculate estimated rounds when players_per_match changes
  useEffect(() => {
    // This will be calculated when we know the number of players
    // For now, we'll calculate it when the form is submitted
  }, [formData.players_per_match]);

  const loadCircuits = async () => {
    try {
      const data = await DatabaseService.getAllCircuits();
      setCircuits(data);
    } catch (error) {
      console.error('Error loading circuits:', error);
    }
  };

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'El nombre es requerido';
    }

    if (formData.type === 'circuit' && !formData.circuit_id) {
      newErrors.circuit_id = 'Debes seleccionar un circuito';
    }

    if (!formData.date) {
      newErrors.date = 'La fecha es requerida';
    }

    if (formData.players_per_match < 2 || formData.players_per_match > 4) {
      newErrors.players_per_match = 'Debe ser entre 2 y 4 jugadores';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = () => {
    if (!validateForm()) return;

    onSave({
      name: formData.name.trim(),
      type: formData.type,
      circuit_id: formData.type === 'circuit' && formData.circuit_id ? Number(formData.circuit_id) : undefined,
      date: formData.date,
      players_per_match: formData.players_per_match,
      number_of_rounds: formData.number_of_rounds ? Number(formData.number_of_rounds) : undefined,
    });
  };

  return (
    <div className="space-y-4">
      <Input
        label="Nombre del Torneo *"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        error={errors.name}
        required
      />

      <Select
        label="Tipo de Torneo *"
        value={formData.type}
        onChange={(e) => setFormData({ ...formData, type: e.target.value as TournamentType, circuit_id: '' })}
        options={[
          { value: 'qualifier', label: 'Clasificatorio' },
          { value: 'circuit', label: 'Circuito' },
        ]}
      />

      {formData.type === 'circuit' && (
        <Select
          label="Circuito *"
          value={formData.circuit_id}
          onChange={(e) => setFormData({ ...formData, circuit_id: e.target.value })}
          options={[
            { value: '', label: 'Seleccionar circuito...' },
            ...circuits.map((c) => ({ value: c.id!.toString(), label: c.name })),
          ]}
          error={errors.circuit_id}
        />
      )}

      <Input
        label="Fecha *"
        type="date"
        value={formData.date}
        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
        error={errors.date}
        required
      />

      {mode === 'advanced' && (
        <>
          <Select
            label="Jugadores por Partida *"
            value={formData.players_per_match.toString()}
            onChange={(e) => setFormData({ ...formData, players_per_match: Number(e.target.value) })}
            options={[
              { value: '2', label: '2 jugadores' },
              { value: '3', label: '3 jugadores' },
              { value: '4', label: '4 jugadores' },
            ]}
            error={errors.players_per_match}
          />
          <Input
            label="Número de Rondas (opcional, se calculará automáticamente si se deja vacío)"
            type="number"
            value={formData.number_of_rounds}
            onChange={(e) => setFormData({ ...formData, number_of_rounds: e.target.value })}
            min="1"
            helperText="Se calculará como potencia de 2 según el número de jugadores si se deja vacío"
          />
        </>
      )}

      <div className="flex justify-end space-x-2 pt-4">
        <Button variant="secondary" onClick={onCancel}>
          Cancelar
        </Button>
        <Button onClick={handleSubmit}>
          {tournament ? 'Actualizar' : 'Continuar'}
        </Button>
      </div>
    </div>
  );
}

