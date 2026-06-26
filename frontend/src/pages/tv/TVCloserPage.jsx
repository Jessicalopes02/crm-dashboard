import { useEffect, useState } from 'react';
import api from '../../services/api';

function TVCloserPage({ tvMode = false }) {
  const [screen, setScreen] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [rotationSeconds, setRotationSeconds] = useState(20);
  const [campaignProgress, setCampaignProgress] = useState(null);

  const BASE_WIDTH = 1920;
  const BASE_HEIGHT = 1080;

  const [tvScale, setTvScale] = useState(1);

  const isTvMode =
    tvMode ||
    new URLSearchParams(window.location.search).get('fullscreen') ===
      'true';

  /*
   * São somente 3 telas:
   *
   * Tela 1 = antiga screen-4
   * Tela 2 = antiga screen-5
   * Tela 3 = antiga screen-6
   */
  const totalScreens = 3;

  useEffect(() => {
    if (!autoRotate) return;

    const rotation = setInterval(() => {
      setScreen((current) => {
        return (current + 1) % totalScreens;
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

    return () => {
      window.removeEventListener('resize', updateTvScale);
    };
  }, [isTvMode]);

  useEffect(() => {
    loadCampaignProgress();

    const interval = setInterval(() => {
      loadCampaignProgress();
    }, 60000);

    return () => clearInterval(interval);
  }, []);

  async function loadCampaignProgress() {
    try {
      const response = await api.get(
        '/api/campaigns/road-to-glory/progress'
      );

      setCampaignProgress(response.data);
    } catch (error) {
      console.error(
        'Erro ao carregar progresso da campanha:',
        error
      );
    }
  }

  function handleFullscreen() {
    const element = document.documentElement;

    if (!document.fullscreenElement) {
      element
        .requestFullscreen()
        .then(() => {
          document.body.classList.add('tv-fullscreen');
        })
        .catch((error) => {
          console.error(
            'Erro ao abrir tela cheia:',
            error
          );
        });
    } else {
      document
        .exitFullscreen()
        .then(() => {
          document.body.classList.remove('tv-fullscreen');
        })
        .catch((error) => {
          console.error(
            'Erro ao sair da tela cheia:',
            error
          );
        });
    }
  }

  useEffect(() => {
    function handleFullscreenChange() {
      if (!document.fullscreenElement) {
        document.body.classList.remove('tv-fullscreen');
      }
    }

    document.addEventListener(
      'fullscreenchange',
      handleFullscreenChange
    );

    return () => {
      document.removeEventListener(
        'fullscreenchange',
        handleFullscreenChange
      );
    };
  }, []);

  return (
    <div
      onDoubleClick={handleFullscreen}
      className="fixed inset-0 bg-black overflow-hidden flex items-center justify-center"
    >
      <div
        className="relative text-white overflow-hidden bg-black shrink-0"
        style={{
          width: `${BASE_WIDTH}px`,
          height: `${BASE_HEIGHT}px`,
          transform: `scale(${tvScale})`,
          transformOrigin: 'center center'
        }}
      >
        {!isTvMode && (
          <div className="absolute top-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-black/70 backdrop-blur border border-white/10 rounded-2xl px-4 py-3 shadow-2xl">
            {[1, 2, 3].map((item, index) => (
              <button
                key={item}
                onClick={() => setScreen(index)}
                className={`px-5 py-2 rounded-2xl text-sm font-bold transition ${
                  screen === index
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                Tela {item}
              </button>
            ))}

            <select
              value={rotationSeconds}
              onChange={(event) =>
                setRotationSeconds(
                  Number(event.target.value)
                )
              }
              className="bg-slate-800 text-white rounded-2xl px-4 py-2 text-sm font-bold"
            >
              <option value={10}>10s</option>
              <option value={20}>20s</option>
              <option value={30}>30s</option>
              <option value={60}>60s</option>
            </select>

            <button
              onClick={() => setAutoRotate((current) => !current)}
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
        )}

        <div className="absolute inset-0 w-full h-full overflow-hidden">
          {screen === 0 && <CloserScreenOne />}

          {screen === 1 && (
            <CloserScreenTwo
              campaignProgress={campaignProgress}
            />
          )}

          {screen === 2 && (
            <CloserScreenThree
              campaignProgress={campaignProgress}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/*
 * NOVA TELA 1
 * Era a antiga tela 4.
 */
function CloserScreenOne() {
  return (
    <div
      className="absolute inset-0 w-full h-full bg-no-repeat"
      style={{
        backgroundImage:
          "url('/campaign-tv/screen-4.png')",
        backgroundSize: '100% 100%',
        backgroundPosition: 'center'
      }}
    />
  );
}

/*
 * NOVA TELA 2
 * Era a antiga tela 5.
 */
function CloserScreenTwo({ campaignProgress }) {
  const ranking = (
    campaignProgress?.ranking || []
  ).slice(0, 3);

  const podium = campaignProgress?.podium;

  const carMap = {
    'Red Bull': '/campaign-tv/car-1.png',
    Mercedes: '/campaign-tv/car-2.png',
    Ferrari: '/campaign-tv/car-3.png'
  };

  const badgeMap = {
    'Red Bull': '/campaign-tv/redbull.png',
    Mercedes: '/campaign-tv/mercedes.png',
    Ferrari: '/campaign-tv/ferrari.png'
  };

  const positionMap = [
    '/campaign-tv/first.png',
    '/campaign-tv/second.png',
    '/campaign-tv/third.png'
  ];

  const topPositions = ['41%', '55%', '70%'];

  const podiumTeams = [
    podium?.first,
    podium?.second,
    podium?.third
  ];

  const bars = ranking.map((team, index) => ({
    ...team,
    top: topPositions[index],
    car: carMap[team.team]
  }));

  return (
    <div
      className="absolute inset-0 w-full h-full overflow-hidden bg-no-repeat"
      style={{
        backgroundImage:
          "url('/campaign-tv/screen-5.png')",
        backgroundSize: '100% 100%',
        backgroundPosition: 'center'
      }}
    >
      <div className="absolute top-[7%] right-[11%] flex items-start gap-10 z-20">
        {podiumTeams.map((team, index) => {
          if (!team) return null;

          return (
            <div
              key={`${team.team}-${index}`}
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
                {team.milesFormatted || '0'}
              </div>
            </div>
          );
        })}
      </div>

      {bars.map((item, index) => {
        const percent = Math.max(
          0,
          Math.min(Number(item.percent || 0), 100)
        );

        return (
          <div
            key={`${item.team}-${index}`}
            className="absolute left-[4.2%] w-[90.8%]"
            style={{
              top: item.top
            }}
          >
            <div className="relative h-[26px] rounded-full overflow-visible">
              <div className="absolute inset-0 rounded-full bg-white/10 border border-white/60" />

              <div
                className="absolute left-0 top-0 h-full rounded-full bg-white shadow-[0_0_18px_rgba(255,255,255,0.8)] transition-all duration-1000"
                style={{
                  width: `${percent}%`
                }}
              />

              {item.car && (
                <img
                  src={item.car}
                  alt={item.team}
                  className="absolute top-1/2 h-[58px] -translate-y-1/2 -translate-x-1/2 object-contain drop-shadow-2xl transition-all duration-1000"
                  style={{
                    left: `calc(${percent}% - 8px)`
                  }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/*
 * NOVA TELA 3
 * Era a antiga tela 6.
 */
function CloserScreenThree({ campaignProgress }) {
  const totalMiles = Number(
    campaignProgress?.totalMiles || 0
  );

  const totalMilesFormatted =
    campaignProgress?.totalMilesFormatted || '0';

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

  const percent = Math.min(
    Math.max((totalMiles / 70000) * 100, 0),
    100
  );

  return (
    <div
      className="absolute inset-0 w-full h-full overflow-hidden bg-no-repeat"
      style={{
        backgroundImage: `url('${background}')`,
        backgroundSize: '100% 100%',
        backgroundPosition: 'center'
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

export default TVCloserPage;
