import {
  Suspense,
  lazy,
  useState
} from 'react';

import {
  useIsAuthenticated,
  useMsal
} from '@azure/msal-react';

import Sidebar from './components/Sidebar';
import Login from './pages/Login';

const Dashboard = lazy(() =>
  import('./pages/Dashboard')
);

const Leads = lazy(() =>
  import('./pages/Leads')
);

const Performance = lazy(() =>
  import('./pages/Performance')
);

const Campaigns = lazy(() =>
  import('./pages/Campaigns')
);

const Reports = lazy(() =>
  import('./pages/Reports')
);

const TVGeneralPage = lazy(() =>
  import('./pages/tv/TVGeneralPage')
);

const TVCloserPage = lazy(() =>
  import('./pages/tv/TVCloserPage')
);

const TVSdrPage = lazy(() =>
  import('./pages/tv/TVSdrPage')
);

const TVOperationalPage = lazy(() =>
  import('./pages/tv/TVOperationalPage')
);

const TVFullSimplePage = lazy(() =>
  import('./pages/tv/TVFullSimplePage')
);

function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-100">
      <div className="rounded-2xl bg-white px-6 py-4 shadow-sm border border-slate-200">
        <p className="text-sm font-medium text-slate-700">
          Carregando...
        </p>
      </div>
    </div>
  );
}

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
    return (
      <Suspense fallback={<PageLoader />}>
        <TVGeneralPage tvMode={isFullscreen} />
      </Suspense>
    );
  }

  if (tvPage === 'closer') {
    return (
      <Suspense fallback={<PageLoader />}>
        <TVCloserPage tvMode={isFullscreen} />
      </Suspense>
    );
  }

  if (tvPage === 'sdr') {
    return (
      <Suspense fallback={<PageLoader />}>
        <TVSdrPage tvMode={isFullscreen} />
      </Suspense>
    );
  }

  if (tvPage === 'operacional') {
    return (
      <Suspense fallback={<PageLoader />}>
        <TVOperationalPage tvMode={isFullscreen} />
      </Suspense>
    );
  }

  if (tvPage === 'full') {
    return (
      <Suspense fallback={<PageLoader />}>
        <TVFullSimplePage />
      </Suspense>
    );
  }

  /*
   * Login obrigatório quando
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

        <Suspense fallback={<PageLoader />}>
          {activePage === 'dashboard' && <Dashboard />}
          {activePage === 'leads' && <Leads />}
          {activePage === 'performance' && <Performance />}
          {activePage === 'campaigns' && <Campaigns />}
          {activePage === 'reports' && <Reports />}

          {activePage === 'tv-general' && <TVGeneralPage />}
          {activePage === 'tv-closer' && <TVCloserPage />}
          {activePage === 'tv-sdr' && <TVSdrPage />}
          {activePage === 'tv-operacional' && <TVOperationalPage />}
        </Suspense>
      </main>
    </div>
  );
}

export default App;
