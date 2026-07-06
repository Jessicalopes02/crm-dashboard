import { useEffect, useState } from 'react';

import TVGeneralPage from './TVGeneralPage';

const TEMPO_POR_TV = 60_000;

const TV_SEQUENCE = [
  'general',
  'background'
];

function TVFullPage() {
  const [currentIndex, setCurrentIndex] =
    useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentIndex((current) =>
        (current + 1) % TV_SEQUENCE.length
      );
    }, TEMPO_POR_TV);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const currentTv =
    TV_SEQUENCE[currentIndex];

  return (
    <div
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#020617'
      }}
    >
      {/* TV Geral */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display:
            currentTv === 'general'
              ? 'block'
              : 'none'
        }}
      >
        <TVGeneralPage tvMode />
      </div>

      {/* Novo background */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display:
            currentTv === 'background'
              ? 'block'
              : 'none'
        }}
      >
        <img
          src="/campaign-tv/campeao.png"
          alt=""
          style={{
            width: '100%',
            height: '100%',
            display: 'block',
            objectFit: 'cover'
          }}
        />
      </div>
    </div>
  );
}

export default TVFullPage;
