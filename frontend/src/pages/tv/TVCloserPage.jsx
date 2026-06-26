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
      '/campaigns/road-to-glory/progress'
    );

    const payload =
      response.data?.data ||
      response.data?.progress ||
      response.data;

    console.log('ROAD TO GLORY RESPONSE:', response.data);
    console.log('ROAD TO GLORY PAYLOAD:', payload);

    setCampaignProgress(payload);
  } catch (error) {
    console.error(
      'Erro ao carregar progresso da campanha:',
      error.response?.data || error
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
  const rawRanking =
    campaignProgress?.ranking ||
    campaignProgress?.teams ||
    [];

  const ranking = rawRanking.slice(0, 3);

  const carMap = {
    'Mercedes': '/campaign-tv/car-2.png',
    'Red Bull': '/campaign-tv/car-1.png',
    'Ferrari': '/campaign-tv/car-3.png'
  };

  const badgeMap = {
    'Mercedes': '/campaign-tv/mercedes.png',
    'Red Bull': '/campaign-tv/redbull.png',
    'Ferrari': '/campaign-tv/ferrari.png'
  };

  const positionMap = [
    '/campaign-tv/first.png',
    '/campaign-tv/second.png',
    '/campaign-tv/third.png'
  ];

  /*
   * Posição vertical de cada pista.
   * Ajustada para o fundo screen-5.png.
   */
  const trackPositions = ['41%', '55%', '70%'];

  function getTeamName(item) {
    return (
      item?.team ||
      item?.teamName ||
      item?.name ||
      ''
    );
  }

  function getMiles(item) {
    return Number(
      item?.miles ||
      item?.points ||
      item?.score ||
      item?.totalMiles ||
      0
    );
  }

  function getFormattedMiles(item) {
    if (item?.milesFormatted) {
      return item.milesFormatted;
    }

    const miles = getMiles(item);

    return new Intl.NumberFormat('pt-BR').format(miles);
  }

  /*
   * Usa o percentual enviado pelo backend.
   * Caso o backend não envie percent, calcula sobre 6.000.
   */
  function getPercent(item) {
    const backendPercent = Number(
      item?.percent ??
      item?.percentage ??
      item?.progressPercent
    );

    if (Number.isFinite(backendPercent)) {
      return Math.min(
        Math.max(backendPercent, 0),
        100
      );
    }

    const miles = getMiles(item);

    return Math.min(
      Math.max((miles / 6000) * 100, 0),
      100
    );
  }

  /*
   * Prioriza o podium retornado pelo backend.
   * Se não existir, utiliza o próprio ranking.
   */
  const backendPodium = campaignProgress?.podium;

  const podiumTeams = backendPodium
    ? [
        backendPodium.first,
        backendPodium.second,
        backendPodium.third
      ].filter(Boolean)
    : ranking;

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
      {/* Ranking superior */}
      <div className="absolute top-[6.5%] right-[7%] flex items-start gap-[34px] z-30">
        {podiumTeams.map((team, index) => {
          const teamName = getTeamName(team);

          return (
            <div
              key={`${teamName}-${index}`}
              className="w-[115px] flex flex-col items-center"
            >
              <img
                src={positionMap[index]}
                alt={`Posição ${index + 1}`}
                className="h-[28px] object-contain mb-2"
              />

              {badgeMap[teamName] && (
                <img
                  src={badgeMap[teamName]}
                  alt={teamName}
                  className="h-[78px] max-w-[105px] object-contain drop-shadow-2xl"
                />
              )}

              <div className="text-white font-black text-[30px] leading-none mt-2 drop-shadow-2xl whitespace-nowrap">
                {getFormattedMiles(team)}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pistas e carros */}
      {ranking.map((team, index) => {
        const teamName = getTeamName(team);
        const percent = getPercent(team);
        const carImage = carMap[teamName];

        return (
          <div
            key={`${teamName}-${index}`}
            className="absolute left-[3.7%] w-[91.5%]"
            style={{
              top: trackPositions[index]
            }}
          >
            <div className="relative h-[25px] overflow-visible">
              {/* Fundo da barra */}
              <div className="absolute inset-0 rounded-full bg-white/5 border-[2px] border-white/80 shadow-[0_0_8px_rgba(255,255,255,0.4)]" />

              {/* Progresso */}
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-white shadow-[0_0_20px_rgba(255,255,255,0.9)] transition-[width] duration-1000 ease-out"
                style={{
                  width: `${percent}%`
                }}
              />

              {/* Carro */}
              {carImage && (
                <img
  src={carImage}
  alt={teamName}
  className="absolute h-[68px] -translate-x-1/2 object-contain drop-shadow-2xl transition-[left] duration-1000 ease-out"
  style={{
    left: `clamp(4%, ${percent}%, 97%)`,
    top: '50%',
    transform: 'translate(-50%, -50%)'
  }}
/>
              )}
            </div>
          </div>
        );
      })}

      {/* Aviso temporário para verificar dados */}
      {ranking.length === 0 && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-black/70 border border-white/20 rounded-2xl px-8 py-5 text-white text-2xl font-bold">
          Aguardando dados da campanha...
        </div>
      )}
    </div>
  );
}

/*
 * NOVA TELA 3
 * Era a antiga tela 6.
 */
function CloserScreenThree({ campaignProgress }) {
  const ranking =
    campaignProgress?.ranking ||
    campaignProgress?.teams ||
    [];

  function getTeamMiles(item) {
    return Number(
      item?.miles ||
      item?.points ||
      item?.score ||
      item?.totalMiles ||
      0
    );
  }

  /*
   * Soma diretamente os três times.
   */
  const calculatedTotalMiles = ranking
    .slice(0, 3)
    .reduce(
      (sum, team) => sum + getTeamMiles(team),
      0
    );

  /*
   * Prioriza o total vindo do backend.
   * Caso não venha, usa a soma dos três times.
   */
  const totalMiles = Number(
    campaignProgress?.totalMiles ??
    campaignProgress?.total ??
    campaignProgress?.totalPoints ??
    calculatedTotalMiles
  );

  const totalMilesFormatted =
    campaignProgress?.totalMilesFormatted ||
    new Intl.NumberFormat('pt-BR').format(totalMiles);

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
      {/* Total das milhas */}
      <div className="absolute top-[33.8%] left-[57%]">
  <div className="text-white font-black text-[54px] leading-none drop-shadow-[0_0_18px_rgba(255,255,255,0.8)]">
    {totalMilesFormatted}
  </div>
</div>

      {/* Barra geral */}
      <div className="absolute top-[42.8%] left-[4.3%] w-[91.4%]">
        <div className="relative h-[26px] rounded-full overflow-hidden">
          <div className="absolute inset-0 rounded-full bg-white/5 border-[2px] border-yellow-400/90" />

          <div
            className="absolute left-0 top-0 h-full rounded-full bg-white shadow-[0_0_20px_rgba(255,255,255,0.9)] transition-[width] duration-1000 ease-out"
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
