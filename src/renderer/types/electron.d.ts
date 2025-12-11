export interface ElectronAPI {
  db: {
    query: (sql: string, params?: any[]) => Promise<any[]>;
    execute: (sql: string, params?: any[]) => Promise<{ lastInsertRowid: number; changes: number }>;
    transaction: (queries: Array<{ sql: string; params?: any[] }>) => Promise<any[]>;
  };
  saveFile: (data: any, filename: string, type: 'excel' | 'csv' | 'pdf' | 'image' | 'json') => Promise<{ success: boolean; filePath?: string; canceled?: boolean; error?: string }>;
  openFile: (filters?: { name: string; extensions: string[] }[]) => Promise<{ success: boolean; canceled?: boolean; filePath?: string; data?: string }>;
  getVersion: () => Promise<string>;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}


