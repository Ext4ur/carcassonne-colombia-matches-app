import { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useNotifications } from '../contexts/NotificationContext';
import Button from '../components/common/Button';
import { ExportService } from '../services/export';
import { ImportService } from '../services/import';
import DatabaseStatus from '../components/common/DatabaseStatus';
import { useTranslation } from 'react-i18next';
import Select from '../components/common/Select';
import githubIcon from '../assets/icons/github.svg';

export default function Settings() {
  const { t, i18n } = useTranslation();
  const { theme, toggleTheme } = useTheme();
  const { addNotification } = useNotifications();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

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
                  alt="GitHub"
                  className="w-5 h-5 mr-2 dark:invert transition-all"
                />
                <span>GitHub</span>
              </a>
              <a
                href="https://boardgamearena.com/player?id=88813461"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center text-sm text-primary-600 dark:text-primary-400 hover:underline"
              >
                <img
                  src="http://www.boardgamearena.com/favicon.ico"
                  alt="BGA"
                  className="w-5 h-5 mr-2 rounded-sm"
                />
                <span>Board Game Arena</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
