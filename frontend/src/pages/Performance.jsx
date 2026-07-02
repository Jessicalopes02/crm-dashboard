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

function Performance() {
  const [loading, setLoading] = useState(true);

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

  const formatBRL = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(Number(value || 0));
  };

  const formatPercent = (value) => {
    return `${Number(value || 0).toFixed(2)}%`;
  };

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
      (accumulator, item) => {
        accumulator.totalLeads += Number(
          item.totalLeads || 0
        );

        accumulator.wonLeads += Number(
          item.wonLeads || 0
        );

        accumulator.lostLeads += Number(
          item.lostLeads || 0
        );

        accumulator.openLeads += Number(
          item.openLeads || 0
        );

        accumulator.pendingLeads += Number(
          item.pendingLeads || 0
        );

        accumulator.activitiesCount += Number(
          item.activitiesCount || 0
        );

        accumulator.staleOpenPending += Number(
          item.staleOpenPending || 0
        );

        accumulator.totalRevenue += Number(
          item.totalRevenue || 0
        );

        return accumulator;
      },
      {
        totalLeads: 0,
        wonLeads: 0,
        lostLeads: 0,
        openLeads: 0,
        pendingLeads: 0,
        activitiesCount: 0,
        staleOpenPending: 0,
        totalRevenue: 0
      }
    );
  }, [filteredPerformance]);

  const title =
    viewMode === 'closer'
      ? 'Performance por Closer'
      : 'Performance por SDR';

  const description =
    viewMode === 'closer'
      ? 'Ranking mensal por receita, vendas, atividades e leads paradas.'
      : 'Ranking mensal por volume de leads, atividades e leads paradas.';

  return (
    <div className="p-8 bg-slate-50 min-h-screen">

      <div className="mb-6">

        <h1 className="text-4xl font-bold text-slate-900">
          Performance Comercial
        </h1>

        <p className="text-slate-500 mt-1">
          Acompanhamento mensal separado por Closer e SDR
        </p>

      </div>

      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 mb-6">

        <div className="flex flex-wrap gap-3">

          <button
            type="button"
            onClick={() => {
              setViewMode('closer');
              setSearch('');
            }}
            className={`px-6 py-3 rounded-xl font-semibold transition ${
              viewMode === 'closer'
                ? 'bg-slate-900 text-white shadow'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
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
            className={`px-6 py-3 rounded-xl font-semibold transition ${
              viewMode === 'sdr'
                ? 'bg-slate-900 text-white shadow'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
            }`}
          >
            Performance por SDR
          </button>

        </div>

        <div className="flex flex-wrap gap-3">

          <input
            type="month"
            value={selectedPeriod}
            onChange={(event) =>
              setSelectedPeriod(event.target.value)
            }
            className="px-4 py-3 rounded-xl border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-slate-300"
          />

          <input
            type="text"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Buscar responsável..."
            className="px-4 py-3 rounded-xl border border-slate-300 bg-white outline-none focus:ring-2 focus:ring-slate-300"
          />

          <button
            type="button"
            onClick={loadPerformance}
            className="px-5 py-3 rounded-xl bg-slate-200 text-slate-700 font-semibold hover:bg-slate-300"
          >
            Atualizar
          </button>

        </div>

      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">

        <h2 className="text-2xl font-bold text-slate-900">
          {title}
        </h2>

        <p className="text-slate-500 mt-1">
          {description}
        </p>

      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-8 gap-4 mb-6">

        <SummaryCard
          title="Total Leads"
          value={summary.totalLeads}
        />

        <SummaryCard
          title="Won"
          value={summary.wonLeads}
        />

        <SummaryCard
          title="Lost"
          value={summary.lostLeads}
        />

        <SummaryCard
          title="Open"
          value={summary.openLeads}
        />

        <SummaryCard
          title="Pending"
          value={summary.pendingLeads}
        />

        <SummaryCard
          title="Atividades"
          value={summary.activitiesCount}
        />

        <SummaryCard
          title="Paradas +5 dias"
          value={summary.staleOpenPending}
          danger={summary.staleOpenPending > 0}
        />

        <SummaryCard
          title="Receita"
          value={formatBRL(summary.totalRevenue)}
        />

      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">

        <table className="w-full min-w-[1450px]">

          <thead className="bg-slate-100">

            <tr className="text-left text-sm text-slate-600">

              <th className="p-4">
                Posição
              </th>

              <th className="p-4">
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

              <th className="p-4">
                Pending
              </th>

              <th className="p-4">
                Cancelado
              </th>

              <th className="p-4">
                Atividades
              </th>

              <th className="p-4">
                Paradas +5 dias
              </th>

              <th className="p-4">
                Receita
              </th>

              <th className="p-4">
                Ticket Médio
              </th>

              <th className="p-4">
                Conversão
              </th>

            </tr>

          </thead>

          <tbody>

            {loading && (
              <tr>
                <td
                  colSpan="13"
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
                    colSpan="13"
                    className="p-12 text-center text-slate-500"
                  >
                    Nenhum resultado encontrado para este mês.
                  </td>
                </tr>
              )}

            {!loading &&
              sortedPerformance.map(
                (item, index) => (
                  <tr
                    key={`${item._id}-${index}`}
                    className="border-t hover:bg-slate-50"
                  >

                    <td className="p-4">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 font-bold text-slate-700">
                        {index + 1}
                      </span>
                    </td>

                    <td className="p-4 font-semibold text-slate-900">
                      {item._id || 'Sem responsável'}
                    </td>

                    <td className="p-4">
                      {Number(item.totalLeads || 0)}
                    </td>

                    <td className="p-4 text-green-700 font-semibold">
                      {Number(item.wonLeads || 0)}
                    </td>

                    <td className="p-4 text-red-700 font-semibold">
                      {Number(item.lostLeads || 0)}
                    </td>

                    <td className="p-4 text-blue-700 font-semibold">
                      {Number(item.openLeads || 0)}
                    </td>

                    <td className="p-4 text-yellow-700 font-semibold">
                      {Number(item.pendingLeads || 0)}
                    </td>

                    <td className="p-4 text-slate-600 font-semibold">
                      {Number(item.canceledLeads || 0)}
                    </td>

                    <td className="p-4 font-semibold text-indigo-700">
                      {Number(item.activitiesCount || 0)}
                    </td>

                    <td className="p-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          Number(item.staleOpenPending || 0) > 0
                            ? 'bg-red-100 text-red-700'
                            : 'bg-green-100 text-green-700'
                        }`}
                      >
                        {Number(item.staleOpenPending || 0)}
                      </span>
                    </td>

                    <td className="p-4 font-semibold">
                      {formatBRL(item.totalRevenue)}
                    </td>

                    <td className="p-4">
                      {formatBRL(item.averageTicket)}
                    </td>

                    <td className="p-4">
                      <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold">
                        {formatPercent(item.conversionRate)}
                      </span>
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

function SummaryCard({
  title,
  value,
  danger = false
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">

      <p className="text-sm text-slate-500">
        {title}
      </p>

      <p
        className={`text-xl font-bold mt-2 break-words ${
          danger
            ? 'text-red-700'
            : 'text-slate-900'
        }`}
      >
        {value}
      </p>

    </div>
  );
}

export default Performance;
