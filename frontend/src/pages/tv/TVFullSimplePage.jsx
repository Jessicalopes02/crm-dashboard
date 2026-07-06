import { useEffect, useState } from 'react';

import TVGeneralPage from './TVGeneralPage';

const TEMPO_POR_TELA = 60_000;

function TVFullSimplePage() {
  const [currentScreen, setCurrentScreen] =
    useState('general');

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentScreen((current) =>
        current === 'general'
          ? 'background'
          : 'general'
      );
    }, TEMPO_POR_TELA);

    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        backgroundColor: '#000'
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display:
            currentScreen === 'general'
              ? 'block'
              : 'none'
        }}
      >
        <TVGeneralPage tvMode />
      </div>

     <div
  style={{
    position: 'absolute',
    inset: 0,
    display:
      currentScreen === 'background'
        ? 'flex'
        : 'none',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000'
  }}
>
  <img
    src="/campaign-tv/campeao.png"
    alt=""
    style={{
      width: '100%',
      height: '100%',
      objectFit: 'contain',
      objectPosition: 'center',
      display: 'block'
    }}
  />
</div>
    </div>
  );
}

export default TVFullSimplePage;
