import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TournamentConfig } from '../../types/tournament';
import { Player } from '../../types/player';
import { buildQuickConfigDraft } from '../../utils/quickTournamentDefaults';
import { isStoreMode } from '../../utils/appMode';
import TournamentForm, { TournamentFormRef, TournamentFormResult } from './TournamentForm';
import PlayerRegistration, { PlayerRegistrationRef } from './PlayerRegistration';
import Button from '../common/Button';

type ConfigDraft = Partial<TournamentConfig> & {
  bye_selection?: 'worst' | 'random' | 'round_robin';
};

export type QuickTournamentPayload = {
  tournament: TournamentFormResult;
  config: ConfigDraft;
  players: Player[];
  numberOfRounds: number;
};

interface QuickTournamentWizardProps {
  onCancel: () => void;
  onComplete: (payload: QuickTournamentPayload) => void;
  onCompleteAndAnother: (payload: QuickTournamentPayload) => void;
}

export default function QuickTournamentWizard({
  onCancel,
  onComplete,
  onCompleteAndAnother,
}: QuickTournamentWizardProps) {
  const { t } = useTranslation();
  const storeMode = isStoreMode();
  const formRef = useRef<TournamentFormRef>(null);
  const registrationRef = useRef<PlayerRegistrationRef>(null);
  const [registrationPlayers, setRegistrationPlayers] = useState<Player[]>([]);

  const buildPayload = (numberOfRounds: number): QuickTournamentPayload | null => {
    const tournament = formRef.current?.validateAndGet();
    if (!tournament?.name || !tournament.type || !tournament.date) return null;
    return {
      tournament,
      config: buildQuickConfigDraft(tournament.players_per_match || 2) as ConfigDraft,
      players: registrationPlayers,
      numberOfRounds,
    };
  };

  const handleComplete = (numberOfRounds: number) => {
    const payload = buildPayload(numberOfRounds);
    if (payload) onComplete(payload);
  };

  const handleCompleteAndAnother = (numberOfRounds: number) => {
    const payload = buildPayload(numberOfRounds);
    if (payload) onCompleteAndAnother(payload);
  };

  return (
    <div className="flex flex-col min-h-[60vh] max-h-[75vh] overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
        <div className="overflow-y-auto min-h-0 lg:pr-4 lg:border-r border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-medium mb-4">
            {t('tournaments.wizard.quick_config_section')}
          </h3>
          <TournamentForm
            ref={formRef}
            mode="quick"
            hideActions
            storeLocationMode={storeMode}
            onSave={() => {}}
            onCancel={onCancel}
          />
        </div>
        <div className="flex flex-col min-h-0 overflow-hidden min-h-[280px] lg:min-h-0">
          <h3 className="text-lg font-medium mb-4 flex-none">
            {t('tournaments.registration.title')}
          </h3>
          <div className="flex-1 min-h-0 overflow-hidden">
            <PlayerRegistration
              ref={registrationRef}
              tournamentId={null}
              draftPlayers={registrationPlayers}
              onDraftPlayersChange={setRegistrationPlayers}
              onComplete={handleComplete}
              onCompleteAndAnother={handleCompleteAndAnother}
              mode="quick"
              layout="panel"
            />
          </div>
        </div>
      </div>
      <div className="flex-none flex justify-end items-center gap-2 pt-4 mt-4 border-t border-gray-200 dark:border-gray-700">
        <Button variant="secondary" onClick={onCancel}>
          {t('common.cancel')}
        </Button>
        {!storeMode && (
          <Button
            variant="secondary"
            onClick={() => registrationRef.current?.requestCompleteAndAnother()}
          >
            {t('tournaments.wizard.create_and_another')}
          </Button>
        )}
        <Button variant="primary" onClick={() => registrationRef.current?.requestComplete()}>
          {t('tournaments.registration.continue_with_count', {
            count: registrationPlayers.length,
          })}
        </Button>
      </div>
    </div>
  );
}
