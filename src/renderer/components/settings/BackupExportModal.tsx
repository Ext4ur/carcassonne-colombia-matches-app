import { useTranslation } from 'react-i18next';
import Modal from '../common/Modal';
import Button from '../common/Button';
import type { Tournament } from '../../types/tournament';

interface BackupExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  tournaments: Tournament[];
  checkedIds: Set<number>;
  onToggleId: (id: number) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onConfirm: () => void;
  isExporting: boolean;
}

export default function BackupExportModal({
  isOpen,
  onClose,
  tournaments,
  checkedIds,
  onToggleId,
  onSelectAll,
  onSelectNone,
  onConfirm,
  isExporting,
}: BackupExportModalProps) {
  const { t } = useTranslation();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('settings.export_modal_title')}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('settings.export_cancel')}
          </Button>
          <Button
            variant="primary"
            onClick={onConfirm}
            isLoading={isExporting}
            disabled={tournaments.length === 0}
          >
            {t('settings.export_confirm')}
          </Button>
        </>
      }
    >
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
        {t('settings.export_modal_hint')}
      </p>
      <div className="flex flex-wrap gap-2 mb-3">
        <Button type="button" variant="secondary" className="text-sm" onClick={onSelectAll}>
          {t('settings.export_select_all')}
        </Button>
        <Button type="button" variant="secondary" className="text-sm" onClick={onSelectNone}>
          {t('settings.export_select_none')}
        </Button>
        <span className="text-sm text-gray-500 dark:text-gray-400 ml-auto">
          {t('settings.export_selected_count', { count: checkedIds.size })}
        </span>
      </div>
      {tournaments.length === 0 ? (
        <p className="text-sm text-gray-500">{t('settings.export_no_tournaments')}</p>
      ) : (
        <ul className="max-h-[50vh] overflow-y-auto divide-y divide-gray-200 dark:divide-gray-600 border border-gray-200 dark:border-gray-600 rounded-lg">
          {tournaments.map((tm) => {
            const id = tm.id!;
            return (
              <li key={id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                  checked={checkedIds.has(id)}
                  onChange={() => onToggleId(id)}
                />
                <span className="flex-1 min-w-0">
                  <span className="font-medium text-gray-900 dark:text-gray-100 truncate block">
                    {tm.name}
                  </span>
                  <span className="text-gray-500 dark:text-gray-400 text-xs">
                    {[tm.date, tm.place_name].filter(Boolean).join(' · ')}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
  );
}
