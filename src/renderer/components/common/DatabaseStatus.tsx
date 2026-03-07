/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { testSupabaseConnection, getCurrentApiClientInfo } from '@utils/testSupabaseConnection';
import Button from './Button';
import { useTranslation } from 'react-i18next';

/**
 * Componente para mostrar el estado de la conexión con la base de datos,
 * probar la conexión con Supabase y validar el número de queries.
 */
export default function DatabaseStatus() {
  const { t } = useTranslation();
  const [clientInfo, setClientInfo] = useState(getCurrentApiClientInfo());
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
    details?: any;
  } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testSupabaseConnection();
      setTestResult(result);
    } catch (error: any) {
      setTestResult({
        success: false,
        message: t('database_status.test_error'),
        details: { error: error.message },
      });
    } finally {
      setIsTesting(false);
    }
  };

  useEffect(() => {
    setClientInfo(getCurrentApiClientInfo());
  }, []);

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
        {t('database_status.title')}
      </h3>

      <div className="space-y-3 mb-4">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {t('database_status.current_client')}
          </p>
          <p className="font-medium text-gray-600 dark:text-gray-400">
            {clientInfo.type === 'local' && t('database_status.local')}
            {clientInfo.type === 'cloud-sync' && t('database_status.sync')}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{clientInfo.message}</p>
        </div>
      </div>

      {clientInfo.type === 'cloud-sync' || clientInfo.configured ? (
        <div className="mb-4">
          <Button
            onClick={handleTestConnection}
            variant="primary"
            size="sm"
            isLoading={isTesting}
            disabled={isTesting}
          >
            {isTesting ? t('database_status.testing_btn') : t('database_status.test_btn')}
          </Button>
        </div>
      ) : null}

      {testResult && (
        <div
          className={`p-3 rounded-lg ${
            testResult.success
              ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800'
              : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'
          }`}
        >
          <p
            className={`font-medium ${
              testResult.success
                ? 'text-green-800 dark:text-green-200'
                : 'text-red-800 dark:text-red-200'
            }`}
          >
            {testResult.success ? '✅' : '❌'} {testResult.message}
          </p>
          {testResult.details && (
            <pre className="mt-2 text-xs overflow-auto text-gray-700 dark:text-gray-300">
              {JSON.stringify(testResult.details, null, 2)}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}
