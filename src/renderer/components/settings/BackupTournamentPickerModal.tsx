import { useTranslation } from 'react-i18next';
import type { ReactNode } from 'react';
import Modal from '../common/Modal';
import Button from '../common/Button';

export type BackupPickerItem = {
  key: string | number;
  title: string;
  subtitle?: string;
  duplicate?: boolean;
  checked: boolean;
  onToggle: () => void;
};

type Props = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  hint: string;
  items: BackupPickerItem[];
  selectedCount: ReactNode;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onConfirm: () => void;
  confirmLabel: string;
  cancelLabel: string;
  busy: boolean;
  confirmDisabled?: boolean;
  emptyMessage?: string;
};

export default function BackupTournamentPickerModal({
  isOpen,
  onClose,
  title,
  hint,
  items,
  selectedCount,
  onSelectAll,
  onSelectNone,
  onConfirm,
  confirmLabel,
  cancelLabel,
  busy,
  confirmDisabled,
  emptyMessage,
}: Props) {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {cancelLabel}
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            isLoading={busy}
            disabled={confirmDisabled ?? items.length === 0}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{hint}</p>
      <div className="flex flex-wrap gap-2 mb-3">
        <Button type="button" variant="secondary" className="text-sm" onClick={onSelectAll}>
          {t('settings.export_select_all')}
        </Button>
        <Button type="button" variant="secondary" className="text-sm" onClick={onSelectNone}>
          {t('settings.export_select_none')}
        </Button>
        <span className="text-sm text-gray-500 dark:text-gray-400 ml-auto">{selectedCount}</span>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-500">{emptyMessage}</p>
      ) : (
        <ul className="max-h-[50vh] overflow-y-auto divide-y divide-gray-200 dark:divide-gray-600 border border-gray-200 dark:border-gray-600 rounded-lg">
          {items.map((item) => (
            <li key={item.key} className="flex items-center gap-3 px-3 py-2 text-sm">
              <input
                type="checkbox"
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                checked={item.checked}
                onChange={item.onToggle}
              />
              <span className="flex-1 min-w-0">
                <span className="font-medium text-gray-900 dark:text-gray-100 truncate block">
                  {item.title}
                </span>
                {item.subtitle ? (
                  <span className="text-gray-500 dark:text-gray-400 text-xs">{item.subtitle}</span>
                ) : null}
              </span>
              {item.duplicate ? (
                <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100 shrink-0">
                  {t('settings.import_duplicate_badge')}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
