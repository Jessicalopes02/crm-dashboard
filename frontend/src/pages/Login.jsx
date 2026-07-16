import { useMsal } from '@azure/msal-react';
import { loginRequest } from '../auth/msalConfig';

function Login() {
  const { instance } = useMsal();

  function handleLogin() {
    instance.loginRedirect(loginRequest);
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-700 shadow-2xl p-8 text-center">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-white">
            CRM Dashboard
          </h1>

          <p className="mt-2 text-sm text-slate-400">
            Acesse com sua conta corporativa Microsoft.
          </p>
        </div>

        <button
          type="button"
          onClick={handleLogin}
          className="w-full rounded-2xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition"
        >
          Entrar com Microsoft
        </button>

        <p className="mt-5 text-xs text-slate-500">
          Use apenas o e-mail corporativo autorizado.
        </p>
      </div>
    </div>
  );
}

export default Login;
