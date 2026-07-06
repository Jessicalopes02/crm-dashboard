import { useEffect, useState } from 'react';

import TVGeneralPage from './TVGeneralPage';

const TEMPO_POR_TV = 10_000;

function TVFullPage() {
  const [currentScreen, setCurrentScreen] =
    useState('general');

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentScreen((current) =>
        current === 'general'
          ? 'background'
          : 'general'
      );
    }, TEMPO_POR_TV);

    return () => clearInterval(interval);
  }, []);

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
      <div
        style={{
          position: 'absolute',
          inset: 0,
          visibility:
            currentScreen === 'general'
              ? 'visible'
              : 'hidden',
          opacity:
            currentScreen === 'general'
              ? 1
              : 0,
          zIndex:
            currentScreen === 'general'
              ? 2
              : 1
        }}
      >
        <TVGeneralPage tvMode />
      </div>

      <div
        style={{
          position: 'absolute',
          inset: 0,
          visibility:
            currentScreen === 'background'
              ? 'visible'
              : 'hidden',
          opacity:
            currentScreen === 'background'
              ? 1
              : 0,
          zIndex:
            currentScreen === 'background'
              ? 3
              : 1,
          backgroundColor: '#020617'
        }}
      >
        <img
          src="/campaign-tv/campeao.png"
          alt="Campanha"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            display: 'block'
          }}
          onError={(event) => {
            event.currentTarget.style.display =
              'none';
          }}
        />

        <div
          style={{
            position: 'absolute',
            bottom: '10px',
            right: '10px',
            fontSize: '12px',
            color: 'white',
            opacity: 0.3
          }}
        >
          TV FULL NOVA
        </div>
      </div>
    </div>
  );
}

export default TVFullPage;
