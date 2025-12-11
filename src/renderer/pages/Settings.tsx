import { useState } from 'react';
import { useTheme } from '../contexts/ThemeContext';
import { useNotifications } from '../contexts/NotificationContext';
import Button from '../components/common/Button';
import { ExportService } from '../services/export';
import { ImportService } from '../services/import';

export default function Settings() {
  const { theme, toggleTheme } = useTheme();
  const { addNotification } = useNotifications();
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      await ExportService.exportAll();
      addNotification({
        message: 'Datos exportados exitosamente',
        type: 'success',
      });
    } catch (error) {
      console.error('Error exporting:', error);
      addNotification({
        message: 'Error al exportar los datos',
        type: 'error',
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleImport = async () => {
    try {
      setIsImporting(true);
      const result = await ImportService.importAll();
      if (result.success) {
        addNotification({
          message: `Datos importados exitosamente: ${result.summary}`,
          type: 'success',
        });
        // Reload page to show imported data
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        addNotification({
          message: result.error || 'Error al importar los datos',
          type: 'error',
        });
      }
    } catch (error) {
      console.error('Error importing:', error);
      addNotification({
        message: 'Error al importar los datos',
        type: 'error',
      });
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="px-4 py-6">
      <h1 className="text-2xl font-bold mb-6">Configuración</h1>

      <div className="space-y-6">
        {/* Theme Settings */}
        <div className="card">
          <h2 className="text-xl font-bold mb-4">Apariencia</h2>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Tema</p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Cambiar entre tema claro y oscuro
              </p>
            </div>
            <button
              onClick={toggleTheme}
              className="px-4 py-2 bg-gray-200 dark:bg-gray-700 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              {theme === 'light' ? '🌙 Modo Oscuro' : '☀️ Modo Claro'}
            </button>
          </div>
        </div>

        {/* Export/Import */}
        <div className="card">
          <h2 className="text-xl font-bold mb-4">Datos</h2>
          <div className="space-y-4">
            <div>
              <p className="font-medium mb-2">Exportar Datos</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Exporta todos los datos (torneos, jugadores, circuitos) a un archivo JSON para respaldo.
              </p>
              <Button onClick={handleExport} isLoading={isExporting} variant="primary">
                Exportar Datos
              </Button>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
              <p className="font-medium mb-2">Importar Datos</p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                Importa datos desde un archivo JSON. Esto agregará los datos a los existentes.
              </p>
              <Button onClick={handleImport} isLoading={isImporting} variant="secondary">
                Importar Datos
              </Button>
            </div>
          </div>
        </div>

        {/* About */}
        <div className="card">
          <h2 className="text-xl font-bold mb-4">Acerca de</h2>
          <p className="text-gray-600 dark:text-gray-400">
            Carcassonne Tournament Manager v1.0
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
            Aplicación para gestionar torneos presenciales de Carcassonne Colombia
          </p>
        </div>
      </div>
    </div>
  );
}
