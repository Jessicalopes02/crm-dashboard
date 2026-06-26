import { useEffect, useState } from 'react';

import TVGeneralPage from './TVGeneralPage';
import TVCloserPage from './TVCloserPage';

const TEMPO_POR_TV = 60_000;
// 3 telas × 20 segundos = 60 segundos

function TVFullPage({ tvMode = false }) {
  const [currentTv, setCurrentTv] = useState('general');

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTv((current) =>
        current === 'general' ? 'closer' : 'general'
      );
    }, TEMPO_POR_TV);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      {/* TV Geral permanece carregada */}
      <div
        className={`fixed inset-0 transition-opacity duration-500 ${
          currentTv === 'general'
            ? 'opacity-100 visible z-20'
            : 'opacity-0 invisible pointer-events-none z-10'
        }`}
      >
        <TVGeneralPage tvMode={tvMode} />
      </div>

      {/* TV Closer permanece carregada */}
      <div
        className={`fixed inset-0 transition-opacity duration-500 ${
          currentTv === 'closer'
            ? 'opacity-100 visible z-20'
            : 'opacity-0 invisible pointer-events-none z-10'
        }`}
      >
        <TVCloserPage tvMode={tvMode} />
      </div>
    </div>
  );
}

export default TVFullPage;
