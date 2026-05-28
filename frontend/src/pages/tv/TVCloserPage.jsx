import { useEffect, useState } from 'react';
import api from '../../services/api';

function TVCloserPage({ tvMode = false }) {
  const [screen, setScreen] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [rotationSeconds, setRotationSeconds] = useState(20);
  const [achievement, setAchievement] = useState(null);
  const [period, setPeriod] = useState('2026-05');
  const [campaignProgress, setCampaignProgress] = useState(null);

  
  useEffect(() => {
    if (!autoRotate) return;

    const rotation = setInterval(() => {
      setScreen((current) => (current + 1) % 6);
    }, rotationSeconds * 1000);

    return () => clearInterval(rotation);
  }, [autoRotate, rotationSeconds]);
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

useEffect(() => {
  function handleFullscreenChange() {
    if (!document.fullscreenElement) {
      document.body.classList.remove('tv-fullscreen');
    }
  }

  document.addEventListener('fullscreenchange', handleFullscreenChange);

  return () => {
    document.removeEventListener('fullscreenchange', handleFullscreenChange);
  };
}, []);

useEffect(() => {
  loadAchievement();
  loadCampaignProgress();

  const interval = setInterval(() => {
    loadAchievement();
    loadCampaignProgress();
  }, 60000);

  return () => clearInterval(interval);
}, [period]);

async function loadAchievement() {
  try {
    const response = await api.get('api/goals/achievement', {
      params: { period }
    });

    setAchievement(response.data);
  } catch (error) {
    console.error(error);
  }
}

async function loadCampaignProgress() {
  try {
    const response = await api.get(
      '/api/campaigns/road-to-glory/progress'
    );

    setCampaignProgress(response.data);

  } catch (error) {
    console.error(error);
  }
}

const goalResults = achievement?.results || [];

const formatBRL = (value) => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(value || 0);
};

const getGoalBySector = (sector) => {
  return goalResults.find(
    (item) => item.goal.sector === sector
  );
};

const sumGoalBySector = (sector) =>
  goalResults
    .filter((item) => item.goal.sector === sector)
    .reduce((sum, item) => sum + Number(item.goal.targetRevenue || 0), 0);

const sumActualBySector = (sector) =>
  goalResults
    .filter((item) => item.goal.sector === sector)
    .reduce((sum, item) => sum + Number(item.actual?.revenue || 0), 0);

const generalCards = [
  {
    name: 'Closers',
    goal: sumGoalBySector('closer'),
    actual: sumActualBySector('closer')
  },
  {
    name: 'Accounts',
    goal: getGoalBySector('accounts')?.goal?.targetRevenue || 0,
    actual: getGoalBySector('accounts')?.actual?.revenue || 0
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

const userPhotos = {
  'Gabriel Lopes': '/photos/gabriel.png',
  'Fábio Souza': '/photos/fabio.png',
  'Giovanna Fernandes': '/photos/giovanna.png',
  'Alba Danielly Rezende Lima': '/photos/alba.png',
  'Fabiane Carvalho Nascimento': '/photos/fabiane.png',
  'Beatriz Costa  Costa': '/photos/beatriz.png',
  'Pedro Scarillo': '/photos/pedro.png',
  'Luiza Carvalho': '/photos/luiza.png',
  'Marcus Santana': '/photos/marcus.png',
  'Edson da Silva Bomfim Júnior': '/photos/edson.png'
};

function normalizeName(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

const closerCards = goalResults
  .filter((item) => item.goal.sector === 'closer')
  .map((item) => {
    const name = item.goal.userName || '';

    const matchedPhotoKey = Object.keys(userPhotos).find(
      (key) => normalizeName(key) === normalizeName(name)
    );
console.log('FOTO CARD:', name, matchedPhotoKey, matchedPhotoKey ? userPhotos[matchedPhotoKey] : null);
    return {
      name,
      goal: Number(item.goal.targetRevenue || 0),
      actual: Number(item.actual?.revenue || 0),
      estimated: Number(item.actual?.estimatedRevenue || 0),
      photo: matchedPhotoKey ? userPhotos[matchedPhotoKey] : null
    };
  });


  return (
  <div className="fixed inset-0 bg-black overflow-hidden flex items-center justify-center">
    <div className="tv-slide-canvas text-white overflow-hidden">

    {!tvMode && (
  <div className="tv-controls flex items-center gap-2 mb-4">

    {[1, 2, 3, 4, 5, 6].map((item, index) => (
      <button
        key={item}
        onClick={() => setScreen(index)}
        className={`px-3 py-2 rounded-xl text-xs font-bold ${
          screen === index
            ? 'bg-blue-600 text-white'
            : 'bg-slate-800 text-slate-300'
        }`}
      >
        Tela {item}
      </button>
    ))}

    <button
      onClick={() => setAutoRotate(!autoRotate)}
      className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-800"
    >
      {autoRotate ? 'Auto ON' : 'Auto OFF'}
    </button>

    <select
      value={rotationSeconds}
      onChange={(e) => setRotationSeconds(Number(e.target.value))}
      className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-800 text-white"
    >
      <option value={10}>10s</option>
      <option value={20}>20s</option>
      <option value={30}>30s</option>
      <option value={60}>60s</option>
    </select>

    <button
      onClick={handleFullscreen}
      className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-800"
    >
      Tela cheia
    </button>

  </div>
)}

    <div className="h-screen w-screen overflow-hidden">
      {screen === 0 && <CloserScreenOne />}
      {screen === 1 && (
        <CloserScreenTwo
          generalCards={generalCards}
          formatBRL={formatBRL}
        />
      )}
      {screen === 2 && (
        <CloserScreenThree
          closerCards={closerCards}
          formatBRL={formatBRL}
        />
      )}
      {screen === 3 && <CloserScreenFour />}
      {screen === 4 && (
        <CloserScreenFive
          campaignProgress={campaignProgress}
        />
      )}
      {screen === 5 && (
  <CloserScreenSix campaignProgress={campaignProgress} />
)}
    </div>

  </div>
  </div>
);
}

function ScreenPlaceholder({ title, background }) {
  return (
    <div
      className="h-full w-full bg-cover bg-center bg-no-repeat rounded-3xl overflow-hidden"
      style={{
        backgroundImage: `url('${background}')`
      }}
    >
      <div className="h-full w-full flex items-center justify-center">
        <div className="bg-black/30 backdrop-blur-sm border border-white/10 rounded-3xl px-10 py-6 text-center shadow-2xl">
          <div className="text-5xl font-black">{title}</div>
          <div className="text-white/70 mt-3">Layout em construção</div>
        </div>
      </div>
    </div>
  );
}
function CloserScreenOne() {
  return (
    <div
      className="h-full w-full bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: "url('/campaign-tv/screen-1.png')"
      }}
    />
  );
}

function CloserScreenTwo({ generalCards, formatBRL }) {
    return (
    <div
      className="h-full w-full bg-cover bg-center bg-no-repeat p-8"
      style={{
        backgroundImage: "url('/campaign-tv/screen-2.png')"
      }}
    >
      <div className="h-full flex items-center pt-24">
        <section className="grid grid-cols-2 gap-5 w-full">

          {generalCards.map((item) => (
            <SectorKpi
              key={item.name}
              name={item.name}
              goal={item.goal}
              actual={item.actual}
              estimated={item.estimated}
              formatBRL={formatBRL}
            />
          ))}

        </section>
      </div>
    </div>
  );
}

function CloserScreenFour() {
  return (
    <div
      className="h-full w-full bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: "url('/campaign-tv/screen-4.png')"
      }}
    />
  );
}

function CloserScreenThree({ closerCards, formatBRL }) {
  return (
    <div
      className="h-full w-full bg-cover bg-center bg-no-repeat p-6"
      style={{
        backgroundImage: "url('/campaign-tv/screen-3.png')"
      }}
    >
      <div className="h-full flex items-start pt-[140px]">
        <section className="grid grid-cols-4 gap-3 w-full">

          {closerCards.map((item, index) => (
            <CloserGoalCard
              key={`${item.name}-${index}`}
              name={item.name}
              goal={item.goal}
              actual={item.actual}
              estimated={item.estimated}
              photo={item.photo}
              formatBRL={formatBRL}
            />
          ))}

        </section>
      </div>
    </div>
  );
}

function CloserScreenFive({ campaignProgress }) {

  const ranking = campaignProgress?.ranking || [];
  const podium = campaignProgress?.podium;

  const carMap = {
  'Red Bull': '/campaign-tv/car-1.png',
  'Mercedes': '/campaign-tv/car-2.png',
  'Ferrari': '/campaign-tv/car-3.png'
};

const bars = ranking.map((team, index) => ({
  ...team,
  top: ['41%', '55%', '70%'][index],
  car: carMap[team.team]
}));

  return (
    <div
      className="relative h-full w-full bg-cover bg-center bg-no-repeat overflow-hidden"
      style={{
        backgroundImage: "url('/campaign-tv/screen-5.png')"
      }}
    >
      <div className="absolute top-[7%] right-[11%] flex items-start gap-10 z-20">

  {[podium?.first, podium?.second, podium?.third].map((team, index) => {

    if (!team) return null;

    const badgeMap = {
      'Red Bull': '/campaign-tv/redbull.png',
      'Mercedes': '/campaign-tv/mercedes.png',
      'Ferrari': '/campaign-tv/ferrari.png'
    };

    const positionMap = [
      '/campaign-tv/first.png',
      '/campaign-tv/second.png',
      '/campaign-tv/third.png'
    ];

    return (
      <div
        key={team.team}
        className="flex flex-col items-center"
      >

        <img
          src={positionMap[index]}
          alt={`Posição ${index + 1}`}
          className="h-[22px] object-contain mb-1"
        />

        <img
          src={badgeMap[team.team]}
          alt={team.team}
          className="h-[65px] object-contain drop-shadow-2xl"
        />

       
        <div className="text-yellow-300 font-black text-[34px] leading-none mt-1 drop-shadow-2xl">
          {team.milesFormatted}
        </div>

      </div>
    );
  })}
</div>

      {bars.map((item) => (
        
        <div
          key={item.team}
          className="absolute left-[4.2%] w-[90.8%]"
          style={{ top: item.top }}
        >

          <div className="relative h-[26px] rounded-full overflow-visible">

            <div className="absolute inset-0 rounded-full bg-white/10 border border-white/60" />

            <div
              className="absolute left-0 top-0 h-full rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.8)] transition-all duration-1000"
              style={{
                width: `${item.percent}%`
              }}
            />

            <img
              src={item.car}
              alt={item.team}
              className="absolute top-1/2 h-[58px] -translate-y-1/2 -translate-x-1/2 object-contain drop-shadow-2xl transition-all duration-1000"
              style={{
                left: `calc(${item.percent}% - 8px)`
              }}
            />

          </div>

        </div>
      ))}

    </div>
  );
}



function CloserScreenSix({ campaignProgress }) {
  const totalMiles = campaignProgress?.totalMiles || 0;
  const totalMilesFormatted = campaignProgress?.totalMilesFormatted || '0';

  let background = '/campaign-tv/screen-6.png';

  if (totalMiles >= 70000) {
    background = '/campaign-tv/screen-6-5.png';
  } else if (totalMiles >= 60000) {
    background = '/campaign-tv/screen-6-4.png';
  } else if (totalMiles >= 10000) {
    background = '/campaign-tv/screen-6-3.png';
  } else if (totalMiles >= 8000) {
    background = '/campaign-tv/screen-6-2.png';
  }

  const percent = Math.min((totalMiles / 70000) * 100, 100);

  return (
    <div
      className="relative h-full w-full bg-cover bg-center bg-no-repeat overflow-hidden"
      style={{
        backgroundImage: `url('${background}')`
      }}
    >
      <div className="absolute top-[31%] left-[12%] w-full text-center">
        <div className="text-white font-black text-[44px] drop-shadow-[0_0_18px_rgba(255,255,255,0.9)]">
          {totalMilesFormatted} 
        </div>
      </div>

      <div className="absolute top-[42.8%] left-[5.5%] w-[89%]">
        <div className="relative h-[22px] rounded-full overflow-hidden">
          <div className="absolute inset-0 rounded-full bg-white/10 border border-yellow-400/80" />

          <div
            className="absolute left-0 top-0 h-full rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.8)] transition-all duration-1000"
            style={{
              width: `${percent}%`
            }}
          />
        </div>
      </div>
    </div>
  );
}

function SectorKpi({ name, goal, actual, estimated = 0, formatBRL }) {
  const percent = goal > 0 ? Math.min((actual / goal) * 100, 999) : 0;
  const estimatedPercent = goal > 0 ? Math.min((estimated / goal) * 100, 999) : 0;

  return (
    <div className="bg-white/10 backdrop-blur rounded-2xl p-5 border border-white/10 shadow-2xl overflow-hidden h-[170px]">
      <div className="flex justify-between items-start">
        <div>
          <div className="text-slate-300 text-lg font-bold">
            {name}
          </div>

          <div className="text-2xl font-black mt-2">
            {formatBRL(actual)}
          </div>

          <div className="text-slate-400 mt-2 text-xs">
            Meta: {formatBRL(goal)}
          </div>
        </div>

        <div className="text-blue-400 text-3xl font-black">
          {percent.toFixed(1)}%
        </div>
      </div>

      <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden mt-4">
        <div
          className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-green-400"
          style={{ width: `${Math.min(percent, 100)}%` }}
        />
      </div>

      <div className="flex justify-between mt-2 text-xs text-cyan-300">
        <span>Estimado: {formatBRL(estimated)}</span>
        <span className="font-bold">{estimatedPercent.toFixed(1)}%</span>
      </div>

      <div className="text-xs text-slate-400 mt-2">
        Falta: {formatBRL(Math.max(goal - actual, 0))}
      </div>
    </div>
  );
}

function CloserGoalCard({ name, goal, actual, estimated = 0, photo, formatBRL }) {
  const percent = goal > 0 ? Math.min((actual / goal) * 100, 999) : 0;
  const estimatedPercent = goal > 0 ? Math.min((estimated / goal) * 100, 999) : 0;

  const firstName = String(name || '').split(' ')[0];

  const initials = name
    ?.split(' ')
    ?.filter(Boolean)
    ?.slice(0, 2)
    ?.map((part) => part[0])
    ?.join('')
    ?.toUpperCase();

  return (
    <div className="bg-white/10 backdrop-blur rounded-2xl px-3 py-2 border border-white/10 shadow-2xl overflow-hidden h-[168px]">
      <div className="flex gap-3 h-full">
        <div className="w-[32%] h-full rounded-2xl overflow-hidden bg-white/5 flex items-center justify-center shrink-0 border border-white/10">
          {photo ? (
  <img
    src={photo}
    alt={name}
    className="w-full h-full object-cover object-top"
    onError={(e) => {
      console.log('Erro ao carregar foto:', photo);
      e.currentTarget.style.display = 'none';
    }}
  />
) : (
  <div className="w-14 h-14 rounded-full bg-blue-600 flex items-center justify-center font-black text-white border border-white/20 text-lg">
    {initials}
  </div>
)}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div className="flex justify-between items-start gap-2">
            <div className="min-w-0">
              <div className="font-black text-[17px] leading-tight truncate">
                {firstName}
              </div>

              <div className="text-slate-400 text-[11px]">
                Meta individual
              </div>
            </div>

            <div className="w-[54px] h-[54px] rounded-full bg-blue-500/20 border-4 border-blue-400 flex items-center justify-center shrink-0">
              <span className="text-blue-300 font-black text-base">
                {percent.toFixed(0)}%
              </span>
            </div>
          </div>

          <div>
            <div className="text-slate-400 text-[11px]">
              Atingido
            </div>

            <div className="font-black text-[22px] leading-none truncate">
              {formatBRL(actual)}
            </div>
          </div>

          <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-500 via-cyan-400 to-green-400"
              style={{ width: `${Math.min(percent, 100)}%` }}
            />
          </div>

          <div className="flex justify-between text-[10px] text-cyan-300">
            <span>Estimado: {formatBRL(estimated)}</span>
            <span>{estimatedPercent.toFixed(1)}%</span>
          </div>

          <div className="flex justify-between text-[10px] text-slate-500">
            <span>Meta: {formatBRL(goal)}</span>
            <span>Falta: {formatBRL(Math.max(goal - actual, 0))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default TVCloserPage;