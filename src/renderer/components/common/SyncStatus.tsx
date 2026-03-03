import { useState, useEffect } from 'react';
import { SyncService } from '../../services/syncService';

export default function SyncStatus() {
  const [status, setStatus] = useState({
    isSyncing: false,
    isOnline: navigator.onLine,
    isConfigured: false,
  });
  const [queueSize, setQueueSize] = useState(0);
  const [lastCheck, setLastCheck] = useState(new Date());

  useEffect(() => {
    const updateStatus = async () => {
      setStatus(SyncService.getSyncStatus());
      const size = await SyncService.getQueueSize();
      setQueueSize(size);
      setLastCheck(new Date());
    };

    // Initial load
    updateStatus();

    // Poll every 5 seconds as requested
    const interval = setInterval(updateStatus, 5000);

    // Listen to online/offline events for immediate feedback
    const handleOnline = () => {
      console.log('Status: Browser online event');
      updateStatus();
    };
    const handleOffline = () => {
      console.log('Status: Browser offline event');
      updateStatus();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(interval);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!status.isConfigured) {
    // Hide if Supabase not configured or just minimal indicator?
    // Let's show a "Local Mode" indicator
    return (
      <div
        className="flex items-center text-xs text-gray-500 dark:text-gray-400 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-800"
        title="Modo Offline (Solo Local)"
      >
        <span className="mr-1">💾</span>
        <span className="hidden sm:inline">Local</span>
      </div>
    );
  }

  return (
    <div className="flex items-center space-x-2 text-sm">
      {/* Network Status Icon */}
      <div
        className={`flex items-center justify-center w-6 h-6 rounded-full ${
          status.isOnline
            ? 'text-green-500 bg-green-50 dark:bg-green-900/20'
            : 'text-red-500 bg-red-50 dark:bg-red-900/20'
        }`}
        title={`${status.isOnline ? 'Internet: Conectado' : 'Internet: Desconectado'}
Navegador: ${navigator.onLine ? 'Online' : 'Offline'}
Supabase: ${status.isOnline ? 'Online' : 'Offline'}
Última revisión: ${lastCheck.toLocaleTimeString()}`}
      >
        {status.isOnline ? (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.55a11 11 0 0 1 14.08 0"></path>
            <path d="M1.42 9a16 16 0 0 1 21.16 0"></path>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
            <line x1="12" y1="20" x2="12.01" y2="20"></line>
          </svg>
        ) : (
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="1" y1="1" x2="23" y2="23"></line>
            <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55"></path>
            <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39"></path>
            <path d="M10.71 5.05A16 16 0 0 1 22.58 9"></path>
            <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88"></path>
            <path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path>
            <line x1="12" y1="20" x2="12.01" y2="20"></line>
          </svg>
        )}
      </div>

      {/* Sync Status Icon */}
      <div
        className={`flex items-center px-3 py-1 rounded-full border transition-all duration-300 ${
          !status.isOnline
            ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
            : status.isSyncing
              ? 'bg-blue-50 text-blue-600 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-800'
              : queueSize > 0
                ? 'bg-yellow-50 text-yellow-600 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-400 dark:border-yellow-800'
                : 'bg-green-50 text-green-600 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
        }`}
        title={
          !status.isOnline
            ? 'Sin conexión a internet'
            : status.isSyncing
              ? 'Sincronizando cambios...'
              : queueSize > 0
                ? `${queueSize} cambios pendientes`
                : 'Sincronizado'
        }
      >
        <span className={`mr-1.5 ${status.isSyncing ? 'animate-spin' : ''}`}>
          {!status.isOnline ? (
            // Cloud Off
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M22.61 22.61L1.39 1.39" />
              <path d="M3.38 3.38C2.53 4.36 2 5.61 2 7c0 2.21 1.79 4 4 4h.88M9.62 9.62A5 5 0 0 1 12 7c2.76 0 5 2.24 5 5 0 .28-.03.55-.07.81" />
              <path d="M19.12 19.12C18.47 20.25 17.31 21 16 21H6c-2.38 0-4.24-1.63-4.84-3.84" />
              <path d="M11 11L13 13M19 11v6" />
            </svg>
          ) : status.isSyncing ? (
            // Refresh CW
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
              <path d="M3 21v-5h5" />
            </svg>
          ) : (
            // Cloud Check
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M16.5 16.5L18 18L21.5 14.5M10.88 5c.42-.66 1.1-1 1.11-1 3.3 0 6 2.7 6 6 0 .34-.03.68-.1 1.01 M16 21H6a5 5 0 0 1 0-10h.85c.34-1.87 1.9-3.26 3.8-3.32" />
            </svg>
          )}
        </span>

        <span className="font-medium text-xs hidden sm:inline">
          {!status.isOnline
            ? queueSize > 0
              ? `Pendiente (${queueSize})`
              : 'Offline'
            : status.isSyncing
              ? 'Sincronizando...'
              : 'Sync OK'}
        </span>
      </div>

      {/* Manual Sync Button (only visible if there are pending items and online) */}
      {status.isOnline && !status.isSyncing && (
        <button
          onClick={() => SyncService.sync()} // Trigger manual sync
          className="text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 text-xs underline"
          title="Forzar sincronización ahora"
        >
          {queueSize > 0 ? 'Subir ahora' : 'Sincronizar'}
        </button>
      )}
    </div>
  );
}
