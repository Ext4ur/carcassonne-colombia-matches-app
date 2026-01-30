import { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Input from '../common/Input';

interface RoundsConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (numberOfRounds: number) => void;
  numPlayers: number;
  calculatedRounds: number;
  mode: 'quick' | 'advanced';
  currentRounds?: number;
}

export default function RoundsConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  numPlayers,
  calculatedRounds,
  mode,
  currentRounds,
}: RoundsConfirmationModalProps) {
  const [numberOfRounds, setNumberOfRounds] = useState<string>(
    currentRounds?.toString() || calculatedRounds.toString()
  );
  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (isOpen) {
      setNumberOfRounds(currentRounds?.toString() || calculatedRounds.toString());
      setError('');
    }
  }, [isOpen, currentRounds, calculatedRounds]);

  const handleConfirm = () => {
    const rounds = parseInt(numberOfRounds, 10);
    if (isNaN(rounds) || rounds < 1) {
      setError('El número de rondas debe ser al menos 1');
      return;
    }
    onConfirm(rounds);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Confirmar Número de Rondas" size="sm">
      <div className="space-y-3">
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            <strong>Jugadores inscritos:</strong> {numPlayers}
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
            <strong>Rondas calculadas:</strong> {calculatedRounds}
          </p>
        </div>

        <div>
          <Input
            label="Número de Rondas"
            type="number"
            value={numberOfRounds}
            onChange={(e) => {
              const value = e.target.value;
              if (value === '') {
                setNumberOfRounds('');
                setError('');
              } else {
                const numValue = parseInt(value, 10);
                if (!isNaN(numValue) && numValue >= 1) {
                  setNumberOfRounds(value);
                  setError('');
                }
              }
            }}
            disabled={mode === 'quick'}
            error={error}
            helperText={
              mode === 'quick'
                ? 'En modo rápido se calcula automáticamente'
                : 'Ajusta el número de rondas si lo necesitas'
            }
          />
        </div>

        <div className="flex justify-end space-x-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={handleConfirm} variant="primary">
            Confirmar
          </Button>
        </div>
      </div>
    </Modal>
  );
}
