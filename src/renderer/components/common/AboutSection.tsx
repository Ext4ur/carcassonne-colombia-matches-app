import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import githubIcon from '../../assets/icons/github.svg';
import bgaIcon from '../../assets/icons/bga_icon.png';
import packageJson from '../../../../package.json';

type Props = {
  /** Tarjeta con borde (Settings) vs pie compacto (Layout tienda). */
  variant?: 'card' | 'footer';
};

export default function AboutSection({ variant = 'card' }: Props) {
  const { t } = useTranslation();
  const [appVersion, setAppVersion] = useState<string>(packageJson.version);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const v = await window.electronAPI.getVersion();
        const resolved = (v && String(v).trim()) || packageJson.version;
        if (!cancelled) setAppVersion(resolved);
      } catch {
        if (!cancelled) setAppVersion(packageJson.version);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const content = (
    <div className="space-y-2">
      <p className="font-semibold text-gray-800 dark:text-gray-200">
        {t('settings.app_name', { version: appVersion })}
      </p>
      <p className="text-sm text-gray-600 dark:text-gray-400">
        {t('settings.developed_by')} <strong>Ext4ur</strong>
        <span className="text-gray-500 dark:text-gray-500">
          {t('settings.developed_by_version_suffix', { version: appVersion })}
        </span>
      </p>
      <div className="flex flex-wrap gap-x-6 gap-y-2 mt-4">
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
            src={bgaIcon}
            alt=""
            aria-hidden
            className="w-5 h-5 mr-2 rounded-sm object-contain"
          />
          <span>{t('settings.links.board_game_arena')}</span>
        </a>
      </div>
    </div>
  );

  if (variant === 'footer') {
    return (
      <footer className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-bold text-gray-700 dark:text-gray-300 mb-3">
          {t('settings.about')}
        </h2>
        {content}
      </footer>
    );
  }

  return (
    <div className="card">
      <h2 className="text-xl font-bold mb-4">{t('settings.about')}</h2>
      {content}
    </div>
  );
}
