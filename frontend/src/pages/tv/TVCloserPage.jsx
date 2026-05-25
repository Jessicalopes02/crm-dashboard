import { useEffect, useState } from 'react';

function TVCloserPage() {
  const [screen, setScreen] = useState(0);
  const [autoRotate, setAutoRotate] = useState(true);
  const [rotationSeconds, setRotationSeconds] = useState(20);

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


  return (
  <div className="h-screen text-white p-4 overflow-hidden bg-slate-950">

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

    <div className="h-[calc(100vh-80px)] overflow-hidden">
      {screen === 0 && <CloserScreenOne />}
      {screen === 1 && <CloserScreenTwo />}
      {screen === 2 && <CloserScreenThree />}
      {screen === 3 && <CloserScreenFour />}
      {screen === 4 && <CloserScreenFive />}
      {screen === 5 && <CloserScreenSix />}
    </div>

  </div>
);
}

function ScreenPlaceholder({ title }) {
  return (
    <div className="h-full flex items-center justify-center">
      <div className="bg-white/10 border border-white/10 rounded-3xl p-10 text-center shadow-2xl">
        <div className="text-5xl font-black">{title}</div>
        <div className="text-slate-400 mt-3">Layout em construção</div>
      </div>
    </div>
  );
}

function CloserScreenOne() {
  return <ScreenPlaceholder title="Tela 1 - Visão Geral" />;
}

function CloserScreenTwo() {
  return <ScreenPlaceholder title="Tela 2 - Meta por Closers" />;
}

function CloserScreenThree() {
  return <ScreenPlaceholder title="Tela 3 - Meta Process" />;
}

function CloserScreenFour() {
  return <ScreenPlaceholder title="Tela 4 - Campanha 1" />;
}

function CloserScreenFive() {
  return <ScreenPlaceholder title="Tela 5 - Campanha 2" />;
}

function CloserScreenSix() {
  return <ScreenPlaceholder title="Tela 6 - Campanha 3" />;
}

export default TVCloserPage;