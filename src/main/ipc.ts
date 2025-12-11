import { ipcMain, dialog, app } from 'electron';
import { getDatabase } from './database';
import * as fs from 'fs';
import * as path from 'path';
import ExcelJS from 'exceljs';
import { createObjectCsvWriter } from 'csv-writer';
import jsPDF from 'jspdf';

export function setupIpcHandlers() {
  // Database handlers
  ipcMain.handle('db:query', async (event, sql: string, params?: any[]) => {
    const db = getDatabase();
    try {
      const stmt = db.prepare(sql);
      if (params && params.length > 0) {
        return stmt.all(...params);
      }
      return stmt.all();
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  });

  ipcMain.handle('db:execute', async (event, sql: string, params?: any[]) => {
    const db = getDatabase();
    try {
      const stmt = db.prepare(sql);
      if (params && params.length > 0) {
        const result = stmt.run(...params);
        return { lastInsertRowid: result.lastInsertRowid, changes: result.changes };
      }
      return stmt.run();
    } catch (error) {
      console.error('Database execute error:', error);
      throw error;
    }
  });

  ipcMain.handle('db:transaction', async (event, queries: Array<{ sql: string; params?: any[] }>) => {
    const db = getDatabase();
    const transaction = db.transaction(() => {
      const results = [];
      for (const query of queries) {
        const stmt = db.prepare(query.sql);
        if (query.params && query.params.length > 0) {
          results.push(stmt.run(...query.params));
        } else {
          results.push(stmt.run());
        }
      }
      return results;
    });
    return transaction();
  });

  // File save handler
  ipcMain.handle('file:save', async (event, data: any, filename: string, type: 'excel' | 'csv' | 'pdf' | 'image' | 'json') => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      defaultPath: filename,
      filters: [
        { name: type === 'excel' ? 'Excel' : type === 'csv' ? 'CSV' : type === 'pdf' ? 'PDF' : type === 'image' ? 'Image' : 'JSON', extensions: [type === 'excel' ? 'xlsx' : type === 'csv' ? 'csv' : type === 'pdf' ? 'pdf' : type === 'image' ? 'png' : 'json'] },
      ],
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    try {
      if (type === 'excel') {
        const workbook = new ExcelJS.Workbook();
        // Add sheets from data
        if (data.sheets) {
          for (const sheetData of data.sheets) {
            const worksheet = workbook.addWorksheet(sheetData.name);
            if (sheetData.headers) {
              worksheet.addRow(sheetData.headers);
            }
            if (sheetData.rows) {
              sheetData.rows.forEach((row: any[]) => worksheet.addRow(row));
            }
          }
        }
        await workbook.xlsx.writeFile(filePath);
      } else if (type === 'csv') {
        const csvWriter = createObjectCsvWriter({
          path: filePath,
          header: data.headers || [],
        });
        await csvWriter.writeRecords(data.rows || []);
      } else if (type === 'pdf') {
        // For PDF, we'll use jsPDF with HTML content
        const doc = new jsPDF();
        // Simple text-based PDF for now
        const lines = data.split('\n');
        let y = 10;
        lines.forEach((line: string) => {
          if (y > 280) {
            doc.addPage();
            y = 10;
          }
          doc.text(line.substring(0, 100), 10, y);
          y += 7;
        });
        doc.save(filePath);
      } else if (type === 'image') {
        // For images, data should be a base64 string (data URL)
        if (typeof data === 'string') {
          // Remove data URL prefix if present
          let base64Data = data;
          if (data.startsWith('data:image/')) {
            base64Data = data.replace(/^data:image\/\w+;base64,/, '');
          }
          
          // Write the buffer to file
          const buffer = Buffer.from(base64Data, 'base64');
          fs.writeFileSync(filePath, buffer);
        } else if (Buffer.isBuffer(data)) {
          fs.writeFileSync(filePath, data);
        } else {
          throw new Error('Invalid image data format');
        }
      } else if (type === 'json') {
        // For JSON, data should be a string
        if (typeof data === 'string') {
          fs.writeFileSync(filePath, data, 'utf8');
        } else {
          fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
        }
      }
      return { success: true, filePath };
    } catch (error) {
      console.error('File save error:', error);
      return { success: false, error: String(error) };
    }
  });

  // File open handler
  ipcMain.handle('file:open', async (event, filters?: { name: string; extensions: string[] }[]) => {
    const { filePaths, canceled } = await dialog.showOpenDialog({
      filters: filters || [{ name: 'All Files', extensions: ['*'] }],
      properties: ['openFile'],
    });

    if (canceled || filePaths.length === 0) {
      return { success: false, canceled: true };
    }

    try {
      const filePath = filePaths[0];
      const data = fs.readFileSync(filePath, 'utf8');
      return { success: true, filePath, data };
    } catch (error) {
      console.error('File open error:', error);
      return { success: false, error: String(error) };
    }
  });

  // App info handler
  ipcMain.handle('app:version', () => {
    return app.getVersion();
  });
}

