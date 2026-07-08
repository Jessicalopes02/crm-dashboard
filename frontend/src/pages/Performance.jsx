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

function getTodayDate() {
  const today = new Date();

  return `${today.getFullYear()}-${String(
    today.getMonth() + 1
  ).padStart(2, '0')}-${String(
    today.getDate()
  ).padStart(2, '0')}`;
}

function subtractDays(dateString, days) {
  const date = new Date(
    `${dateString}T12:00:00`
  );

  date.setDate(
    date.getDate() -
      Math.max(Number(days || 1) - 1, 0)
  );

  return `${date.getFullYear()}-${String(
    date.getMonth() + 1
  ).padStart(2, '0')}-${String(
    date.getDate()
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

  const [syncing, setSyncing] =
    useState(false);

  const [syncMessage, setSyncMessage] =
    useState('');

  const [selectedPeriod, setSelectedPeriod] =
    useState(getCurrentPeriod());

  const [filterMode, setFilterMode] =
    useState('month');

  const [selectedDate, setSelectedDate] =
    useState(getTodayDate());

  const [startDate, setStartDate] =
    useState(getTodayDate());

  const [endDate, setEndDate] =
    useState(getTodayDate());

  const [daysCount, setDaysCount] =
    useState(7);

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

  const [sourcesModal, setSourcesModal] =
    useState(null);

  useEffect(() => {
    loadPerformance();
  }, [
    selectedPeriod,
    selectedDate,
    startDate,
    endDate,
    daysCount,
    filterMode
  ]);

  function getFilterParams() {
    if (filterMode === 'day') {
      return {
        startDate: selectedDate,
        endDate: selectedDate
      };
    }

    if (filterMode === 'range') {
      return {
        startDate,
        endDate
      };
    }

    if (filterMode === 'days') {
      return {
        startDate: subtractDays(
          endDate,
          daysCount
        ),
        endDate
      };
    }

    return {
      period: selectedPeriod
    };
  }

  function getCurrentFilterLabel() {
    if (filterMode === 'day') {
      return `Dia ${selectedDate}`;
    }

    if (filterMode === 'range') {
      return `${startDate} até ${endDate}`;
    }

    if (filterMode === 'days') {
      return `Últimos ${daysCount} dias até ${endDate}`;
    }

    return `Mês ${selectedPeriod}`;
  }

  async function loadPerformance() {
    try {
      setLoading(true);
      setErrorMessage('');

      const response = await api.get(
        '/dashboard/performance-by-assignee',
        {
          params: getFilterParams()
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

  async function syncPerformanceDatabase() {
  try {
    setSyncing(true);
    setSyncMessage(
      'Atualizando atividades do período...'
    );
    setErrorMessage('');

    const syncResponse = await api.get(
      '/sync/nutshell/activities-period',
      {
        params: getFilterParams()
      }
    );

    const syncPayload =
      syncResponse.data || {};

    setSyncMessage(
      `Banco atualizado com sucesso. ${
        syncPayload.activitiesSaved || 0
      } atividades sincronizadas.`
    );

    await loadPerformance();
  } catch (error) {
    console.error(
      'Erro ao atualizar atividades:',
      error
    );

    setSyncMessage('');

    setErrorMessage(
      error.response?.data?.erro ||
        error.response?.data?.error
          ?.message ||
        'Não foi possível atualizar as atividades.'
    );
  } finally {
    setSyncing(false);
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

        total.firstContactMeetings +=
          safeNumber(
            item.activityBreakdown
              ?.firstContactMeetings
          );

        total.followUpMeetings +=
          safeNumber(
            item.activityBreakdown
              ?.followUpMeetings
          );

        total.simulationProposal +=
          safeNumber(
            item.activityBreakdown
              ?.simulationProposal
          );

        total.standaloneProposal +=
          safeNumber(
            item.activityBreakdown
              ?.standaloneProposal
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
        firstContactMeetings: 0,
        followUpMeetings: 0,
        simulationProposal: 0,
        standaloneProposal: 0,
        other: 0
      }
    );
  }, [filteredPerformance]);

  const generalSourcesBreakdown =
    useMemo(() => {
      const sourceTotals = new Map();

      filteredPerformance.forEach((item) => {
        const sources = Array.isArray(
          item.sourcesBreakdown
        )
          ? item.sourcesBreakdown
          : [];

        sources.forEach((source) => {
          const sourceName =
            String(
              source?.name ||
                'Sem source'
            ).trim() ||
            'Sem source';

          sourceTotals.set(
            sourceName,
            safeNumber(
              sourceTotals.get(sourceName)
            ) +
              safeNumber(source?.total)
          );
        });
      });

      return Array.from(
        sourceTotals.entries()
      )
        .map(([name, total]) => ({
          name,
          total
        }))
        .sort(
          (first, second) =>
            second.total - first.total
        );
    }, [filteredPerformance]);

  const totalClosedDecisions =
  summary.wonLeads +
  summary.lostLeads;

const generalConversion =
  totalClosedDecisions > 0
    ? (
        summary.wonLeads /
        totalClosedDecisions
      ) * 100
    : 0;

  return (
    <div className="min-h-screen w-[calc(100vw-96px)] min-w-0 max-w-[calc(100vw-96px)] overflow-x-hidden bg-slate-950 p-4 text-slate-100 md:p-6 lg:p-8">

      <div className="mb-6 flex flex-col gap-5">

        <div>
          <h1 className="text-3xl font-bold text-white md:text-4xl">
            Performance Comercial
          </h1>

          <p className="mt-1 text-slate-400">
            Pipeline e atividades por responsável
          </p>

          <p className="mt-2 text-sm font-semibold text-blue-400">
            Filtro atual: {getCurrentFilterLabel()}
          </p>
        </div>

        <div className="flex w-full min-w-0 flex-col gap-3">

          <div className="flex flex-wrap gap-2">

            <FilterButton
              active={
                filterMode === 'day'
              }
              onClick={() =>
                setFilterMode('day')
              }
            >
              Dia
            </FilterButton>

            <FilterButton
              active={
                filterMode === 'days'
              }
              onClick={() =>
                setFilterMode('days')
              }
            >
              Últimos dias
            </FilterButton>

            <FilterButton
              active={
                filterMode === 'range'
              }
              onClick={() =>
                setFilterMode('range')
              }
            >
              Intervalo
            </FilterButton>

            <FilterButton
              active={
                filterMode === 'month'
              }
              onClick={() =>
                setFilterMode('month')
              }
            >
              Mês inteiro
            </FilterButton>

          </div>

<div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">

  {filterMode === 'month' && (
    <input
      type="month"
      value={selectedPeriod}
      onChange={(event) =>
        setSelectedPeriod(
          event.target.value
        )
      }
      className="min-w-[210px] rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
    />
  )}

  {filterMode === 'day' && (
    <input
      type="date"
      value={selectedDate}
      onChange={(event) =>
        setSelectedDate(
          event.target.value
        )
      }
      className="min-w-[210px] rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
    />
  )}

  {filterMode === 'days' && (
    <>
      <input
        type="number"
        min="1"
        max="365"
        value={daysCount}
        onChange={(event) =>
          setDaysCount(
            event.target.value
          )
        }
        placeholder="Quantidade de dias"
        className="min-w-[160px] rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
      />

      <input
        type="date"
        value={endDate}
        onChange={(event) =>
          setEndDate(
            event.target.value
          )
        }
        title="Data final"
        className="min-w-[210px] rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
      />
    </>
  )}

  {filterMode === 'range' && (
    <>
      <input
        type="date"
        value={startDate}
        onChange={(event) =>
          setStartDate(
            event.target.value
          )
        }
        className="min-w-[210px] rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
      />

      <input
        type="date"
        value={endDate}
        onChange={(event) =>
          setEndDate(
            event.target.value
          )
        }
        className="min-w-[210px] rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none focus:border-blue-500"
      />
    </>
  )}

  <input
  type="text"
  value={search}
  onChange={(event) =>
    setSearch(
      event.target.value
    )
  }
  placeholder="Buscar responsável..."
  className="w-full rounded-xl border border-slate-700 bg-slate-900 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-blue-500"
/>

  <button
  type="button"
  onClick={loadPerformance}
  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-5 py-3 font-semibold text-white transition hover:bg-slate-700"
>
  Consultar
</button>

  <button
  type="button"
  onClick={syncPerformanceDatabase}
  disabled={syncing}
  className="w-full rounded-xl bg-emerald-600 px-5 py-3 font-semibold text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
>
  {syncing
    ? 'Atualizando banco...'
    : 'Atualizar banco'}
</button>

</div>

          {syncMessage && (
            <p className="text-sm font-semibold text-emerald-400">
              {syncMessage}
            </p>
          )}

        </div>

      </div>

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 md:flex md:flex-wrap">

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

      <div className="mb-6 w-full min-w-0 max-w-full overflow-x-auto pb-2">
        <div className="grid min-w-[980px] grid-cols-8 gap-2">

        <SummaryCard
          title="Total de Leads"
          value={summary.totalLeads}
          clickable
          onClick={() =>
            setSourcesModal({
              title:
                viewMode === 'closer'
                  ? 'Sources das leads dos Closers'
                  : 'Sources das leads dos SDRs',
              total: summary.totalLeads,
              sources:
                generalSourcesBreakdown
            })
          }
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
     </div> 

      <div className="mb-6 w-full min-w-0 max-w-full overflow-x-auto pb-2">
        <div
          className={`grid gap-2 ${
            viewMode === 'closer'
              ? 'min-w-[1080px] grid-cols-10'
              : 'min-w-[780px] grid-cols-7'
          }`}
        >
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

        {viewMode === 'closer' ? (
          <>
            <ActivitySummaryCard
              title="Reuniões primeiro contato"
              value={
                summary.firstContactMeetings
              }
            />

            <ActivitySummaryCard
              title="Reuniões follow-up"
              value={
                summary.followUpMeetings
              }
            />

            <ActivitySummaryCard
              title="Propostas simulação"
              value={
                summary.simulationProposal
              }
            />

            <ActivitySummaryCard
              title="Propostas avulsas"
              value={
                summary.standaloneProposal
              }
            />
          </>
        ) : (
          <ActivitySummaryCard
            title="Reuniões"
            value={
              summary.meetingsCount
            }
          />
        )}

        <ActivitySummaryCard
          title="Outras"
          value={summary.other}
        />
      </div>
      </div>

      {loading && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-400">
          Carregando performance...
        </div>
      )}

      {!loading &&
        sortedPerformance.length === 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-400">
            Nenhum resultado encontrado.
          </div>
        )}

      {!loading &&
  sortedPerformance.length > 0 && (
    <>
      <div className="mb-6 grid w-full min-w-0 max-w-full grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">

        {sortedPerformance.map(
          (item, index) => (
            <PersonPerformanceCard
              key={`${item._id}-${index}`}
              item={item}
              position={index + 1}
              viewMode={viewMode}
              onOpenSources={() =>
                setSourcesModal({
                  title:
                    `Sources das leads — ${
                      item._id ||
                      'Sem responsável'
                    }`,
                  total: safeNumber(
                    item.totalLeads
                  ),
                  sources:
                    Array.isArray(
                      item.sourcesBreakdown
                    )
                      ? item.sourcesBreakdown
                      : []
                })
              }
            />
          )
        )}

      </div>

      <PerformanceTable
        items={sortedPerformance}
        viewMode={viewMode}
      />
    </>
  )}

      {sourcesModal && (
        <SourcesModal
          data={sourcesModal}
          onClose={() =>
            setSourcesModal(null)
          }
        />
      )}

    </div>
  );
}

function FilterButton({
  active,
  onClick,
  children
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
        active
          ? 'bg-blue-600 text-white'
          : 'border border-slate-700 bg-slate-900 text-slate-300 hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  );
}

function SummaryCard({
  title,
  value,
  accent = 'default',
  clickable = false,
  onClick = undefined
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
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      className={`min-h-[90px] min-w-0 rounded-xl border border-slate-800 bg-slate-900 p-3 text-left shadow-lg transition ${
        clickable
          ? 'cursor-pointer hover:border-blue-500 hover:bg-slate-800'
          : 'cursor-default'
      }`}
    >
      <p className="text-xs text-slate-400">
        {title}
      </p>

      <p
        className={`mt-1 truncate text-lg font-bold ${
          accentClasses[accent]
        }`}
        title={String(value)}
      >
        {value}
      </p>

      {clickable && (
        <p className="mt-2 text-xs font-semibold text-blue-400">
          Ver sources
        </p>
      )}
    </button>
  );
}

function ActivitySummaryCard({
  title,
  value
}) {
  return (
    <div className="min-h-[78px] rounded-xl border border-slate-800 bg-slate-900 p-3">

      <p className="min-h-[28px] text-[11px] leading-snug text-slate-400">
        {title}
      </p>

      <p className="mt-1 text-lg font-bold text-violet-300">
        {safeNumber(value)}
      </p>

    </div>
  );
}


function SourcesModal({
  data,
  onClose
}) {
  const sources = Array.isArray(
    data?.sources
  )
    ? data.sources
    : [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div className="max-h-[85vh] w-full max-w-xl overflow-hidden rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-800 p-5">
          <div>
            <h2 className="text-xl font-bold text-white">
              {data?.title ||
                'Sources das leads'}
            </h2>

            <p className="mt-1 text-sm text-slate-400">
              Total de leads: {safeNumber(
                data?.total
              )}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
          >
            Fechar
          </button>
        </div>

        <div className="max-h-[65vh] overflow-y-auto p-5">
          {sources.length === 0 ? (
            <div className="rounded-xl border border-slate-800 bg-slate-950 p-6 text-center text-slate-400">
              Nenhum source encontrado.
            </div>
          ) : (
            <div className="space-y-3">
              {sources.map(
                (source, index) => (
                  <div
                    key={`${source.name}-${index}`}
                    className="flex items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950 p-4"
                  >
                    <span className="text-sm font-semibold text-slate-200">
                      {source.name ||
                        'Sem source'}
                    </span>

                    <span className="rounded-full bg-blue-950 px-3 py-1 text-sm font-bold text-blue-300">
                      {safeNumber(
                        source.total
                      )}
                    </span>
                  </div>
                )
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}


function PersonPerformanceCard({
  item,
  position,
  viewMode,
  onOpenSources = undefined
}) {
  const breakdown =
    item.activityBreakdown || {};

  const totalActivities =
    safeNumber(item.activitiesCount);

  const activityItems =
    viewMode === 'closer'
      ? [
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
            label: 'Reunião primeiro contato',
            value: safeNumber(
              breakdown.firstContactMeetings
            )
          },
          {
            label: 'Reunião follow-up',
            value: safeNumber(
              breakdown.followUpMeetings
            )
          },
          {
            label: 'Proposta simulação',
            value: safeNumber(
              breakdown.simulationProposal
            )
          },
          {
            label: 'Proposta avulsa',
            value: safeNumber(
              breakdown.standaloneProposal
            )
          },
          {
            label: 'Outras',
            value: safeNumber(
              breakdown.other
            )
          }
        ]
      : [
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
    <div className="w-full min-w-0 overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-3 shadow-lg">

      <div className="mb-4 flex items-start justify-between gap-3">

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

        <div className="shrink-0 rounded-xl border border-violet-900 bg-violet-950/40 px-3 py-2 text-right">

          <p className="text-xs text-violet-300">
            Atividades
          </p>

          <p className="text-lg font-bold text-violet-200">
            {totalActivities}
          </p>

        </div>

      </div>

      <div className="mb-4 grid w-full min-w-0 grid-cols-4 gap-2">

        <Metric
          label="Total Leads"
          value={item.totalLeads}
          clickable
          onClick={onOpenSources}
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

      <div className="grid w-full min-w-0 grid-cols-4 gap-1.5 2xl:grid-cols-5">

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
  accent = 'default',
  clickable = false,
  onClick = undefined
}) {
  const accentClasses = {
    default: 'text-white',
    blue: 'text-blue-400',
    green: 'text-emerald-400',
    red: 'text-red-400',
    amber: 'text-amber-400'
  };

  return (
    <button
      type="button"
      onClick={clickable ? onClick : undefined}
      className={`min-h-[62px] min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-950 p-1.5 text-left transition ${
        clickable
          ? 'cursor-pointer hover:border-blue-500 hover:bg-slate-900'
          : 'cursor-default'
      }`}
    >
      <p className="min-w-0 truncate text-[9px] leading-tight text-slate-500">
        {label}
      </p>

      <p
        className={`mt-0.5 min-w-0 truncate text-sm font-bold ${
          accentClasses[accent]
        }`}
        title={String(value)}
      >
        {value}
      </p>

      {clickable && (
        <p className="mt-1 text-[10px] font-semibold text-blue-400">
          Ver sources
        </p>
      )}
    </button>
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
    <div className="min-h-[62px] min-w-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-950 p-1.5">

      <div className="mb-1 flex items-start justify-between gap-1">

        <p
          className="min-w-0 truncate text-[9px] leading-tight text-slate-400"
          title={label}
        >
          {label}
        </p>

        <span className="shrink-0 text-[10px] font-bold text-violet-300">
          {safeNumber(value)}
        </span>

      </div>

      <div className="h-1 overflow-hidden rounded-full bg-slate-800">

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
        <table className="w-full min-w-[1400px]">
          <thead className="bg-slate-800">
            <tr className="text-left text-xs text-slate-300">
              <th className="px-3 py-4 text-center">#</th>
              <th className="px-3 py-4">Responsável</th>
              <th className="px-3 py-4 text-center">Leads</th>
              <th className="px-3 py-4 text-center">Open</th>
              <th className="px-3 py-4 text-center">Won</th>
              <th className="px-3 py-4 text-center">Lost</th>
              <th className="px-3 py-4 text-center">Atividades</th>
              <th className="px-3 py-4 text-center">Efetivas</th>
              <th className="px-3 py-4 text-center">Não efetivas</th>
              <th className="px-3 py-4 text-center">WhatsApp diálogo</th>
              <th className="px-3 py-4 text-center">WhatsApp pontual</th>
              <th className="px-3 py-4 text-center">E-mails</th>

              {viewMode === 'closer' ? (
                <>
                  <th className="px-3 py-4 text-center">Reunião 1º contato</th>
                  <th className="px-3 py-4 text-center">Reunião follow-up</th>
                  <th className="px-3 py-4 text-center">Proposta simulação</th>
                  <th className="px-3 py-4 text-center">Proposta avulsa</th>
                </>
              ) : (
                <th className="px-3 py-4 text-center">Reuniões</th>
              )}

              <th className="px-3 py-4 text-center">Outras</th>

              {viewMode === 'closer' && (
                <th className="px-3 py-4 text-right">Receita</th>
              )}
            </tr>
          </thead>

          <tbody>
            {items.map((item, index) => {
              const breakdown =
                item.activityBreakdown || {};

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
                    {safeNumber(item.totalLeads)}
                  </td>

                  <td className="px-3 py-4 text-center font-semibold text-blue-400">
                    {safeNumber(item.openLeads)}
                  </td>

                  <td className="px-3 py-4 text-center font-semibold text-emerald-400">
                    {safeNumber(item.wonLeads)}
                  </td>

                  <td className="px-3 py-4 text-center font-semibold text-red-400">
                    {safeNumber(item.lostLeads)}
                  </td>

                  <td className="px-3 py-4 text-center font-bold text-violet-300">
                    {safeNumber(item.activitiesCount)}
                  </td>

                  <td className="px-3 py-4 text-center">
                    {safeNumber(breakdown.effectiveCall)}
                  </td>

                  <td className="px-3 py-4 text-center">
                    {safeNumber(breakdown.nonEffectiveCall)}
                  </td>

                  <td className="px-3 py-4 text-center">
                    {safeNumber(breakdown.whatsappDialogue)}
                  </td>

                  <td className="px-3 py-4 text-center">
                    {safeNumber(breakdown.whatsappMessage)}
                  </td>

                  <td className="px-3 py-4 text-center">
                    {safeNumber(breakdown.prospectingEmail)}
                  </td>

                  {viewMode === 'closer' ? (
                    <>
                      <td className="px-3 py-4 text-center text-amber-300">
                        {safeNumber(breakdown.firstContactMeetings)}
                      </td>

                      <td className="px-3 py-4 text-center text-amber-300">
                        {safeNumber(breakdown.followUpMeetings)}
                      </td>

                      <td className="px-3 py-4 text-center text-cyan-300">
                        {safeNumber(breakdown.simulationProposal)}
                      </td>

                      <td className="px-3 py-4 text-center text-cyan-300">
                        {safeNumber(breakdown.standaloneProposal)}
                      </td>
                    </>
                  ) : (
                    <td className="px-3 py-4 text-center text-amber-300">
                      {safeNumber(breakdown.meetings)}
                    </td>
                  )}

                  <td className="px-3 py-4 text-center">
                    {safeNumber(breakdown.other)}
                  </td>

                  {viewMode === 'closer' && (
                    <td className="whitespace-nowrap px-3 py-4 text-right font-semibold text-emerald-300">
                      {formatBRL(item.totalRevenue)}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default Performance;
