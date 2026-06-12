import { useEffect, useState } from 'react';
import api from '../services/api';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  ComposedChart,
  CartesianGrid,
  Legend
} from 'recharts';

import {
  TrendingUp,
  Users,
  Trophy,
  XCircle,
  DollarSign
} from 'lucide-react';

function Dashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [performance, setPerformance] = useState([]);
  const [sources, setSources] = useState([]);
  const [products, setProducts] = useState([]);
  const [yearComparison, setYearComparison] = useState([]);
  const [funnel, setFunnel] = useState([]);
  const [leadTime, setLeadTime] = useState(null);
  const [states, setStates] = useState([]);
  const [dataQuality, setDataQuality] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    loadDashboard();
  }, [startDate, endDate]);

  async function loadDashboard() {
  try {
    const response = await api.get('/dashboard/full', {
      params: {
        startDate: startDate || undefined,
        endDate: endDate || undefined
      }
    });

    const full = response.data;

    setDashboard({
      metrics: full.general.metrics,
      charts: full.general.charts
    });

    setPerformance(full.performance || []);
    setSources(full.sources || []);
    setProducts(full.products || []);
    setYearComparison(full.comparison || []);
    setFunnel(full.funnel || []);
    setLeadTime(full.leadTime || null);
    setStates(full.states || []);
    setDataQuality(full.dataQuality || null);

  } catch (error) {
    console.error(error);
  }
}

  const formatBRL = (value) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  };

  const formatNumber = (value) => {
    return new Intl.NumberFormat('pt-BR').format(value || 0);
  };

  if (!dashboard) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 text-slate-600">
        Carregando dashboard...
      </div>
    );
  }

  const metrics = dashboard.metrics;

  const conversionRate =
    metrics.totalLeads > 0
      ? ((metrics.wonLeads / metrics.totalLeads) * 100).toFixed(2)
      : 0;

  const statusLabels = {
    0: 'Open',
    1: 'Pending',
    10: 'Won',
    11: 'Lost',
    12: 'Cancelado'
  };

  const statusData = dashboard.charts.leadsByStatus.map((item) => ({
    name: statusLabels[item._id] || `Status ${item._id}`,
    total: item.total
  }));

  const funnelData = [...funnel]
  .map((item) => ({
    label: item.label,
    total: item.total || 0,
    percent: item.percentOfTotal || 0,
    revenue: item.revenue || 0
  }))
  .sort((a, b) => b.total - a.total);

  const monthlyData =
  dashboard?.charts?.leadsByMonth?.map((item) => ({
    month: `${String(item._id.month).padStart(2, '0')}/${item._id.year}`,
    receita: item.revenue || 0,
    revenue: item.revenue || 0,
    leads: item.totalLeads || 0,
    won: item.wonLeads || 0
  })) || [];
const monthlyChartData = monthlyData.slice(-12);

  const assigneeData =
    dashboard.charts.leadsByAssignee
      .filter((item) => item._id)
      .slice(0, 5)
      .map((item) => ({
        name: item._id,
        receita: item.revenue,
        won: item.wonLeads,
        leads: item.totalLeads
      }));

  const COLORS = ['#0f172a', '#1d4ed8', '#2563eb', '#60a5fa', '#93c5fd'];
 
  const sourceData = [...sources]
  .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
  .slice(0, 8)
  .map((item) => ({
    name: item._id || 'Sem source',
    receita: item.revenue || 0,
    won: item.wonLeads || 0,
    leads: item.totalLeads || 0
  }));

  const productData = products.slice(0, 8).map((item) => ({
    name: item._id,
    receita: item.revenue || 0,
    won: item.wonLeads || 0,
    leads: item.totalLeads || 0
    }));

    const comparisonData = yearComparison.map((item) => ({
      month: item.monthName,
      currentRevenue: item.current.revenue || 0,
      previousRevenue: item.previous.revenue || 0,
      growth: item.growth.revenuePercent || 0
    }));

    const leadTimeData =
      leadTime?.byMonth?.map((item) => ({
        month: `${String(item._id.month).padStart(2, '0')}/${item._id.year}`,
        leadTime: Number(item.averageLeadTimeDays || 0).toFixed(1),
        won: item.totalWon || 0
      })) || [];

    const stateData = states.slice(0, 10).map((item) => ({
      name: item._id,
      receita: item.revenue || 0,
      leads: item.totalLeads || 0,
      won: item.wonLeads || 0,
      open: item.openLeads || 0
    }));

    async function handleSyncNow() {
  try {
    setSyncing(true);

    await api.get('/sync/nutshell/auto', {
      params: {
        limit: 20,
        pagesBack: 5,
        enrichLimit: 50
      }
    });

    await loadDashboard();

    alert('Banco atualizado com sucesso!');
  } catch (error) {
    console.error(error);
    alert('Erro ao atualizar banco');
  } finally {
    setSyncing(false);
  }
}
  return (
    <div className="min-h-screen bg-slate-100 text-slate-900">

      <header className="bg-slate-950 text-white px-8 py-6 shadow-lg">
        <div className="flex flex-col gap-1">
          <h1 className="text-3xl font-bold tracking-tight">
            CRM Dashboard
          </h1>
          <p className="text-slate-300 text-sm">
            Visão gerencial de leads, receita, conversão e performance comercial
          </p>
        </div>
      </header>

      <main className="p-8 space-y-8">
        <div className="bg-white rounded-2xl shadow p-5 mb-6">

        <div className="flex flex-wrap items-end gap-4">

         <div>
           <label className="block text-sm text-slate-500 mb-1">
             Data Inicial
           </label>

           <input
             type="date"
             value={startDate}
             onChange={(e) => setStartDate(e.target.value)}
             className="border rounded-xl px-4 py-2"
           />
        </div>

        <div>
          <label className="block text-sm text-slate-500 mb-1">
            Data Final
          </label>

          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="border rounded-xl px-4 py-2"
         />
       </div>

       <button
         onClick={() => {
           setStartDate('');
           setEndDate('');
         }}
         className="bg-slate-200 hover:bg-slate-300 px-5 py-2 rounded-xl"
       >
         Limpar filtro
       </button>

       <button
         onClick={() => {
          const today = new Date().toISOString().slice(0, 10);
          setStartDate(today);
          setEndDate(today);
         }}
         className="bg-blue-100 text-blue-700 hover:bg-blue-200 px-5 py-2 rounded-xl"
        >
          Hoje
        </button>

        <button
          onClick={() => {
            const now = new Date();

            const firstDay = new Date(
              now.getFullYear(),
              now.getMonth(),
              1
            )
              .toISOString()
              .slice(0, 10);

            const lastDay = new Date(
              now.getFullYear(),
              now.getMonth() + 1,
              0
            )
             .toISOString()
             .slice(0, 10);

            setStartDate(firstDay);
            setEndDate(lastDay);
          }}
          className="bg-blue-100 text-blue-700 hover:bg-blue-200 px-5 py-2 rounded-xl"
        >
          Este mês
        </button>

        <button
          onClick={() => {
            const now = new Date();

            setStartDate(`${now.getFullYear()}-01-01`);
            setEndDate(`${now.getFullYear()}-12-31`);
          }}
          className="bg-blue-100 text-blue-700 hover:bg-blue-200 px-5 py-2 rounded-xl"
        >
          Este ano
        </button>

        </div>

        </div>
        <section className="bg-white rounded-2xl shadow p-5">
  <div className="flex flex-wrap items-center justify-between gap-4">
    <div>
      <h2 className="text-lg font-semibold">
        Status do Banco
      </h2>

      <p className="text-sm text-slate-500">
        Total: {formatNumber(dataQuality?.totalLeads)} leads |
        Criadas hoje: {formatNumber(dataQuality?.today?.createdToday)} |
        Fechadas hoje: {formatNumber(dataQuality?.today?.closedToday)} |
        Modificadas hoje: {formatNumber(dataQuality?.today?.modifiedToday)}
      </p>
    </div>

    <button
      onClick={handleSyncNow}
      disabled={syncing}
      className="bg-slate-900 text-white px-5 py-2 rounded-xl disabled:opacity-50"
    >
      {syncing ? 'Atualizando...' : 'Atualizar banco agora'}
    </button>
  </div>
</section>
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-7 gap-5">

          <MetricCard
            title="Total de Leads"
            value={formatNumber(metrics.totalLeads)}
            icon={<Users size={22} />}
            description="Base total sincronizada"
          />

          <MetricCard
            title="Won"
            value={formatNumber(metrics.wonLeads)}
            icon={<Trophy size={22} />}
            description="Leads ganhos"
          />

          <MetricCard
            title="Lost"
            value={formatNumber(metrics.lostLeads)}
            icon={<XCircle size={22} />}
            description="Leads perdidos"
          />
          
          <MetricCard
            title="Open"
            value={formatNumber(metrics.openLeads)}
            icon={<Users size={22} />}
            description="Leads abertas"
          />

          <MetricCard
            title="Receita"
            value={formatBRL(metrics.totalRevenue)}
            icon={<DollarSign size={22} />}
            description="Receita total Won"
          />

          <MetricCard
            title="Conversão"
            value={`${conversionRate}%`}
            icon={<TrendingUp size={22} />}
            description="Won / Total Leads"
          />

          <MetricCard
            title="Lead Time Médio"
            value={`${Number(leadTime?.summary?.averageLeadTimeDays || 0).toFixed(1)} dias`}
            icon={<TrendingUp size={22} />}
            description="Da abertura até a venda"
          />
        </section>
        <section className="bg-white rounded-2xl shadow p-5">

         <div className="flex items-center justify-between mb-6">
            <div>
             <h2 className="text-2xl font-bold">
               Evolução Mensal
             </h2>

             <p className="text-slate-500">
                Receita mensal comparada com quantidade de vendas ganhas
             </p>
            </div>
           </div>

           <div style={{ width: '100%', height: 400 }}>
            <ResponsiveContainer>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />

                <XAxis dataKey="month" />

                <YAxis />

                <Tooltip
                  formatter={(value, name) => {
                    if (name === 'Receita') {
                     return [
                      new Intl.NumberFormat('pt-BR', {
                       style: 'currency',
                       currency: 'BRL'
                    }).format(value || 0),
                    'Receita'
                  ];
                }

                return [
                  new Intl.NumberFormat('pt-BR').format(value || 0),
                  'Won'
                ];
              }}
            />

                <Legend />

                <Line
                  type="monotone"
                  dataKey="revenue"
                  name="Receita"
                  stroke="#2563eb"
                  strokeWidth={3}
                />

                <Line
                  type="monotone"
                  dataKey="won"
                  name="Won"
                  stroke="#16a34a"
                  strokeWidth={3}
                />
              </LineChart>
             </ResponsiveContainer>
           </div>

        </section>
        <section className="bg-white rounded-2xl shadow p-6">

  <div className="flex items-center justify-between mb-6">
    <div>
      <h2 className="text-2xl font-bold">
        Ranking Comercial
      </h2>

      <p className="text-slate-500">
        Performance por responsável no período selecionado
      </p>
    </div>
  </div>

  <div className="overflow-x-auto">
    <table className="w-full">

      <thead>
        <tr className="border-b text-left text-slate-500">
          <th className="pb-3">Responsável</th>
          <th className="pb-3">Leads</th>
          <th className="pb-3">Won</th>
          <th className="pb-3">Lost</th>
          <th className="pb-3">Conversão</th>
          <th className="pb-3">Receita</th>
          <th className="pb-3">Ticket Médio</th>
        </tr>
      </thead>

      <tbody>
        {performance.map((item, index) => (
          <tr
            key={index}
            className="border-b hover:bg-slate-50"
          >
            <td className="py-4 font-semibold">
              {item._id || 'Sem responsável'}
            </td>

            <td className="py-4">
              {formatNumber(item.totalLeads)}
            </td>

            <td className="py-4 text-green-600 font-semibold">
              {formatNumber(item.wonLeads)}
            </td>

            <td className="py-4 text-red-600 font-semibold">
              {formatNumber(item.lostLeads)}
            </td>

            <td className="py-4">
              <span className="bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-semibold">
                {Number(item.conversionRate || 0).toFixed(1)}%
              </span>
            </td>

            <td className="py-4 font-semibold text-blue-700">
              {formatBRL(item.totalRevenue)}
            </td>

            <td className="py-4">
              {formatBRL(item.averageTicket)}
            </td>
          </tr>
        ))}
      </tbody>

    </table>
  </div>
  <section className="bg-white rounded-2xl shadow p-6">

  <div className="flex items-center justify-between mb-6">
    <div>
      <h2 className="text-2xl font-bold">
        Funil Comercial
      </h2>

      <p className="text-slate-500">
        Distribuição dos leads por status no período selecionado
      </p>
    </div>
  </div>

  <FunnelChart
  data={funnelData}
  formatNumber={formatNumber}
  formatBRL={formatBRL}
/>

</section>

<section className="bg-white rounded-2xl shadow p-6">
  <div className="flex items-center justify-between mb-6">
    <div>
      <h2 className="text-2xl font-bold">
        Evolução do Lead Time
      </h2>

      <p className="text-slate-500">
        Tempo médio entre abertura e venda
      </p>
    </div>
  </div>

  <ResponsiveContainer width="100%" height={380}>
  <ComposedChart
    data={monthlyChartData}
    margin={{ top: 20, right: 20, left: 10, bottom: 10 }}
  >
    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

    <XAxis
      dataKey="month"
      tick={{ fontSize: 12, fill: '#475569' }}
      axisLine={false}
      tickLine={false}
    />

    <YAxis
      yAxisId="revenue"
      tick={{ fontSize: 12, fill: '#475569' }}
      axisLine={false}
      tickLine={false}
      tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`}
    />

    <YAxis
      yAxisId="won"
      orientation="right"
      tick={{ fontSize: 12, fill: '#16a34a' }}
      axisLine={false}
      tickLine={false}
      allowDecimals={false}
    />

    <Tooltip
      formatter={(value, name) => {
        if (name === 'Receita') {
          return [formatBRL(value), 'Receita'];
        }

        if (name === 'Won') {
          return [formatNumber(value), 'Won'];
        }

        return [value, name];
      }}
      labelStyle={{
        color: '#0f172a',
        fontWeight: 700
      }}
      contentStyle={{
        borderRadius: 12,
        border: '1px solid #e2e8f0'
      }}
    />

    <Legend />

    <Bar
      yAxisId="revenue"
      dataKey="revenue"
      name="Receita"
      fill="#2563eb"
      radius={[8, 8, 0, 0]}
      barSize={34}
    />

    <Line
      yAxisId="won"
      type="monotone"
      dataKey="won"
      name="Won"
      stroke="#16a34a"
      strokeWidth={3}
      dot={{
        r: 4,
        strokeWidth: 2
      }}
      activeDot={{
        r: 6
      }}
    />
  </ComposedChart>
</ResponsiveContainer>
</section>

<section className="bg-white rounded-2xl shadow p-6">
  <div className="flex items-center justify-between mb-6">
    <div>
      <h2 className="text-2xl font-bold">
        Receita por Source
      </h2>

      <p className="text-slate-500">
        Ranking das principais origens por receita no período selecionado
      </p>
    </div>
  </div>

  <SourceRanking
    data={sourceData}
    formatBRL={formatBRL}
    formatNumber={formatNumber}
  />
</section>
        <section className="bg-white rounded-2xl shadow p-6">

  <div className="flex items-center justify-between mb-6">
    <div>
      <h2 className="text-2xl font-bold">
        Receita por Produto
      </h2>

      <p className="text-slate-500">
        Produtos com maior receita no período
      </p>
    </div>
  </div>

  <ResponsiveContainer width="100%" height={380}>
    <BarChart data={productData}>
      <CartesianGrid strokeDasharray="3 3" />

      <XAxis
        dataKey="name"
        tick={{ fontSize: 11 }}
      />

      <YAxis
        tickFormatter={(value) =>
          `R$ ${(value / 1000).toFixed(0)}k`
        }
      />

      <Tooltip
        formatter={(value, name) => {

          if (name === 'receita') {
            return [formatBRL(value), 'Receita'];
          }

          return [formatNumber(value), name];
        }}
      />

      <Legend />

      <Bar
        dataKey="receita"
        name="Receita"
        fill="#0f172a"
        radius={[8, 8, 0, 0]}
      />

      <Bar
        dataKey="won"
        name="Won"
        fill="#2563eb"
        radius={[8, 8, 0, 0]}
      />

    </BarChart>
  </ResponsiveContainer>

</section>
<section className="bg-white rounded-2xl shadow p-6">

  <div className="flex items-center justify-between mb-6">

    <div>
      <h2 className="text-2xl font-bold">
        Comparativo Anual
      </h2>

      <p className="text-slate-500">
        Receita atual vs ano anterior
      </p>
    </div>

  </div>

  <ResponsiveContainer width="100%" height={420}>

    <LineChart data={comparisonData}>

      <CartesianGrid strokeDasharray="3 3" />

      <XAxis dataKey="month" />

      <YAxis
        tickFormatter={(value) =>
          `R$ ${(value / 1000).toFixed(0)}k`
        }
      />

      <Tooltip
        formatter={(value, name) => {

          const labels = {
            currentRevenue: 'Ano Atual',
            previousRevenue: 'Ano Anterior',
            growth: 'Crescimento %'
          };

          if (name === 'growth') {
            return [
              `${Number(value).toFixed(1)}%`,
              labels[name]
            ];
          }

          return [
            formatBRL(value),
            labels[name]
          ];
        }}
      />

      <Legend />

      <Line
        type="monotone"
        dataKey="currentRevenue"
        name="Ano Atual"
        stroke="#2563eb"
        strokeWidth={4}
      />

      <Line
        type="monotone"
        dataKey="previousRevenue"
        name="Ano Anterior"
        stroke="#94a3b8"
        strokeWidth={4}
      />

    </LineChart>

  </ResponsiveContainer>

</section>
<section className="bg-white rounded-2xl shadow p-6">
  <div className="flex items-center justify-between mb-6">
    <div>
      <h2 className="text-2xl font-bold">
        Ranking por Estado / Território
      </h2>

      <p className="text-slate-500">
        Distribuição geográfica dos leads e receita
      </p>
    </div>
  </div>

  <ResponsiveContainer width="100%" height={380}>
    <BarChart data={stateData}>
      <CartesianGrid strokeDasharray="3 3" />

      <XAxis
        dataKey="name"
        tick={{ fontSize: 11 }}
      />

      <YAxis />

      <Tooltip
        formatter={(value, name) => {
          if (name === 'receita') {
            return [formatBRL(value), 'Receita'];
          }

          const labels = {
            leads: 'Leads',
            won: 'Won',
            open: 'Open'
          };

          return [
            formatNumber(value),
            labels[name] || name
          ];
        }}
      />

      <Legend />

      <Bar
        dataKey="leads"
        name="Leads"
        fill="#2563eb"
        radius={[8, 8, 0, 0]}
      />

      <Bar
        dataKey="won"
        name="Won"
        fill="#16a34a"
        radius={[8, 8, 0, 0]}
      />

      <Bar
        dataKey="open"
        name="Open"
        fill="#f97316"
        radius={[8, 8, 0, 0]}
      />
    </BarChart>
  </ResponsiveContainer>
</section>
</section>
        <section className="grid grid-cols-1 xl:grid-cols-2 gap-6">

          <ChartCard title="Receita Mensal">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`} />
                <Tooltip
                  formatter={(value) => [
                   new Intl.NumberFormat('pt-BR', {
                    style: 'currency',
                    currency: 'BRL'
                 }).format(value || 0),
                 'Receita'
               ]}
             />
                <Line
                  type="monotone"
                  dataKey="receita"
                  stroke="#1d4ed8"
                  strokeWidth={3}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Leads por Status">
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={statusData}
                  dataKey="total"
                  nameKey="name"
                  outerRadius={110}
                  label
                >
                  {statusData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatNumber(value)} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Top Responsáveis por Receita">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={assigneeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(value) => `R$ ${(value / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(value) => formatBRL(value)} />
                <Bar dataKey="receita" fill="#0f172a" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Evolução de Leads Mensais">
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={monthlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip formatter={(value) => formatNumber(value)} />
                <Line
                  type="monotone"
                  dataKey="leads"
                  stroke="#2563eb"
                  strokeWidth={3}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="won"
                  stroke="#0f172a"
                  strokeWidth={3}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

        </section>

      </main>
    </div>
  );
}

function MetricCard({ title, value, icon, description }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm text-slate-500">{title}</span>
        <div className="bg-slate-100 text-slate-800 p-2 rounded-xl">
          {icon}
        </div>
      </div>

      <div className="text-2xl font-bold text-slate-950">
        {value}
      </div>

      <p className="text-xs text-slate-500 mt-2">
        {description}
      </p>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
      <h2 className="text-lg font-semibold text-slate-800 mb-4">
        {title}
      </h2>
      {children}
    </div>
  );
}

function FunnelChart({ data, formatNumber, formatBRL }) {
  const maxTotal = Math.max(...data.map((item) => item.total || 0), 1);
  const minTotal = Math.min(...data.map((item) => item.total || 0), maxTotal);

  const colors = {
    Lost: 'from-red-500 to-red-600',
    Won: 'from-green-500 to-green-600',
    Open: 'from-blue-500 to-blue-600',
    Cancelado: 'from-slate-500 to-slate-600',
    Pending: 'from-amber-400 to-orange-500'
  };

  function getWidth(total) {
    if (maxTotal === minTotal) return 68;

    const normalized = (total - minTotal) / (maxTotal - minTotal);

    return 34 + normalized * 34;
  }

  return (
    <div className="w-full py-2 space-y-2">
      {data.map((item, index) => {
        const width = getWidth(item.total);
        const color = colors[item.label] || 'from-blue-500 to-blue-600';

        return (
          <div
            key={`${item.label}-${index}`}
            className="w-full flex justify-center"
          >
            <div
              className={`bg-gradient-to-r ${color} rounded-lg shadow-sm text-white px-4 py-2`}
              style={{
                width: `${width}%`,
                minWidth: '260px',
                maxWidth: '520px'
              }}
            >
              <div className="grid grid-cols-[1.2fr_auto_auto] items-center gap-3">
                <div className="min-w-0">
                  <div className="text-base font-bold leading-tight">
                    {item.label}
                  </div>

                  <div className="text-[11px] text-white/90 mt-0.5">
                    {Number(item.percent || 0).toFixed(2)}% do total
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[9px] uppercase tracking-wide text-white/80">
                    Qtd.
                  </div>

                  <div className="text-xl font-black leading-none">
                    {formatNumber(item.total)}
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="text-[9px] uppercase tracking-wide text-white/80">
                    Receita
                  </div>

                  <div className="text-xs font-bold whitespace-nowrap">
                    {formatBRL(item.revenue)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}


function SourceRanking({ data, formatBRL, formatNumber }) {
  const sortedData = [...data]
    .sort((a, b) => Number(b.receita || 0) - Number(a.receita || 0))
    .slice(0, 8);

  const maxRevenue = Math.max(
    ...sortedData.map((item) => Number(item.receita || 0)),
    1
  );

  return (
    <div className="space-y-4">
      {sortedData.map((item, index) => {
        const percent = (Number(item.receita || 0) / maxRevenue) * 100;
        const conversion =
          item.leads > 0
            ? ((Number(item.won || 0) / Number(item.leads || 0)) * 100).toFixed(1)
            : '0.0';

        return (
          <div
            key={`${item.name}-${index}`}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
          >
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-black">
                    {index + 1}
                  </span>

                  <h3 className="font-bold text-slate-900 truncate">
                    {item.name || 'Sem source'}
                  </h3>
                </div>

                <p className="text-xs text-slate-500 mt-1 ml-9">
                  Leads: {formatNumber(item.leads)} | Won: {formatNumber(item.won)} | Conversão: {conversion}%
                </p>
              </div>

              <div className="text-right shrink-0">
                <div className="text-xs text-slate-500">
                  Receita
                </div>

                <div className="text-xl font-black text-blue-700">
                  {formatBRL(item.receita)}
                </div>
              </div>
            </div>

            <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-600 to-cyan-400 rounded-full"
                style={{
                  width: `${Math.max(percent, 2)}%`
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
export default Dashboard;
