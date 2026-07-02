import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

function formatPercent(value) {
  return `${Number(value || 0).toFixed(2)}%`;
}

function shortCampaignName(tag) {
  if (tag === 'All Hands - Road to the Glory') {
    return 'All Hands';
  }

  if (tag.includes('Maio')) {
    return 'Maio';
  }

  if (tag.includes('Junho')) {
    return 'Junho';
  }

  return tag;
}

function Reports() {
  const [loading, setLoading] = useState(true);
  const [campaigns, setCampaigns] = useState([]);
  const [comparison, setComparison] = useState([]);
  const [highlights, setHighlights] = useState({});
  const [selectedCampaign, setSelectedCampaign] =
    useState('all');

  useEffect(() => {
    loadReport();
  }, []);

  async function loadReport() {
    try {
      setLoading(true);

      const response = await api.get(
        '/reports/road-to-glory'
      );

      const payload = response.data || {};

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

      setHighlights(payload.highlights || {});
    } catch (error) {
      console.error(
        'Erro ao carregar relatório:',
        error
      );

      setCampaigns([]);
      setComparison([]);
      setHighlights({});
    } finally {
      setLoading(false);
    }
  }

  const visibleCampaigns = useMemo(() => {
    if (selectedCampaign === 'all') {
      return campaigns;
    }

    return campaigns.filter(
      (campaign) =>
        campaign.tag === selectedCampaign
    );
  }, [campaigns, selectedCampaign]);

  const generalSummary = useMemo(() => {
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

        return total;
      },
      {
        totalLeads: 0,
        openLeads: 0,
        wonLeads: 0,
        lostLeads: 0,
        meetingsCount: 0,
        activitiesCount: 0
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
      <div className="min-h-screen bg-slate-50 p-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
          Carregando relatório da campanha...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 lg:p-8">

      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">

        <div>
          <h1 className="text-3xl font-bold text-slate-900 md:text-4xl">
            Relatório Road to the Glory
          </h1>

          <p className="mt-1 text-slate-500">
            Comparativo das campanhas e desempenho dos times
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
            className="rounded-xl border border-slate-300 bg-white px-4 py-3"
          >
            <option value="all">
              Comparar todas
            </option>

            {campaigns.map((campaign) => (
              <option
                key={campaign.tag}
                value={campaign.tag}
              >
                {shortCampaignName(
                  campaign.tag
                )}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={loadReport}
            className="rounded-xl bg-slate-900 px-5 py-3 font-semibold text-white"
          >
            Atualizar
          </button>

        </div>

      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">

        <SummaryCard
          title="Total de Leads"
          value={generalSummary.totalLeads}
        />

        <SummaryCard
          title="Open"
          value={generalSummary.openLeads}
        />

        <SummaryCard
          title="Won"
          value={generalSummary.wonLeads}
        />

        <SummaryCard
          title="Lost"
          value={generalSummary.lostLeads}
        />

        <SummaryCard
          title="Reuniões"
          value={generalSummary.meetingsCount}
        />

        <SummaryCard
          title="Conversão"
          value={formatPercent(
            conversionRate
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
              data={highlights.highestWon}
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

        {visibleCampaigns.map((campaign) => (
          <CampaignSection
            key={campaign.tag}
            campaign={campaign}
          />
        ))}

      </div>

    </div>
  );
}

function SummaryCard({ title, value }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

      <p className="text-sm text-slate-500">
        {title}
      </p>

      <p className="mt-2 text-2xl font-bold text-slate-900">
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
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

      <p className="text-sm text-slate-500">
        {title}
      </p>

      <p className="mt-2 text-lg font-bold text-slate-900">
        {data
          ? shortCampaignName(data.tag)
          : '—'}
      </p>

      <p className="mt-1 text-2xl font-bold text-blue-700">
        {data
          ? percentage
            ? formatPercent(data.value)
            : data.value
          : 0}
      </p>

    </div>
  );
}

function ComparisonTable({ comparison }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

      <div className="border-b border-slate-200 p-6">

        <h2 className="text-xl font-bold text-slate-900">
          Comparativo das campanhas
        </h2>

        <p className="mt-1 text-sm text-slate-500">
          Resultados gerais dos três períodos
        </p>

      </div>

      <div className="overflow-x-auto">

        <table className="w-full min-w-[850px]">

          <thead className="bg-slate-100">

            <tr className="text-left text-sm text-slate-600">

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

            {comparison.map((item) => (
              <tr
                key={item.tag}
                className="border-t border-slate-200"
              >

                <td className="p-4 font-semibold text-slate-900">
                  {shortCampaignName(
                    item.tag
                  )}
                </td>

                <td className="p-4">
                  {item.totalLeads}
                </td>

                <td className="p-4 text-blue-700 font-semibold">
                  {item.openLeads}
                </td>

                <td className="p-4 text-green-700 font-semibold">
                  {item.wonLeads}
                </td>

                <td className="p-4 text-red-700 font-semibold">
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

                <td className="p-4 font-semibold">
                  {item.bestTeam || '—'}
                </td>

              </tr>
            ))}

          </tbody>

        </table>

      </div>

    </div>
  );
}

function CampaignSection({ campaign }) {
  const teamsTotal = campaign.teams.reduce(
    (total, team) =>
      total +
      Number(team.totalLeads || 0),
    0
  );

  const outsideTeams = Math.max(
    Number(campaign.totalLeads || 0) -
      teamsTotal,
    0
  );

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

      <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">

        <div>

          <h2 className="text-2xl font-bold text-slate-900">
            {shortCampaignName(
              campaign.tag
            )}
          </h2>

          <p className="mt-1 text-sm text-slate-500">
            Resultado dos times nesta campanha
          </p>

        </div>

        <div className="rounded-xl bg-slate-100 px-4 py-3">

          <p className="text-xs text-slate-500">
            Melhor performance
          </p>

          <p className="font-bold text-slate-900">
            {campaign.bestPerformance
              ?.team || '—'}
          </p>

        </div>

      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">

        <MiniCard
          label="Total"
          value={campaign.totalLeads}
        />

        <MiniCard
          label="Open"
          value={campaign.openLeads}
        />

        <MiniCard
          label="Won"
          value={campaign.wonLeads}
        />

        <MiniCard
          label="Lost"
          value={campaign.lostLeads}
        />

        <MiniCard
          label="Reuniões"
          value={campaign.meetingsCount}
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

        {campaign.teams.map((team) => (
          <TeamCard
            key={`${campaign.tag}-${team.teamKey}`}
            team={team}
          />
        ))}

      </div>

    </div>
  );
}

function MiniCard({ label, value }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">

      <p className="text-xs text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-xl font-bold text-slate-900">
        {value}
      </p>

    </div>
  );
}

function TeamCard({ team }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-5">

      <div className="mb-4 flex items-center justify-between">

        <h3 className="text-xl font-bold text-slate-900">
          {team.team}
        </h3>

        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm font-semibold">
          {team.manualPoints} pts
        </span>

      </div>

      <div className="grid grid-cols-2 gap-3">

        <Metric
          label="Total Leads"
          value={team.totalLeads}
        />

        <Metric
          label="Open"
          value={team.openLeads}
        />

        <Metric
          label="Won"
          value={team.wonLeads}
        />

        <Metric
          label="Lost"
          value={team.lostLeads}
        />

        <Metric
          label="Reuniões"
          value={team.meetingsCount}
        />

        <Metric
          label="Atividades"
          value={team.activitiesCount}
        />

        <Metric
          label="Conversão"
          value={formatPercent(
            team.conversionRate
          )}
        />

        <Metric
          label="Pontuação"
          value={team.manualPoints}
        />

      </div>

    </div>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-xl bg-slate-50 p-3">

      <p className="text-xs text-slate-500">
        {label}
      </p>

      <p className="mt-1 text-lg font-bold text-slate-900">
        {value}
      </p>

    </div>
  );
}

export default Reports;
