import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import api from '../../services/api';

function TVSdrPage() {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('month');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();

    const interval = setInterval(() => {
      loadData();
    }, 60000);

    return () => clearInterval(interval);
  }, [period]);

  function formatDateForApi(date) {
    const year = date.getFullYear();

    const month = String(
      date.getMonth() + 1
    ).padStart(2, '0');

    const day = String(
      date.getDate()
    ).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  function getDateRange() {
    const now = new Date();

    let startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      0,
      0,
      0
    );

    let endDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate(),
      23,
      59,
      59
    );

    if (period === 'week') {
      const firstDay = new Date(now);

      firstDay.setDate(
        now.getDate() - now.getDay()
      );

      startDate = new Date(
        firstDay.getFullYear(),
        firstDay.getMonth(),
        firstDay.getDate(),
        0,
        0,
        0
      );
    }

    if (period === 'month') {
      startDate = new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
        0,
        0,
        0
      );
    }

    if (period === 'quarter') {
      const quarterStartMonth =
        Math.floor(now.getMonth() / 3) * 3;

      startDate = new Date(
        now.getFullYear(),
        quarterStartMonth,
        1,
        0,
        0,
        0
      );
    }

    return {
      startDate,
      endDate
    };
  }

  async function loadData() {
    try {
      setLoading(true);

      const {
        startDate,
        endDate
      } = getDateRange();

      const response = await api.get(
        '/dashboard/performance-by-assignee',
        {
          params: {
            startDate:
              formatDateForApi(startDate),

            endDate:
              formatDateForApi(endDate)
          }
        }
      );

      const sdrs =
        response.data?.sdrs || [];

      const totals =
        buildSdrTotals(sdrs);

      const activityTotals =
        buildActivityTotals(sdrs);

      const sources =
        buildSources(sdrs);

      const funnel =
        buildFunnel(totals);

      setData({
        raw: response.data,
        sdrs,
        totals,
        activityTotals,
        sources,
        funnel,
        range: {
          startDate,
          endDate
        }
      });
    } catch (error) {
      console.error(
        'Erro ao carregar TV SDR:',
        error
      );

      setData({
        sdrs: [],
        totals: buildSdrTotals([]),
        activityTotals:
          buildActivityTotals([]),
        sources: [],
        funnel: [],
        range: null
      });
    } finally {
      setLoading(false);
    }
  }

  function buildSdrTotals(sdrs) {
    return sdrs.reduce(
      (acc, user) => {
        acc.totalLeads += Number(
          user.totalLeads || 0
        );

        acc.openLeads += Number(
          user.openLeads || 0
        );

        acc.pendingLeads += Number(
          user.pendingLeads || 0
        );

        acc.wonLeads += Number(
          user.wonLeads || 0
        );

        acc.lostLeads += Number(
          user.lostLeads || 0
        );

        acc.canceledLeads += Number(
          user.canceledLeads || 0
        );

        acc.activitiesCount += Number(
          user.activitiesCount || 0
        );

        acc.meetingsCount += Number(
          user.meetingsCount || 0
        );

        acc.noShow += Number(
          user.activityBreakdown?.noShow || 0
        );

        acc.staleOpenPending += Number(
          user.staleOpenPending || 0
        );

        return acc;
      },
      {
        totalLeads: 0,
        openLeads: 0,
        pendingLeads: 0,
        wonLeads: 0,
        lostLeads: 0,
        canceledLeads: 0,
        activitiesCount: 0,
        meetingsCount: 0,
        noShow: 0,
        staleOpenPending: 0
      }
    );
  }

  function buildActivityTotals(sdrs) {
    return sdrs.reduce(
      (acc, user) => {
        const breakdown =
          user.activityBreakdown || {};

        acc.effectiveCall += Number(
          breakdown.effectiveCall || 0
        );

        acc.nonEffectiveCall += Number(
          breakdown.nonEffectiveCall || 0
        );

        acc.whatsappDialogue += Number(
          breakdown.whatsappDialogue || 0
        );

        acc.whatsappMessage += Number(
          breakdown.whatsappMessage || 0
        );

        acc.prospectingEmail += Number(
          breakdown.prospectingEmail || 0
        );

        acc.meetings += Number(
          breakdown.meetings || 0
        );

        acc.firstContactMeetings += Number(
          breakdown.firstContactMeetings || 0
        );

        acc.followUpMeetings += Number(
          breakdown.followUpMeetings || 0
        );

        acc.noShow += Number(
          breakdown.noShow || 0
        );

        acc.other += Number(
          breakdown.other || 0
        );

        return acc;
      },
      {
        effectiveCall: 0,
        nonEffectiveCall: 0,
        whatsappDialogue: 0,
        whatsappMessage: 0,
        prospectingEmail: 0,
        meetings: 0,
        firstContactMeetings: 0,
        followUpMeetings: 0,
        noShow: 0,
        other: 0
      }
    );
  }

  function buildSources(sdrs) {
    const map = new Map();

    sdrs.forEach((user) => {
      const sources =
        user.sourcesBreakdown || [];

      sources.forEach((source) => {
        const name =
          source.name ||
          'Sem source';

        const current =
          map.get(name) || {
            name,
            total: 0
          };

        current.total += Number(
          source.total || 0
        );

        map.set(name, current);
      });
    });

    return Array.from(map.values())
      .sort(
        (a, b) =>
          Number(b.total || 0) -
          Number(a.total || 0)
      )
      .slice(0, 6);
  }

  function buildFunnel(totals) {
    return [
      {
        label: 'Recebidas',
        total: totals.totalLeads
      },
      {
        label: 'Open',
        total: totals.openLeads
      },
      {
        label: 'Pending',
        total: totals.pendingLeads
      },
      {
        label: 'Lost',
        total: totals.lostLeads
      },
      {
        label: 'Canceladas',
        total: totals.canceledLeads
      }
    ];
  }

  function formatNumber(value) {
    return new Intl.NumberFormat(
      'pt-BR'
    ).format(Number(value || 0));
  }

  function formatPeriodLabel() {
    const labels = {
      day: 'Hoje',
      week: 'Semana',
      month: 'Mês Atual',
      quarter: 'Trimestre'
    };

    return labels[period] || 'Período';
  }

  const rankedSdrs = useMemo(() => {
    return [...(data?.sdrs || [])].sort(
      (a, b) => {
        const scoreA =
          Number(a.totalLeads || 0) * 2 +
          Number(a.activitiesCount || 0) +
          Number(a.meetingsCount || 0) * 3;

        const scoreB =
          Number(b.totalLeads || 0) * 2 +
          Number(b.activitiesCount || 0) +
          Number(b.meetingsCount || 0) * 3;

        return scoreB - scoreA;
      }
    );
  }, [data]);

  if (!data || loading) {
    return (
      <div className="h-screen bg-slate-950 text-white flex items-center justify-center text-3xl font-bold">
        Carregando TV SDR...
      </div>
    );
  }

  const totals = data.totals;
  const activities = data.activityTotals;

  const activePipeline =
    totals.openLeads +
    totals.pendingLeads;

  const activityPerLead =
    totals.totalLeads > 0
      ? totals.activitiesCount /
        totals.totalLeads
      : 0;

  return (
    <div className="h-screen text-white p-3 overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950">
      <header className="flex items-center justify-between mb-2 bg-white/5 border border-white/10 rounded-2xl px-4 py-2 shadow-2xl backdrop-blur">
        <div>
          <h1 className="text-3xl font-black tracking-tight">
            ProcessLog&Comex - SDR
          </h1>

          <p className="text-slate-400 text-sm mt-1">
            Performance de recebimento, atendimento e atividades comerciais
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {[
              {
                key: 'day',
                label: 'Hoje'
              },
              {
                key: 'week',
                label: 'Semana'
              },
              {
                key: 'month',
                label: 'Mês Atual'
              },
              {
                key: 'quarter',
                label: 'Trimestre'
              }
            ].map((item) => (
              <button
                key={item.key}
                onClick={() =>
                  setPeriod(item.key)
                }
                className={`px-4 py-2 rounded-2xl font-bold transition text-sm ${
                  period === item.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="text-right ml-4">
            <div className="text-xs text-slate-400">
              {formatPeriodLabel()}
            </div>

            <div className="text-base font-bold text-blue-400">
              Atualiza a cada 60s
            </div>

            <div className="flex items-center justify-end gap-2 mt-1 text-green-400 text-xs font-bold">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              AO VIVO
            </div>
          </div>
        </div>
      </header>

      <section className="grid grid-cols-5 gap-3 mb-3">
        <BigKpi
          title="Leads Recebidas"
          value={formatNumber(
            totals.totalLeads
          )}
          subtitle="Criadas no período"
        />

        <BigKpi
          title="Em Atendimento"
          value={formatNumber(
            activePipeline
          )}
          subtitle="Open + Pending"
        />

        <BigKpi
          title="Atividades"
          value={formatNumber(
            totals.activitiesCount
          )}
          subtitle="Executadas no período"
        />

        <BigKpi
          title="Reuniões"
          value={formatNumber(
            totals.meetingsCount
          )}
          subtitle="Registradas"
        />

        <BigKpi
          title="No Show"
          value={formatNumber(
            totals.noShow
          )}
          subtitle="Ausências registradas"
          danger={totals.noShow > 0}
        />
      </section>

      <section className="grid grid-cols-12 grid-rows-2 gap-3 h-[calc(100vh-178px)]">
        <Card
          title="Ranking SDRs"
          className="col-span-6 row-span-2"
        >
          <SdrRanking
            users={rankedSdrs}
            formatNumber={formatNumber}
          />
        </Card>

        <Card
          title="Funil SDR"
          className="col-span-3"
        >
          <FunnelBlock
            funnel={data.funnel}
            total={totals.totalLeads}
            formatNumber={formatNumber}
          />
        </Card>

        <Card
          title="Atividades por Tipo"
          className="col-span-3"
        >
          <div className="grid grid-cols-2 gap-2">
            <MiniKpi
              label="WhatsApp diálogo"
              value={formatNumber(
                activities.whatsappDialogue
              )}
            />

            <MiniKpi
              label="WhatsApp pontual"
              value={formatNumber(
                activities.whatsappMessage
              )}
            />

            <MiniKpi
              label="Ligação efetiva"
              value={formatNumber(
                activities.effectiveCall
              )}
            />

            <MiniKpi
              label="Ligação não efetiva"
              value={formatNumber(
                activities.nonEffectiveCall
              )}
            />

            <MiniKpi
              label="E-mail prospecção"
              value={formatNumber(
                activities.prospectingEmail
              )}
            />

            <MiniKpi
              label="Outras"
              value={formatNumber(
                activities.other
              )}
            />
          </div>
        </Card>

        <Card
          title="Top Sources"
          className="col-span-3"
        >
          <div className="space-y-2">
            {data.sources.length > 0 ? (
              data.sources.map(
                (source, index) => (
                  <SourceLine
                    key={`${source.name}-${index}`}
                    name={source.name}
                    leads={source.total}
                  />
                )
              )
            ) : (
              <EmptyInfo text="Nenhuma source encontrada no período." />
            )}
          </div>
        </Card>

        <Card
          title="Qualidade / Atenção"
          className="col-span-3"
        >
          <div className="grid grid-cols-2 gap-2">
            <MiniKpi
              label="Lost"
              value={formatNumber(
                totals.lostLeads
              )}
            />

            <MiniKpi
              label="Canceladas"
              value={formatNumber(
                totals.canceledLeads
              )}
            />

            <MiniKpi
              label="+5 dias sem mov."
              value={formatNumber(
                totals.staleOpenPending
              )}
            />

            <MiniKpi
              label="Ativ./Lead"
              value={activityPerLead.toFixed(1)}
            />
          </div>
        </Card>
      </section>
    </div>
  );
}

function BigKpi({
  title,
  value,
  subtitle,
  danger = false
}) {
  return (
    <motion.div
      initial={{
        opacity: 0,
        scale: 0.96
      }}
      animate={{
        opacity: 1,
        scale: 1
      }}
      className={`bg-white/10 backdrop-blur rounded-3xl p-4 h-[86px] border shadow-2xl overflow-hidden ${
        danger
          ? 'border-red-400/30'
          : 'border-white/10'
      }`}
    >
      <div className="text-slate-400 text-xs font-bold uppercase tracking-wide">
        {title}
      </div>

      <div
        className={`text-2xl xl:text-3xl font-black mt-1 leading-tight truncate ${
          danger
            ? 'text-red-300'
            : 'text-white'
        }`}
      >
        {value}
      </div>

      <div className="text-slate-500 mt-1 text-xs">
        {subtitle}
      </div>
    </motion.div>
  );
}

function Card({
  title,
  className = '',
  children
}) {
  return (
    <motion.div
      initial={{
        opacity: 0,
        y: 20
      }}
      animate={{
        opacity: 1,
        y: 0
      }}
      className={`${className} bg-white/10 backdrop-blur rounded-2xl p-3 border border-white/10 shadow-2xl min-w-0 overflow-hidden`}
    >
      <h2 className="text-base font-black mb-3 text-white">
        {title}
      </h2>

      {children}
    </motion.div>
  );
}

function MiniKpi({ label, value }) {
  return (
    <div className="bg-slate-950/50 rounded-2xl p-3 border border-white/5 min-h-[72px]">
      <div className="text-slate-400 text-[11px] font-bold uppercase leading-tight">
        {label}
      </div>

      <div className="text-xl font-black mt-2">
        {value}
      </div>
    </div>
  );
}

function SdrRanking({
  users,
  formatNumber
}) {
  if (!users || users.length === 0) {
    return (
      <EmptyInfo text="Nenhum SDR encontrado no período." />
    );
  }

  return (
    <div className="h-full overflow-hidden">
      <div className="grid grid-cols-[1.5fr_0.7fr_0.7fr_0.8fr_0.8fr_0.7fr] gap-2 px-3 py-2 text-[11px] uppercase font-black text-slate-400 border-b border-white/10">
        <div>SDR</div>
        <div className="text-center">
          Leads
        </div>
        <div className="text-center">
          Open
        </div>
        <div className="text-center">
          Ativ.
        </div>
        <div className="text-center">
          Reuniões
        </div>
        <div className="text-center">
          No Show
        </div>
      </div>

      <div className="space-y-2 mt-2">
        {users.slice(0, 8).map(
          (user, index) => (
            <motion.div
              key={user._id || index}
              initial={{
                opacity: 0,
                x: -20
              }}
              animate={{
                opacity: 1,
                x: 0
              }}
              transition={{
                delay: index * 0.06
              }}
              className="grid grid-cols-[1.5fr_0.7fr_0.7fr_0.8fr_0.8fr_0.7fr] gap-2 items-center bg-slate-950/45 border border-white/5 rounded-2xl px-3 py-2"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-blue-600/30 border border-blue-400/30 flex items-center justify-center text-xs font-black text-blue-200">
                    {index + 1}
                  </span>

                  <span className="font-black text-sm truncate">
                    {user._id}
                  </span>
                </div>
              </div>

              <NumberCell
                value={formatNumber(
                  user.totalLeads
                )}
              />

              <NumberCell
                value={formatNumber(
                  user.openLeads
                )}
              />

              <NumberCell
                value={formatNumber(
                  user.activitiesCount
                )}
              />

              <NumberCell
                value={formatNumber(
                  user.meetingsCount
                )}
              />

              <NumberCell
                value={formatNumber(
                  user.activityBreakdown?.noShow
                )}
                danger={
                  Number(
                    user.activityBreakdown?.noShow || 0
                  ) > 0
                }
              />
            </motion.div>
          )
        )}
      </div>
    </div>
  );
}

function NumberCell({
  value,
  danger = false
}) {
  return (
    <div
      className={`text-center font-black text-base ${
        danger
          ? 'text-red-300'
          : 'text-white'
      }`}
    >
      {value}
    </div>
  );
}

function FunnelBlock({
  funnel,
  total,
  formatNumber
}) {
  return (
    <div className="flex flex-col gap-2">
      {(funnel || []).map((item, index) => {
        const percent =
          total > 0
            ? (Number(item.total || 0) /
                total) *
              100
            : 0;

        const widths = [
          '100%',
          '86%',
          '72%',
          '58%',
          '44%'
        ];

        return (
          <motion.div
            key={item.label}
            initial={{
              opacity: 0,
              x: -25
            }}
            animate={{
              opacity: 1,
              x: 0
            }}
            transition={{
              delay: index * 0.08
            }}
            style={{
              width:
                widths[index] || '40%'
            }}
            className="mx-auto"
          >
            <div className="bg-gradient-to-r from-blue-600 to-cyan-500 rounded-xl px-3 py-2 shadow-lg shadow-blue-900/30">
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-xs truncate">
                  {item.label}
                </span>

                <span className="font-black text-base">
                  {formatNumber(
                    item.total
                  )}
                </span>
              </div>

              <div className="text-[10px] text-blue-100 mt-0.5">
                {percent.toFixed(1)}%
                das recebidas
              </div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

function SourceLine({
  name,
  leads
}) {
  return (
    <div className="bg-slate-950/50 rounded-2xl px-3 py-2 border border-white/5">
      <div className="flex justify-between gap-3">
        <span className="text-sm font-semibold truncate">
          {name}
        </span>

        <span className="text-sm text-blue-300 font-bold">
          {leads}
        </span>
      </div>

      <div className="text-xs text-slate-500">
        leads recebidas no período
      </div>
    </div>
  );
}

function EmptyInfo({ text }) {
  return (
    <div className="h-full flex items-center justify-center text-center text-slate-400 text-sm bg-slate-950/40 rounded-2xl p-4 border border-white/5">
      {text}
    </div>
  );
}

export default TVSdrPage;
