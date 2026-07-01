import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const CLOSER_NAMES = [
  'Gabriel Lopes',
  'Edson da Silva Bomfim Júnior',
  'Alba Danielly Rezende Lima',
  'Fábio Souza',
  'Luiza Carvalho',
  'Fabiane Carvalho Nascimento',
  'Beatriz Costa',
  'Beatriz Costa Costa',
  'Marcus Santana'
];

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
  const [viewMode, setViewMode] = useState('closer');

  const [closerPerformance, setCloserPerformance] =
    useState([]);

  const [sdrPerformance, setSdrPerformance] =
    useState([]);

  const [search, setSearch] = useState('');

  useEffect(() => {
    loadPerformance();
  }, []);

  async function loadPerformance() {
    try {
      setLoading(true);

      const response = await api.get(
        '/dashboard/performance-by-assignee'
      );

      const payload = response.data || {};

      /*
       * Estrutura futura recomendada:
       *
       * {
       *   closers: [],
       *   sdrs: []
       * }
       */
      if (
        Array.isArray(payload.closers) ||
        Array.isArray(payload.sdrs)
      ) {
        setCloserPerformance(
          Array.isArray(payload.closers)
            ? payload.closers
            : []
        );

        setSdrPerformance(
          Array.isArray(payload.sdrs)
            ? payload.sdrs
            : []
        );

        return;
      }

      /*
       * Compatibilidade com o retorno atual:
       *
       * {
       *   performance: []
       * }
       */
      const allPerformance = Array.isArray(
        payload.performance
      )
        ? payload.performance
        : [];

      const normalizedCloserNames =
        CLOSER_NAMES.map(normalizeName);

      const closers = allPerformance.filter(
        (item) => {
          const itemName = normalizeName(
            item._id ||
            item.userName ||
            item.assignee
          );

          return normalizedCloserNames.includes(
            itemName
          );
        }
      );

      const sdrs = allPerformance.filter(
        (item) => {
          const itemName = normalizeName(
            item._id ||
            item.userName ||
            item.assignee
          );

          return (
            itemName &&
            !normalizedCloserNames.includes(
              itemName
            ) &&
            itemName !== 'accounts grupo' &&
            itemName !== 'transportes' &&
            itemName !== 'geral' &&
            itemName !== 'sem responsavel'
          );
        }
      );

      setCloserPerformance(closers);
      setSdrPerformance(sdrs);

    } catch (error) {
      console.error(
        'Erro ao carregar performance:',
        error
      );

      setCloserPerformance([]);
      setSdrPerformance([]);

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
      ? closerPerformance
      : sdrPerformance;

  const filteredPerformance = useMemo(() => {
    const normalizedSearch =
      normalizeName(search);

    if (!normalizedSearch) {
      return currentPerformance;
    }

    return currentPerformance.filter(
      (item) => {
        const itemName = normalizeName(
          item._id ||
          item.userName ||
          item.assignee
        );

        return itemName.includes(
          normalizedSearch
        );
      }
    );
  }, [
    currentPerformance,
    search
  ]);

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

        accumulator.pendingLeads += Number(
          item.pendingLeads || 0
        );

        accumulator.canceledLeads += Number(
          item.canceledLeads || 0
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
        pendingLeads: 0,
        canceledLeads: 0,
        totalRevenue: 0
      }
    );
  }, [filteredPerformance]);

  const moduleTitle =
    viewMode === 'closer'
      ? 'Performance por Closer'
      : 'Performance por SDR';

  const moduleDescription =
    viewMode === 'closer'
      ? 'Receita, vendas, conversão e desempenho dos closers'
      : 'Leads, conversão e desempenho dos SDRs';

  return (
    <div className="p-8 bg-slate-50 min-h-screen">

      <div className="mb-6">
        <h1 className="text-4xl font-bold text-slate-900">
          Performance Comercial
        </h1>

        <p className="text-slate-500 mt-1">
          Acompanhamento separado por equipe comercial
        </p>
      </div>

      {/* Botões dos dois módulos */}
      <div className="flex flex-wrap gap-3 mb-6">

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

      {/* Cabeçalho do módulo */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 mb-6">

        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">

          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {moduleTitle}
            </h2>

            <p className="text-slate-500 mt-1">
              {moduleDescription}
            </p>
          </div>

          <div className="flex gap-3">

            <input
              type="text"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Buscar responsável..."
              className="w-full lg:w-72 px-4 py-3 rounded-xl border border-slate-300 outline-none focus:ring-2 focus:ring-slate-300"
            />

            <button
              type="button"
              onClick={loadPerformance}
              className="px-5 py-3 rounded-xl bg-slate-100 text-slate-700 font-semibold hover:bg-slate-200"
            >
              Atualizar
            </button>

          </div>

        </div>

      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4 mb-6">

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
          title="Pending"
          value={summary.pendingLeads}
        />

        <SummaryCard
          title="Canceladas"
          value={summary.canceledLeads}
        />

        <SummaryCard
          title="Receita"
          value={formatBRL(
            summary.totalRevenue
          )}
        />

      </div>

      {/* Tabela */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-x-auto">

        <table className="w-full min-w-[1100px]">

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
                Pending
              </th>

              <th className="p-4">
                Cancelado
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
                  colSpan="10"
                  className="p-12 text-center text-slate-500"
                >
                  Carregando performance...
                </td>
              </tr>
            )}

            {!loading &&
              filteredPerformance.length === 0 && (
                <tr>
                  <td
                    colSpan="10"
                    className="p-12 text-center text-slate-500"
                  >
                    Nenhum resultado encontrado neste módulo.
                  </td>
                </tr>
              )}

            {!loading &&
              filteredPerformance.map(
                (item, index) => (
                  <tr
                    key={
                      item._id ||
                      item.userName ||
                      index
                    }
                    className="border-t hover:bg-slate-50"
                  >

                    <td className="p-4">
                      <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-slate-100 font-bold text-slate-700">
                        {index + 1}
                      </span>
                    </td>

                    <td className="p-4 font-semibold text-slate-900">
                      {item._id ||
                        item.userName ||
                        item.assignee ||
                        'Sem responsável'}
                    </td>

                    <td className="p-4">
                      {Number(
                        item.totalLeads || 0
                      )}
                    </td>

                    <td className="p-4 text-green-700 font-semibold">
                      {Number(
                        item.wonLeads || 0
                      )}
                    </td>

                    <td className="p-4 text-red-700 font-semibold">
                      {Number(
                        item.lostLeads || 0
                      )}
                    </td>

                    <td className="p-4 text-yellow-700 font-semibold">
                      {Number(
                        item.pendingLeads || 0
                      )}
                    </td>

                    <td className="p-4 text-slate-600 font-semibold">
                      {Number(
                        item.canceledLeads || 0
                      )}
                    </td>

                    <td className="p-4 font-semibold">
                      {formatBRL(
                        item.totalRevenue
                      )}
                    </td>

                    <td className="p-4">
                      {formatBRL(
                        item.averageTicket
                      )}
                    </td>

                    <td className="p-4">
                      <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold">
                        {formatPercent(
                          item.conversionRate
                        )}
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
  value
}) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5">

      <p className="text-sm text-slate-500">
        {title}
      </p>

      <p className="text-xl font-bold text-slate-900 mt-2 break-words">
        {value}
      </p>

    </div>
  );
}

export default Performance;
