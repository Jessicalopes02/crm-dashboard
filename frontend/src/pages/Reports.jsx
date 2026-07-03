import {
  useEffect,
  useMemo,
  useState
} from 'react';

import api from '../services/api';

const STORAGE_KEY =
  'roadToGloryReportOverrides';

const OFFICIAL_CAMPAIGN_DATA = {
  'All Hands - Road to the Glory': {
    totalLeads: 107,
    openLeads: 26,
    wonLeads: 4,
    lostLeads: 77,
    meetingsCount: 16,
    wonRevenue: 21500,
    referenceLabel: '30/04/2026'
  },

  'Road to the Glory - Maio': {
    totalLeads: 140,
    openLeads: 29,
    wonLeads: 8,
    lostLeads: 103,
    meetingsCount: 57,
    wonRevenue: 69165.25,
    referenceLabel:
      '25/05/2026 a 29/05/2026'
  },

  'Road to the Glory - Junho': {
    totalLeads: 65,
    openLeads: 42,
    wonLeads: 2,
    lostLeads: 21,
    meetingsCount: 12,
    wonRevenue: 6500,
    referenceLabel: '30/06/2026'
  }
};

const WON_REVENUE_BY_TEAM = {
  'All Hands - Road to the Glory': {
    ferrari: 0,
    mercedes: 0,
    redbull: 21500
  },

  'Road to the Glory - Maio': {
    ferrari: 0,
    mercedes: 15000,
    redbull: 54165.25
  },

  'Road to the Glory - Junho': {
    ferrari: 4500,
    mercedes: 0,
    redbull: 2000
  }
};

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatPoints(value) {
  return Number(value || 0).toLocaleString(
    'pt-BR'
  );
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL'
    }
  );
}
function shortCampaignName(tag) {
  if (
    tag ===
    'All Hands - Road to the Glory'
  ) {
    return 'Abril';
  }

  if (String(tag).includes('Maio')) {
    return 'Maio';
  }

  if (String(tag).includes('Junho')) {
    return 'Junho';
  }

  return tag;
}

function safeNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function calculateConversion(won, total) {
  return safeNumber(total) > 0
    ? Number(
        (
          (safeNumber(won) /
            safeNumber(total)) *
          100
        ).toFixed(2)
      )
    : 0;
}

function getStoredOverrides() {
  try {
    const raw = localStorage.getItem(
      STORAGE_KEY
    );

    return raw
      ? JSON.parse(raw)
      : {
          campaigns: {},
          teams: {}
        };
  } catch {
    return {
      campaigns: {},
      teams: {}
    };
  }
}

function saveStoredOverrides(value) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(value)
  );
}

function Reports() {
  const [loading, setLoading] =
    useState(true);

  const [rawCampaigns, setRawCampaigns] =
    useState([]);

  const [
    selectedCampaign,
    setSelectedCampaign
  ] = useState('all');

  const [errorMessage, setErrorMessage] =
    useState('');

  const [overrides, setOverrides] =
    useState(() => getStoredOverrides());

  useEffect(() => {
    loadReport();
  }, []);

  async function loadReport() {
    try {
      setLoading(true);
      setErrorMessage('');

      const response = await api.get(
        '/reports/road-to-glory'
      );

      const payload =
        response.data || {};

      setRawCampaigns(
        Array.isArray(payload.campaigns)
          ? payload.campaigns
          : []
      );
    } catch (error) {
      console.error(
        'Erro ao carregar relatório:',
        error
      );

      setRawCampaigns([]);

      setErrorMessage(
        error.response?.data?.erro ||
          'Não foi possível carregar o relatório.'
      );
    } finally {
      setLoading(false);
    }
  }

  function updateOverrides(nextValue) {
    setOverrides(nextValue);
    saveStoredOverrides(nextValue);
  }

  function saveCampaignOverride(
    campaignTag,
    values
  ) {
    const nextOverrides = {
      ...overrides,
      campaigns: {
        ...overrides.campaigns,
        [campaignTag]: values
      }
    };

    updateOverrides(nextOverrides);
  }

  function saveTeamOverride(
    campaignTag,
    teamKey,
    values
  ) {
    const key = `${campaignTag}|${teamKey}`;

    const nextOverrides = {
      ...overrides,
      teams: {
        ...overrides.teams,
        [key]: values
      }
    };

    updateOverrides(nextOverrides);
  }

  const campaigns = useMemo(() => {
    return rawCampaigns.map(
      (campaign) => {
        const official =
          OFFICIAL_CAMPAIGN_DATA[
            campaign.tag
          ] || {};

        const campaignOverride =
          overrides.campaigns?.[
            campaign.tag
          ] || {};

        const baseCampaign = {
          ...campaign,

          totalLeads:
            official.totalLeads ??
            campaign.totalLeads,

          openLeads:
            official.openLeads ??
            campaign.openLeads,

          wonLeads:
            official.wonLeads ??
            campaign.wonLeads,

          lostLeads:
            official.lostLeads ??
            campaign.lostLeads,

          meetingsCount:
            official.meetingsCount ??
            campaign.meetingsCount,

          wonRevenue:
            official.wonRevenue ??
            campaign.wonRevenue ??
            0,

          referenceLabel:
            official.referenceLabel ||
            campaign.referenceLabel
        };

        const mergedCampaign = {
          ...baseCampaign,
          ...campaignOverride
        };

        mergedCampaign.conversionRate =
          calculateConversion(
            mergedCampaign.wonLeads,
            mergedCampaign.totalLeads
          );

        const teams = Array.isArray(
          campaign.teams
        )
          ? campaign.teams
          : [];

        const adjustedTeams = teams.map(
          (team) => {
            const key = `${campaign.tag}|${team.teamKey}`;

            const teamOverride =
              overrides.teams?.[key] || {};

            const adjustedTeam = {
              ...team,
              ...teamOverride
            };

            adjustedTeam.automaticPoints =
              safeNumber(
                adjustedTeam.automaticPoints
              );

            adjustedTeam.manualPoints =
              safeNumber(
                adjustedTeam.manualPoints
              );

            adjustedTeam.totalPoints =
              safeNumber(
                adjustedTeam.automaticPoints
              ) +
              safeNumber(
                adjustedTeam.manualPoints
              );

            adjustedTeam.conversionRate =
              calculateConversion(
                adjustedTeam.wonLeads,
                adjustedTeam.totalLeads
              );

            return adjustedTeam;
          }
        );

        const bestTeamByMiles = [
          ...adjustedTeams
        ].sort(
          (first, second) =>
            safeNumber(
              second.totalPoints
            ) -
            safeNumber(
              first.totalPoints
            )
        )[0];

        return {
          ...mergedCampaign,
          teams: adjustedTeams,
          bestPerformance:
            bestTeamByMiles || null
        };
      }
    );
  }, [rawCampaigns, overrides]);

  const comparison = useMemo(() => {
    return campaigns.map((campaign) => ({
      tag: campaign.tag,
      totalLeads: campaign.totalLeads,
      openLeads: campaign.openLeads,
      wonLeads: campaign.wonLeads,
      lostLeads: campaign.lostLeads,
      meetingsCount:
  campaign.meetingsCount,

wonRevenue:
  campaign.wonRevenue || 0,

conversionRate:
  campaign.conversionRate,

bestTeam:
  campaign.bestPerformance?.team ||
  '—'
    }));
  }, [campaigns]);

  const visibleCampaigns =
    useMemo(() => {
      if (
        selectedCampaign === 'all'
      ) {
        return campaigns;
      }

      return campaigns.filter(
        (campaign) =>
          campaign.tag ===
          selectedCampaign
      );
    }, [
      campaigns,
      selectedCampaign
    ]);

  const generalSummary =
    useMemo(() => {
      return visibleCampaigns.reduce(
        (total, campaign) => {
          total.totalLeads += safeNumber(
            campaign.totalLeads
          );

          total.openLeads += safeNumber(
            campaign.openLeads
          );

          total.wonLeads += safeNumber(
            campaign.wonLeads
          );

          total.lostLeads += safeNumber(
            campaign.lostLeads
          );

          total.meetingsCount += safeNumber(
            campaign.meetingsCount
          );

          total.totalPoints +=
            Array.isArray(
              campaign.teams
            )
              ? campaign.teams.reduce(
                  (sum, team) =>
                    sum +
                    safeNumber(
                      team.totalPoints
                    ),
                  0
                )
              : 0;

          return total;
        },
        {
          totalLeads: 0,
          openLeads: 0,
          wonLeads: 0,
          lostLeads: 0,
          meetingsCount: 0,
          totalPoints: 0
        }
      );
    }, [visibleCampaigns]);

  const conversionRate =
    calculateConversion(
      generalSummary.wonLeads,
      generalSummary.totalLeads
    );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 p-8 text-slate-100">
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-400">
          Carregando relatório da campanha...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 p-4 text-slate-100 md:p-6 lg:p-8">

      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">

        <div>
          <h1 className="text-3xl font-bold text-white md:text-4xl">
            Relatório Road to the Glory
          </h1>

          <p className="mt-1 text-slate-400">
            Comparativo das campanhas,
            desempenho dos times e
            pontuação em milhas
          </p>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row">

          <select
            value={selectedCampaign}
            onChange={(event) =>
              setSelectedCampaign(
                event.target.value
              )
            }
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
          >
            <option value="all">
              Comparar todas
            </option>

            {campaigns.map(
              (campaign) => (
                <option
                  key={campaign.tag}
                  value={campaign.tag}
                >
                  {shortCampaignName(
                    campaign.tag
                  )}
                </option>
              )
            )}
          </select>

          <button
            type="button"
            onClick={loadReport}
            className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-500"
          >
            Atualizar
          </button>

        </div>

      </div>

      {errorMessage && (
        <div className="mb-6 rounded-xl border border-red-900 bg-red-950/50 p-4 text-red-300">
          {errorMessage}
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4 xl:grid-cols-7">

        <SummaryCard
          title="Total de Leads"
          value={
            generalSummary.totalLeads
          }
        />

        <SummaryCard
          title="Open"
          value={
            generalSummary.openLeads
          }
        />

        <SummaryCard
          title="Won"
          value={
            generalSummary.wonLeads
          }
        />

        <SummaryCard
          title="Lost"
          value={
            generalSummary.lostLeads
          }
        />

        <SummaryCard
          title="Reuniões"
          value={
            generalSummary.meetingsCount
          }
        />

        <SummaryCard
          title="Conversão"
          value={formatPercent(
            conversionRate
          )}
        />

        <SummaryCard
          title="Total de Milhas"
          value={formatPoints(
            generalSummary.totalPoints
          )}
        />

      </div>

      {selectedCampaign === 'all' && (
        <ComparisonTable
          comparison={comparison}
        />
      )}

      <div className="mt-6 space-y-6">

        {visibleCampaigns.map(
          (campaign) => (
            <CampaignSection
              key={campaign.tag}
              campaign={campaign}
              onSaveCampaign={
                saveCampaignOverride
              }
              onSaveTeam={
                saveTeamOverride
              }
            />
          )
        )}

      </div>

    <WonRevenuePanel
  campaigns={visibleCampaigns}
/>

    </div>
  );
}

function SummaryCard({
  title,
  value
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-lg">

      <p className="text-sm text-slate-400">
        {title}
      </p>

      <p className="mt-2 text-2xl font-bold text-white">
        {value}
      </p>

    </div>
  );
}

function ComparisonTable({
  comparison
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-lg">

      <div className="border-b border-slate-800 p-5">

        <h2 className="text-xl font-bold text-white">
          Comparativo das campanhas
        </h2>

        <p className="mt-1 text-sm text-slate-400">
          Resultados gerais dos três períodos
        </p>

      </div>

      <div className="w-full">

  <table className="w-full table-fixed">

    <thead className="bg-slate-800">

      <tr className="text-left text-[11px] text-slate-300 lg:text-xs">

        <th className="w-[11%] px-2 py-3">
          Campanha
        </th>

        <th className="w-[8%] px-1 py-3 text-center">
          Total
        </th>

        <th className="w-[8%] px-1 py-3 text-center">
          Open
        </th>

        <th className="w-[8%] px-1 py-3 text-center">
          Won
        </th>

        <th className="w-[8%] px-1 py-3 text-center">
          Lost
        </th>

        <th className="w-[9%] px-1 py-3 text-center">
          Reuniões
        </th>

        <th className="w-[18%] px-2 py-3 text-right">
          Receita Won
        </th>

        <th className="w-[11%] px-1 py-3 text-center">
          Conversão
        </th>

        <th className="w-[19%] px-2 py-3">
          Melhor Time
        </th>

      </tr>

    </thead>

    <tbody>

      {comparison.map((item) => (
        <tr
          key={item.tag}
          className="border-t border-slate-800 text-xs text-slate-200 lg:text-sm"
        >

          <td className="px-2 py-3 font-semibold text-white">
            {shortCampaignName(item.tag)}
          </td>

          <td className="px-1 py-3 text-center">
            {item.totalLeads}
          </td>

          <td className="px-1 py-3 text-center font-semibold text-blue-400">
            {item.openLeads}
          </td>

          <td className="px-1 py-3 text-center font-semibold text-emerald-400">
            {item.wonLeads}
          </td>

          <td className="px-1 py-3 text-center font-semibold text-red-400">
            {item.lostLeads}
          </td>

          <td className="px-1 py-3 text-center">
            {item.meetingsCount}
          </td>

          <td className="whitespace-nowrap px-2 py-3 text-right font-semibold text-emerald-300">
            {formatCurrency(item.wonRevenue)}
          </td>

          <td className="px-1 py-3 text-center">
            {formatPercent(item.conversionRate)}
          </td>

          <td className="px-2 py-3 font-semibold text-white">
            {item.bestTeam}
          </td>

        </tr>
      ))}

    </tbody>

  </table>

</div>

    </div>
  );
}

function CampaignSection({
  campaign,
  onSaveCampaign,
  onSaveTeam
}) {
  const teams = Array.isArray(
    campaign.teams
  )
    ? campaign.teams
    : [];

  const teamsTotal = teams.reduce(
    (total, team) =>
      total +
      safeNumber(
        team.totalLeads
      ),
    0
  );

  const outsideTeams = Math.max(
    safeNumber(
      campaign.totalLeads
    ) - teamsTotal,
    0
  );

  const campaignPoints =
    teams.reduce(
      (total, team) =>
        total +
        safeNumber(
          team.totalPoints
        ),
      0
    );

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">

        <div>

          <h2 className="text-2xl font-bold text-white">
            {shortCampaignName(
              campaign.tag
            )}
          </h2>

          <p className="mt-1 text-sm text-slate-400">
            Resultado dos times nesta
            campanha
          </p>

          {campaign.referenceLabel && (
            <p className="mt-2 text-sm font-semibold text-blue-400">
              Período de referência:{' '}
              {
                campaign.referenceLabel
              }
            </p>
          )}

        </div>

        <div className="flex flex-col gap-3 sm:flex-row">

          <div className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-3">

            <p className="text-xs text-slate-400">
              Melhor performance
            </p>

            <p className="font-bold text-white">
              {campaign.bestPerformance
                ?.team || '—'}
            </p>

          </div>

          <div className="rounded-xl border border-blue-900 bg-blue-950/50 px-4 py-3">

            <p className="text-xs text-blue-300">
              Milhas da campanha
            </p>

            <p className="font-bold text-blue-200">
              {formatPoints(
                campaignPoints
              )}
            </p>

          </div>

        </div>

      </div>

      <CampaignManualEditor
        campaign={campaign}
        onSave={onSaveCampaign}
      />

      <div className="mb-6 mt-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">

        <MiniCard
          label="Total"
          value={
            campaign.totalLeads
          }
        />

        <MiniCard
          label="Open"
          value={
            campaign.openLeads
          }
        />

        <MiniCard
          label="Won"
          value={
            campaign.wonLeads
          }
        />

        <MiniCard
          label="Lost"
          value={
            campaign.lostLeads
          }
        />

        <MiniCard
          label="Reuniões"
          value={
            campaign.meetingsCount
          }
        />

        <MiniCard
          label="Conversão"
          value={formatPercent(
            campaign.conversionRate
          )}
        />

        <MiniCard
          label="Fora dos times"
          value={outsideTeams}
        />

      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">

        {teams.map((team) => (
          <TeamCard
            key={`${campaign.tag}-${team.teamKey}`}
            team={team}
            campaignTag={
              campaign.tag
            }
            onSave={onSaveTeam}
          />
        ))}

      </div>

    </div>
  );
}

function CampaignManualEditor({
  campaign,
  onSave
}) {
  const [form, setForm] =
    useState({
      totalLeads:
        campaign.totalLeads || 0,
      openLeads:
        campaign.openLeads || 0,
      wonLeads:
        campaign.wonLeads || 0,
      lostLeads:
        campaign.lostLeads || 0,
      meetingsCount:
        campaign.meetingsCount || 0,
      activitiesCount:
        campaign.activitiesCount || 0
    });

  useEffect(() => {
    setForm({
      totalLeads:
        campaign.totalLeads || 0,
      openLeads:
        campaign.openLeads || 0,
      wonLeads:
        campaign.wonLeads || 0,
      lostLeads:
        campaign.lostLeads || 0,
      meetingsCount:
        campaign.meetingsCount || 0,
      activitiesCount:
        campaign.activitiesCount || 0
    });
  }, [campaign]);

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    onSave(campaign.tag, {
      totalLeads:
        safeNumber(form.totalLeads),
      openLeads:
        safeNumber(form.openLeads),
      wonLeads:
        safeNumber(form.wonLeads),
      lostLeads:
        safeNumber(form.lostLeads),
      meetingsCount:
        safeNumber(form.meetingsCount),
      activitiesCount:
        safeNumber(
          form.activitiesCount
        )
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-slate-700 bg-slate-950 p-4"
    >

      <p className="mb-3 font-semibold text-white">
        Ajuste manual da campanha
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">

        <EditInput
          label="Total"
          value={form.totalLeads}
          onChange={(value) =>
            updateField(
              'totalLeads',
              value
            )
          }
        />

        <EditInput
          label="Open"
          value={form.openLeads}
          onChange={(value) =>
            updateField(
              'openLeads',
              value
            )
          }
        />

        <EditInput
          label="Won"
          value={form.wonLeads}
          onChange={(value) =>
            updateField(
              'wonLeads',
              value
            )
          }
        />

        <EditInput
          label="Lost"
          value={form.lostLeads}
          onChange={(value) =>
            updateField(
              'lostLeads',
              value
            )
          }
        />

        <EditInput
          label="Reuniões"
          value={form.meetingsCount}
          onChange={(value) =>
            updateField(
              'meetingsCount',
              value
            )
          }
        />

        <EditInput
          label="Atividades"
          value={form.activitiesCount}
          onChange={(value) =>
            updateField(
              'activitiesCount',
              value
            )
          }
        />

        <button
          type="submit"
          className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500"
        >
          Salvar
        </button>

      </div>

    </form>
  );
}

function MiniCard({
  label,
  value
}) {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">

      <p className="text-xs text-slate-400">
        {label}
      </p>

      <p className="mt-1 text-xl font-bold text-white">
        {value}
      </p>

    </div>
  );
}

function TeamCard({
  team,
  campaignTag,
  onSave
}) {
  const [form, setForm] =
    useState({
      totalLeads:
        team.totalLeads || 0,
      openLeads:
        team.openLeads || 0,
      wonLeads:
        team.wonLeads || 0,
      lostLeads:
        team.lostLeads || 0,
      meetingsCount:
        team.meetingsCount || 0,
      activitiesCount:
        team.activitiesCount || 0,
      automaticPoints:
        team.automaticPoints || 0,
      manualPoints:
        team.manualPoints || 0
    });

  useEffect(() => {
    setForm({
      totalLeads:
        team.totalLeads || 0,
      openLeads:
        team.openLeads || 0,
      wonLeads:
        team.wonLeads || 0,
      lostLeads:
        team.lostLeads || 0,
      meetingsCount:
        team.meetingsCount || 0,
      activitiesCount:
        team.activitiesCount || 0,
      automaticPoints:
        team.automaticPoints || 0,
      manualPoints:
        team.manualPoints || 0
    });
  }, [team]);

  const automaticPoints =
    safeNumber(
      team.automaticPoints
    );

  const manualPoints =
    safeNumber(team.manualPoints);

  const totalPoints =
    safeNumber(team.totalPoints);

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();

    onSave(
      campaignTag,
      team.teamKey,
      {
        totalLeads:
          safeNumber(form.totalLeads),
        openLeads:
          safeNumber(form.openLeads),
        wonLeads:
          safeNumber(form.wonLeads),
        lostLeads:
          safeNumber(form.lostLeads),
        meetingsCount:
          safeNumber(
            form.meetingsCount
          ),
        activitiesCount:
          safeNumber(
            form.activitiesCount
          ),
        automaticPoints:
          safeNumber(
            form.automaticPoints
          ),
        manualPoints:
          safeNumber(
            form.manualPoints
          )
      }
    );
  }

  return (
    <div className="rounded-2xl border border-slate-700 bg-slate-950 p-5">

      <div className="mb-4 flex items-center justify-between gap-3">

        <h3 className="text-xl font-bold text-white">
          {team.team}
        </h3>

        <span className="rounded-full bg-blue-950 px-3 py-1 text-sm font-semibold text-blue-300">
          {formatPoints(
            totalPoints
          )}{' '}
          milhas
        </span>

      </div>

      <div className="grid grid-cols-2 gap-3">

        <Metric
          label="Total Leads"
          value={
            team.totalLeads
          }
        />

        <Metric
          label="Open"
          value={
            team.openLeads
          }
        />

        <Metric
          label="Won"
          value={
            team.wonLeads
          }
        />

        <Metric
          label="Lost"
          value={
            team.lostLeads
          }
        />

        <Metric
          label="Reuniões"
          value={
            team.meetingsCount
          }
        />

        <Metric
          label="Atividades"
          value={
            team.activitiesCount
          }
        />

        <Metric
          label="Conversão"
          value={formatPercent(
            team.conversionRate
          )}
        />

        <Metric
          label="Milhas automáticas"
          value={formatPoints(
            automaticPoints
          )}
        />

        <Metric
          label="Milhas manuais"
          value={formatPoints(
            manualPoints
          )}
        />

        <Metric
          label="Total de milhas"
          value={formatPoints(
            totalPoints
          )}
          featured
        />

      </div>

      <form
        onSubmit={handleSubmit}
        className="mt-5 rounded-xl border border-slate-700 bg-slate-900 p-4"
      >

        <p className="mb-3 font-semibold text-white">
          Ajuste manual do time
        </p>

        <div className="grid grid-cols-2 gap-3">

          <EditInput
            label="Total"
            value={form.totalLeads}
            onChange={(value) =>
              updateField(
                'totalLeads',
                value
              )
            }
          />

          <EditInput
            label="Open"
            value={form.openLeads}
            onChange={(value) =>
              updateField(
                'openLeads',
                value
              )
            }
          />

          <EditInput
            label="Won"
            value={form.wonLeads}
            onChange={(value) =>
              updateField(
                'wonLeads',
                value
              )
            }
          />

          <EditInput
            label="Lost"
            value={form.lostLeads}
            onChange={(value) =>
              updateField(
                'lostLeads',
                value
              )
            }
          />

          <EditInput
            label="Reuniões"
            value={form.meetingsCount}
            onChange={(value) =>
              updateField(
                'meetingsCount',
                value
              )
            }
          />

          <EditInput
            label="Atividades"
            value={form.activitiesCount}
            onChange={(value) =>
              updateField(
                'activitiesCount',
                value
              )
            }
          />

          <EditInput
            label="Milhas auto"
            value={form.automaticPoints}
            onChange={(value) =>
              updateField(
                'automaticPoints',
                value
              )
            }
          />

          <EditInput
            label="Milhas manuais"
            value={form.manualPoints}
            onChange={(value) =>
              updateField(
                'manualPoints',
                value
              )
            }
          />

        </div>

        <button
          type="submit"
          className="mt-3 w-full rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500"
        >
          Salvar ajustes do time
        </button>

      </form>

    </div>
  );
}

function EditInput({
  label,
  value,
  onChange
}) {
  return (
    <label className="block">

      <span className="mb-1 block text-xs text-slate-400">
        {label}
      </span>

      <input
        type="number"
        value={value}
        onChange={(event) =>
          onChange(event.target.value)
        }
        className="w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white outline-none focus:border-blue-500"
      />

    </label>
  );
}

function Metric({
  label,
  value,
  featured = false
}) {
  return (
    <div
      className={
        featured
          ? 'rounded-xl border border-blue-800 bg-blue-950/50 p-3'
          : 'rounded-xl border border-slate-700 bg-slate-900 p-3'
      }
    >

      <p
        className={
          featured
            ? 'text-xs text-blue-300'
            : 'text-xs text-slate-400'
        }
      >
        {label}
      </p>

      <p
        className={
          featured
            ? 'mt-1 text-lg font-bold text-blue-200'
            : 'mt-1 text-lg font-bold text-white'
        }
      >
        {value ?? 0}
      </p>

    </div>
  );
}

function WonRevenuePanel({
  campaigns
}) {
  return (
    <div className="mt-8 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">

      <div className="mb-5">
        <h2 className="text-xl font-bold text-white">
          Receita Won por Time
        </h2>

        <p className="mt-1 text-sm text-slate-400">
          Receita por campanha e por equipe
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">

        {campaigns.map((campaign) => {
          const revenue =
            WON_REVENUE_BY_TEAM[
              campaign.tag
            ] || {};

          return (
            <div
              key={campaign.tag}
              className="rounded-2xl border border-slate-700 bg-slate-950 p-5"
            >

              <h3 className="mb-4 text-lg font-bold text-white">
                {shortCampaignName(
                  campaign.tag
                )}
              </h3>

              <div className="space-y-3">

                <RevenueRow
                  team="Ferrari"
                  value={
                    revenue.ferrari
                  }
                />

                <RevenueRow
                  team="Mercedes"
                  value={
                    revenue.mercedes
                  }
                />

                <RevenueRow
                  team="Red Bull"
                  value={
                    revenue.redbull
                  }
                />

              </div>

            </div>
          );
        })}

      </div>

    </div>
  );
}

function RevenueRow({
  team,
  value
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-slate-800 bg-slate-900 px-4 py-3">

      <span className="text-sm text-slate-400">
        {team}
      </span>

      <span className="font-bold text-emerald-300">
        {formatCurrency(value)}
      </span>

    </div>
  );
}

export default Reports;
