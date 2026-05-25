import { useEffect, useState } from 'react';
import api from '../services/api';

function Performance() {
  const [loading, setLoading] = useState(true);
  const [performance, setPerformance] = useState([]);

  useEffect(() => {
    loadPerformance();
  }, []);

  async function loadPerformance() {
    try {
      setLoading(true);

      const response = await api.get('/dashboard/performance-by-assignee');

      setPerformance(response.data.performance || []);

    } catch (error) {
      console.error(error);

    } finally {
      setLoading(false);
    }
  }

  const formatBRL = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const formatPercent = (value) => {
    return `${Number(value || 0).toFixed(2)}%`;
  };

  return (
    <div className="p-8">

      <div className="mb-6">
        <h1 className="text-4xl font-bold">
          Performance Comercial
        </h1>

        <p className="text-slate-500 mt-1">
          Ranking por responsável, receita, conversão e ticket médio
        </p>
      </div>

      <div className="bg-white rounded-2xl shadow overflow-hidden">

        <table className="w-full">

          <thead className="bg-slate-100">
            <tr className="text-left text-sm text-slate-600">
              <th className="p-4">Responsável</th>
              <th className="p-4">Total Leads</th>
              <th className="p-4">Won</th>
              <th className="p-4">Lost</th>
              <th className="p-4">Pending</th>
              <th className="p-4">Cancelado</th>
              <th className="p-4">Receita</th>
              <th className="p-4">Ticket Médio</th>
              <th className="p-4">Conversão</th>
            </tr>
          </thead>

          <tbody>

            {loading && (
              <tr>
                <td colSpan="9" className="p-10 text-center">
                  Carregando...
                </td>
              </tr>
            )}

            {!loading && performance.map((item) => (
              <tr
                key={item._id}
                className="border-t hover:bg-slate-50"
              >
                <td className="p-4 font-semibold">
                  {item._id || 'Sem responsável'}
                </td>

                <td className="p-4">
                  {item.totalLeads}
                </td>

                <td className="p-4 text-green-700 font-semibold">
                  {item.wonLeads}
                </td>

                <td className="p-4 text-red-700 font-semibold">
                  {item.lostLeads}
                </td>

                <td className="p-4 text-yellow-700 font-semibold">
                  {item.pendingLeads}
                </td>

                <td className="p-4 text-slate-600 font-semibold">
                  {item.canceledLeads}
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
            ))}

          </tbody>

        </table>

      </div>

    </div>
  );
}

export default Performance;