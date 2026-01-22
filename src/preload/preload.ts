import { contextBridge, ipcRenderer } from 'electron';

console.log('Preload script loaded');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
try {
  contextBridge.exposeInMainWorld('electronAPI', {
    // Database operations
    db: {
      query: (sql: string, params?: any[]) => {
        console.log('Preload: db.query called', sql);
        return ipcRenderer.invoke('db:query', sql, params);
      },
      execute: (sql: string, params?: any[]) => {
        console.log('Preload: db.execute called', sql);
        return ipcRenderer.invoke('db:execute', sql, params);
      },
      transaction: (queries: Array<{ sql: string; params?: any[] }>) => {
        console.log('Preload: db.transaction called', queries.length, 'queries');
        return ipcRenderer.invoke('db:transaction', queries);
      },
    },
    
    // File operations
    saveFile: (data: any, filename: string, type: 'excel' | 'csv' | 'pdf' | 'image' | 'json') => {
      console.log('Preload: saveFile called', filename, type);
      return ipcRenderer.invoke('file:save', data, filename, type);
    },
    openFile: (filters?: { name: string; extensions: string[] }[]) => {
      console.log('Preload: openFile called');
      return ipcRenderer.invoke('file:open', filters);
    },
    
    // App info
    getVersion: () => {
      console.log('Preload: getVersion called');
      return ipcRenderer.invoke('app:version');
    },
  });
  console.log('electronAPI exposed successfully');
} catch (error) {
  console.error('Error exposing electronAPI:', error);
}


