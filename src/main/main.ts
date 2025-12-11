import { app, BrowserWindow, dialog } from 'electron';
import * as path from 'path';
import { initDatabase } from './database';
import { setupIpcHandlers } from './ipc';

let mainWindow: BrowserWindow | null = null;

// Log startup
console.log('Main process starting...');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('isPackaged:', app.isPackaged);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;
console.log('isDev:', isDev);

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    console.log('Electron app ready, initializing...');
    
    // Initialize database
    console.log('Initializing database...');
    await initDatabase();
    console.log('Database initialized');
    
    // Setup IPC handlers
    console.log('Setting up IPC handlers...');
    setupIpcHandlers();
    console.log('IPC handlers set up');
    
    // Create window
    console.log('Creating window...');
    createWindow();
    console.log('Window created');

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  } catch (error: any) {
    console.error('Error during app initialization:', error);
    // Show error dialog
    dialog.showErrorBox('Error', `Failed to initialize app: ${error?.message || String(error)}`);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

