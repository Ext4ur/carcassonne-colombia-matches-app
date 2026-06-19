import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Modal from '../common/Modal';
import Button from '../common/Button';
import {
  saveTournamentExcelReport,
  saveTournamentJsonBackup,
} from '../../utils/tournamentExportFiles';
import { setStoreKioskLocked } from '../../services/storeLifecycle';

type Step = 'json' | 'excel' | 'done';

type Props = {
  isOpen: boolean;
  tournamentId: number;
  tournamentName: string;
  onComplete: () => void;
};

export default function StoreFinalizeExportModal({
  isOpen,
  tournamentId,
  tournamentName,
  onComplete,
}: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('json');
  const [jsonDone, setJsonDone] = useState(false);
  const [excelDone, setExcelDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const handleSaveJson = async () => {
    setBusy(true);
    setErrorKey(null);
    const result = await saveTournamentJsonBackup(tournamentId);
    setBusy(false);
    if (result.success) {
      setJsonDone(true);
      setStep('excel');
      return;
    }
    if (result.canceled) {
      setErrorKey('store_finalize.canceled_json');
      return;
    }
    setErrorKey('store_finalize.error_json');
  };

  const handleSaveExcel = async () => {
    setBusy(true);
    setErrorKey(null);
    const result = await saveTournamentExcelReport(tournamentId, tournamentName);
    setBusy(false);
    if (result.success) {
      setExcelDone(true);
      setStep('done');
      setStoreKioskLocked();
      return;
    }
    if (result.canceled) {
      setErrorKey('store_finalize.canceled_excel');
      return;
    }
    setErrorKey('store_finalize.error_excel');
  };

  const handleFinish = () => {
    if (jsonDone && excelDone) {
      onComplete();
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        /* bloqueante: no cerrar con backdrop hasta completar */
      }}
      title={t('store_finalize.title')}
      footer={
        step === 'done' ? (
          <Button onClick={handleFinish}>{t('store_finalize.done_btn')}</Button>
        ) : (
          <Button
            variant="primary"
            isLoading={busy}
            onClick={step === 'json' ? handleSaveJson : handleSaveExcel}
          >
            {step === 'json'
              ? t('store_finalize.save_json_btn')
              : t('store_finalize.save_excel_btn')}
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('store_finalize.intro')}</p>
        <ol className="list-decimal list-inside space-y-2 text-sm">
          <li className={jsonDone ? 'text-green-600 dark:text-green-400' : ''}>
            {t('store_finalize.step_json')}
            {jsonDone ? ` — ${t('store_finalize.step_done')}` : ''}
          </li>
          <li className={excelDone ? 'text-green-600 dark:text-green-400' : ''}>
            {t('store_finalize.step_excel')}
            {excelDone ? ` — ${t('store_finalize.step_done')}` : ''}
          </li>
        </ol>
        {step === 'excel' && !excelDone && (
          <p className="text-sm font-medium text-primary-600 dark:text-primary-400">
            {t('store_finalize.now_excel')}
          </p>
        )}
        {step === 'done' && (
          <p className="text-sm text-green-700 dark:text-green-300">
            {t('store_finalize.all_done')}
          </p>
        )}
        {errorKey && (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {t(errorKey)}
          </p>
        )}
      </div>
    </Modal>
  );
}
