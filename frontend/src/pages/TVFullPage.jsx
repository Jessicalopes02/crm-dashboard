import { useEffect, useState } from 'react';

import TVGeneralPage from './TVGeneralPage';
import TVCloserPage from './TVCloserPage';

const TEMPO_POR_TV = 60_000;

/*
 * false = TV Closer desligada no link TV Full
 * true = TV Closer ligada no link TV Full
 */
const ENABLE_CLOSER_TV = false;

const TV_SEQUENCE = ENABLE_CLOSER_TV
  ? ['general', 'closer', 'background']
  : ['general', 'background'];

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
    <div className="tv-fullscreen relative h-screen w-screen overflow-hidden">

      {/* Mantém a TV Geral carregada */}
      <div
        className={
          currentTv === 'general'
            ? 'absolute inset-0 block'
            : 'absolute inset-0 hidden'
        }
      >
        <TVGeneralPage tvMode />
      </div>

      {/* Mantém a TV Closer carregada, mas pode ficar desligada da sequência */}
      {ENABLE_CLOSER_TV && (
        <div
          className={
            currentTv === 'closer'
              ? 'absolute inset-0 block'
              : 'absolute inset-0 hidden'
          }
        >
          <TVCloserPage tvMode />
        </div>
      )}

      {/* Nova tela somente com background */}
     <div
  className={
    currentTv === 'background'
      ? 'absolute inset-0 block'
      : 'absolute inset-0 hidden'
  }
>
  <div
    className="h-full w-full bg-cover bg-center bg-no-repeat"
    style={{
      backgroundImage:
        "url('/campaign-tv/campeao.png')"
    }}
  />
</div>
  );
}

export default TVFullPage;
