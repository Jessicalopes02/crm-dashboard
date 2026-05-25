import { useEffect, useState } from 'react';
import api from '../services/api';

function Leads() {
  const [loading, setLoading] = useState(true);

  const [leads, setLeads] = useState([]);

  const [page, setPage] = useState(1);

  const [totalPages, setTotalPages] = useState(1);

  const [search, setSearch] = useState('');

  async function fetchLeads() {
    try {
      setLoading(true);

      const response = await api.get('/dashboard/leads-list', {
        params: {
          page,
          limit: 20,
          search
        }
      });

      setLeads(response.data.leads);

      setTotalPages(response.data.totalPages);

    } catch (error) {
      console.error(error);

    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchLeads();
  }, [page]);

  function handleSearch(e) {
    e.preventDefault();

    setPage(1);

    fetchLeads();
  }

  function getStatus(status) {
  switch (status) {
    case 10:
      return {
        label: 'Won',
        color: 'bg-green-100 text-green-700'
      };

    case 11:
      return {
        label: 'Lost',
        color: 'bg-red-100 text-red-700'
      };

    case 0:
      return {
        label: 'Open',
        color: 'bg-blue-100 text-blue-700'
      };

    case 1:
      return {
        label: 'Pending',
        color: 'bg-yellow-100 text-yellow-700'
      };

    case 12:
      return {
        label: 'Cancelado',
        color: 'bg-slate-200 text-slate-700'
      };

    default:
      return {
        label: 'Outro',
        color: 'bg-slate-100 text-slate-600'
      };
  }
}
  return (
    <div className="p-8">

      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-4xl font-bold">
            Leads
          </h1>

          <p className="text-slate-500 mt-1">
            Gestão comercial e operacional
          </p>
        </div>

        <form
          onSubmit={handleSearch}
          className="flex gap-2"
        >
          <input
            type="text"
            placeholder="Buscar lead..."
            className="border rounded-xl px-4 py-2 w-80"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <button
            className="bg-blue-600 text-white px-5 py-2 rounded-xl"
          >
            Buscar
          </button>
        </form>
      </div>

      <div className="bg-white rounded-2xl shadow overflow-hidden">

        <table className="w-full">

          <thead className="bg-slate-100">
            <tr className="text-left text-sm text-slate-600">
              <th className="p-4">Lead</th>
              <th className="p-4">Conta</th>
              <th className="p-4">Responsável</th>
              <th className="p-4">Status</th>
              <th className="p-4">Valor</th>
              <th className="p-4">Data</th>
            </tr>
          </thead>

          <tbody>

            {loading && (
              <tr>
                <td colSpan="6" className="p-10 text-center">
                  Carregando...
                </td>
              </tr>
            )}

            {!loading && leads.map((lead) => {
              const status = getStatus(lead.status);

              return (
                <tr
                  key={lead._id}
                  className="border-t hover:bg-slate-50"
                >
                  <td className="p-4">
                    <div className="font-semibold">
                      {lead.name}
                    </div>

                    <div className="text-xs text-slate-500">
                      {lead.description}
                    </div>
                  </td>

                  <td className="p-4">
                    {lead.primaryAccount?.name || '-'}
                  </td>

                  <td className="p-4">
                    {lead.assignee?.name || '-'}
                  </td>

                  <td className="p-4">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${status.color}`}
                    >
                      {status.label}
                    </span>
                  </td>

                  <td className="p-4 font-semibold">
                    {lead.value?.amount
                      ? lead.value.amount.toLocaleString('pt-BR', {
                          style: 'currency',
                          currency: 'BRL'
                        })
                      : '-'}
                  </td>

                  <td className="p-4 text-sm text-slate-500">
                    {lead.closedTime
                      ? new Date(lead.closedTime).toLocaleDateString('pt-BR')
                      : '-'}
                  </td>
                </tr>
              );
            })}

          </tbody>
        </table>

      </div>

      <div className="flex items-center justify-between mt-6">

        <button
          disabled={page === 1}
          onClick={() => setPage(page - 1)}
          className="bg-slate-200 px-4 py-2 rounded-xl disabled:opacity-40"
        >
          Anterior
        </button>

        <div className="text-sm text-slate-600">
          Página {page} de {totalPages}
        </div>

        <button
          disabled={page >= totalPages}
          onClick={() => setPage(page + 1)}
          className="bg-slate-200 px-4 py-2 rounded-xl disabled:opacity-40"
        >
          Próxima
        </button>

      </div>

    </div>
  );
}

export default Leads;