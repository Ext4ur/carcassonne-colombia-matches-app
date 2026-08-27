import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import i18n from './i18n/config';
import { SyncService } from './services/syncService';
import { isLocalOnlyMode } from './utils/appMode';

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
          <h1 style={{ color: '#dc2626', marginBottom: '20px' }}>{i18n.t('common.app_error')}</h1>
          <p style={{ color: '#666', maxWidth: '600px', marginBottom: '10px' }}>
            {this.state.error?.message || i18n.t('common.error_unknown')}
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
            {i18n.t('common.reload')}
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
      <h1 style="color: #dc2626; margin-bottom: 20px;">${i18n.t('common.error_api')}</h1>
      <ul style="margin: 10px 0; padding-left: 20px; text-align: left; max-width: 600px;">
        <li>${i18n.t('common.check_executable')}</li>
        <li>${i18n.t('common.check_console')}</li>
      </ul>
    </div>
  `;
} else {
  console.log('electronAPI is available:', typeof window.electronAPI);

  // Start the background sync service
  (window as unknown as { SyncService: typeof SyncService }).SyncService = SyncService;
  if (!isLocalOnlyMode()) {
    SyncService.startSync(30000);
  }

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
        <h1 style="color: #dc2626; margin-bottom: 20px;">${i18n.t('common.render_error')}</h1>
        <p style="color: #666; max-width: 600px;">${error instanceof Error ? error.message : String(error)}</p>
        <button 
          id="reload-btn"
          style="padding: 10px 20px; margin-top: 20px; cursor: pointer; background-color: #3b82f6; color: white; border: none; border-radius: 4px;"
        >
          ${i18n.t('common.reload')}
        </button>
      </div>
      <script>
        document.getElementById('reload-btn').onclick = () => window.location.reload();
      </script>
    `;
  }
}
