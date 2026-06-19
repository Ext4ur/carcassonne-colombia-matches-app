import { HashRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import Home from './pages/Home';
import Tournaments from './pages/Tournaments';
import TournamentDetail from './pages/TournamentDetail';
import Circuits from './pages/Circuits';
import Players from './pages/Players';
import Places from './pages/Places';
import Cities from './pages/Cities';
import Settings from './pages/Settings';
import Layout from './components/common/Layout';
import { isStoreMode } from './utils/storeMode';
import { ensureStoreModeSyncDefaults } from './api/clients/supabaseConfig';

ensureStoreModeSyncDefaults();

function App() {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <HashRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/tournaments" element={<Tournaments />} />
              <Route path="/tournament/:id" element={<TournamentDetail />} />
              {!isStoreMode() && <Route path="/circuits" element={<Circuits />} />}
              {!isStoreMode() && <Route path="/places" element={<Places />} />}
              {!isStoreMode() && <Route path="/cities" element={<Cities />} />}
              <Route path="/players" element={<Players />} />
              {!isStoreMode() && <Route path="/settings" element={<Settings />} />}
            </Routes>
          </Layout>
        </HashRouter>
      </NotificationProvider>
    </ThemeProvider>
  );
}

export default App;
