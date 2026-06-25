import api from '../../../services/api';

/**
 * CAMADA ÚNICA DE DADOS PARA TODAS AS TVS
 * (Closer, Geral, SDR, Operacional)
 */

export async function getAchievement(period) {
  try {
    const res = await api.get('/api/goals/achievement', {
      params: { period }
    });

    return normalizeAchievement(res.data);
  } catch (err) {
    console.error('getAchievement error:', err);
    return { results: [] };
  }
}

export async function getCampaignProgress() {
  try {
    const res = await api.get('/api/campaigns/road-to-glory/progress');
    return res.data || {};
  } catch (err) {
    console.error('getCampaignProgress error:', err);
    return {};
  }
}

/**
 * NORMALIZAÇÃO GLOBAL (REGRA DAS TVS)
 */
export function normalizeAchievement(data) {
  return {
    results: data?.results || []
  };
}

/**
 * MAPA PADRÃO DE SECTORS
 */
export const SECTORS = {
  CLOSER: 'closer',
  ACCOUNTS: 'accounts',
  TRANSPORTES: 'transportes',
  GERAL: 'geral'
};

/**
 * FUNÇÕES PADRÃO DE CÁLCULO
 */
export function sumBySector(results, sector, field = 'targetRevenue') {
  return results
    .filter((i) => i?.goal?.sector === sector)
    .reduce((acc, i) => acc + Number(i?.goal?.[field] || 0), 0);
}

export function sumActualBySector(results, sector) {
  return results
    .filter((i) => i?.goal?.sector === sector)
    .reduce((acc, i) => acc + Number(i?.actual?.revenue || 0), 0);
}

export function getBySector(results, sector) {
  return results.find((i) => i?.goal?.sector === sector);
}