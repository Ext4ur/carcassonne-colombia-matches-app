/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react';
import { testSupabaseConnection, getCurrentApiClientInfo } from '@utils/testSupabaseConnection';
import { getQueryCount, getCacheHitCount, resetQueryCount } from '@api/clients/queryCounter';
import Button from './Button';

/**
 * Componente para mostrar el estado de la conexión con la base de datos,
 * probar la conexión con Supabase y validar el número de queries.
 */
export default function DatabaseStatus() {
  const [clientInfo, setClientInfo] = useState(getCurrentApiClientInfo());
  const [queryCount, setQueryCount] = useState(0);
  const [cacheHitCount, setCacheHitCount] = useState(0);
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
        message: 'Error al probar conexión',
        details: { error: error.message },
      });
    } finally {
      setIsTesting(false);
    }
  };

  useEffect(() => {
    setClientInfo(getCurrentApiClientInfo());
    setQueryCount(getQueryCount());
    setCacheHitCount(getCacheHitCount());
  }, []);

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
      <h3 className="text-lg font-semibold mb-3 text-gray-900 dark:text-gray-100">
        Estado de Base de Datos
      </h3>

      <div className="space-y-3">
        <div>
          <p className="text-sm text-gray-600 dark:text-gray-400">Cliente actual:</p>
          <p className="font-medium text-gray-600 dark:text-gray-400">
            {clientInfo.type === 'local' && 'SQLite (Local)'}
            {clientInfo.type === 'cloud-sync' && 'SQLite (Local) + Supabase (Sync)'}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{clientInfo.message}</p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Queries a Supabase/BD: <strong>{queryCount}</strong>
            </span>
            <span className="text-sm text-gray-500 dark:text-gray-500">|</span>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Desde caché: <strong>{cacheHitCount}</strong>
            </span>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setQueryCount(getQueryCount());
                setCacheHitCount(getCacheHitCount());
              }}
            >
              Actualizar conteo
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                resetQueryCount();
                setQueryCount(0);
                setCacheHitCount(0);
              }}
            >
              Reset
            </Button>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Las queries a BD son las que llegan al cliente; desde caché son lecturas resueltas sin
            tocar la BD.
          </p>
        </div>

        {clientInfo.type === 'cloud-sync' || clientInfo.configured ? (
          <div>
            <Button
              onClick={handleTestConnection}
              variant="primary"
              size="sm"
              isLoading={isTesting}
              disabled={isTesting}
            >
              {isTesting ? 'Probando...' : 'Probar Conexión Supabase'}
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
    </div>
  );
}
