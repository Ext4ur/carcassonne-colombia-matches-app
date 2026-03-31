import { useState, useEffect } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';
import Input from '../common/Input';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
      setError(t('tournaments.rounds_modal.error_min'));
      return;
    }
    onConfirm(rounds);
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('tournaments.rounds_modal.title')}
      size="sm"
      closeOnBackdropClick={false}
    >
      <div className="space-y-3">
        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            <strong>{t('tournaments.rounds_modal.registered')}</strong> {numPlayers}
          </p>
          <p className="text-sm text-gray-700 dark:text-gray-300 mt-1">
            <strong>{t('tournaments.rounds_modal.calculated')}</strong> {calculatedRounds}
          </p>
        </div>

        <div>
          <Input
            label={t('tournaments.rounds_modal.label')}
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
                ? t('tournaments.rounds_modal.help_quick')
                : t('tournaments.rounds_modal.help_advanced')
            }
          />
        </div>

        <div className="flex justify-end space-x-2 pt-2">
          <Button variant="secondary" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm} variant="primary">
            {t('common.confirm')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
