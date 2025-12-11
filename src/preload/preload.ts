import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Database operations
  db: {
    query: (sql: string, params?: any[]) => ipcRenderer.invoke('db:query', sql, params),
    execute: (sql: string, params?: any[]) => ipcRenderer.invoke('db:execute', sql, params),
    transaction: (queries: Array<{ sql: string; params?: any[] }>) => 
      ipcRenderer.invoke('db:transaction', queries),
  },
  
  // File operations
  saveFile: (data: any, filename: string, type: 'excel' | 'csv' | 'pdf' | 'image' | 'json') =>
    ipcRenderer.invoke('file:save', data, filename, type),
  openFile: (filters?: { name: string; extensions: string[] }[]) =>
    ipcRenderer.invoke('file:open', filters),
  
  // App info
  getVersion: () => ipcRenderer.invoke('app:version'),
});


