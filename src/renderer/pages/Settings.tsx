import { useMemo, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useNotifications } from '../contexts/NotificationContext';
import Button from '../components/common/Button';
import { ExportService } from '../services/export';
import { ImportService } from '../services/import';
import DatabaseStatus from '../components/common/DatabaseStatus';
import { useTranslation } from 'react-i18next';
import Select from '../components/common/Select';
import githubIcon from '../assets/icons/github.svg';
import TournamentConfigComponent from '../components/tournament/TournamentConfig';
import { TournamentConfig, normalizeBuchholzByeMode } from '../types/tournament';
import { getDefaultScoringSystem } from '../utils/scoring';
import { DEFAULT_TIEBREAK_CRITERIA } from '../utils/tiebreak';
import {
  clearQuickTournamentDefaults,
  readQuickTournamentDefaults,
  writeQuickTournamentDefaults,
} from '../utils/quickTournamentDefaults';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { addNotification } = useNotifications();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [quickDefaultsPpm, setQuickDefaultsPpm] = useState(2);
  const [quickDefaultsVersion, setQuickDefaultsVersion] = useState(0);

  const quickDefaultsFormConfig: TournamentConfig = useMemo(() => {
    const stored = readQuickTournamentDefaults();
    const ppm = quickDefaultsPpm;
    return {
      tournament_id: 0,
      avoid_rematches: stored?.avoid_rematches ?? true,
      tiebreak_criteria: stored?.tiebreak_criteria ?? DEFAULT_TIEBREAK_CRITERIA,
      scoring_system:
        stored?.scoring_system && stored.scoring_players_per_match === ppm
          ? stored.scoring_system
          : getDefaultScoringSystem(ppm),
      bye_selection: stored?.bye_selection ?? 'worst',
      player_display_mode: stored?.player_display_mode ?? 'per_player',
      pairing_algorithm: stored?.pairing_algorithm ?? 'greedy',
      buchholz_bye_mode: normalizeBuchholzByeMode(stored?.buchholz_bye_mode),
    };
  }, [quickDefaultsPpm, quickDefaultsVersion]);

  const handleQuickDefaultsSave = (
    cfg: Partial<TournamentConfig> & {
      bye_selection?: 'worst' | 'random' | 'round_robin';
      player_display_mode?: 'per_player' | 'names_only' | 'usernames_only';
      pairing_algorithm?: 'greedy' | 'backtracking';
    }
  ) => {
    writeQuickTournamentDefaults({
      avoid_rematches: cfg.avoid_rematches ?? true,
      tiebreak_criteria: cfg.tiebreak_criteria ?? DEFAULT_TIEBREAK_CRITERIA,
      scoring_system: cfg.scoring_system ?? getDefaultScoringSystem(quickDefaultsPpm),
      bye_selection: cfg.bye_selection ?? 'worst',
      player_display_mode: cfg.player_display_mode ?? 'per_player',
      pairing_algorithm: cfg.pairing_algorithm ?? 'greedy',
      buchholz_bye_mode: normalizeBuchholzByeMode(cfg.buchholz_bye_mode),
      scoring_players_per_match: quickDefaultsPpm,
    });
    addNotification({
      message: t('settings.quick_defaults_saved'),
      type: 'success',
    });
  };

  const handleQuickDefaultsReset = () => {
    if (!confirm(t('settings.quick_defaults_reset_confirm'))) return;
    clearQuickTournamentDefaults();
    setQuickDefaultsPpm(2);
    setQuickDefaultsVersion((v) => v + 1);
    addNotification({
      message: t('settings.quick_defaults_reset_done'),
      type: 'success',
    });
  };

  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(() => {
    const saved = localStorage.getItem('cloud_sync_enabled');
    if (saved === null) {
      // Default to true for Colombia, false for International
      return import.meta.env.VITE_APP_ENV !== 'international';
    }
    return saved === 'true';
  });

  const handleExport = async () => {
    try {
      setIsExporting(true);
      await ExportService.exportAll();
      addNotification({
        message: t('settings.errors.export_success'),
        type: 'success',
      });
    } catch (error) {
      console.error('Error exporting:', error);
      addNotification({
        message: t('settings.errors.export_error'),
        type: 'error',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    try {
      setIsImporting(true);
      const result = await ImportService.importAll();
      if (result.success) {
        addNotification({
          message: t('settings.errors.import_success', { summary: result.summary }),
          type: 'success',
        });
        // Reload page to show imported data
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        addNotification({
          message: result.error || t('settings.errors.import_error'),
          type: 'error',
        });
      }
    } catch (error) {
      console.error('Error importing:', error);
      addNotification({
        message: t('settings.errors.import_error'),
        type: 'error',
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">{t('settings.title')}</h1>

      <div className="space-y-6">
        {/* Theme Settings */}
        <div className="card">
          <h2 className="text-xl font-bold mb-4">{t('settings.appearance')}</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">{t('settings.theme')}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('settings.theme_desc')}</p>
            </div>
            <button
              onClick={toggleTheme}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              {theme === 'light' ? t('settings.dark_mode') : t('settings.light_mode')}
            </button>
          </div>

          <div className="mt-6 border-t border-gray-100 dark:border-gray-700 pt-6">
            <div className="flex items-center justify-between">
              <div className="flex-1 mr-4">
                <p className="font-medium">{t('settings.language')}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('settings.language_desc')}
                </p>
              </div>
              <div className="w-48">
                <Select
                  value={i18n.language.split('-')[0]}
                  onChange={(e) => i18n.changeLanguage(e.target.value)}
                  options={[
                    { value: 'es', label: 'es - Español' },
                    { value: 'en', label: 'en - English' },
                    { value: 'hu', label: 'hu - Magyar' },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <h2 className="text-xl font-bold mb-2">{t('settings.quick_defaults_title')}</h2>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            {t('settings.quick_defaults_desc')}
          </p>
          <div className="mb-4 w-full max-w-xs">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              {t('settings.quick_defaults_ppm')}
            </label>
            <Select
              value={String(quickDefaultsPpm)}
              onChange={(e) => setQuickDefaultsPpm(Number(e.target.value))}
              options={[
                { value: '2', label: '2' },
                { value: '3', label: '3' },
                { value: '4', label: '4' },
              ]}
            />
          </div>
          <div className="max-h-[min(70vh,520px)] overflow-y-auto pr-1 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
            <TournamentConfigComponent
              key={`quick-def-${quickDefaultsPpm}-${quickDefaultsVersion}`}
              tournamentId={0}
              playersPerMatch={quickDefaultsPpm}
              config={quickDefaultsFormConfig}
              onSave={handleQuickDefaultsSave}
              onCancel={() => {}}
              showCancel={false}
            />
          </div>
          <div className="mt-4">
            <Button variant="secondary" onClick={handleQuickDefaultsReset}>
              {t('settings.quick_defaults_reset')}
            </Button>
          </div>
        </div>

        {/* Synchronization Settings */}
        <div className="card">
          <h2 className="text-xl font-bold mb-4">{t('settings.sync')}</h2>
          <div className="flex items-center justify-between">
            <div className="flex-1 mr-4">
              <p className="font-medium">{t('settings.sync_enabled')}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">{t('settings.sync_desc')}</p>
            </div>
            <button
              onClick={() => {
                const newValue = !cloudSyncEnabled;
                setCloudSyncEnabled(newValue);
                localStorage.setItem('cloud_sync_enabled', String(newValue));
                addNotification({
                  message: newValue
                    ? t('settings.errors.sync_enabled_msg')
                    : t('settings.errors.sync_disabled_msg'),
                  type: 'info',
                });
                // Reload or notify sync service? Reload is safest to restart background processes
                setTimeout(() => window.location.reload(), 1000);
              }}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                cloudSyncEnabled ? 'bg-primary-600' : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  cloudSyncEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>

        {/* Database Status */}
        <DatabaseStatus />

        {/* Export/Import */}
        <div className="card">
          <h2 className="text-xl font-bold mb-4">{t('settings.data')}</h2>
          <div className="space-y-4">
            <div>
              <p className="font-medium mb-2">{t('settings.export_title')}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {t('settings.export_desc')}
              </p>
              <Button onClick={handleExport} isLoading={isExporting} variant="primary">
                {t('settings.export_btn')}
              </Button>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <p className="font-medium mb-2">{t('settings.import_title')}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {t('settings.import_desc')}
              </p>
              <Button onClick={handleImport} isLoading={isImporting} variant="secondary">
                {t('settings.import_btn')}
              </Button>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="card">
          <h2 className="text-xl font-bold mb-4">{t('settings.about')}</h2>
          <div className="space-y-2">
            <p className="font-semibold text-gray-800 dark:text-gray-200">
              Carcassonne Tournament Manager v1.3
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('settings.developed_by')} <strong>Ext4ur</strong>
            </p>
            <div className="flex space-x-6 mt-4">
              <a
                href="https://github.com/Ext4ur"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center text-sm text-primary-600 dark:text-primary-400 hover:underline"
              >
                <img
                  src={githubIcon}
                  alt=""
                  aria-hidden
                  className="w-5 h-5 mr-2 dark:invert transition-all"
                />
                <span>{t('settings.links.github')}</span>
              </a>
              <a
                href="https://boardgamearena.com/player?id=88813461"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center text-sm text-primary-600 dark:text-primary-400 hover:underline"
              >
                <img
                  src="http://www.boardgamearena.com/favicon.ico"
                  alt=""
                  aria-hidden
                  className="w-5 h-5 mr-2 rounded-sm"
                />
                <span>{t('settings.links.board_game_arena')}</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
