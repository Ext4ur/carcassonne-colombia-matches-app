import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

export default function Home() {
  const { t } = useTranslation();

  return (
    <div className="px-4 py-6">
      <div className="card">
        <h1 className="text-3xl font-bold mb-4">{t('home.welcome')}</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{t('home.description')}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link
            to="/tournaments"
            className="block p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
          >
            <h2 className="text-xl font-semibold mb-2">🏆 {t('nav.tournaments')}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('home.tournaments_desc')}</p>
          </Link>
          <Link
            to="/players"
            className="block p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
          >
            <h2 className="text-xl font-semibold mb-2">👥 {t('nav.players')}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('home.players_desc')}</p>
          </Link>
          <Link
            to="/circuits"
            className="block p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
          >
            <h2 className="text-xl font-semibold mb-2">🔄 {t('nav.circuits')}</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">{t('home.circuits_desc')}</p>
          </Link>
        </div>
      </div>
    </div>
  );
}
