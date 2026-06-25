import api from '../../../services/api';

/**
 * CAMADA ÚNICA DE DADOS PARA TODAS AS TVS
 */

export async function getAchievement(period) {
  try {
    const res = await api.get('/goals/achievement', {
      params: { period }
    });

    return {
      results: res.data?.results || []
    };
  } catch (err) {
    console.error('getAchievement error:', err);
    return { results: [] };
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
