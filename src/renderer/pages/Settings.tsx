import { useMemo, useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useNotifications } from '../contexts/NotificationContext';
import Button from '../components/common/Button';
import { ExportService, isExportSubsetError } from '../services/export';
import { ImportService, type BackupImportData } from '../services/import';
import { DatabaseService } from '../services/database';
import { Tournament } from '../types/tournament';
import BackupExportModal from '../components/settings/BackupExportModal';
import BackupImportModal from '../components/settings/BackupImportModal';
import DatabaseStatus from '../components/common/DatabaseStatus';
import { useTranslation } from 'react-i18next';
import Select from '../components/common/Select';
import AboutSection from '../components/common/AboutSection';
import TournamentConfigComponent from '../components/tournament/TournamentConfig';
import { TournamentConfig, normalizeBuchholzByeMode } from '../types/tournament';
import { getDefaultScoringSystem } from '../utils/scoring';
import { DEFAULT_TIEBREAK_CRITERIA } from '../utils/tiebreak';
import {
  clearQuickTournamentDefaults,
  readQuickTournamentDefaults,
  writeQuickTournamentDefaults,
} from '../utils/quickTournamentDefaults';
import { formatUserError } from '../utils/formatUserError';
import { isLocalOnlyMode, isStoreMode } from '../utils/storeMode';
import { ensureStoreModeSyncDefaults, isRemoteSyncReady } from '../api/clients/supabaseConfig';
import { SyncService } from '../services/syncService';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const storeMode = isStoreMode();
  ensureStoreModeSyncDefaults();
  const { theme, toggleTheme } = useTheme();
  const { addNotification } = useNotifications();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportList, setExportList] = useState<Tournament[]>([]);
  const [exportCheckedIds, setExportCheckedIds] = useState<Set<number>>(new Set());
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [pendingImportData, setPendingImportData] = useState<BackupImportData | null>(null);
  /** índices de data.tournaments */
  const [importCheckedIndices, setImportCheckedIndices] = useState<Set<number>>(new Set());
  const [importDupByIndex, setImportDupByIndex] = useState<Map<number, boolean>>(new Map());

  const [quickDefaultsPpm, setQuickDefaultsPpm] = useState(2);
  const [quickDefaultsVersion, setQuickDefaultsVersion] = useState(0);

  const quickDefaultsFormConfig: TournamentConfig = useMemo(() => {
    void quickDefaultsVersion;
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

  const [cloudResyncBusy, setCloudResyncBusy] = useState(false);

  const [cloudSyncEnabled, setCloudSyncEnabled] = useState(() => {
    const saved = localStorage.getItem('cloud_sync_enabled');
    if (saved === null) {
      return import.meta.env.VITE_APP_ENV !== 'international';
    }
    return saved === 'true';
  });

  const handleCloudResync = async () => {
    if (!window.confirm(t('settings.cloud_resync_confirm'))) return;
    setCloudResyncBusy(true);
    try {
      const result = await SyncService.resetLocalDataForCloudResync();
      if (result.ok) {
        addNotification({ message: t('settings.cloud_resync_success'), type: 'success' });
      } else {
        addNotification({
          message: t('settings.cloud_resync_error', { detail: result.error ?? '' }),
          type: 'error',
        });
      }
    } catch (error) {
      addNotification({
        message: formatUserError(error, t('settings.cloud_resync_error', { detail: '' })),
        type: 'error',
      });
    } finally {
      setCloudResyncBusy(false);
    }
  };

  const openExportModal = async () => {
    try {
      const list = await DatabaseService.getAllTournaments();
      setExportList(list);
      setExportCheckedIds(new Set(list.map((x) => x.id!).filter((id): id is number => id != null)));
      setExportModalOpen(true);
    } catch (error) {
      console.error('Error listing tournaments:', error);
      addNotification({
        message: formatUserError(error, t('settings.errors.export_error')),
        type: 'error',
      });
    }
  };

  const toggleExportId = (id: number) => {
    setExportCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleExportConfirmed = async () => {
    if (exportCheckedIds.size === 0) {
      addNotification({ message: t('settings.export_no_selection'), type: 'warning' });
      return;
    }
    try {
      setIsExporting(true);
      await ExportService.exportSubset(Array.from(exportCheckedIds));
      setExportModalOpen(false);
      addNotification({
        message: t('settings.errors.export_success'),
        type: 'success',
      });
    } catch (error: unknown) {
      console.error('Error exporting:', error);
      const msg = isExportSubsetError(error)
        ? t('settings.export_no_selection')
        : formatUserError(error, t('settings.errors.export_error'));
      addNotification({ message: msg, type: 'error' });
    } finally {
      setIsExporting(false);
    }
  };

  const startImportFlow = async () => {
    try {
      setIsImporting(true);
      const picked = await ImportService.pickFileAndParse();
      if (!picked.success || !picked.importData) {
        if (!picked.canceled) {
          addNotification({
            message: picked.error || t('settings.errors.import_error'),
            type: 'error',
          });
        }
        return;
      }
      const dupRows = await ImportService.peekTournamentDuplicates(picked.importData);
      const dupMap = new Map(dupRows.map((r) => [r.index, r.existsInDb]));
      const n = picked.importData.data.tournaments.length;
      setPendingImportData(picked.importData);
      setImportDupByIndex(dupMap);
      setImportCheckedIndices(new Set(Array.from({ length: n }, (_, i) => i)));
      setImportModalOpen(true);
    } catch (error) {
      console.error('Error importing:', error);
      addNotification({
        message: formatUserError(error, t('settings.errors.import_error')),
        type: 'error',
      });
    } finally {
      setIsImporting(false);
    }
  };

  const toggleImportIndex = (idx: number) => {
    setImportCheckedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleImportConfirmed = async () => {
    if (!pendingImportData) {
      addNotification({ message: t('settings.import_pick_file_first'), type: 'warning' });
      return;
    }
    const indices = Array.from(importCheckedIndices).sort((a, b) => a - b);
    if (indices.length === 0) {
      addNotification({ message: t('settings.import_no_selection'), type: 'warning' });
      return;
    }
    try {
      setIsImporting(true);
      const result = await ImportService.importSelected(pendingImportData, indices);
      setImportModalOpen(false);
      setPendingImportData(null);
      if (result.success) {
        addNotification({
          message: t('settings.errors.import_success', { summary: result.summary }),
          type: 'success',
        });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        addNotification({
          message: result.error || t('settings.errors.import_error'),
          type: 'error',
        });
      }
    } catch (error) {
      console.error('Error importing:', error);
      addNotification({
        message: formatUserError(error, t('settings.errors.import_error')),
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
                    { value: 'de', label: 'de - Deutsch' },
                    { value: 'hu', label: 'hu - Magyar' },
                  ]}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Synchronization Settings */}
        <div className="card">
          <h2 className="text-xl font-bold mb-4">{t('settings.sync')}</h2>
          {isLocalOnlyMode() ? (
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {storeMode ? t('settings.sync_store_local') : t('settings.sync_hq_local')}
            </p>
          ) : (
            <div className="flex items-center justify-between">
              <div className="flex-1 mr-4">
                <p className="font-medium">{t('settings.sync_enabled')}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('settings.sync_desc')}
                </p>
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
          )}
          {!isLocalOnlyMode() && cloudSyncEnabled && isRemoteSyncReady() && (
            <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
              <p className="font-medium">{t('settings.cloud_resync_title')}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {t('settings.cloud_resync_desc')}
              </p>
              <Button variant="secondary" disabled={cloudResyncBusy} onClick={handleCloudResync}>
                {cloudResyncBusy
                  ? t('settings.cloud_resync_busy')
                  : t('settings.cloud_resync_action')}
              </Button>
            </div>
          )}
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
              <Button onClick={openExportModal} isLoading={isExporting} variant="primary">
                {t('settings.export_btn')}
              </Button>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <p className="font-medium mb-2">{t('settings.import_title')}</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {t('settings.import_desc')}
              </p>
              <Button onClick={startImportFlow} isLoading={isImporting} variant="secondary">
                {t('settings.import_btn')}
              </Button>
            </div>
          </div>
        </div>

        <BackupExportModal
          isOpen={exportModalOpen}
          onClose={() => setExportModalOpen(false)}
          tournaments={exportList}
          checkedIds={exportCheckedIds}
          onToggleId={toggleExportId}
          onSelectAll={() =>
            setExportCheckedIds(new Set(exportList.map((x) => x.id!).filter(Boolean)))
          }
          onSelectNone={() => setExportCheckedIds(new Set())}
          onConfirm={handleExportConfirmed}
          isExporting={isExporting}
        />

        <BackupImportModal
          isOpen={importModalOpen}
          onAbort={() => {
            setImportModalOpen(false);
            setPendingImportData(null);
          }}
          pendingImportData={pendingImportData}
          checkedIndices={importCheckedIndices}
          duplicateByIndex={importDupByIndex}
          onToggleIndex={toggleImportIndex}
          onSelectAll={() => {
            const n = pendingImportData?.data.tournaments.length ?? 0;
            setImportCheckedIndices(new Set(Array.from({ length: n }, (_, i) => i)));
          }}
          onSelectNone={() => setImportCheckedIndices(new Set())}
          onConfirm={handleImportConfirmed}
          isImporting={isImporting}
        />

        {/* Quick tournament defaults */}
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

        <AboutSection />
      </div>
    </div>
  );
}
