import { ExportService, ExportSubsetError } from '../services/export';
import { ReportService } from '../services/reports';

export type SaveFileResult = {
  success: boolean;
  canceled?: boolean;
  error?: string;
};

export async function saveTournamentJsonBackup(tournamentId: number): Promise<SaveFileResult> {
  try {
    return await ExportService.exportSubsetToFile([tournamentId]);
  } catch (e) {
    if (e instanceof ExportSubsetError) {
      return { success: false, error: ExportSubsetError.code };
    }
    return { success: false, error: (e as Error).message || String(e) };
  }
}

export async function saveTournamentExcelReport(
  tournamentId: number,
  tournamentName: string
): Promise<SaveFileResult> {
  try {
    const data = await ReportService.generateTournamentExcel(tournamentId);
    const filename = `${tournamentName.replace(/[^a-z0-9]/gi, '_')}.xlsx`;
    const result = await window.electronAPI.saveFile(data, filename, 'excel');
    if (result.success) return { success: true };
    if (result.canceled) return { success: false, canceled: true };
    return { success: false, error: result.error || 'save_failed' };
  } catch (e) {
    return { success: false, error: (e as Error).message || String(e) };
  }
}
