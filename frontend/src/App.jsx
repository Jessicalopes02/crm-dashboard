import { useState } from 'react';
import {
  useIsAuthenticated,
  useMsal
} from '@azure/msal-react';

import Sidebar from './components/Sidebar';
import Dashboard from './pages/Dashboard';
import Leads from './pages/Leads';
import Performance from './pages/Performance';
import Campaigns from './pages/Campaigns';
import Reports from './pages/Reports';
import Login from './pages/Login';

import TVGeneralPage from './pages/tv/TVGeneralPage';
import TVCloserPage from './pages/tv/TVCloserPage';
import TVSdrPage from './pages/tv/TVSdrPage';
import TVOperationalPage from './pages/tv/TVOperationalPage';
import TVFullSimplePage from './pages/tv/TVFullSimplePage';

function App() {
  const [activePage, setActivePage] =
    useState('dashboard');

  const { instance, accounts } = useMsal();

  const isAuthenticated =
    useIsAuthenticated();

  const authEnabled =
    import.meta.env.VITE_AUTH_ENABLED === 'true';

  const searchParams =
    new URLSearchParams(window.location.search);

  const tvPage =
    searchParams.get('tv');

  const isFullscreen =
    searchParams.get('fullscreen') === 'true';

  /*
   * TVs continuam abrindo sem login por enquanto,
   * para não quebrar as telas em produção.
   */
  if (tvPage === 'general') {
    return <TVGeneralPage tvMode={isFullscreen} />;
  }

  if (tvPage === 'closer') {
    return <TVCloserPage tvMode={isFullscreen} />;
  }

  if (tvPage === 'sdr') {
    return <TVSdrPage tvMode={isFullscreen} />;
  }

  if (tvPage === 'operacional') {
    return <TVOperationalPage tvMode={isFullscreen} />;
  }

  if (tvPage === 'full') {
    return <TVFullSimplePage />;
  }

  /*
   * Login só fica obrigatório quando
   * VITE_AUTH_ENABLED=true
   */
  if (authEnabled && !isAuthenticated) {
    return <Login />;
  }

  const account =
    accounts?.[0];

  const userName =
    account?.name ||
    account?.username ||
    'Usuário';

  function handleLogout() {
    instance.logoutRedirect({
      postLogoutRedirectUri:
        window.location.origin
    });
  }

  return (
    <div className="flex min-h-screen bg-slate-100">
      <Sidebar
        activePage={activePage}
        setActivePage={setActivePage}
      />

      <main className="flex-1">
        {authEnabled && (
          <div className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
            <div>
              <p className="text-xs text-slate-500">
                Logado como
              </p>

              <p className="text-sm font-semibold text-slate-800">
                {userName}
              </p>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
            >
              Sair
            </button>
          </div>
        )}

        {activePage === 'dashboard' && <Dashboard />}
        {activePage === 'leads' && <Leads />}
        {activePage === 'performance' && <Performance />}
        {activePage === 'campaigns' && <Campaigns />}
        {activePage === 'reports' && <Reports />}

        {activePage === 'tv-general' && <TVGeneralPage />}
        {activePage === 'tv-closer' && <TVCloserPage />}
        {activePage === 'tv-sdr' && <TVSdrPage />}
        {activePage === 'tv-operacional' && <TVOperationalPage />}
      </main>
    </div>
  );
}

export default App;
