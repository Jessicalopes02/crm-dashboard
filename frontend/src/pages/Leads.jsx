import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';

const PAGE_LIMIT = 20;

const INITIAL_FILTERS = {
search: '',
status: '',
assignee: '',
account: ''
};

function Leads() {
const [loading, setLoading] = useState(true);
const [leads, setLeads] = useState([]);

const [page, setPage] = useState(1);
const [total, setTotal] = useState(0);
const [totalPages, setTotalPages] = useState(1);

const [filters, setFilters] = useState(
INITIAL_FILTERS
);

const [appliedFilters, setAppliedFilters] =
useState(INITIAL_FILTERS);

useEffect(() => {
fetchLeads();
}, [page, appliedFilters]);

async function fetchLeads() {
try {
setLoading(true);


  const response = await api.get(
    '/dashboard/leads-list',
    {
      params: {
        page,
        limit: PAGE_LIMIT,

        search:
          appliedFilters.search ||
          undefined,

        status:
          appliedFilters.status !== ''
            ? appliedFilters.status
            : undefined,

        assignee:
          appliedFilters.assignee ||
          undefined,

        account:
          appliedFilters.account ||
          undefined
      }
    }
  );

  const payload = response.data || {};

  setLeads(payload.leads || []);
  setTotal(Number(payload.total || 0));
  setTotalPages(
    Math.max(
      Number(payload.totalPages || 1),
      1
    )
  );
} catch (error) {
  console.error(
    'Erro ao carregar leads:',
    error
  );

  setLeads([]);
  setTotal(0);
  setTotalPages(1);
} finally {
  setLoading(false);
}


}

function handleFilterChange(field, value) {
setFilters((current) => ({
...current,
[field]: value
}));
}

function handleSearch(event) {
event.preventDefault();


setPage(1);

setAppliedFilters({
  search: filters.search.trim(),
  status: filters.status,
  assignee: filters.assignee.trim(),
  account: filters.account.trim()
});
}

function handleClearFilters() {
setFilters(INITIAL_FILTERS);
setAppliedFilters(INITIAL_FILTERS);
setPage(1);
}

function getStatus(status) {
switch (Number(status)) {
case 10:
return {
label: 'Won',
color:
'bg-green-100 text-green-700 border-green-200'
};

  case 11:
    return {
      label: 'Lost',
      color:
        'bg-red-100 text-red-700 border-red-200'
    };

  case 0:
    return {
      label: 'Open',
      color:
        'bg-blue-100 text-blue-700 border-blue-200'
    };

  case 1:
    return {
      label: 'Pending',
      color:
        'bg-amber-100 text-amber-700 border-amber-200'
    };

  case 12:
    return {
      label: 'Cancelado',
      color:
        'bg-slate-200 text-slate-700 border-slate-300'
    };

  default:
    return {
      label: 'Outro',
      color:
        'bg-slate-100 text-slate-600 border-slate-200'
    };
}
}

function normalizeAssigneeName(name) {
const normalized = String(name || '')
.replace(/\s+/g, ' ')
.trim();

const aliases = {
  'Marcus Santana':
    'Marcus Vinicius Dias Santana',

  'Beatriz Costa Costa':
    'Beatriz Costa',

  'Edson da Silva Bomfim Junior':
    'Edson da Silva Bomfim Júnior',

  'Fabio Souza':
    'Fábio Souza'
};

return (
  aliases[normalized] ||
  normalized ||
  'Sem responsável'
);

}

function formatBRL(value) {
const amount = Number(value || 0);

if (amount <= 0) {
  return 'Sem valor';
}

return new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL'
}).format(amount);


}

function formatNumber(value) {
return new Intl.NumberFormat(
'pt-BR'
).format(Number(value || 0));
}

function formatDate(value) {
if (!value) {
return '-';
}


const date = new Date(value);

if (Number.isNaN(date.getTime())) {
  return '-';
}

return date.toLocaleDateString(
  'pt-BR'
);

}

function getReferenceDate(lead) {
const status = Number(lead.status);

if ([10, 11, 12].includes(status)) {
  return {
    value: lead.closedTime,
    label: 'Fechamento'
  };
}

if ([0, 1].includes(status)) {
  return {
    value: lead.dueTime,
    label: 'Previsão'
  };
}

return {
  value:
    lead.closedTime ||
    lead.dueTime ||
    null,
  label: 'Referência'
};

}

const pageSummary = useMemo(() => {
return leads.reduce(
(summary, lead) => {
const status = Number(lead.status);


    if (status === 0) {
      summary.open += 1;
    }

    if (status === 1) {
      summary.pending += 1;
    }

    if (status === 10) {
      summary.won += 1;
    }

    if (status === 11) {
      summary.lost += 1;
    }

    if (status === 12) {
      summary.cancelled += 1;
    }

    return summary;
  },
  {
    open: 0,
    pending: 0,
    won: 0,
    lost: 0,
    cancelled: 0
  }
);


}, [leads]);

const firstVisible =
total === 0
? 0
: (page - 1) * PAGE_LIMIT + 1;

const lastVisible = Math.min(
page * PAGE_LIMIT,
total
);

const hasActiveFilters =
appliedFilters.search ||
appliedFilters.status !== '' ||
appliedFilters.assignee ||
appliedFilters.account;

return ( <div className="min-h-screen bg-slate-100 p-5 lg:p-8"> <div className="max-w-[1600px] mx-auto space-y-6"> <header className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-5"> <div> <h1 className="text-4xl font-black text-slate-950">
Leads </h1>

        <p className="text-slate-500 mt-1">
          Gestão comercial e operacional
        </p>
      </div>

      <div className="text-sm text-slate-500">
        <span className="font-black text-slate-900">
          {formatNumber(total)}
        </span>{' '}
        leads encontradas
      </div>
    </header>

    <form
      onSubmit={handleSearch}
      className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-[minmax(260px,1.5fr)_180px_220px_220px_auto_auto] gap-3 items-end">
        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
            Busca geral
          </label>

          <input
            type="text"
            placeholder="Nome, descrição, conta ou contato..."
            className="w-full h-11 border border-slate-300 rounded-xl px-4 outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={filters.search}
            onChange={(event) =>
              handleFilterChange(
                'search',
                event.target.value
              )
            }
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
            Status
          </label>

          <select
            className="w-full h-11 border border-slate-300 rounded-xl px-3 bg-white outline-none focus:ring-2 focus:ring-blue-500"
            value={filters.status}
            onChange={(event) =>
              handleFilterChange(
                'status',
                event.target.value
              )
            }
          >
            <option value="">
              Todos
            </option>

            <option value="0">
              Open
            </option>

            <option value="1">
              Pending
            </option>

            <option value="10">
              Won
            </option>

            <option value="11">
              Lost
            </option>

            <option value="12">
              Cancelado
            </option>
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
            Responsável
          </label>

          <input
            type="text"
            placeholder="Nome do responsável"
            className="w-full h-11 border border-slate-300 rounded-xl px-4 outline-none focus:ring-2 focus:ring-blue-500"
            value={filters.assignee}
            onChange={(event) =>
              handleFilterChange(
                'assignee',
                event.target.value
              )
            }
          />
        </div>

        <div>
          <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1.5">
            Conta
          </label>

          <input
            type="text"
            placeholder="Nome da conta"
            className="w-full h-11 border border-slate-300 rounded-xl px-4 outline-none focus:ring-2 focus:ring-blue-500"
            value={filters.account}
            onChange={(event) =>
              handleFilterChange(
                'account',
                event.target.value
              )
            }
          />
        </div>

        <button
          type="submit"
          className="h-11 bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 rounded-xl transition"
        >
          Buscar
        </button>

        <button
          type="button"
          onClick={handleClearFilters}
          className="h-11 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold px-5 rounded-xl transition"
        >
          Limpar
        </button>
      </div>

      {hasActiveFilters && (
        <div className="mt-4 flex flex-wrap gap-2">
          {appliedFilters.search && (
            <FilterBadge>
              Busca: {appliedFilters.search}
            </FilterBadge>
          )}

          {appliedFilters.status !== '' && (
            <FilterBadge>
              Status:{' '}
              {
                getStatus(
                  appliedFilters.status
                ).label
              }
            </FilterBadge>
          )}

          {appliedFilters.assignee && (
            <FilterBadge>
              Responsável:{' '}
              {appliedFilters.assignee}
            </FilterBadge>
          )}

          {appliedFilters.account && (
            <FilterBadge>
              Conta:{' '}
              {appliedFilters.account}
            </FilterBadge>
          )}
        </div>
      )}
    </form>

    <section className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
      <SummaryCard
        title="Total encontrado"
        value={total}
        className="border-slate-200 bg-white text-slate-900"
      />

      <SummaryCard
        title="Open nesta página"
        value={pageSummary.open}
        className="border-blue-200 bg-blue-50 text-blue-700"
      />

      <SummaryCard
        title="Pending nesta página"
        value={pageSummary.pending}
        className="border-amber-200 bg-amber-50 text-amber-700"
      />

      <SummaryCard
        title="Won nesta página"
        value={pageSummary.won}
        className="border-green-200 bg-green-50 text-green-700"
      />

      <SummaryCard
        title="Lost nesta página"
        value={pageSummary.lost}
        className="border-red-200 bg-red-50 text-red-700"
      />

      <SummaryCard
        title="Canceladas nesta página"
        value={pageSummary.cancelled}
        className="border-slate-300 bg-slate-100 text-slate-700"
      />
    </section>

    <section className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1050px]">
          <thead className="bg-slate-100 border-b border-slate-300">
            <tr className="text-left text-xs font-black uppercase tracking-wide text-slate-600">
              <th className="px-5 py-4">
                Lead
              </th>

              <th className="px-5 py-4">
                Conta
              </th>

              <th className="px-5 py-4">
                Responsável
              </th>

              <th className="px-5 py-4">
                Status
              </th>

              <th className="px-5 py-4 text-right">
                Valor
              </th>

              <th className="px-5 py-4">
                Data de referência
              </th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200">
            {loading && (
              <tr>
                <td
                  colSpan="6"
                  className="px-5 py-16 text-center text-slate-500"
                >
                  Carregando leads...
                </td>
              </tr>
            )}

            {!loading &&
              leads.length === 0 && (
                <tr>
                  <td
                    colSpan="6"
                    className="px-5 py-16 text-center"
                  >
                    <div className="text-lg font-black text-slate-800">
                      Nenhuma lead encontrada
                    </div>

                    <div className="text-sm text-slate-500 mt-1">
                      Revise os filtros utilizados.
                    </div>
                  </td>
                </tr>
              )}

            {!loading &&
              leads.map((lead, index) => {
                const status = getStatus(
                  lead.status
                );

                const referenceDate =
                  getReferenceDate(lead);

                return (
                  <tr
                    key={
                      lead._id ||
                      lead.nutshell_id ||
                      index
                    }
                    className="hover:bg-blue-50/40 transition"
                  >
                    <td className="px-5 py-4 max-w-[360px]">
                      <div className="font-black text-slate-900">
                        {lead.name ||
                          `Lead ${lead.nutshell_id || ''}`}
                      </div>

                      <div
                        className="text-xs text-slate-500 mt-1 line-clamp-2"
                        title={
                          lead.description || ''
                        }
                      >
                        {lead.description ||
                          'Sem descrição'}
                      </div>
                    </td>

                    <td className="px-5 py-4 max-w-[240px]">
                      <div
                        className="font-medium text-slate-800 truncate"
                        title={
                          lead.primaryAccount
                            ?.name || ''
                        }
                      >
                        {lead.primaryAccount
                          ?.name ||
                          'Sem conta'}
                      </div>
                    </td>

                    <td className="px-5 py-4 max-w-[230px]">
                      <div
                        className="font-medium text-slate-800"
                        title={
                          normalizeAssigneeName(
                            lead.assignee?.name
                          )
                        }
                      >
                        {normalizeAssigneeName(
                          lead.assignee?.name
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex border px-3 py-1 rounded-full text-xs font-black ${status.color}`}
                      >
                        {status.label}
                      </span>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <div
                        className={`font-black whitespace-nowrap ${
                          Number(
                            lead.value
                              ?.amount || 0
                          ) > 0
                            ? 'text-slate-900'
                            : 'text-slate-400'
                        }`}
                      >
                        {formatBRL(
                          lead.value?.amount
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-4">
                      <div className="font-bold text-slate-800">
                        {formatDate(
                          referenceDate.value
                        )}
                      </div>

                      <div className="text-xs text-slate-500 mt-0.5">
                        {referenceDate.label}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      <div className="border-t border-slate-200 bg-slate-50 px-5 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="text-sm text-slate-600">
          Exibindo{' '}
          <span className="font-black text-slate-900">
            {formatNumber(firstVisible)}
          </span>{' '}
          a{' '}
          <span className="font-black text-slate-900">
            {formatNumber(lastVisible)}
          </span>{' '}
          de{' '}
          <span className="font-black text-slate-900">
            {formatNumber(total)}
          </span>{' '}
          resultados
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            disabled={
              loading || page === 1
            }
            onClick={() =>
              setPage((current) =>
                Math.max(current - 1, 1)
              )
            }
            className="bg-white border border-slate-300 hover:bg-slate-100 px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Anterior
          </button>

          <div className="min-w-[110px] text-center text-sm text-slate-600">
            Página{' '}
            <span className="font-black text-slate-900">
              {page}
            </span>{' '}
            de{' '}
            <span className="font-black text-slate-900">
              {totalPages}
            </span>
          </div>

          <button
            type="button"
            disabled={
              loading ||
              page >= totalPages
            }
            onClick={() =>
              setPage((current) =>
                Math.min(
                  current + 1,
                  totalPages
                )
              )
            }
            className="bg-white border border-slate-300 hover:bg-slate-100 px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Próxima
          </button>
        </div>
      </div>
    </section>
  </div>
</div>

);
}

function SummaryCard({
title,
value,
className
}) {
return (
<div
className={`rounded-2xl border p-4 ${className}`}
> <div className="text-[11px] font-black uppercase tracking-wide opacity-80">
{title} </div>

  <div className="text-2xl font-black mt-1">
    {new Intl.NumberFormat(
      'pt-BR'
    ).format(Number(value || 0))}
  </div>
</div>

);
}

function FilterBadge({ children }) {
return ( <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-3 py-1 text-xs font-bold text-blue-700">
{children} </span>
);
}

export default Leads;
