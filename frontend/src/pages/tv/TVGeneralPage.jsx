import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import Chart from 'react-apexcharts';
import api from '../../services/api';

function TVGeneralPage({ tvMode = false }) {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('month');
  const [rotationSeconds, setRotationSeconds] = useState(20);
  const [autoRotate, setAutoRotate] = useState(true);
  const [achievement, setAchievement] = useState(null);
  const [viewMode, setViewMode] = useState('cover');

  const BASE_WIDTH = 1920;
  const BASE_HEIGHT = 1080;

  const [tvScale, setTvScale] = useState(1);

  const isTvMode =
  tvMode ||
  new URLSearchParams(window.location.search).get('fullscreen') === 'true';

  useEffect(() => {
    loadData();

    const interval = setInterval(() => {
      loadData();
    }, 60000);

    return () => clearInterval(interval);
  }, [period]);

  useEffect(() => {
  if (!autoRotate) return;

  const views = ['cover', 'general', 'sector'];

  const rotation = setInterval(() => {
    setViewMode((current) => {
      const currentIndex = views.indexOf(current);
      const nextIndex = (currentIndex + 1) % views.length;

      return views[nextIndex];
    });
  }, rotationSeconds * 1000);

  return () => clearInterval(rotation);
}, [autoRotate, rotationSeconds]);


  useEffect(() => {
  function updateTvScale() {
    const scale = Math.min(
  window.innerWidth / BASE_WIDTH,
  window.innerHeight / BASE_HEIGHT
);

    setTvScale(scale);
  }

  updateTvScale();

  window.addEventListener('resize', updateTvScale);

  return () => window.removeEventListener('resize', updateTvScale);
}, [isTvMode]);

  async function loadData() {
    try {
      const now = new Date();

      let startDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
        0,
        0,
        0
      );

      let endDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
        23,
        59,
        59
      );

      if (period === 'quarter') {
        const quarterStartMonth = Math.floor(now.getMonth() / 3) * 3;

        startDate = new Date(
          now.getFullYear(),
          quarterStartMonth,
          1,
          0,
          0,
          0
        );
      }

      const response = await api.get('/dashboard/full', {
        params: {
          startDate: startDate.toLocaleString('sv-SE').replace(' ', 'T'),
          endDate: endDate.toLocaleString('sv-SE').replace(' ', 'T')
        }
      });

      setData(response.data);

      const goalPeriod = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;

      const achievementResponse = await api.get('/goals/achievement', {
        params: {
          period: goalPeriod
        }
      });

      const achievementPayload =
        achievementResponse.data?.data || achievementResponse.data;

      console.log('ACHIEVEMENT RESPONSE:', achievementPayload);

      setAchievement(achievementPayload);

    } catch (error) {
      console.error(error);
    }
  }

  const formatBRL = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const formatCompactBRL = (value) => {
  const number = Number(value || 0);

  if (number >= 1000000) {
    return `R$ ${(number / 1000000).toFixed(1).replace('.', ',')} mi`;
  }

  if (number >= 1000) {
    return `R$ ${(number / 1000).toFixed(1).replace('.', ',')} mil`;
  }

  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(number);
};

  const formatNumber = (value) => {
    return new Intl.NumberFormat('pt-BR').format(value || 0);
  };

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center text-4xl font-bold">
        Carregando Meta Geral...
      </div>
    );
  }

  const metrics = data.general.metrics;

  // Temporário: depois vamos puxar da página Campanhas
  const generalGoal =
    achievement?.results
      ?.filter((item) => item.goal.sector === 'geral')
      ?.reduce((sum, item) => sum + Number(item.goal.targetRevenue || 0), 0) || 0;
  
  const sdrGoal =
  achievement?.results
    ?.filter((item) => item.goal.sector === 'sdr')
    ?.reduce(
      (sum, item) =>
        sum +
        Number(
          item.goal.targetMeetings ||
          item.goal.targetLeads ||
          0
        ),
      0
    ) || 0;

const closerGoal =
  achievement?.results
    ?.filter((item) => item.goal.sector === 'closer')
    ?.reduce(
      (sum, item) =>
        sum + Number(item.goal.targetRevenue || 0),
      0
    ) || 0;
  const currentRevenue = metrics.totalRevenue || 0;

  const goalPercent =
    generalGoal > 0
      ? Math.min((currentRevenue / generalGoal) * 100, 100)
      : 0;

  const remaining = Math.max(generalGoal - currentRevenue, 0);

  const chartData =
  data.general.charts.leadsByMonth?.map((item) => ({
    label: `${String(item._id.month).padStart(2, '0')}/${item._id.year}`,
    revenue: item.revenue || 0
  })) || [];

  const teamGoals = [
  {
    name: 'Closer',
    goal: closerGoal,
    actual:
      achievement?.results
        ?.filter((item) => item.goal.sector === 'closer')
        ?.reduce(
          (sum, item) =>
            sum + Number(item.actual.revenue || 0),
          0
        ) || 0
  },

  {
    name: 'SDR',
    goal: sdrGoal,
    actual:
      achievement?.results
        ?.filter((item) => item.goal.sector === 'sdr')
        ?.reduce(
          (sum, item) =>
            sum +
            Number(
              item.actual.meetings ||
              item.actual.leads ||
              0
            ),
          0
        ) || 0
  }
];

  const radialOptions = {
    chart: {
      type: 'radialBar',
      background: 'transparent',
      sparkline: {
        enabled: true
      }
    },
    plotOptions: {
      radialBar: {
        hollow: {
          size: '70%'
        },
        track: {
          background: '#1e293b'
        },
        dataLabels: {
          name: {
            show: true,
            color: '#94a3b8',
            fontSize: '18px'
          },
          value: {
            show: true,
            color: '#ffffff',
            fontSize: '42px',
            fontWeight: 800,
            formatter: function (val) {
              return `${Number(val).toFixed(1)}%`;
            }
          }
        }
      }
    },
    labels: ['Meta Geral'],
    colors: ['#2563eb']
  };

  const lineOptions = {
    chart: {
      type: 'area',
      toolbar: {
        show: false
      },
      background: 'transparent'
    },
    stroke: {
      curve: 'smooth',
      width: 4
    },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.35,
        opacityTo: 0.05,
        stops: [0, 90, 100]
      }
    },
    grid: {
      borderColor: '#1e293b'
    },
    xaxis: {
      categories: chartData.map((item) => item.label),
      labels: {
        style: {
          colors: '#94a3b8'
        }
      }
    },
    yaxis: {
      labels: {
        style: {
          colors: '#94a3b8'
        },
        formatter: function (value) {
          return `R$ ${(value / 1000).toFixed(0)}k`;
        }
      }
    },
    theme: {
      mode: 'dark'
    },
    tooltip: {
      theme: 'dark',
      y: {
        formatter: function (value) {
          return formatBRL(value);
        }
      }
    },
    colors: ['#2563eb']
  };

  const lineSeries = [
    {
      name: 'Receita',
      data: chartData.map((item) => item.revenue)
    }
  ];

  const teamOptions = {
    chart: {
      type: 'bar',
      toolbar: {
        show: false
      },
      background: 'transparent'
    },
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 10,
        barHeight: '55%'
      }
    },
    grid: {
      borderColor: '#1e293b'
    },
    xaxis: {
      labels: {
        style: {
          colors: '#94a3b8'
        },
        formatter: function (value) {
          return `R$ ${(value / 1000).toFixed(0)}k`;
        }
      }
    },
    yaxis: {
      labels: {
        style: {
          colors: '#e2e8f0',
          fontSize: '16px'
        }
      }
    },
    theme: {
      mode: 'dark'
    },
    tooltip: {
      theme: 'dark',
      y: {
        formatter: function (value) {
          return formatBRL(value);
        }
      }
    },
    colors: ['#2563eb', '#16a34a']
  };

  const teamSeries = [
    {
      name: 'Realizado',
      data: teamGoals.map((item) => item.actual)
    },
    {
      name: 'Meta',
      data: teamGoals.map((item) => item.goal)
    }
  ];

  function handleFullscreen() {
  const element = document.documentElement;

  if (!document.fullscreenElement) {
    element.requestFullscreen();
    document.body.classList.add('tv-fullscreen');
  } else {
    document.exitFullscreen();
    document.body.classList.remove('tv-fullscreen');
  }
}
const userPhotos = {
  'Gabriel Lopes': '/photos/gabriel.png',
  'Fábio Souza': '/photos/fabio.png',
  'Giovanna Fernandes': '/photos/giovanna.png',
  'Alba Danielly Rezende Lima': '/photos/alba.png',
  'Fabiane Carvalho Nascimento': '/photos/fabiane.png',
  'Beatriz Costa  Costa ': '/photos/beatriz.png',
  'Pedro Scarillo': '/photos/pedro.png',
  'Marcus Santana': '/photos/marcus.png',
  'Edson da silva bomfim júnior ': '/photos/edson.png',
  'Luiza Carvalho': '/photos/luiza.png',
  'Accounts Grupo ': '/photos/emely.png'
};
const goalResults =
  achievement?.results ||
  achievement?.data?.results ||
  [];

const sumGoalBySector = (sector) =>
  goalResults
    .filter((item) => item.goal.sector === sector)
    .reduce((sum, item) => sum + Number(item.goal.targetRevenue || 0), 0);

const sumActualBySector = (sector) =>
  goalResults
    .filter((item) => item.goal.sector === sector)
    .reduce((sum, item) => sum + Number(item.actual.revenue || 0), 0);



function normalizeName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}


const closerGoals = goalResults.filter(
  (item) => item.goal.sector === 'closer'
);

const closerCards = closerGoals.map((goalItem) => {
  const displayName = goalItem.goal.userName || 'Sem responsável';

  const matchedActual = goalResults.find(
    (item) =>
      normalizeName(item.goal.userName) === normalizeName(displayName) &&
      item.goal.sector === 'closer'
  );

  const matchedPhotoKey = Object.keys(userPhotos).find(
    (key) => normalizeName(key) === normalizeName(displayName)
  );

  return {
    name: displayName,
    goal: Number(goalItem.goal.targetRevenue || 0),
    actual: Number(matchedActual?.actual?.revenue || 0),
    estimated: Number(matchedActual?.actual?.estimatedRevenue || 0),
    photo: matchedPhotoKey ? userPhotos[matchedPhotoKey] : null
  };
});
 

const getGoalBySector = (sector) => {
  return goalResults.find(
    (item) => item.goal.sector === sector
  );
};

const generalCards = [
  {
    name: 'Closers',
    goal: sumGoalBySector('closer'),
    actual: sumActualBySector('closer')
  },
  {
    name: 'Accounts',
    goal: sumGoalBySector('accounts'),
    actual: sumActualBySector('accounts')
  },
  {
    name: 'Transportes',
    goal: getGoalBySector('transportes')?.goal?.targetRevenue || 0,
    actual: getGoalBySector('transportes')?.actual?.revenue || 0
  },
  {
    name: 'Geral',
    goal: getGoalBySector('geral')?.goal?.targetRevenue || 0,
    actual: getGoalBySector('geral')?.actual?.revenue || 0
  }
];

const closerColumns = [
  closerCards.slice(0, 3),
  closerCards.slice(3, 6),
  closerCards.slice(6, 9)
];

  return (
  <div
    onDoubleClick={handleFullscreen}
    className="fixed inset-0 bg-black overflow-hidden flex items-center justify-center"
  >
    <div
      className="relative text-white overflow-hidden bg-center bg-no-repeat flex flex-col shrink-0"
      style={{
        width: `${BASE_WIDTH}px`,
        height: `${BASE_HEIGHT}px`,
        transform: `scale(${tvScale})`,
        transformOrigin: 'center center',
        backgroundSize: '100% 100%',
        backgroundImage:
          viewMode === 'cover'
            ? "url('/campaign-tv/screen-1.png')"
            : viewMode === 'general'
              ? "url('/campaign-tv/screen-2.png')"
              : "url('/campaign-tv/screen-3.png')"
      }}
    >

    
  {!isTvMode && viewMode !== 'cover' && (
  <header className="shrink-0 grid grid-cols-[1fr_auto] items-center gap-4 mb-4 bg-white/5 border border-white/10 rounded-2xl px-4 py-3 shadow-2xl backdrop-blur">
      <div>
        <h1 className="text-3xl font-black tracking-tight">
          ProcessLog&Comex - Meta Geral
        </h1>

        <p className="text-slate-400 text-sm mt-1">
          Acompanhamento geral do período.
        </p>
      </div>

        <div className="flex items-center justify-end gap-3 flex-wrap">
    <button
      onClick={() => setPeriod('month')}
      className={`px-5 py-2 rounded-2xl font-bold transition ${
        period === 'month'
          ? 'bg-blue-600 text-white'
          : 'bg-slate-800 text-slate-300'
      }`}
    >
      Mês Atual
    </button>

    <button
      onClick={() => setPeriod('quarter')}
      className={`px-5 py-2 rounded-2xl font-bold transition ${
        period === 'quarter'
          ? 'bg-blue-600 text-white'
          : 'bg-slate-800 text-slate-300'
      }`}
    >
      Trimestre
    </button>

    <div className="text-right ml-2">
      <div className="text-xs text-slate-400">
        Atualização automática
      </div>

      <div className="text-base font-bold text-blue-400">
        a cada 60s
      </div>

      <div className="flex items-center justify-end gap-2 mt-1 text-green-400 text-xs font-bold">
        <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
        AO VIVO
      </div>
    </div>

    <button
  onClick={() => setViewMode('cover')}
  className={`px-4 py-2 rounded-2xl font-bold text-sm ${
    viewMode === 'cover'
      ? 'bg-blue-600 text-white'
      : 'bg-slate-800 text-slate-300'
  }`}
>
  Capa
</button>

<button
  onClick={() => setViewMode('general')}
  className={`px-4 py-2 rounded-2xl font-bold text-sm ${
    viewMode === 'general'
      ? 'bg-blue-600 text-white'
      : 'bg-slate-800 text-slate-300'
  }`}
>
  Meta Geral
</button>

<button
  onClick={() => setViewMode('sector')}
  className={`px-4 py-2 rounded-2xl font-bold text-sm ${
    viewMode === 'sector'
      ? 'bg-blue-600 text-white'
      : 'bg-slate-800 text-slate-300'
  }`}
>
  Por Setor
</button>

    <select
      value={rotationSeconds}
      onChange={(e) => setRotationSeconds(Number(e.target.value))}
      className="bg-slate-800 text-white rounded-2xl px-3 py-2 text-sm"
    >
      <option value={10}>10s</option>
      <option value={20}>20s</option>
      <option value={30}>30s</option>
      <option value={60}>60s</option>
    </select>

    <button
      onClick={() => setAutoRotate(!autoRotate)}
      className="px-4 py-2 rounded-2xl bg-slate-800 text-slate-300 font-bold text-sm"
    >
      {autoRotate ? 'Auto ON' : 'Auto OFF'}
    </button>

    <button
      onClick={handleFullscreen}
      className="px-4 py-2 rounded-2xl bg-slate-800 text-slate-300 font-bold text-sm"
    >
      Tela cheia
    </button>
  </div>
</header>
  )}
    {viewMode === 'cover' && (
  <main className="flex-1 min-h-0 w-full overflow-hidden" />
)}
    {viewMode === 'general' && (
  <main
    className="absolute inset-0 w-full h-full overflow-hidden px-[90px] pb-[60px]"
    style={{
      paddingTop: isTvMode ? 260 : 170
    }}
  >
    <section className="grid grid-cols-2 gap-6 w-full max-w-full min-w-0">
      {generalCards.map((item) => (
        <SectorKpi
          key={item.name}
          name={item.name}
          goal={item.goal}
          actual={item.actual}
          formatBRL={formatBRL}
        />
      ))}
    </section>
  </main>
)}

{viewMode === 'sector' && (
  <main
    className="absolute inset-0 w-full h-full overflow-hidden px-[70px] pb-[40px]"
    style={{
  paddingTop: isTvMode ? 250 : 230
}}
  >
    <section className="grid grid-cols-3 gap-6 w-full max-w-full">
  {closerCards.map((item, index) => (
    <CloserGoalCard
      key={`${item.name}-${index}`}
      name={item.name}
      goal={item.goal}
      actual={item.actual}
      estimated={item.estimated}
      photo={item.photo}
      formatBRL={formatBRL}
      formatCompactBRL={formatCompactBRL}
    />
  ))}
</section>
  </main>
)}
        </div>
  </div>
);
}

function BigKpi({ title, value, subtitle }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white/10 backdrop-blur rounded-3xl p-4 h-[72px] border border-white/10 shadow-2xl overflow-hidden"
    >
      <div className="text-slate-400 text-xs">
        {title}
      </div>

      <div className="text-sm xl:text-base font-black mt-2 leading-tight truncate">
        {value}
      </div>

      <div className="text-slate-500 mt-1 text-xs">
        {subtitle}
      </div>
    </motion.div>
  );
}

function MiniKpi({ label, value }) {
  return (
    <div className="bg-slate-950/50 rounded-2xl p-2 border border-white/5">
      <div className="text-slate-400 text-xs">
        {label}
      </div>

      <div className="text-base font-bold mt-1">
        {value}
      </div>
    </div>
  );
}

function ProgressBar({ label, current, goal, formatBRL }) {
  const percent =
    goal > 0 ? Math.min((current / goal) * 100, 100) : 0;


  
  return (
    <div className="h-full bg-white/10 backdrop-blur rounded-2xl p-2 border border-white/10 shadow-2xl">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="text-slate-400 text-xs">
            {label}
          </div>

          <div className="text-lg font-black mt-1">
            {formatBRL(current)}
          </div>
        </div>

        <div className="text-3xl font-black text-blue-400">
          {percent.toFixed(1)}%
        </div>
      </div>

      <div className="w-full h-5 bg-slate-800 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${percent}%` }}
          transition={{ duration: 1.4, ease: 'easeOut' }}
          className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-green-400 rounded-full shadow-lg shadow-blue-500/40"
        />
      </div>

      <div className="flex justify-between mt-3 text-xs text-slate-500">
        <span>Meta: {formatBRL(goal)}</span>
        <span>Falta: {formatBRL(Math.max(goal - current, 0))}</span>
      </div>
      </div>
    );
   }

function SourceLine({ name, leads, won }) {
  return (
    <div className="bg-slate-950/50 rounded-2xl px-3 py-2 border border-white/5">
      <div className="flex justify-between gap-3">
        <span className="text-sm font-semibold truncate">
          {name}
        </span>

        <span className="text-sm text-blue-300 font-bold">
          {leads}
        </span>
      </div>

      <div className="text-xs text-slate-500">
        {won} won no período
      </div>
    </div>
  );
}

function AlertLine({ label, value }) {
  return (
    <div className="flex items-center justify-between bg-slate-950/50 rounded-2xl px-3 py-2 border border-white/5">
      <span className="text-slate-400 text-xs">
        {label}
      </span>

      <span className="font-bold text-white text-sm">
        {value}
      </span>
    </div>
  );
}

function SectorKpi({ name, goal, actual, formatBRL }) {
  const percent = goal > 0 ? Math.min((actual / goal) * 100, 999) : 0;
  const missing = Math.max(goal - actual, 0);

    return (
  <div className="w-full min-w-0 bg-white/10 backdrop-blur rounded-3xl px-8 py-7 border border-white/10 shadow-2xl overflow-hidden h-[250px]">
      <div className="flex justify-between items-start gap-4">
        <div>
          <div className="text-slate-300 text-4xl font-black leading-tight">
            {name}
          </div>

          <div className="text-5xl font-black mt-5 leading-none">
            {formatBRL(actual)}
          </div>

          <div className="text-slate-400 text-2xl mt-4 font-semibold">
            Meta: {formatBRL(goal)}
          </div>
        </div>

        <div className="text-blue-400 text-5xl font-black leading-none">
          {percent.toFixed(1)}%
        </div>
      </div>

      <div className="w-full h-5 bg-slate-800 rounded-full overflow-hidden mt-8">
        <div
          className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-green-400"
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>

      <div className="text-slate-400 text-xl mt-5 font-semibold">
        Falta: {formatBRL(missing)}
      </div>
    </div>
  );
}

function CloserGoalCard({
  name,
  goal,
  actual,
  estimated,
  photo,
  formatBRL,
  formatCompactBRL
}) {
  const percent = goal > 0 ? Math.min((actual / goal) * 100, 999) : 0;
  const firstName = String(name || '').split(' ')[0];

  const initials = name
    ?.split(' ')
    ?.filter(Boolean)
    ?.slice(0, 2)
    ?.map((part) => part[0])
    ?.join('')
    ?.toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full min-w-0 bg-white/10 backdrop-blur rounded-2xl px-6 py-6 border border-white/10 shadow-2xl overflow-hidden h-[245px]"
    >
      <div className="flex gap-4 h-full min-w-0">
        <div className="shrink-0 flex items-center">
          {photo ? (
            <img
              src={photo}
              alt={firstName}
              className="w-[118px] h-[165px] rounded-2xl object-cover border border-white/20"
            />
          ) : (
            <div className="w-[118px] h-[165px] rounded-2xl bg-blue-600 flex items-center justify-center font-black text-white border border-white/20 text-4xl">
              {initials}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-black text-[44px] truncate leading-none text-white">
                {firstName}
              </div>

              <div className="text-slate-300 text-base mt-1 font-semibold">
                Meta individual
              </div>
            </div>

            <div className="shrink-0 text-cyan-300 font-black text-[42px] leading-none">
              {percent.toFixed(1)}%
            </div>
          </div>

          <div className="min-w-0">
            <div className="text-slate-300 text-base font-semibold">
              Atingido
            </div>

            <div className="font-black text-[48px] leading-none whitespace-nowrap text-white">
              {formatBRL(actual)}
            </div>
          </div>

          <div className="relative w-full h-4 bg-slate-800 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(percent, 100)}%` }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-green-400"
            />
          </div>

          <div className="flex justify-between gap-2 text-base font-bold">
            <span className="text-cyan-300 truncate">
              Estimado: {formatCompactBRL(estimated || 0)}
            </span>

            <span className="text-cyan-300 shrink-0">
              {goal > 0
                ? `${(((estimated || 0) / goal) * 100).toFixed(1)}%`
                : '0%'}
            </span>
          </div>

          <div className="flex justify-between gap-2 text-sm text-slate-300 font-semibold">
            <span className="truncate">
              Meta: {formatCompactBRL(goal)}
            </span>

            <span className="truncate text-right">
              Falta: {formatCompactBRL(Math.max(goal - actual, 0))}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export default TVGeneralPage;
