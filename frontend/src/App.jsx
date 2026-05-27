import { useState } from 'react';
import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Performance from './pages/Performance';
import Campaigns from './pages/Campaigns';
import TVGeneralPage from './pages/tv/TVGeneralPage';
import TVCloserPage from './pages/tv/TVCloserPage';
import TVSdrPage from './pages/tv/TVSdrPage';
import TVOperationalPage from './pages/tv/TVOperationalPage';

function App() {
  const [activePage, setActivePage] = useState('dashboard');

const isTvMode = window.location.pathname === '/fullscreen';

if (isTvMode) {
  return <TVCloserPage tvMode />;
}

return (
  <div className="flex min-h-screen bg-slate-100">
    <Sidebar
      activePage={activePage}
      setActivePage={setActivePage}
    />

    <main className="flex-1">
      {activePage === 'dashboard' && <Dashboard />}
      {activePage === 'leads' && <Leads />}
      {activePage === 'performance' && <Performance />}
      {activePage === 'campaigns' && <Campaigns />}

      {activePage === 'tv-general' && <TVGeneralPage />}
      {activePage === 'tv-closer' && <TVCloserPage />}
      {activePage === 'tv-sdr' && <TVSdrPage />}
      {activePage === 'tv-operacional' && <TVOperationalPage />}
    </main>
  </div>
);
}

export default App;