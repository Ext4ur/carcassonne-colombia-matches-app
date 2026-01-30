import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// Error boundary for React errors
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('React Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            height: '100vh',
            flexDirection: 'column',
            fontFamily: 'Arial, sans-serif',
            padding: '20px',
            textAlign: 'center',
          }}
        >
          <h1 style={{ color: '#dc2626', marginBottom: '20px' }}>Error en la aplicación</h1>
          <p style={{ color: '#666', maxWidth: '600px', marginBottom: '10px' }}>
            {this.state.error?.message || 'Ocurrió un error inesperado'}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '10px 20px',
              marginTop: '20px',
              cursor: 'pointer',
              backgroundColor: '#3b82f6',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
            }}
          >
            Recargar aplicación
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Check if electronAPI is available
if (!window.electronAPI) {
  console.error('electronAPI is not available!');
  document.body.innerHTML = `
    <div style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column; font-family: Arial, sans-serif; padding: 20px; text-align: center;">
      <h1 style="color: #dc2626; margin-bottom: 20px;">Error: Electron API no disponible</h1>
      <p style="color: #666; max-width: 600px; margin-bottom: 10px;">
        La aplicación no puede comunicarse con el proceso principal de Electron.
      </p>
      <p style="color: #666; max-width: 600px; margin-bottom: 20px;">
        Esto generalmente ocurre cuando el script preload no se carga correctamente.
      </p>
      <div style="background: #f3f4f6; padding: 15px; border-radius: 8px; max-width: 600px; text-align: left;">
        <p style="margin: 5px 0; font-weight: bold;">Posibles soluciones:</p>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li>Verifica que el ejecutable se generó correctamente</li>
          <li>Revisa la consola de desarrollador (F12) para más detalles</li>
          <li>Intenta regenerar el ejecutable con: npm run dist:win</li>
        </ul>
      </div>
      <p style="color: #999; margin-top: 20px; font-size: 12px;">
        Revisa la consola para más información de depuración.
      </p>
    </div>
  `;
} else {
  console.log('electronAPI is available:', typeof window.electronAPI);
  console.log('Starting React app...');

  try {
    const root = document.getElementById('root');
    if (!root) {
      throw new Error('Root element not found');
    }

    ReactDOM.createRoot(root).render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>
    );
    console.log('React app rendered successfully');
  } catch (error) {
    console.error('Error rendering React app:', error);
    document.body.innerHTML = `
      <div style="display: flex; justify-content: center; align-items: center; height: 100vh; flex-direction: column; font-family: Arial, sans-serif; padding: 20px; text-align: center;">
        <h1 style="color: #dc2626; margin-bottom: 20px;">Error al renderizar la aplicación</h1>
        <p style="color: #666; max-width: 600px;">${error instanceof Error ? error.message : String(error)}</p>
        <button 
          onClick={() => window.location.reload()} 
          style="padding: 10px 20px; margin-top: 20px; cursor: pointer; background-color: #3b82f6; color: white; border: none; border-radius: 4px;"
        >
          Recargar aplicación
        </button>
      </div>
    `;
  }
}
