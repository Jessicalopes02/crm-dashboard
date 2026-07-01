import api from '../../../services/api';

/**
 * CAMADA ÚNICA DE DADOS PARA TODAS AS TVS
 */

export async function getAchievement(period) {
  const fallbackPeriod = '2026-06';

  try {
    // Primeiro tenta o período solicitado pela tela
    const currentResponse = await api.get(
      '/api/goals/achievement',
      {
        params: {
          period
        }
      }
    );

    const currentData = normalizeAchievement(
      currentResponse.data
    );

    const currentResults = Array.isArray(
      currentData?.results
    )
      ? currentData.results
      : [];

    const currentTotalGoals = Number(
      currentResponse.data?.totalGoals || 0
    );

    /*
     * Se o mês solicitado tiver metas,
     * retorna normalmente.
     */
    if (
      currentResults.length > 0 ||
      currentTotalGoals > 0
    ) {
      return {
        ...currentData,
        requestedPeriod: period,
        activePeriod: period,
        usingFallback: false
      };
    }

    /*
     * Se já estiver buscando junho,
     * não faz outra requisição.
     */
    if (period === fallbackPeriod) {
      return {
        ...currentData,
        requestedPeriod: period,
        activePeriod: period,
        usingFallback: false
      };
    }

    console.warn(
      `[TV] Não existem metas para ${period}. Usando ${fallbackPeriod}.`
    );

    // Busca automaticamente as metas de junho
    const fallbackResponse = await api.get(
      '/api/goals/achievement',
      {
        params: {
          period: fallbackPeriod
        }
      }
    );

    const fallbackData = normalizeAchievement(
      fallbackResponse.data
    );

    return {
      ...fallbackData,
      requestedPeriod: period,
      activePeriod: fallbackPeriod,
      usingFallback: true
    };
  } catch (err) {
    console.error(
      'getAchievement error:',
      err
    );

    return {
      results: [],
      requestedPeriod: period,
      activePeriod: period,
      usingFallback: false
    };
  }
}

export async function getCampaignProgress() {
  try {
    const res = await api.get('/campaigns/road-to-glory/progress');
    return res.data || {};
  } catch (err) {
    console.error('getCampaignProgress error:', err);
    return {};
  }
}

/**
 * NORMALIZAÇÃO GLOBAL
 */
export function normalizeAchievement(data) {
  return {
    results: data?.results || []
  };
}

export const SECTORS = {
  CLOSER: 'closer',
  ACCOUNTS: 'accounts',
  TRANSPORTES: 'transportes',
  GERAL: 'geral'
};

export function sumBySector(results, sector) {
  return results
    .filter((i) => i?.goal?.sector === sector)
    .reduce((acc, i) => acc + Number(i?.goal?.targetRevenue || 0), 0);
}

export function sumActualBySector(results, sector) {
  return results
    .filter((i) => i?.goal?.sector === sector)
    .reduce((acc, i) => acc + Number(i?.actual?.revenue || 0), 0);
}

export function getBySector(results, sector) {
  return results.find((i) => i?.goal?.sector === sector);
}
