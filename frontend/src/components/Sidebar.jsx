import { useState } from 'react';
import {
  LayoutDashboard,
  Users,
  Headphones,
  Trophy,
  Target,
  Monitor,
  Activity
} from 'lucide-react';

function Sidebar({ activePage, setActivePage }) {
  const [collapsed, setCollapsed] = useState(true);

  const items = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'leads', label: 'Leads', icon: Users },
    { id: 'performance', label: 'Performance', icon: Trophy },
    { id: 'campaigns', label: 'Campanhas', icon: Target },
    { id: 'tv', label: 'TV Mode', icon: Monitor },
    { id: 'tv-general', label: 'TV Geral', icon: Monitor },
    { id: 'tv-closer', label: 'TV Closer', icon: Trophy },
    { id: 'tv-sdr', label: 'TV SDR', icon: Headphones },
    { id: 'tv-operacional', label: 'TV Operacional', icon: Activity }
  ];

  return (
    <aside
      onMouseEnter={() => setCollapsed(false)}
      onMouseLeave={() => setCollapsed(true)}
      className={`bg-slate-950 text-white min-h-screen p-4 transition-all duration-300 ${
        collapsed ? 'w-20' : 'w-64'
      }`}
    >
      <div className="mb-8 h-12 overflow-hidden">
        <h1 className="text-xl font-bold whitespace-nowrap">
          {collapsed ? 'BI' : 'CRM BI'}
        </h1>

        {!collapsed && (
          <p className="text-xs text-slate-400 whitespace-nowrap">
            Process Log & Comex
          </p>
        )}
      </div>

      <nav className="space-y-2">
        {items.map((item) => {
          const Icon = item.icon;
          const active = activePage === item.id;

          return (
            <button
              key={item.id}
              onClick={() => setActivePage(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition ${
                active
                  ? 'bg-blue-600 text-white'
                  : 'text-slate-300 hover:bg-slate-800'
              } ${collapsed ? 'justify-center' : 'justify-start'}`}
              title={item.label}
            >
              <Icon size={20} />

              {!collapsed && (
                <span className="whitespace-nowrap">
                  {item.label}
                </span>
              )}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export default Sidebar;