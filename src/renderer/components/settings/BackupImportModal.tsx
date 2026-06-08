import { useTranslation } from 'react-i18next';
import Modal from '../common/Modal';
import Button from '../common/Button';
import type { BackupImportData } from '../../services/import';

interface BackupImportModalProps {
  isOpen: boolean;
  onAbort: () => void;
  pendingImportData: BackupImportData | null;
  checkedIndices: Set<number>;
  duplicateByIndex: Map<number, boolean>;
  onToggleIndex: (index: number) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onConfirm: () => void;
  isImporting: boolean;
}

export default function BackupImportModal({
  isOpen,
  onAbort,
  pendingImportData,
  checkedIndices,
  duplicateByIndex,
  onToggleIndex,
  onSelectAll,
  onSelectNone,
  onConfirm,
  isImporting,
}: BackupImportModalProps) {
  const { t } = useTranslation();
  const tournaments = pendingImportData?.data.tournaments ?? [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onAbort}
      title={t('settings.import_modal_title')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onAbort}>
            {t('settings.import_cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            isLoading={isImporting}
            disabled={!pendingImportData || checkedIndices.size === 0}
          >
            {t('settings.import_confirm')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
        {t('settings.import_modal_hint')}
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        <Button type="button" variant="secondary" className="text-sm" onClick={onSelectAll}>
          {t('settings.import_select_all')}
        </Button>
        <Button type="button" variant="secondary" className="text-sm" onClick={onSelectNone}>
          {t('settings.import_select_none')}
        </Button>
        <span className="text-sm text-gray-500 dark:text-gray-400 ml-auto">
          {t('settings.import_selected_count', { count: checkedIndices.size })}
        </span>
      </div>
      {pendingImportData && (
        <ul className="max-h-[50vh] overflow-y-auto divide-y divide-gray-200 dark:divide-gray-600 border border-gray-200 dark:border-gray-600 rounded-lg">
          {tournaments.map(
            (tm: { name?: string; date?: string; place_name?: string }, idx: number) => (
              <li key={idx} className="flex items-center gap-3 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  checked={checkedIndices.has(idx)}
                  onChange={() => onToggleIndex(idx)}
                />
                <span className="flex-1 min-w-0">
                  <span className="font-medium text-gray-900 dark:text-gray-100 truncate block">
                    {tm.name}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400 text-xs">
                    {[tm.date, tm.place_name].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {duplicateByIndex.get(idx) && (
                  <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-100 shrink-0">
                    {t('settings.import_duplicate_badge')}
                  </span>
                )}
              </li>
            )
          )}
        </ul>
      )}
    </Modal>
  );
}
