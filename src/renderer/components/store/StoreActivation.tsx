import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../common/Button';
import Input from '../common/Input';
import { getMachineFingerprint } from '../../services/storeActivation';
import { redeemStoreActivation } from '../../services/storeActivationApi';
import { SyncService } from '../../services/syncService';
import { isRemoteSyncReady } from '../../api/clients/supabaseConfig';

type Props = {
  onActivated: () => void;
};

export default function StoreActivation({ onActivated }: Props) {
  const { t } = useTranslation();
  const syncReady = isRemoteSyncReady();
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) return;
    setIsLoading(true);
    setErrorKey(null);
    try {
      const result = await redeemStoreActivation(trimmed, getMachineFingerprint());
      if (!result.ok) {
        setErrorKey(result.message);
        return;
      }
      try {
        await SyncService.sync();
        await SyncService.recoverStoreCatalogIfEmpty();
      } catch (syncErr) {
        console.warn('Sync after activation failed:', syncErr);
      }
      onActivated();
    } catch (err) {
      console.error(err);
      setErrorKey('store_activation.errors.redeem_failed');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4">
      <div className="card max-w-md w-full space-y-4">
        <h1 className="text-xl font-bold">{t('store_activation.title')}</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('store_activation.hint')}</p>
        {!syncReady && (
          <div
            className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-sm text-amber-900 dark:text-amber-100"
            role="alert"
          >
            <p className="font-medium">{t('store_activation.sync_not_ready_title')}</p>
            <p className="mt-1">{t('store_activation.sync_not_ready_hint')}</p>
          </div>
        )}
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label={t('store_activation.code_label')}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('store_activation.code_placeholder')}
            autoComplete="off"
            disabled={isLoading || !syncReady}
          />
          {errorKey && (
            <p className="text-sm text-red-600 dark:text-red-400" role="alert">
              {t(errorKey)}
            </p>
          )}
          <Button type="submit" isLoading={isLoading} disabled={!syncReady} className="w-full">
            {t('store_activation.submit')}
          </Button>
        </form>
      </div>
    </div>
  );
}
