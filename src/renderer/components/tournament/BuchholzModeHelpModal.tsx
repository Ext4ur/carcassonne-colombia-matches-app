import Modal from '../common/Modal';
import Button from '../common/Button';
import { useTranslation } from 'react-i18next';
import { getAllBuchholzModeMetas } from '../../utils/buchholzModeMeta';

interface BuchholzModeHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function BuchholzModeHelpModal({ isOpen, onClose }: BuchholzModeHelpModalProps) {
  const { t } = useTranslation();
  const metas = getAllBuchholzModeMetas();

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('tournaments.config.buchholz_help_modal_title')}
      size="lg"
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-300">
          {t('tournaments.config.buchholz_help_modal_intro')}
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {metas.map((meta) => (
            <div
              key={meta.mode}
              className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-900"
            >
              <h4 className="font-semibold text-sm text-gray-900 dark:text-gray-100">
                {t(meta.modeLabelI18nKey)}
              </h4>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                {meta.usesVirtualOpponent
                  ? t('tournaments.config.buchholz_help_uses_virtual_yes')
                  : t('tournaments.config.buchholz_help_uses_virtual_no')}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {meta.virtualKind === 'field_avg'
                  ? t('tournaments.config.buchholz_help_virtual_kind_avg')
                  : meta.virtualKind === 'round_worst'
                    ? t('tournaments.config.buchholz_help_virtual_kind_worst')
                    : t('tournaments.config.buchholz_help_virtual_kind_none')}
              </p>
              <p className="text-sm text-gray-700 dark:text-gray-300 mt-2">
                {t(meta.exampleI18nKey)}
              </p>
            </div>
          ))}
        </div>
        <div className="flex justify-end">
          <Button variant="secondary" onClick={onClose}>
            {t('common.close')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
