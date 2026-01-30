/* eslint-disable @typescript-eslint/no-explicit-any */
import { app, BrowserWindow, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
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
  const preloadPath = path.join(__dirname, '../preload/preload.js');
  console.log('Preload path:', preloadPath);
  console.log('Preload exists:', fs.existsSync(preloadPath));

  const rendererPath = path.join(__dirname, '../renderer/index.html');
  console.log('Renderer path:', rendererPath);
  console.log('Renderer exists:', fs.existsSync(rendererPath));

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: true,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
  });

  // Handle errors in renderer
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('Failed to load:', errorCode, errorDescription);
    if (!isDev) {
      dialog.showErrorBox('Error de carga', `No se pudo cargar la aplicación: ${errorDescription}`);
    }
  });

  // Log console messages from renderer
  mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`[Renderer ${level}]:`, message);
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(rendererPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  try {
    console.log('Electron app ready, initializing...');
    console.log('__dirname:', __dirname);
    console.log('app.getAppPath():', app.getAppPath());
    console.log('process.resourcesPath:', process.resourcesPath);

    // Initialize database
    console.log('Initializing database...');
    try {
      await initDatabase();
      console.log('Database initialized successfully');
    } catch (dbError: any) {
      console.error('Database initialization error:', dbError);
      dialog.showErrorBox(
        'Error de Base de Datos',
        `No se pudo inicializar la base de datos: ${dbError?.message || String(dbError)}\n\nEsto puede deberse a un problema con better-sqlite3.`
      );
      throw dbError;
    }

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
    console.error('Error stack:', error?.stack);
    // Show error dialog
    dialog.showErrorBox(
      'Error de Inicialización',
      `No se pudo inicializar la aplicación: ${error?.message || String(error)}\n\nPor favor, revisa la consola para más detalles.`
    );
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
