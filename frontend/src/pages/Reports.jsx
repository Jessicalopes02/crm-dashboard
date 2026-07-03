import {
  useEffect,
  useMemo,
  useState
} from 'react';

import api from '../services/api';

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function formatPoints(value) {
  return Number(value || 0).toLocaleString(
    'pt-BR'
  );
}

function shortCampaignName(tag) {
  if (
    tag ===
    'All Hands - Road to the Glory'
  ) {
    return 'All Hands';
  }

  if (String(tag).includes('Maio')) {
    return 'Maio';
  }

  if (String(tag).includes('Junho')) {
    return 'Junho';
  }

  return tag;
}

function Reports() {
  const [loading, setLoading] =
    useState(true);

  const [campaigns, setCampaigns] =
    useState([]);

  const [comparison, setComparison] =
    useState([]);

  const [highlights, setHighlights] =
    useState({});

  const [
    selectedCampaign,
    setSelectedCampaign
  ] = useState('all');

  const [errorMessage, setErrorMessage] =
    useState('');

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

      setCampaigns(
        Array.isArray(payload.campaigns)
          ? payload.campaigns
          : []
      );

      setComparison(
        Array.isArray(payload.comparison)
          ? payload.comparison
          : []
      );

      setHighlights(
        payload.highlights || {}
      );
    } catch (error) {
      console.error(
        'Erro ao carregar relatório:',
        error
      );

      setCampaigns([]);
      setComparison([]);
      setHighlights({});

      setErrorMessage(
        error.response?.data?.erro ||
          'Não foi possível carregar o relatório.'
      );
    } finally {
      setLoading(false);
    }
  }

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
          total.totalLeads += Number(
            campaign.totalLeads || 0
          );

          total.openLeads += Number(
            campaign.openLeads || 0
          );

          total.wonLeads += Number(
            campaign.wonLeads || 0
          );

          total.lostLeads += Number(
            campaign.lostLeads || 0
          );

          total.meetingsCount += Number(
            campaign.meetingsCount || 0
          );

          total.activitiesCount += Number(
            campaign.activitiesCount || 0
          );

          total.totalPoints +=
            Array.isArray(
              campaign.teams
            )
              ? campaign.teams.reduce(
                  (sum, team) =>
                    sum +
                    Number(
                      team.totalPoints ??
                        team.manualPoints ??
                        0
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
          activitiesCount: 0,
          totalPoints: 0
        }
      );
    }, [visibleCampaigns]);

  const conversionRate =
    generalSummary.totalLeads > 0
      ? (
          generalSummary.wonLeads /
          generalSummary.totalLeads
        ) * 100
      : 0;

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
        <>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">

            <HighlightCard
              title="Maior volume de leads"
              data={
                highlights.highestLeadVolume
              }
            />

            <HighlightCard
              title="Maior número de Won"
              data={
                highlights.highestWon
              }
            />

            <HighlightCard
              title="Maior número de reuniões"
              data={
                highlights.highestMeetings
              }
            />

            <HighlightCard
              title="Melhor conversão"
              data={
                highlights.bestConversion
              }
              percentage
            />

          </div>

          <ComparisonTable
            comparison={comparison}
          />
        </>
      )}

      <div className="mt-6 space-y-6">

        {visibleCampaigns.map(
          (campaign) => (
            <CampaignSection
              key={campaign.tag}
              campaign={campaign}
              onSaved={loadReport}
            />
          )
        )}

      </div>

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

function HighlightCard({
  title,
  data,
  percentage = false
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-lg">

      <p className="text-sm text-slate-400">
        {title}
      </p>

      <p className="mt-2 text-lg font-bold text-white">
        {data
          ? shortCampaignName(
              data.tag
            )
          : '—'}
      </p>

      <p className="mt-1 text-2xl font-bold text-blue-400">
        {data
          ? percentage
            ? formatPercent(
                data.value
              )
            : data.value
          : 0}
      </p>

    </div>
  );
}

function ComparisonTable({
  comparison
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-lg">

      <div className="border-b border-slate-800 p-6">

        <h2 className="text-xl font-bold text-white">
          Comparativo das campanhas
        </h2>

        <p className="mt-1 text-sm text-slate-400">
          Resultados gerais dos três
          períodos
        </p>

      </div>

      <div className="overflow-x-auto">

        <table className="w-full min-w-[900px]">

          <thead className="bg-slate-800">

            <tr className="text-left text-sm text-slate-300">

              <th className="p-4">
                Campanha
              </th>

              <th className="p-4">
                Total Leads
              </th>

              <th className="p-4">
                Open
              </th>

              <th className="p-4">
                Won
              </th>

              <th className="p-4">
                Lost
              </th>

              <th className="p-4">
                Reuniões
              </th>

              <th className="p-4">
                Conversão
              </th>

              <th className="p-4">
                Melhor Time
              </th>

            </tr>

          </thead>

          <tbody>

            {comparison.map(
              (item) => (
                <tr
                  key={item.tag}
                  className="border-t border-slate-800 text-slate-200"
                >

                  <td className="p-4 font-semibold text-white">
                    {shortCampaignName(
                      item.tag
                    )}
                  </td>

                  <td className="p-4">
                    {item.totalLeads}
                  </td>

                  <td className="p-4 font-semibold text-blue-400">
                    {item.openLeads}
                  </td>

                  <td className="p-4 font-semibold text-emerald-400">
                    {item.wonLeads}
                  </td>

                  <td className="p-4 font-semibold text-red-400">
                    {item.lostLeads}
                  </td>

                  <td className="p-4">
                    {item.meetingsCount}
                  </td>

                  <td className="p-4">
                    {formatPercent(
                      item.conversionRate
                    )}
                  </td>

                  <td className="p-4 font-semibold text-white">
                    {item.bestTeam ||
                      '—'}
                  </td>

                </tr>
              )
            )}

          </tbody>

        </table>

      </div>

    </div>
  );
}

function CampaignSection({
  campaign,
  onSaved
}) {
  const teams = Array.isArray(
    campaign.teams
  )
    ? campaign.teams
    : [];

  const teamsTotal = teams.reduce(
    (total, team) =>
      total +
      Number(
        team.totalLeads || 0
      ),
    0
  );

  const outsideTeams = Math.max(
    Number(
      campaign.totalLeads || 0
    ) - teamsTotal,
    0
  );

  const campaignPoints =
    teams.reduce(
      (total, team) =>
        total +
        Number(
          team.totalPoints ??
            team.manualPoints ??
            0
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

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">

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
            onSaved={onSaved}
          />
        ))}

      </div>

    </div>
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
  onSaved
}) {
  const [points, setPoints] =
    useState('');

  const [reason, setReason] =
    useState('');

  const [saving, setSaving] =
    useState(false);

  const [message, setMessage] =
    useState('');

  const automaticPoints = Number(
    team.automaticPoints || 0
  );

  const manualPoints = Number(
    team.manualPoints || 0
  );

  const totalPoints = Number(
    team.totalPoints ??
      automaticPoints +
        manualPoints
  );

  async function handleAddPoints(
    event
  ) {
    event.preventDefault();

    const numericPoints =
      Number(points);

    if (
      !Number.isFinite(
        numericPoints
      ) ||
      numericPoints === 0
    ) {
      setMessage(
        'Informe uma pontuação diferente de zero.'
      );

      return;
    }

    try {
      setSaving(true);
      setMessage('');

      await api.post(
        '/reports/road-to-glory/adjustments',
        {
          campaignTag,
          teamKey: team.teamKey,
          points: numericPoints,
          reason: reason.trim()
        }
      );

      setPoints('');
      setReason('');

      setMessage(
        'Ajuste salvo com sucesso.'
      );

      await onSaved();
    } catch (error) {
      console.error(
        'Erro ao salvar ajuste:',
        error
      );

      setMessage(
        error.response?.data?.erro ||
          'Não foi possível salvar o ajuste.'
      );
    } finally {
      setSaving(false);
    }
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
          label="Ajustes manuais"
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
        onSubmit={handleAddPoints}
        className="mt-5 rounded-xl border border-slate-700 bg-slate-900 p-4"
      >

        <p className="mb-3 font-semibold text-white">
          Adicionar ajuste manual
        </p>

        <div className="grid grid-cols-1 gap-3">

          <input
            type="number"
            value={points}
            onChange={(event) =>
              setPoints(
                event.target.value
              )
            }
            placeholder="Milhas. Ex.: 200 ou -50"
            className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
          />

          <input
            type="text"
            value={reason}
            onChange={(event) =>
              setReason(
                event.target.value
              )
            }
            placeholder="Motivo do ajuste"
            className="rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
          />

          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-blue-600 px-4 py-3 font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving
              ? 'Salvando...'
              : 'Adicionar milhas'}
          </button>

        </div>

        {message && (
          <p className="mt-3 text-sm text-slate-300">
            {message}
          </p>
        )}

      </form>

    </div>
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

export default Reports;
