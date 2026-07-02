import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

function getCurrentPeriod() {
  const today = new Date();

  return `${today.getFullYear()}-${String(
    today.getMonth() + 1
  ).padStart(2, '0')}`;
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function formatBRL(value) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(value || 0));
}

function formatPercent(value) {
  return `${Number(value || 0).toFixed(1)}%`;
}

function Performance() {
  const [loading, setLoading] =
    useState(true);

  const [selectedPeriod, setSelectedPeriod] =
    useState(getCurrentPeriod());

  const [viewMode, setViewMode] =
    useState('closer');

  const [closers, setClosers] =
    useState([]);

  const [sdrs, setSdrs] =
    useState([]);

  const [search, setSearch] =
    useState('');

  useEffect(() => {
    loadPerformance();
  }, [selectedPeriod]);

  async function loadPerformance() {
    try {
      setLoading(true);

      const response = await api.get(
        '/dashboard/performance-by-assignee',
        {
          params: {
            period: selectedPeriod
          }
        }
      );

      const payload = response.data || {};

      setClosers(
        Array.isArray(payload.closers)
          ? payload.closers
          : []
      );

      setSdrs(
        Array.isArray(payload.sdrs)
          ? payload.sdrs
          : []
      );
    } catch (error) {
      console.error(
        'Erro ao carregar performance:',
        error
      );

      setClosers([]);
      setSdrs([]);
    } finally {
      setLoading(false);
    }
  }

  const currentPerformance =
    viewMode === 'closer'
      ? closers
      : sdrs;

  const filteredPerformance = useMemo(() => {
    const normalizedSearch =
      normalizeName(search);

    if (!normalizedSearch) {
      return currentPerformance;
    }

    return currentPerformance.filter((item) =>
      normalizeName(item._id).includes(
        normalizedSearch
      )
    );
  }, [currentPerformance, search]);

  const sortedPerformance = useMemo(() => {
    return [...filteredPerformance].sort(
      (first, second) => {
        if (viewMode === 'closer') {
          return (
            Number(second.totalRevenue || 0) -
            Number(first.totalRevenue || 0)
          );
        }

        return (
          Number(second.totalLeads || 0) -
          Number(first.totalLeads || 0)
        );
      }
    );
  }, [filteredPerformance, viewMode]);

  const summary = useMemo(() => {
    return filteredPerformance.reduce(
      (total, item) => {
        total.totalLeads += Number(
          item.totalLeads || 0
        );

        total.wonLeads += Number(
          item.wonLeads || 0
        );

        total.lostLeads += Number(
          item.lostLeads || 0
        );

        total.openLeads += Number(
          item.openLeads || 0
        );

        total.activitiesCount += Number(
          item.activitiesCount || 0
        );

        total.meetingsCount += Number(
          item.meetingsCount || 0
        );

        total.staleOpenPending += Number(
          item.staleOpenPending || 0
        );

        total.totalRevenue += Number(
          item.totalRevenue || 0
        );

        return total;
      },
      {
        totalLeads: 0,
        wonLeads: 0,
        lostLeads: 0,
        openLeads: 0,
        activitiesCount: 0,
        meetingsCount: 0,
        staleOpenPending: 0,
        totalRevenue: 0
      }
    );
  }, [filteredPerformance]);

  const generalConversion =
    summary.totalLeads > 0
      ? (
          summary.wonLeads /
          summary.totalLeads
        ) * 100
      : 0;

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 lg:p-8 overflow-x-hidden">

      <div className="mb-6">

        <h1 className="text-3xl md:text-4xl font-bold text-slate-900">
          Performance Comercial
        </h1>

        <p className="mt-1 text-slate-500">
          Acompanhamento mensal por Closer e SDR
        </p>

      </div>

      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">

        <div className="flex flex-wrap gap-3">

          <button
            type="button"
            onClick={() => {
              setViewMode('closer');
              setSearch('');
            }}
            className={`rounded-xl px-5 py-3 font-semibold transition ${
              viewMode === 'closer'
                ? 'bg-slate-900 text-white shadow'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            Performance por Closer
          </button>

          <button
            type="button"
            onClick={() => {
              setViewMode('sdr');
              setSearch('');
            }}
            className={`rounded-xl px-5 py-3 font-semibold transition ${
              viewMode === 'sdr'
                ? 'bg-slate-900 text-white shadow'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            Performance por SDR
          </button>

        </div>

        <div className="flex flex-col gap-3 sm:flex-row">

          <input
            type="month"
            value={selectedPeriod}
            onChange={(event) =>
              setSelectedPeriod(
                event.target.value
              )
            }
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-slate-300"
          />

          <input
            type="text"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Buscar responsável..."
            className="rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none focus:ring-2 focus:ring-slate-300"
          />

          <button
            type="button"
            onClick={loadPerformance}
            className="rounded-xl bg-slate-200 px-5 py-3 font-semibold text-slate-700 transition hover:bg-slate-300"
          >
            Atualizar
          </button>

        </div>

      </div>

      <div className="mb-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <h2 className="text-2xl font-bold text-slate-900">
          {viewMode === 'closer'
            ? 'Performance por Closer'
            : 'Performance por SDR'}
        </h2>

        <p className="mt-1 text-slate-500">
          Visão geral de desempenho, atividades, reuniões e acompanhamento das leads.
        </p>

      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">

        <SummaryCard
          title="Total de Leads"
          value={summary.totalLeads}
        />

        <SummaryCard
          title="Leads Abertas"
          value={summary.openLeads}
        />

        <SummaryCard
          title="Atividades"
          value={summary.activitiesCount}
        />

        <SummaryCard
          title="Paradas +5 dias"
          value={summary.staleOpenPending}
          danger={
            summary.staleOpenPending > 0
          }
        />

        <SummaryCard
          title="Reuniões"
          value={summary.meetingsCount}
        />

        <SummaryCard
          title="Conversão"
          value={formatPercent(
            generalConversion
          )}
        />

        <SummaryCard
          title="Leads Ganhas"
          value={summary.wonLeads}
        />

        <SummaryCard
          title={
            viewMode === 'closer'
              ? 'Receita'
              : 'Leads Perdidas'
          }
          value={
            viewMode === 'closer'
              ? formatBRL(
                  summary.totalRevenue
                )
              : summary.lostLeads
          }
        />

      </div>

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-2">

        <RankingPanel
          title="Total de Leads por Responsável"
          items={filteredPerformance}
          valueKey="totalLeads"
        />

        <RankingPanel
          title="Leads Paradas há Mais de 5 Dias"
          items={filteredPerformance}
          valueKey="staleOpenPending"
          danger
        />

        <RankingPanel
          title="Atividades por Responsável"
          items={filteredPerformance}
          valueKey="activitiesCount"
        />

        <RankingPanel
          title="Reuniões por Responsável"
          items={filteredPerformance}
          valueKey="meetingsCount"
        />

      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

        <div className="overflow-x-auto">

          <table className="w-full min-w-[760px] table-fixed">

            <thead className="bg-slate-100">

              <tr className="text-left text-sm text-slate-600">

                <th className="w-24 p-4">
                  Posição
                </th>

                <th className="w-72 p-4">
                  Responsável
                </th>

                <th className="p-4">
                  Total Leads
                </th>

                <th className="p-4">
                  Won
                </th>

                <th className="p-4">
                  Lost
                </th>

                <th className="p-4">
                  Open
                </th>

              </tr>

            </thead>

            <tbody>

              {loading && (
                <tr>
                  <td
                    colSpan="6"
                    className="p-12 text-center text-slate-500"
                  >
                    Carregando performance...
                  </td>
                </tr>
              )}

              {!loading &&
                sortedPerformance.length === 0 && (
                  <tr>
                    <td
                      colSpan="6"
                      className="p-12 text-center text-slate-500"
                    >
                      Nenhum resultado encontrado.
                    </td>
                  </tr>
                )}

              {!loading &&
                sortedPerformance.map(
                  (item, index) => (
                    <tr
                      key={`${item._id}-${index}`}
                      className="border-t border-slate-200 transition hover:bg-slate-50"
                    >

                      <td className="p-4">
                        <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 font-bold text-slate-700">
                          {index + 1}
                        </span>
                      </td>

                      <td
                        className="truncate p-4 font-semibold text-slate-900"
                        title={item._id}
                      >
                        {item._id ||
                          'Sem responsável'}
                      </td>

                      <td className="p-4 font-semibold text-slate-800">
                        {Number(
                          item.totalLeads || 0
                        )}
                      </td>

                      <td className="p-4 font-semibold text-green-700">
                        {Number(
                          item.wonLeads || 0
                        )}
                      </td>

                      <td className="p-4 font-semibold text-red-700">
                        {Number(
                          item.lostLeads || 0
                        )}
                      </td>

                      <td className="p-4 font-semibold text-blue-700">
                        {Number(
                          item.openLeads || 0
                        )}
                      </td>

                    </tr>
                  )
                )}

            </tbody>

          </table>

        </div>

      </div>

    </div>
  );
}

function SummaryCard({
  title,
  value,
  danger = false
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

      <p className="text-sm text-slate-500">
        {title}
      </p>

      <p
        className={`mt-2 truncate text-2xl font-bold ${
          danger
            ? 'text-red-700'
            : 'text-slate-900'
        }`}
        title={String(value)}
      >
        {value}
      </p>

    </div>
  );
}

function RankingPanel({
  title,
  items,
  valueKey,
  danger = false
}) {
  const sortedItems = useMemo(() => {
    return [...items].sort(
      (first, second) =>
        Number(second[valueKey] || 0) -
        Number(first[valueKey] || 0)
    );
  }, [items, valueKey]);

  const maximumValue = Math.max(
    ...sortedItems.map((item) =>
      Number(item[valueKey] || 0)
    ),
    1
  );

  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

      <h3 className="mb-5 text-lg font-bold text-slate-900">
        {title}
      </h3>

      {sortedItems.length === 0 ? (
        <p className="text-sm text-slate-500">
          Nenhum dado disponível.
        </p>
      ) : (
        <div className="space-y-4">

          {sortedItems.map((item) => {
            const value = Number(
              item[valueKey] || 0
            );

            const width = Math.max(
              (value / maximumValue) * 100,
              value > 0 ? 4 : 0
            );

            return (
              <div
                key={`${title}-${item._id}`}
                className="min-w-0"
              >

                <div className="mb-1 flex items-center justify-between gap-3">

                  <span
                    className="truncate text-sm font-semibold text-slate-700"
                    title={item._id}
                  >
                    {item._id}
                  </span>

                  <span
                    className={`shrink-0 text-sm font-bold ${
                      danger
                        ? 'text-red-700'
                        : 'text-slate-900'
                    }`}
                  >
                    {value}
                  </span>

                </div>

                <div className="h-2.5 overflow-hidden rounded-full bg-slate-100">

                  <div
                    className={`h-full rounded-full ${
                      danger
                        ? 'bg-red-400'
                        : 'bg-slate-700'
                    }`}
                    style={{
                      width: `${width}%`
                    }}
                  />

                </div>

              </div>
            );
          })}

        </div>
      )}

    </div>
  );
}

export default Performance;
