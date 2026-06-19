import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isDevirHqMode, isStoreMode } from '../utils/storeMode';

export default function Home() {
  const { t } = useTranslation();
  const storeMode = isStoreMode();
  const hqMode = isDevirHqMode();

  const homeDescription = storeMode
    ? t('home.store_description')
    : hqMode
      ? t('home.hq_description')
      : t('home.description');

  const links = [
    {
      to: '/tournaments',
      icon: '🏆',
      title: t('nav.tournaments'),
      desc: t('home.tournaments_desc'),
      show: true,
    },
    {
      to: '/players',
      icon: '👥',
      title: t('nav.players'),
      desc: t('home.players_desc'),
      show: true,
    },
    {
      to: '/circuits',
      icon: '🔄',
      title: t('nav.circuits'),
      desc: t('home.circuits_desc'),
      show: !storeMode,
    },
  ].filter((l) => l.show);

  return (
    <div className="px-4 py-6">
      <div className="card">
        <h1 className="text-3xl font-bold mb-4">{t('home.welcome')}</h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{homeDescription}</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {links.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="block p-4 bg-primary-50 dark:bg-primary-900/20 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors"
            >
              <h2 className="text-xl font-semibold mb-2">
                {link.icon} {link.title}
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">{link.desc}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
