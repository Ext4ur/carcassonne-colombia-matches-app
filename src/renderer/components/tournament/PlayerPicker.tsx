import { useState, useRef, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import Input from '../common/Input';
import { filterPlayerOptions, type PlayerPickerOption } from '../../utils/playerPickerUtils';

export type { PlayerPickerOption };

interface PlayerPickerProps {
  label?: string;
  options: PlayerPickerOption[];
  registeredIds: number[];
  onRegister: (playerId: number) => void;
  onUnregister: (playerId: number) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export default function PlayerPicker({
  label,
  options,
  registeredIds,
  onRegister,
  onUnregister,
  placeholder,
  disabled = false,
  className = '',
}: PlayerPickerProps) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [filterTerm, setFilterTerm] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filteredOptions = useMemo(
    () => filterPlayerOptions(filterTerm, options),
    [filterTerm, options]
  );

  const registeredCount = registeredIds.length;
  const displayLabel =
    registeredCount === 0
      ? (placeholder ?? t('tournaments.registration.picker_placeholder'))
      : t('tournaments.registration.picker_registered_count', { count: registeredCount });

  const handleToggle = (opt: PlayerPickerOption, currentlyRegistered: boolean) => {
    if (currentlyRegistered) {
      if (confirm(t('tournaments.registration.remove_draft_confirm', { name: opt.label }))) {
        onUnregister(opt.value);
      }
    } else {
      onRegister(opt.value);
    }
  };

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
        </label>
      )}
      <button
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className="input w-full text-left flex items-center justify-between gap-2 min-h-[38px] disabled:opacity-60"
      >
        <span className={registeredCount === 0 ? 'text-gray-500 dark:text-gray-400' : ''}>
          {displayLabel}
        </span>
        <span className="text-gray-400">{isOpen ? '▲' : '▼'}</span>
      </button>
      {isOpen && (
        <div className="absolute z-[110] mt-1 w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 shadow-lg max-h-72 flex flex-col overflow-hidden">
          <div className="p-2 border-b border-gray-200 dark:border-gray-700 flex-none">
            <Input
              type="text"
              value={filterTerm}
              onChange={(e) => setFilterTerm(e.target.value)}
              placeholder={t('tournaments.registration.picker_search')}
              autoFocus
            />
          </div>
          <div className="overflow-y-auto flex-1 p-2 space-y-0.5">
            {filteredOptions.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400 px-2 py-3">
                {t('players.no_players_found')}
              </p>
            ) : (
              filteredOptions.map((opt) => {
                const isRegistered = registeredIds.includes(opt.value);
                return (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 p-2 rounded hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={isRegistered}
                      onChange={() => handleToggle(opt, isRegistered)}
                      className="rounded border-gray-300 text-primary-600 focus:ring-primary-500 flex-none"
                    />
                    <span className="text-sm flex-1 min-w-0 truncate">{opt.label}</span>
                    {isRegistered && (
                      <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200 flex-none">
                        {t('tournaments.registration.registered_badge')}
                      </span>
                    )}
                  </label>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
