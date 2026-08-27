/* eslint-disable @typescript-eslint/no-explicit-any */
import { contextBridge, ipcRenderer } from 'electron';

try {
  contextBridge.exposeInMainWorld('electronAPI', {
    // Database operations
    db: {
      query: (sql: string, params?: any[]) => {
        return ipcRenderer.invoke('db:query', sql, params);
      },
      execute: (sql: string, params?: any[]) => {
        return ipcRenderer.invoke('db:execute', sql, params);
      },
      transaction: (queries: Array<{ sql: string; params?: any[] }>) => {
        return ipcRenderer.invoke('db:transaction', queries);
      },
    },

    // File operations
    saveFile: (data: any, filename: string, type: 'excel' | 'csv' | 'image' | 'json') => {
      return ipcRenderer.invoke('file:save', data, filename, type);
    },
    openFile: (filters?: { name: string; extensions: string[] }[]) => {
      return ipcRenderer.invoke('file:open', filters);
    },

    // App info
    getVersion: () => {
      return ipcRenderer.invoke('app:version');
    },
  });
} catch (error) {
  console.error('Error exposing electronAPI:', error);
}
