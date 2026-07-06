import {
  useEffect,
  useMemo,
  useState
} from 'react';

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

function safeNumber(value) {
  const number = Number(value);

  return Number.isFinite(number)
    ? number
    : 0;
}

function formatBRL(value) {
  return new Intl.NumberFormat(
    'pt-BR',
    {
      style: 'currency',
      currency: 'BRL'
    }
  ).format(safeNumber(value));
}

function formatPercent(value) {
  return `${safeNumber(value).toFixed(1)}%`;
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

  const [errorMessage, setErrorMessage] =
    useState('');

  useEffect(() => {
    loadPerformance();
  }, [selectedPeriod]);

  async function loadPerformance() {
    try {
      setLoading(true);
      setErrorMessage('');

      const response = await api.get(
        '/dashboard/performance-by-assignee',
        {
          params: {
            period: selectedPeriod
          }
        }
      );

      const payload =
        response.data || {};

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

      setErrorMessage(
        error.response?.data?.erro ||
          'Não foi possível carregar os dados.'
      );
    } finally {
      setLoading(false);
    }
  }

  const currentPerformance =
    viewMode === 'closer'
      ? closers
      : sdrs;

  const filteredPerformance =
    useMemo(() => {
      const normalizedSearch =
        normalizeName(search);

      if (!normalizedSearch) {
        return currentPerformance;
      }

      return currentPerformance.filter(
        (item) =>
          normalizeName(
            item._id
          ).includes(normalizedSearch)
      );
    }, [
      currentPerformance,
      search
    ]);

  const sortedPerformance =
    useMemo(() => {
      return [...filteredPerformance].sort(
        (first, second) =>
          safeNumber(
            second.activitiesCount
          ) -
          safeNumber(
            first.activitiesCount
          )
      );
    }, [filteredPerformance]);

  const summary = useMemo(() => {
    return filteredPerformance.reduce(
      (total, item) => {
        total.totalLeads += safeNumber(
          item.totalLeads
        );

        total.wonLeads += safeNumber(
          item.wonLeads
        );

        total.lostLeads += safeNumber(
          item.lostLeads
        );

        total.openLeads += safeNumber(
          item.openLeads
        );

        total.activitiesCount +=
          safeNumber(
            item.activitiesCount
          );

        total.meetingsCount +=
          safeNumber(
            item.meetingsCount
          );

        total.staleOpenPending +=
          safeNumber(
            item.staleOpenPending
          );

        total.totalRevenue +=
          safeNumber(
            item.totalRevenue
          );

        total.effectiveCall +=
          safeNumber(
            item.activityBreakdown
              ?.effectiveCall
          );

        total.nonEffectiveCall +=
          safeNumber(
            item.activityBreakdown
              ?.nonEffectiveCall
          );

        total.whatsappDialogue +=
          safeNumber(
            item.activityBreakdown
              ?.whatsappDialogue
          );

        total.whatsappMessage +=
          safeNumber(
            item.activityBreakdown
              ?.whatsappMessage
          );

        total.prospectingEmail +=
          safeNumber(
            item.activityBreakdown
              ?.prospectingEmail
          );

        total.other += safeNumber(
          item.activityBreakdown?.other
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
        totalRevenue: 0,
        effectiveCall: 0,
        nonEffectiveCall: 0,
        whatsappDialogue: 0,
        whatsappMessage: 0,
        prospectingEmail: 0,
        other: 0
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
    <div className="min-h-screen overflow-x-hidden bg-slate-950 p-4 text-slate-100 md:p-6 lg:p-8">

      <div className="mb-6 flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">

        <div>
          <h1 className="text-3xl font-bold text-white md:text-4xl">
            Performance Comercial
          </h1>

          <p className="mt-1 text-slate-400">
            Pipeline e atividades por responsável
          </p>
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
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
          />

          <input
            type="text"
            value={search}
            onChange={(event) =>
              setSearch(
                event.target.value
              )
            }
            placeholder="Buscar responsável..."
            className="rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
          />

          <button
            type="button"
            onClick={loadPerformance}
            className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white transition hover:bg-blue-500"
          >
            Atualizar
          </button>

        </div>

      </div>

      <div className="mb-6 flex flex-wrap gap-3">

        <button
          type="button"
          onClick={() => {
            setViewMode('closer');
            setSearch('');
          }}
          className={`rounded-xl px-5 py-3 font-semibold transition ${
            viewMode === 'closer'
              ? 'bg-blue-600 text-white shadow-lg shadow-blue-950'
              : 'border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
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
              ? 'bg-violet-600 text-white shadow-lg shadow-violet-950'
              : 'border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
          }`}
        >
          Performance por SDR
        </button>

      </div>

      {errorMessage && (
        <div className="mb-6 rounded-xl border border-red-900 bg-red-950/40 p-4 text-red-300">
          {errorMessage}
        </div>
      )}

      <div className="mb-6 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-lg">

        <h2 className="text-2xl font-bold text-white">
          {viewMode === 'closer'
            ? 'Módulo Closer'
            : 'Módulo SDR'}
        </h2>

        <p className="mt-1 text-slate-400">
          {viewMode === 'closer'
            ? 'Pipeline por assignee atual e atividades realizadas pelo closer.'
            : 'Pipeline dos SDRs e atividades realizadas por cada responsável.'}
        </p>

      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-8">

        <SummaryCard
          title="Total de Leads"
          value={summary.totalLeads}
        />

        <SummaryCard
          title="Open"
          value={summary.openLeads}
          accent="blue"
        />

        <SummaryCard
          title="Won"
          value={summary.wonLeads}
          accent="green"
        />

        <SummaryCard
          title="Lost"
          value={summary.lostLeads}
          accent="red"
        />

        <SummaryCard
          title="Atividades"
          value={
            summary.activitiesCount
          }
          accent="violet"
        />

        <SummaryCard
          title="Reuniões"
          value={
            summary.meetingsCount
          }
          accent="amber"
        />

        <SummaryCard
          title="Conversão"
          value={formatPercent(
            generalConversion
          )}
        />

        <SummaryCard
          title={
            viewMode === 'closer'
              ? 'Receita Won'
              : 'Paradas +5 dias'
          }
          value={
            viewMode === 'closer'
              ? formatBRL(
                  summary.totalRevenue
                )
              : summary.staleOpenPending
          }
          accent={
            viewMode === 'closer'
              ? 'green'
              : 'red'
          }
        />

      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4 xl:grid-cols-7">

        <ActivitySummaryCard
          title="Ligações efetivas"
          value={summary.effectiveCall}
        />

        <ActivitySummaryCard
          title="Ligações não efetivas"
          value={
            summary.nonEffectiveCall
          }
        />

        <ActivitySummaryCard
          title="WhatsApp com diálogo"
          value={
            summary.whatsappDialogue
          }
        />

        <ActivitySummaryCard
          title="WhatsApp pontual"
          value={
            summary.whatsappMessage
          }
        />

        <ActivitySummaryCard
          title="E-mails de prospecção"
          value={
            summary.prospectingEmail
          }
        />

        <ActivitySummaryCard
          title="Reuniões"
          value={
            summary.meetingsCount
          }
        />

        <ActivitySummaryCard
          title="Outras"
          value={summary.other}
        />

      </div>

      <div className="mb-6 grid grid-cols-1 gap-5 xl:grid-cols-2">

        {sortedPerformance.map(
          (item, index) => (
            <PersonPerformanceCard
              key={`${item._id}-${index}`}
              item={item}
              position={index + 1}
              viewMode={viewMode}
            />
          )
        )}

      </div>

      {!loading &&
        sortedPerformance.length === 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-400">
            Nenhum resultado encontrado.
          </div>
        )}

      {loading && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-400">
          Carregando performance...
        </div>
      )}

      {!loading &&
        sortedPerformance.length > 0 && (
          <PerformanceTable
            items={sortedPerformance}
            viewMode={viewMode}
          />
        )}

    </div>
  );
}

function SummaryCard({
  title,
  value,
  accent = 'default'
}) {
  const accentClasses = {
    default: 'text-white',
    blue: 'text-blue-400',
    green: 'text-emerald-400',
    red: 'text-red-400',
    violet: 'text-violet-400',
    amber: 'text-amber-400'
  };

  return (
    <div className="min-w-0 rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-lg">

      <p className="text-xs text-slate-400">
        {title}
      </p>

      <p
        className={`mt-2 truncate text-2xl font-bold ${
          accentClasses[accent]
        }`}
        title={String(value)}
      >
        {value}
      </p>

    </div>
  );
}

function ActivitySummaryCard({
  title,
  value
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900 p-4">

      <p className="text-xs text-slate-400">
        {title}
      </p>

      <p className="mt-1 text-xl font-bold text-violet-300">
        {safeNumber(value)}
      </p>

    </div>
  );
}

function PersonPerformanceCard({
  item,
  position,
  viewMode
}) {
  const breakdown =
    item.activityBreakdown || {};

  const totalActivities =
    safeNumber(item.activitiesCount);

  const activityItems = [
    {
      label: 'Ligação efetiva',
      value: safeNumber(
        breakdown.effectiveCall
      )
    },
    {
      label: 'Ligação não efetiva',
      value: safeNumber(
        breakdown.nonEffectiveCall
      )
    },
    {
      label: 'WhatsApp com diálogo',
      value: safeNumber(
        breakdown.whatsappDialogue
      )
    },
    {
      label: 'WhatsApp pontual',
      value: safeNumber(
        breakdown.whatsappMessage
      )
    },
    {
      label: 'E-mail de prospecção',
      value: safeNumber(
        breakdown.prospectingEmail
      )
    },
    {
      label: 'Reuniões',
      value: safeNumber(
        breakdown.meetings
      )
    },
    {
      label: 'Outras',
      value: safeNumber(
        breakdown.other
      )
    }
  ];

  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-lg">

      <div className="mb-5 flex items-start justify-between gap-4">

        <div className="min-w-0">

          <div className="flex items-center gap-3">

            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-800 font-bold text-slate-200">
              {position}
            </span>

            <div className="min-w-0">

              <h3
                className="truncate text-lg font-bold text-white"
                title={item._id}
              >
                {item._id ||
                  'Sem responsável'}
              </h3>

              <p className="text-xs text-slate-400">
                {viewMode === 'closer'
                  ? 'Closer'
                  : 'SDR'}
              </p>

            </div>

          </div>

        </div>

        <div className="rounded-xl border border-violet-900 bg-violet-950/40 px-4 py-2 text-right">

          <p className="text-xs text-violet-300">
            Atividades
          </p>

          <p className="text-xl font-bold text-violet-200">
            {totalActivities}
          </p>

        </div>

      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">

        <Metric
          label="Total Leads"
          value={item.totalLeads}
        />

        <Metric
          label="Open"
          value={item.openLeads}
          accent="blue"
        />

        <Metric
          label="Won"
          value={item.wonLeads}
          accent="green"
        />

        <Metric
          label="Lost"
          value={item.lostLeads}
          accent="red"
        />

        <Metric
          label="Conversão"
          value={formatPercent(
            item.conversionRate
          )}
        />

        <Metric
          label="Paradas +5 dias"
          value={
            item.staleOpenPending
          }
          accent="red"
        />

        <Metric
          label="Reuniões"
          value={
            item.meetingsCount
          }
          accent="amber"
        />

        {viewMode === 'closer' && (
          <Metric
            label="Receita Won"
            value={formatBRL(
              item.totalRevenue
            )}
            accent="green"
          />
        )}

      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">

        {activityItems.map(
          (activity) => (
            <ActivityMetric
              key={activity.label}
              label={activity.label}
              value={activity.value}
              total={totalActivities}
            />
          )
        )}

      </div>

    </div>
  );
}

function Metric({
  label,
  value,
  accent = 'default'
}) {
  const accentClasses = {
    default: 'text-white',
    blue: 'text-blue-400',
    green: 'text-emerald-400',
    red: 'text-red-400',
    amber: 'text-amber-400'
  };

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">

      <p className="text-xs text-slate-500">
        {label}
      </p>

      <p
        className={`mt-1 truncate text-lg font-bold ${
          accentClasses[accent]
        }`}
        title={String(value)}
      >
        {value}
      </p>

    </div>
  );
}

function ActivityMetric({
  label,
  value,
  total
}) {
  const percentage =
    total > 0
      ? Math.min(
          (safeNumber(value) /
            total) *
            100,
          100
        )
      : 0;

  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950 p-3">

      <div className="mb-2 flex items-center justify-between gap-3">

        <p className="truncate text-xs text-slate-400">
          {label}
        </p>

        <span className="text-sm font-bold text-violet-300">
          {safeNumber(value)}
        </span>

      </div>

      <div className="h-2 overflow-hidden rounded-full bg-slate-800">

        <div
          className="h-full rounded-full bg-violet-500"
          style={{
            width: `${percentage}%`
          }}
        />

      </div>

    </div>
  );
}

function PerformanceTable({
  items,
  viewMode
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-lg">

      <div className="border-b border-slate-800 p-5">

        <h2 className="text-xl font-bold text-white">
          Ranking completo
        </h2>

        <p className="mt-1 text-sm text-slate-400">
          Ordenado pelo total de atividades
        </p>

      </div>

      <div className="overflow-x-auto">

        <table className="w-full min-w-[1200px]">

          <thead className="bg-slate-800">

            <tr className="text-left text-xs text-slate-300">

              <th className="px-3 py-4 text-center">
                #
              </th>

              <th className="px-3 py-4">
                Responsável
              </th>

              <th className="px-3 py-4 text-center">
                Leads
              </th>

              <th className="px-3 py-4 text-center">
                Open
              </th>

              <th className="px-3 py-4 text-center">
                Won
              </th>

              <th className="px-3 py-4 text-center">
                Lost
              </th>

              <th className="px-3 py-4 text-center">
                Atividades
              </th>

              <th className="px-3 py-4 text-center">
                Efetivas
              </th>

              <th className="px-3 py-4 text-center">
                Não efetivas
              </th>

              <th className="px-3 py-4 text-center">
                WhatsApp diálogo
              </th>

              <th className="px-3 py-4 text-center">
                WhatsApp pontual
              </th>

              <th className="px-3 py-4 text-center">
                E-mails
              </th>

              <th className="px-3 py-4 text-center">
                Reuniões
              </th>

              <th className="px-3 py-4 text-center">
                Outras
              </th>

              {viewMode === 'closer' && (
                <th className="px-3 py-4 text-right">
                  Receita
                </th>
              )}

            </tr>

          </thead>

          <tbody>

            {items.map(
              (item, index) => {
                const breakdown =
                  item.activityBreakdown ||
                  {};

                return (
                  <tr
                    key={`${item._id}-${index}`}
                    className="border-t border-slate-800 text-sm text-slate-200 transition hover:bg-slate-800/60"
                  >

                    <td className="px-3 py-4 text-center font-bold text-slate-400">
                      {index + 1}
                    </td>

                    <td className="whitespace-nowrap px-3 py-4 font-semibold text-white">
                      {item._id}
                    </td>

                    <td className="px-3 py-4 text-center">
                      {safeNumber(
                        item.totalLeads
                      )}
                    </td>

                    <td className="px-3 py-4 text-center font-semibold text-blue-400">
                      {safeNumber(
                        item.openLeads
                      )}
                    </td>

                    <td className="px-3 py-4 text-center font-semibold text-emerald-400">
                      {safeNumber(
                        item.wonLeads
                      )}
                    </td>

                    <td className="px-3 py-4 text-center font-semibold text-red-400">
                      {safeNumber(
                        item.lostLeads
                      )}
                    </td>

                    <td className="px-3 py-4 text-center font-bold text-violet-300">
                      {safeNumber(
                        item.activitiesCount
                      )}
                    </td>

                    <td className="px-3 py-4 text-center">
                      {safeNumber(
                        breakdown.effectiveCall
                      )}
                    </td>

                    <td className="px-3 py-4 text-center">
                      {safeNumber(
                        breakdown.nonEffectiveCall
                      )}
                    </td>

                    <td className="px-3 py-4 text-center">
                      {safeNumber(
                        breakdown.whatsappDialogue
                      )}
                    </td>

                    <td className="px-3 py-4 text-center">
                      {safeNumber(
                        breakdown.whatsappMessage
                      )}
                    </td>

                    <td className="px-3 py-4 text-center">
                      {safeNumber(
                        breakdown.prospectingEmail
                      )}
                    </td>

                    <td className="px-3 py-4 text-center text-amber-300">
                      {safeNumber(
                        breakdown.meetings
                      )}
                    </td>

                    <td className="px-3 py-4 text-center">
                      {safeNumber(
                        breakdown.other
                      )}
                    </td>

                    {viewMode ===
                      'closer' && (
                      <td className="whitespace-nowrap px-3 py-4 text-right font-semibold text-emerald-300">
                        {formatBRL(
                          item.totalRevenue
                        )}
                      </td>
                    )}

                  </tr>
                );
              }
            )}

          </tbody>

        </table>

      </div>

    </div>
  );
}

export default Performance;
