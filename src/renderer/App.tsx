import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './contexts/ThemeContext';
import { NotificationProvider } from './contexts/NotificationContext';
import Home from './pages/Home';
import Tournaments from './pages/Tournaments';
import TournamentDetail from './pages/TournamentDetail';
import Circuits from './pages/Circuits';
import Players from './pages/Players';
import Settings from './pages/Settings';
import Layout from './components/common/Layout';

function App() {
  return (
    <ThemeProvider>
      <NotificationProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/tournaments" element={<Tournaments />} />
              <Route path="/tournament/:id" element={<TournamentDetail />} />
              <Route path="/circuits" element={<Circuits />} />
              <Route path="/players" element={<Players />} />
              <Route path="/settings" element={<Settings />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </NotificationProvider>
    </ThemeProvider>
  );
}

export default App;

