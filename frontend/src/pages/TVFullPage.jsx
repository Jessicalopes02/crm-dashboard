import { useEffect, useState } from 'react';

import TVGeneralPage from './TVGeneralPage';
import TVCloserPage from './TVCloserPage';

const TEMPO_POR_TV = 60_000;

/*
 * false = TV Closer desligada no TV Full
 * true = TV Closer ligada no TV Full
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
      setCurrentIndex(
        (current) =>
          (current + 1) %
          TV_SEQUENCE.length
      );
    }, TEMPO_POR_TV);

    return () => {
      clearInterval(interval);
    };
  }, []);

  const currentTv =
    TV_SEQUENCE[currentIndex];

  return (
    <div className="tv-fullscreen relative h-screen w-screen overflow-hidden bg-slate-950">

      {/* TV Geral */}
      <div
        className={
          currentTv === 'general'
            ? 'absolute inset-0 z-10 block'
            : 'absolute inset-0 hidden'
        }
      >
        <TVGeneralPage tvMode />
      </div>

      {/* TV Closer desligada quando ENABLE_CLOSER_TV = false */}
      {ENABLE_CLOSER_TV && (
        <div
          className={
            currentTv === 'closer'
              ? 'absolute inset-0 z-10 block'
              : 'absolute inset-0 hidden'
          }
        >
          <TVCloserPage tvMode />
        </div>
      )}

      {/* Background */}
      <div
        className={
          currentTv === 'background'
            ? 'absolute inset-0 z-20 block'
            : 'absolute inset-0 hidden'
        }
      >
        <img
          src="/campaign-tv/campeao.png"
          alt=""
          className="h-full w-full object-cover"
        />
      </div>

    </div>
  );
}

export default TVFullPage;
