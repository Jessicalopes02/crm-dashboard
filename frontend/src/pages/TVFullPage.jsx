import { useEffect, useState } from 'react';

import TVGeneralPage from './TVGeneralPage';
import TVCloserPage from './TVCloserPage';

const TEMPO_POR_TV = 60_000;
// 3 telas × 20 segundos = 60 segundos

function TVFullPage() {
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
    <div className="tv-fullscreen">
      {currentTv === 'general' && <TVGeneralPage />}

      {currentTv === 'closer' && <TVCloserPage />}
    </div>
  );
}

export default TVFullPage;
