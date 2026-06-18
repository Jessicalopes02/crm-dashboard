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
  ComposableMap,
  Geographies,
  Geography
} from 'react-simple-maps';

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
  const [selectedRevenueMonth, setSelectedRevenueMonth] = useState('');
  const [achievement, setAchievement] = useState(null);
  const [commercialFlow, setCommercialFlow] = useState(null);
  const [comparisonSource, setComparisonSource] = useState('');

  useEffect(() => {
    loadDashboard();
  }, [startDate, endDate, comparisonSource]);

  async function loadDashboard() {
  try {
    const response = await api.get('/dashboard/full', {
      params: {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        comparisonSource:
        comparisonSource || undefined
     }
  });

    const full = response.data;

    const referenceDate = endDate
  ? new Date(`${endDate}T12:00:00`)
  : new Date();

const goalPeriod = `${referenceDate.getFullYear()}-${String(
  referenceDate.getMonth() + 1
).padStart(2, '0')}`;

const achievementResponse = await api.get('/goals/achievement', {
  params: {
    period: goalPeriod
  }
});

const achievementPayload =
  achievementResponse.data?.data ||
  achievementResponse.data;

setAchievement(achievementPayload);

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
    setCommercialFlow(full.commercialFlow || null);

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

  const STATUS_CONFIG = [
{
code: 0,
name: 'Open',
color: '#0f172a'
},
{
code: 1,
name: 'Pending',
color: '#f59e0b'
},
{
code: 10,
name: 'Won',
color: '#16a34a'
},
{
code: 11,
name: 'Lost',
color: '#ef4444'
},
{
code: 12,
name: 'Cancelado',
color: '#64748b'
}
];

const statusTotalsMap = new Map(
(dashboard.charts.leadsByStatus || []).map(
(item) => [
Number(item._id),
Number(item.total || 0)
]
)
);

const statusData = STATUS_CONFIG.map((status) => ({
code: status.code,
name: status.name,
color: status.color,
total: statusTotalsMap.get(status.code) || 0
}));

const totalStatusLeads = statusData.reduce(
(sum, item) => sum + Number(item.total || 0),
0
);


  const FUNNEL_STATUS_ORDER = [
'Lost',
'Won',
'Open'
];

const funnelData = [...funnel]
.filter((item) =>
FUNNEL_STATUS_ORDER.includes(item.label)
)
.map((item) => ({
label: item.label,
total: item.total || 0,
percent: item.percentOfTotal || 0,
revenue: item.revenue || 0
}))
.sort(
(a, b) =>
FUNNEL_STATUS_ORDER.indexOf(a.label) -
FUNNEL_STATUS_ORDER.indexOf(b.label)
);

const visibleFunnelTotal = funnelData.reduce(
(sum, item) =>
sum + Number(item.total || 0),
0
);

const normalizedFunnelData = funnelData.map(
(item) => ({
...item,

percent:
  visibleFunnelTotal > 0
    ? (
        Number(item.total || 0) /
        visibleFunnelTotal
      ) * 100
    : 0

})
);


  const monthlyData =
  dashboard?.charts?.leadsByMonth?.map((item) => ({
    month: `${String(item._id.month).padStart(2, '0')}/${item._id.year}`,
    receita: item.revenue || 0,
    revenue: item.revenue || 0,
    leads: item.totalLeads || 0,
    won: item.wonLeads || 0
  })) || [];
const monthlyChartData = monthlyData.slice(-12);

const selectedRevenueData = selectedRevenueMonth
  ? monthlyData.filter((item) => item.month === selectedRevenueMonth)
  : monthlyData.slice(-12);

const revenueMonthOptions = monthlyData.map((item) => item.month);



const leadTimeChartData =
  leadTime?.byMonth?.map((item) => ({
    month: `${String(item._id.month).padStart(2, '0')}/${item._id.year}`,
    averageDays: Number(item.averageLeadTimeDays || 0),
    totalWon: Number(item.totalWon || 0)
  })) || [];

  
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

  const productData = [...products]
  .sort((a, b) => Number(b.revenue || 0) - Number(a.revenue || 0))
  .slice(0, 10)
  .map((item) => ({
    name: item._id || 'Sem produto',
    receita: item.revenue || 0,
    won: item.wonLeads || 0,
    leads: item.totalLeads || 0
  }));

const totalProductRevenue = productData.reduce(
  (sum, item) => sum + Number(item.receita || 0),
  0
);

   const comparisonEndMonth = endDate
  ? new Date(`${endDate}T12:00:00`).getMonth() + 1
  : new Date().getMonth() + 1;

const comparisonData = yearComparison
  .filter(
    (item) =>
      Number(item.month) <= comparisonEndMonth
  )
  .map((item) => {
    const currentRevenue = Number(
      item.current?.revenue || 0
    );

    const previousRevenue = Number(
      item.previous?.revenue || 0
    );

    const difference =
      currentRevenue - previousRevenue;

    const growth =
      previousRevenue > 0
        ? (difference / previousRevenue) * 100
        : currentRevenue > 0
          ? 100
          : 0;

    return {
      month: item.monthName,
      monthNumber: Number(item.month),
      currentYear: item.currentYear,
      previousYear: item.previousYear,
      currentRevenue,
      previousRevenue,
      difference,
      growth
    };
  });

const comparisonCurrentTotal =
  comparisonData.reduce(
    (sum, item) =>
      sum + Number(item.currentRevenue || 0),
    0
  );

const comparisonPreviousTotal =
  comparisonData.reduce(
    (sum, item) =>
      sum + Number(item.previousRevenue || 0),
    0
  );

const comparisonDifference =
  comparisonCurrentTotal -
  comparisonPreviousTotal;

const comparisonGrowth =
  comparisonPreviousTotal > 0
    ? (
        comparisonDifference /
        comparisonPreviousTotal
      ) * 100
    : comparisonCurrentTotal > 0
      ? 100
      : 0;

const comparisonCurrentYear =
  comparisonData[0]?.currentYear ||
  new Date().getFullYear();

const comparisonPreviousYear =
  comparisonData[0]?.previousYear ||
  comparisonCurrentYear - 1;


    const leadTimeData =
      leadTime?.byMonth?.map((item) => ({
        month: `${String(item._id.month).padStart(2, '0')}/${item._id.year}`,
        leadTime: Number(item.averageLeadTimeDays || 0).toFixed(1),
        won: item.totalWon || 0
      })) || [];

    const stateData = states.map((item) => ({
  name: item._id,
  receita: item.revenue || 0,
  leads: item.totalLeads || 0,
  won: item.wonLeads || 0,
  open: item.openLeads || 0
}));

const UF_MAP = {
  AC: 'AC', ACRE: 'AC',
  AL: 'AL', ALAGOAS: 'AL',
  AP: 'AP', AMAPA: 'AP', AMAPÁ: 'AP',
  AM: 'AM', AMAZONAS: 'AM',
  BA: 'BA', BAHIA: 'BA',
  CE: 'CE', CEARA: 'CE', CEARÁ: 'CE',
  DF: 'DF', 'DISTRITO FEDERAL': 'DF',
  ES: 'ES', 'ESPIRITO SANTO': 'ES', 'ESPÍRITO SANTO': 'ES',
  GO: 'GO', GOIAS: 'GO', GOIÁS: 'GO',
  MA: 'MA', MARANHAO: 'MA', MARANHÃO: 'MA',
  MT: 'MT', 'MATO GROSSO': 'MT',
  MS: 'MS', 'MATO GROSSO DO SUL': 'MS',
  MG: 'MG', 'MINAS GERAIS': 'MG',
  PA: 'PA', PARA: 'PA', PARÁ: 'PA',
  PB: 'PB', PARAIBA: 'PB', PARAÍBA: 'PB',
  PR: 'PR', PARANA: 'PR', PARANÁ: 'PR',
  PE: 'PE', PERNAMBUCO: 'PE',
  PI: 'PI', PIAUI: 'PI', PIAUÍ: 'PI',
  RJ: 'RJ', 'RIO DE JANEIRO': 'RJ',
  RN: 'RN', 'RIO GRANDE DO NORTE': 'RN',
  RS: 'RS', 'RIO GRANDE DO SUL': 'RS',
  RO: 'RO', RONDONIA: 'RO', RONDÔNIA: 'RO',
  RR: 'RR', RORAIMA: 'RR',
  SC: 'SC', 'SANTA CATARINA': 'SC',
  SP: 'SP', 'SAO PAULO': 'SP', 'SÃO PAULO': 'SP',
  SE: 'SE', SERGIPE: 'SE',
  TO: 'TO', TOCANTINS: 'TO'
};

function normalizeText(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .trim();
}

function extractUF(rawValue) {
  const value = normalizeText(rawValue);

  if (!value || value === 'SEM ESTADO') return null;

  const directMatch = value.match(/\b(AC|AL|AP|AM|BA|CE|DF|ES|GO|MA|MT|MS|MG|PA|PB|PR|PE|PI|RJ|RN|RS|RO|RR|SC|SP|SE|TO)\b/);

  if (directMatch) {
    return directMatch[1];
  }

  for (const key of Object.keys(UF_MAP)) {
    if (value.includes(key)) {
      return UF_MAP[key];
    }
  }

  return null;
}

const mapData = stateData.reduce((acc, item) => {
  const uf = extractUF(item.name);

  if (!uf) return acc;

  if (!acc[uf]) {
    acc[uf] = {
      uf,
      leads: 0,
      won: 0,
      open: 0,
      receita: 0
    };
  }

  acc[uf].leads += Number(item.leads || 0);
  acc[uf].won += Number(item.won || 0);
  acc[uf].open += Number(item.open || 0);
  acc[uf].receita += Number(item.receita || 0);

  return acc;
}, {});

const mapArray = Object.values(mapData);

const totalMapLeads = mapArray.reduce(
  (sum, item) => sum + Number(item.leads || 0),
  0
);

const maxLeads = Math.max(
  ...mapArray.map((item) => item.leads),
  1
);

function getMapColor(value) {
  if (!value) return '#e2e8f0';

  const intensity = value / maxLeads;

  if (intensity > 0.8) return '#1d4ed8';
  if (intensity > 0.6) return '#2563eb';
  if (intensity > 0.4) return '#60a5fa';
  if (intensity > 0.2) return '#93c5fd';

  return '#dbeafe';
}

const goalResults =
  achievement?.results ||
  achievement?.data?.results ||
  [];

const generalGoal =
  goalResults
    .filter((item) => item.goal?.sector === 'geral')
    .reduce(
      (sum, item) =>
        sum + Number(item.goal?.targetRevenue || 0),
      0
    );

function normalizeGoalName(name) {
return String(name || '')
.normalize('NFD')
.replace(/[\u0300-\u036f]/g, '')
.replace(/\s+/g, ' ')
.trim()
.toLowerCase();
}

function canonicalGoalName(name) {
const normalized = normalizeGoalName(name);

const aliases = {
'marcus santana': 'marcus vinicius dias santana',
'marcus vinicius dias santana': 'marcus vinicius dias santana',
'beatriz costa costa': 'beatriz costa',
'beatriz costa': 'beatriz costa',
'edson da silva bomfim junior': 'edson da silva bomfim junior'
};

return aliases[normalized] || normalized;
}

const closerProjectionData = goalResults
.filter(
(item) =>
item.goal?.sector === 'closer' &&
Number(item.goal?.targetRevenue || 0) > 0
)
.map((goalItem) => {
const name =
goalItem.goal?.userName ||
'Sem responsável';


const performanceItem = performance.find(
  (item) =>
    canonicalGoalName(item._id) ===
    canonicalGoalName(name)
);

const goal = Number(
  goalItem.goal?.targetRevenue || 0
);

const actual = Number(
  goalItem.actual?.revenue || 0
);

const estimated = Number(
  performanceItem?.estimatedRevenue || 0
);

const projected = actual + estimated;

const actualPercent =
  goal > 0
    ? (actual / goal) * 100
    : 0;

const projectedPercent =
  goal > 0
    ? (projected / goal) * 100
    : 0;

return {
  name,
  firstName: String(name)
    .split(' ')
    .filter(Boolean)[0],
  goal,
  actual,
  estimated,
  projected,
  actualPercent,
  projectedPercent,
  gap: Math.max(goal - projected, 0)
};


})
.sort(
(a, b) =>
b.projectedPercent -
a.projectedPercent
)
.slice(0, 8);


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



const realizedRevenue =
  Number(metrics.totalRevenue || 0);

const estimatedRevenue =
  performance.reduce(
    (sum, item) =>
      sum + Number(item.estimatedRevenue || 0),
    0
  );

const projectedRevenue =
  realizedRevenue + estimatedRevenue;

const realizedPercent =
  generalGoal > 0
    ? (realizedRevenue / generalGoal) * 100
    : 0;

const projectedPercent =
  generalGoal > 0
    ? (projectedRevenue / generalGoal) * 100
    : 0;

const remainingToGoal =
  Math.max(generalGoal - realizedRevenue, 0);

const projectedRemaining =
  Math.max(generalGoal - projectedRevenue, 0);


const goalComparisonData = [
{
name: 'Meta',
value: generalGoal,
fill: '#0f172a'
},
{
name: 'Realizado',
value: realizedRevenue,
fill: '#2563eb'
},
{
name: 'Projeção',
value: projectedRevenue,
fill: '#06b6d4'
}
];

const commercialFlowData =
commercialFlow?.months?.map((item) => ({
label: item.label,
entries: Number(item.entries || 0),
closures: Number(item.closures || 0),
backlog: Number(item.backlog || 0),
won: Number(item.won || 0),
lost: Number(item.lost || 0),
cancelled: Number(item.cancelled || 0),
balance: Number(item.balance || 0)
})) || [];

const commercialFlowTotals =
commercialFlow?.totals || {
entries: 0,
closures: 0,
won: 0,
lost: 0,
cancelled: 0,
balance: 0
};

const startingBacklog =
Number(
commercialFlow?.startingBacklog || 0
);

const endingBacklog =
Number(
commercialFlow?.endingBacklog || 0
);

const backlogDifference =
endingBacklog - startingBacklog;


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
       <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
  <MetricCard
    title="Receita"
    value={formatBRL(metrics.totalRevenue)}
    icon={<DollarSign size={20} />}
    description="Receita total das leads Won"
  />

  <MetricCard
    title="Conversão"
    value={`${conversionRate}%`}
    icon={<TrendingUp size={20} />}
    description="Percentual de leads convertidas"
  />

  <MetricCard
    title="Lead Time Médio"
    value={`${Number(leadTime?.summary?.averageLeadTimeDays || 0).toFixed(1)} dias`}
    icon={<TrendingUp size={20} />}
    description="Tempo médio da abertura até a venda"
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
  <ResponsiveContainer width="100%" height="100%">
    <ComposedChart
      data={monthlyData.slice(-12)}
      margin={{ top: 20, right: 30, left: 10, bottom: 10 }}
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
        barSize={38}
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
          strokeWidth: 2,
          fill: '#ffffff'
        }}
        activeDot={{
          r: 6
        }}
      />
    </ComposedChart>
 </ResponsiveContainer>
</div>

</section>

<section className="bg-white rounded-2xl shadow p-5">
  <div className="flex items-center justify-between mb-4">
    <div>
      <h2 className="text-lg font-black text-slate-900">
        Ranking Comercial
      </h2>

      <p className="text-sm text-slate-500">
        Performance por responsável no período
      </p>
    </div>
  </div>

  <div className="space-y-2">
    {performance.slice(0, 8).map((item, index) => {
      const revenue = Number(item.totalRevenue || 0);
      const won = Number(item.wonLeads || 0);
      const lost = Number(item.lostLeads || 0);
      const leads = Number(item.totalLeads || 0);
      const conversion = Number(item.conversionRate || 0);
      const ticket = Number(item.averageTicket || 0);

      return (
        <div
          key={`${item._id}-${index}`}
          className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 hover:bg-white transition"
        >
          <div className="grid grid-cols-[38px_minmax(0,1.4fr)_130px_130px_70px_100px_110px] gap-3 items-center">
            <div className="w-8 h-8 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-black">
              {index + 1}
            </div>

           <div className="min-w-0">
  <div className="font-black text-slate-900 truncate">
    {item._id || 'Sem responsável'}
  </div>

  <div className="text-xs text-slate-500">
    {formatNumber(leads)} leads • {formatNumber(lost)} lost
  </div>
</div>

<div>
  <div className="text-[11px] text-slate-500">
    Estimativa
  </div>

  <div className="text-sm font-black text-cyan-700">
    {formatBRL(item.estimatedRevenue || 0)}
  </div>
</div>

<div>
  <div className="text-[11px] text-slate-500">
    Receita
  </div>

  <div className="text-sm font-black text-blue-700">
    {formatBRL(revenue)}
  </div>
</div>

<div>
  <div className="text-[11px] text-slate-500">
    Won
  </div>

              <div className="text-sm font-black text-green-600">
                {formatNumber(won)}
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-500">
                Conversão
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-blue-700">
                  {conversion.toFixed(1)}%
                </span>
              </div>

              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-1">
                <div
                  className="h-full bg-blue-600 rounded-full"
                  style={{
                    width: `${Math.min(conversion, 100)}%`
                  }}
                />
              </div>
            </div>

            <div>
              <div className="text-[11px] text-slate-500">
                Ticket
              </div>

              <div className="text-sm font-black text-slate-900 truncate">
                {formatBRL(ticket)}
              </div>
            </div>
          </div>
        </div>
      );
    })}
  </div>
</section>

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
  data={normalizedFunnelData}
  formatNumber={formatNumber}
  formatBRL={formatBRL}
/>
</section>

<ChartCard
  title="Evolução do Lead Time"
  subtitle="Tempo médio entre abertura e venda"
>
  <div style={{ width: '100%', height: 400 }}>
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart
        data={leadTimeChartData}
        margin={{ top: 20, right: 30, left: 10, bottom: 10 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

        <XAxis
          dataKey="month"
          tick={{ fontSize: 12, fill: '#475569' }}
          axisLine={false}
          tickLine={false}
        />

        <YAxis
          yAxisId="days"
          tick={{ fontSize: 12, fill: '#475569' }}
          axisLine={false}
          tickLine={false}
          label={{
            value: 'Dias',
            angle: -90,
            position: 'insideLeft',
            fill: '#475569',
            fontSize: 12
          }}
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
            if (name === 'Lead Time Médio') {
              return [`${Number(value).toFixed(1)} dias`, 'Lead Time Médio'];
            }

            if (name === 'Won') {
              return [formatNumber(value), 'Won'];
            }

            return [value, name];
          }}
          labelStyle={{ color: '#0f172a', fontWeight: 700 }}
          contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0' }}
        />

        <Legend />

        <Bar
          yAxisId="days"
          dataKey="averageDays"
          name="Lead Time Médio"
          fill="#2563eb"
          radius={[8, 8, 0, 0]}
          barSize={38}
        />

        <Line
          yAxisId="won"
          type="monotone"
          dataKey="totalWon"
          name="Won"
          stroke="#16a34a"
          strokeWidth={3}
          dot={{ r: 4, strokeWidth: 2, fill: '#ffffff' }}
          activeDot={{ r: 6 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  </div>
</ChartCard>

<section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
  <div className="bg-white rounded-2xl shadow p-5">
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h2 className="text-xl font-black text-slate-900">
          Receita por Source
        </h2>

        <p className="text-sm text-slate-500">
          Principais origens por receita
        </p>
      </div>
    </div>

    <CompactRanking
      data={sourceData}
      valueKey="receita"
      totalLabel="Leads"
      formatBRL={formatBRL}
      formatNumber={formatNumber}
      maxItems={6}
    />
  </div>

  <div className="bg-white rounded-2xl shadow p-5">
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <h2 className="text-xl font-black text-slate-900">
          Receita por Produto
        </h2>

        <p className="text-sm text-slate-500">
          Produtos por receita individual
        </p>
      </div>

      <div className="text-right shrink-0">
        <div className="text-xs text-slate-500">
          Total listado
        </div>

        <div className="text-lg font-black text-blue-700">
          {formatBRL(totalProductRevenue)}
        </div>
      </div>
    </div>

    <CompactRanking
      data={productData}
      valueKey="receita"
      totalLabel="Leads"
      formatBRL={formatBRL}
      formatNumber={formatNumber}
      maxItems={6}
    />
  </div>
</section>

  <section className="bg-white rounded-2xl shadow p-6">
  <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
    <div>
      <h2 className="text-2xl font-bold">
        Comparativo Anual
      </h2>


  <p className="text-slate-500">
    Receita acumulada até o período selecionado
  </p>
</div>

<div className="flex flex-wrap items-end gap-3">
  <div>
    <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-1">
      Origem
    </label>

    <select
      value={comparisonSource}
      onChange={(event) =>
        setComparisonSource(event.target.value)
      }
      className="h-10 min-w-[180px] rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
    >
      <option value="">
        Todas as sources
      </option>

      <option value="chinaLink">
        China Link
      </option>

      <option value="metodo12p">
        Método 12P
      </option>

      <option value="process">
        Process
      </option>
    </select>
  </div>

  <div
    className={`h-10 flex items-center px-4 rounded-xl text-sm font-black ${
      comparisonGrowth >= 0
        ? 'bg-green-100 text-green-700'
        : 'bg-red-100 text-red-700'
    }`}
  >
    {comparisonGrowth >= 0 ? '▲' : '▼'}{' '}
    {Math.abs(comparisonGrowth).toFixed(1)}%
  </div>
</div>

  </div>


  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-7">
    <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
      <div className="text-xs font-bold uppercase tracking-wide text-blue-600">
        Ano atual · {comparisonCurrentYear}
      </div>


  <div className="text-2xl font-black text-blue-800 mt-1">
    {formatBRL(comparisonCurrentTotal)}
  </div>

  <div className="text-xs text-blue-600 mt-1">
    Acumulado no período
  </div>
</div>

<div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
  <div className="text-xs font-bold uppercase tracking-wide text-slate-500">
    Ano anterior · {comparisonPreviousYear}
  </div>

  <div className="text-2xl font-black text-slate-800 mt-1">
    {formatBRL(comparisonPreviousTotal)}
  </div>

  <div className="text-xs text-slate-500 mt-1">
    Mesmo período comparativo
  </div>
</div>

<div
  className={`rounded-2xl border p-4 ${
    comparisonDifference >= 0
      ? 'border-green-200 bg-green-50'
      : 'border-red-200 bg-red-50'
  }`}
>
  <div
    className={`text-xs font-bold uppercase tracking-wide ${
      comparisonDifference >= 0
        ? 'text-green-600'
        : 'text-red-600'
    }`}
  >
    Diferença acumulada
  </div>

  <div
    className={`text-2xl font-black mt-1 ${
      comparisonDifference >= 0
        ? 'text-green-700'
        : 'text-red-700'
    }`}
  >
    {comparisonDifference >= 0 ? '+' : ''}
    {formatBRL(comparisonDifference)}
  </div>

  <div
    className={`text-xs mt-1 ${
      comparisonDifference >= 0
        ? 'text-green-600'
        : 'text-red-600'
    }`}
  >
    {comparisonGrowth.toFixed(1)}% em relação ao ano anterior
  </div>
</div>


  </div>

  <div style={{ width: '100%', height: 420 }}>
    <ResponsiveContainer width="100%" height="100%">
      <LineChart
        data={comparisonData}
        margin={{
          top: 20,
          right: 30,
          left: 20,
          bottom: 10
        }}
      >
        <CartesianGrid
          strokeDasharray="3 3"
          stroke="#e2e8f0"
        />


    <XAxis
      dataKey="month"
      tick={{
        fontSize: 12,
        fill: '#475569'
      }}
      axisLine={false}
      tickLine={false}
    />

    <YAxis
      tick={{
        fontSize: 12,
        fill: '#475569'
      }}
      axisLine={false}
      tickLine={false}
      tickFormatter={(value) =>
        `R$ ${(value / 1000).toFixed(0)}k`
      }
    />

    <Tooltip
      formatter={(value, name, props) => {
        const item = props?.payload || {};

        if (name === `Ano Atual (${comparisonCurrentYear})`) {
          return [
            formatBRL(value),
            `Ano Atual (${comparisonCurrentYear})`
          ];
        }

        if (name === `Ano Anterior (${comparisonPreviousYear})`) {
          return [
            formatBRL(value),
            `Ano Anterior (${comparisonPreviousYear})`
          ];
        }

        return [formatBRL(value), name];
      }}
      labelFormatter={(label, payload) => {
        const item = payload?.[0]?.payload;

        if (!item) {
          return label;
        }

        return `${label} · Variação: ${
          item.growth >= 0 ? '+' : ''
        }${Number(item.growth || 0).toFixed(1)}%`;
      }}
      labelStyle={{
        color: '#0f172a',
        fontWeight: 800
      }}
      contentStyle={{
        borderRadius: 14,
        border: '1px solid #e2e8f0',
        boxShadow:
          '0 10px 25px rgba(15, 23, 42, 0.12)'
      }}
    />

    <Legend />

    <Line
      type="monotone"
      dataKey="previousRevenue"
      name={`Ano Anterior (${comparisonPreviousYear})`}
      stroke="#94a3b8"
      strokeWidth={3}
      strokeDasharray="8 6"
      dot={{
        r: 4,
        strokeWidth: 2,
        fill: '#ffffff',
        stroke: '#94a3b8'
      }}
      activeDot={{
        r: 7
      }}
    />

    <Line
      type="monotone"
      dataKey="currentRevenue"
      name={`Ano Atual (${comparisonCurrentYear})`}
      stroke="#2563eb"
      strokeWidth={4}
      dot={{
        r: 5,
        strokeWidth: 3,
        fill: '#ffffff',
        stroke: '#2563eb'
      }}
      activeDot={{
        r: 8
      }}
    />
  </LineChart>
</ResponsiveContainer>


  </div>
</section>

<section className="bg-white rounded-2xl shadow p-6">
  <div className="flex items-center justify-between mb-6">
    <div>
      <h2 className="text-2xl font-bold">
        Ranking por Estado / Território
      </h2>

      <p className="text-slate-500">
        Distribuição geográfica dos leads e receita por UF
      </p>
    </div>
  </div>

    <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_360px] gap-6 items-start">
    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
      <div className="w-full h-[520px] flex items-center justify-center overflow-hidden">
    <ComposableMap
      projection="geoMercator"
      width={700}
      height={700}
      projectionConfig={{
        scale: 760,
        center: [-54, -15]
      }}
      style={{
        width: '100%',
        height: '100%'
      }}
    >
      <Geographies geography="/maps/brazil-states.geojson">
        {({ geographies }) =>
          geographies.map((geo) => {
            const uf =
              geo.properties.sigla ||
              geo.properties.SIGLA ||
              geo.properties.uf ||
              geo.properties.UF ||
              geo.properties.id ||
              geo.properties.name;

            const normalizedUf = extractUF(uf);
            const stateInfo = mapData[normalizedUf];
            const leads = stateInfo?.leads || 0;

            return (
              <Geography
                key={geo.rsmKey}
                geography={geo}
                fill={getMapColor(leads)}
                stroke="#ffffff"
                strokeWidth={0.8}
                style={{
                  default: {
                    outline: 'none'
                  },
                  hover: {
                    fill: '#0f172a',
                    outline: 'none',
                    cursor: 'pointer'
                  },
                  pressed: {
                    outline: 'none'
                  }
                }}
              >
                <title>
                  {normalizedUf || uf}
                  {`\nLeads: ${formatNumber(stateInfo?.leads || 0)}`}
                  {`\nWon: ${formatNumber(stateInfo?.won || 0)}`}
                  {`\nOpen: ${formatNumber(stateInfo?.open || 0)}`}
                  {`\nReceita: ${formatBRL(stateInfo?.receita || 0)}`}
                </title>
              </Geography>
            );
          })
        }
      </Geographies>
    </ComposableMap>
  </div>

  <div className="flex items-center gap-3 mt-4 text-xs text-slate-600">
    <span>Menor volume</span>

    <div className="flex h-3 w-40 rounded-full overflow-hidden border border-slate-200">
      <div className="flex-1 bg-[#dbeafe]" />
      <div className="flex-1 bg-[#93c5fd]" />
      <div className="flex-1 bg-[#60a5fa]" />
      <div className="flex-1 bg-[#2563eb]" />
      <div className="flex-1 bg-[#1d4ed8]" />
    </div>

    <span>Maior volume</span>
  </div>
</div>

    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200">
      <h3 className="text-lg font-semibold mb-4">
        Top estados
      </h3>

      <div className="space-y-3">
        {mapArray
  .sort((a, b) => b.leads - a.leads)
  .slice(0, 8)
  .map((item) => {
    const statePercentage =
      totalMapLeads > 0
        ? (
            Number(item.leads || 0) /
            totalMapLeads
          ) * 100
        : 0;

    return (
            <div
              key={item.uf}
              className="flex items-center justify-between border-b border-slate-200 pb-2"
            >
              <div>
                <div className="font-semibold text-slate-800">
                  {item.uf}
                </div>

                <div className="text-xs text-slate-500">
                  Won: {formatNumber(item.won)} | Open: {formatNumber(item.open)}
                </div>
              </div>

              <div className="text-right">
                <div className="font-semibold text-blue-700">
                  {formatNumber(item.leads)} leads
                </div>

              <div className="text-xs font-semibold text-blue-600">
                {statePercentage.toFixed(1)}% do total
              </div>

              <div className="text-xs text-slate-500">
                {formatBRL(item.receita)}
              </div>
              </div>
            </div>
          );
       })}
      </div>
        </div>
  </div>
</section>

<section className="grid grid-cols-1 xl:grid-cols-2 gap-6">
 <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
  <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
    <div>
      <h2 className="text-xl font-black text-slate-900">
        Meta x Realizado x Estimado
      </h2>

      <p className="text-sm text-slate-500 mt-1">
        Resultado atual e projeção comercial do período
      </p>
    </div>

    <div
      className={`px-4 py-2 rounded-xl text-sm font-black ${
        projectedPercent >= 100
          ? 'bg-green-100 text-green-700'
          : projectedPercent >= 80
            ? 'bg-blue-100 text-blue-700'
            : 'bg-amber-100 text-amber-700'
      }`}
    >
      Projeção: {projectedPercent.toFixed(1)}%
    </div>
  </div>

  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
    <div className="rounded-xl bg-slate-100 border border-slate-200 p-3">
      <div className="text-xs font-bold uppercase text-slate-500">
        Meta
      </div>

      <div className="text-lg font-black text-slate-900 mt-1">
        {formatBRL(generalGoal)}
      </div>
    </div>

    <div className="rounded-xl bg-blue-50 border border-blue-100 p-3">
      <div className="text-xs font-bold uppercase text-blue-600">
        Realizado
      </div>

      <div className="text-lg font-black text-blue-800 mt-1">
        {formatBRL(realizedRevenue)}
      </div>
    </div>

    <div className="rounded-xl bg-cyan-50 border border-cyan-100 p-3">
      <div className="text-xs font-bold uppercase text-cyan-600">
        Estimado
      </div>

      <div className="text-lg font-black text-cyan-800 mt-1">
        {formatBRL(estimatedRevenue)}
      </div>
    </div>
  </div>

  <ResponsiveContainer width="100%" height={220}>
    <BarChart
      data={goalComparisonData}
      layout="vertical"
      margin={{
        top: 10,
        right: 30,
        left: 15,
        bottom: 10
      }}
    >
      <CartesianGrid
        strokeDasharray="3 3"
        stroke="#e2e8f0"
        horizontal={false}
      />

      <XAxis
        type="number"
        tick={{
          fontSize: 11,
          fill: '#475569'
        }}
        axisLine={false}
        tickLine={false}
        tickFormatter={(value) =>
          `R$ ${(value / 1000).toFixed(0)}k`
        }
      />

      <YAxis
        type="category"
        dataKey="name"
        width={75}
        tick={{
          fontSize: 12,
          fill: '#334155',
          fontWeight: 700
        }}
        axisLine={false}
        tickLine={false}
      />

      <Tooltip
        formatter={(value) => [
          formatBRL(value),
          'Valor'
        ]}
        contentStyle={{
          borderRadius: 12,
          border: '1px solid #e2e8f0'
        }}
      />

      <Bar
        dataKey="value"
        radius={[0, 8, 8, 0]}
        barSize={30}
      >
        {goalComparisonData.map((item) => (
          <Cell
            key={item.name}
            fill={item.fill}
          />
        ))}
      </Bar>
    </BarChart>
  </ResponsiveContainer>

  <div className="space-y-3 mt-2">
    <div>
      <div className="flex items-center justify-between text-xs font-bold mb-1">
        <span className="text-slate-600">
          Progresso realizado
        </span>

        <span className="text-blue-700">
          {realizedPercent.toFixed(1)}%
        </span>
      </div>

      <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-blue-600 rounded-full"
          style={{
            width: `${Math.min(realizedPercent, 100)}%`
          }}
        />
      </div>
    </div>

    <div>
      <div className="flex items-center justify-between text-xs font-bold mb-1">
        <span className="text-slate-600">
          Progresso com estimativa
        </span>

        <span className="text-cyan-700">
          {projectedPercent.toFixed(1)}%
        </span>
      </div>

      <div className="w-full h-3 bg-slate-200 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${
            projectedPercent >= 100
              ? 'bg-green-500'
              : 'bg-cyan-500'
          }`}
          style={{
            width: `${Math.min(projectedPercent, 100)}%`
          }}
        />
      </div>
    </div>
  </div>

  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-xs text-slate-500">
        Falta realizar
      </div>

      <div className="text-base font-black text-slate-900 mt-1">
        {formatBRL(remainingToGoal)}
      </div>
    </div>

    <div
      className={`rounded-xl border p-3 ${
        projectedRemaining === 0
          ? 'border-green-200 bg-green-50'
          : 'border-amber-200 bg-amber-50'
      }`}
    >
      <div
        className={`text-xs ${
          projectedRemaining === 0
            ? 'text-green-600'
            : 'text-amber-600'
        }`}
      >
        Falta considerando a estimativa
      </div>

      <div
        className={`text-base font-black mt-1 ${
          projectedRemaining === 0
            ? 'text-green-700'
            : 'text-amber-700'
        }`}
      >
        {projectedRemaining === 0
          ? 'Meta projetada atingida'
          : formatBRL(projectedRemaining)}
      </div>
    </div>
  </div>
</div>

          <ChartCard
title="Leads por Status"
subtitle="Distribuição das oportunidades no período selecionado"

>

  <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_240px] gap-6 items-center">
    <div className="relative w-full h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={statusData}
            dataKey="total"
            nameKey="name"
            innerRadius={78}
            outerRadius={118}
            paddingAngle={3}
            stroke="#ffffff"
            strokeWidth={3}
          >
            {statusData.map((entry) => (
              <Cell
                key={entry.code}
                fill={entry.color}
              />
            ))}
          </Pie>


      <Tooltip
        formatter={(value, name) => {
          const percent =
            totalStatusLeads > 0
              ? (
                  (Number(value || 0) /
                    totalStatusLeads) *
                  100
                ).toFixed(1)
              : '0.0';

          return [
            `${formatNumber(value)} leads · ${percent}%`,
            name
          ];
        }}
        contentStyle={{
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow:
            '0 8px 20px rgba(15, 23, 42, 0.10)'
        }}
      />
    </PieChart>
  </ResponsiveContainer>

  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
    <div className="text-3xl font-black text-slate-900">
      {formatNumber(totalStatusLeads)}
    </div>

    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
      Total de leads
    </div>
  </div>
</div>

<div className="space-y-2">
  {statusData.map((item) => {
    const percent =
      totalStatusLeads > 0
        ? (
            (Number(item.total || 0) /
              totalStatusLeads) *
            100
          ).toFixed(1)
        : '0.0';

    return (
      <div
        key={item.code}
        className="flex items-center justify-between gap-4 border-b border-slate-200 py-3"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className="w-3.5 h-3.5 rounded-full shrink-0"
            style={{
              backgroundColor: item.color
            }}
          />

          <span className="text-sm font-bold text-slate-700 truncate">
            {item.name}
          </span>
        </div>

        <div className="text-right shrink-0">
          <div className="text-base font-black text-slate-900">
            {formatNumber(item.total)}
          </div>

          <div className="text-xs text-slate-500">
            {percent}%
          </div>
        </div>
      </div>
    );
  })}
</div>


  </div>
</ChartCard>


         <ChartCard
title="Meta Individual: Realizado x Projeção"
subtitle="Comparação entre meta, receita realizada e projeção com estimativas"

>

  <ResponsiveContainer width="100%" height={420}>
    <BarChart
      data={closerProjectionData}
      layout="vertical"
      margin={{
        top: 10,
        right: 25,
        left: 15,
        bottom: 10
      }}
    >
      <CartesianGrid
        strokeDasharray="3 3"
        stroke="#e2e8f0"
        horizontal={false}
      />


  <XAxis
    type="number"
    tick={{
      fontSize: 11,
      fill: '#475569'
    }}
    axisLine={false}
    tickLine={false}
    tickFormatter={(value) =>
      `R$ ${(value / 1000).toFixed(0)}k`
    }
  />

  <YAxis
    type="category"
    dataKey="firstName"
    width={75}
    tick={{
      fontSize: 12,
      fill: '#334155',
      fontWeight: 700
    }}
    axisLine={false}
    tickLine={false}
  />

  <Tooltip
    formatter={(value, name, props) => {
      const labels = {
        goal: 'Meta',
        actual: 'Realizado',
        projected: 'Projeção'
      };

      return [
        formatBRL(value),
        labels[name] || name
      ];
    }}
    labelFormatter={(label, payload) => {
      const item = payload?.[0]?.payload;

      if (!item) {
        return label;
      }

      return `${item.name} · Projeção: ${item.projectedPercent.toFixed(1)}%`;
    }}
    contentStyle={{
      borderRadius: 12,
      border: '1px solid #e2e8f0',
      boxShadow:
        '0 8px 20px rgba(15, 23, 42, 0.10)'
    }}
  />

  <Legend />

  <Bar
    dataKey="goal"
    name="Meta"
    fill="#0f172a"
    radius={[0, 6, 6, 0]}
    barSize={12}
  />

  <Bar
    dataKey="actual"
    name="Realizado"
    fill="#2563eb"
    radius={[0, 6, 6, 0]}
    barSize={12}
  />

  <Bar
    dataKey="projected"
    name="Projeção"
    fill="#06b6d4"
    radius={[0, 6, 6, 0]}
    barSize={12}
  />
</BarChart>


  </ResponsiveContainer>

  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3">
    {closerProjectionData.slice(0, 4).map((item) => {
      const achieved =
        item.actualPercent >= 100;


  const projectedAchievement =
    item.projectedPercent >= 100;

  return (
    <div
      key={item.name}
      className={`rounded-xl border px-3 py-2 ${
        achieved
          ? 'border-green-200 bg-green-50'
          : projectedAchievement
            ? 'border-cyan-200 bg-cyan-50'
            : 'border-slate-200 bg-slate-50'
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-black text-slate-900 truncate">
          {item.firstName}
        </span>

        <span
          className={`text-sm font-black ${
            achieved
              ? 'text-green-700'
              : projectedAchievement
                ? 'text-cyan-700'
                : 'text-slate-700'
          }`}
        >
          {item.projectedPercent.toFixed(1)}%
        </span>
      </div>

      <div className="text-xs text-slate-500 mt-1">
        {achieved
          ? 'Meta já atingida'
          : projectedAchievement
            ? 'Meta atingida na projeção'
            : `Faltam ${formatBRL(item.gap)}`}
      </div>
    </div>
  );
})}


  </div>
</ChartCard>

          <ChartCard
  title="Fluxo Comercial Mensal"
  subtitle="Entradas, fechamentos e evolução do backlog"
>
  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
      <div className="text-xs font-bold uppercase text-blue-600">
        Entradas
      </div>

      <div className="text-2xl font-black text-blue-800 mt-1">
        {formatNumber(commercialFlowTotals.entries)}
      </div>
    </div>

    <div className="rounded-xl border border-green-100 bg-green-50 p-3">
      <div className="text-xs font-bold uppercase text-green-600">
        Fechamentos
      </div>

      <div className="text-2xl font-black text-green-800 mt-1">
        {formatNumber(commercialFlowTotals.closures)}
      </div>
    </div>

    <div
      className={`rounded-xl border p-3 ${
        commercialFlowTotals.balance <= 0
          ? 'border-emerald-100 bg-emerald-50'
          : 'border-amber-100 bg-amber-50'
      }`}
    >
      <div
        className={`text-xs font-bold uppercase ${
          commercialFlowTotals.balance <= 0
            ? 'text-emerald-600'
            : 'text-amber-600'
        }`}
      >
        Saldo do período
      </div>

      <div
        className={`text-2xl font-black mt-1 ${
          commercialFlowTotals.balance <= 0
            ? 'text-emerald-800'
            : 'text-amber-800'
        }`}
      >
        {commercialFlowTotals.balance > 0 ? '+' : ''}
        {formatNumber(commercialFlowTotals.balance)}
      </div>
    </div>

    <div className="rounded-xl border border-purple-100 bg-purple-50 p-3">
      <div className="text-xs font-bold uppercase text-purple-600">
        Backlog atual
      </div>

      <div className="text-2xl font-black text-purple-800 mt-1">
        {formatNumber(endingBacklog)}
      </div>
    </div>
  </div>

  <ResponsiveContainer width="100%" height={380}>
    <ComposedChart
      data={commercialFlowData}
      margin={{
        top: 20,
        right: 30,
        left: 10,
        bottom: 10
      }}
    >
      <CartesianGrid
        strokeDasharray="3 3"
        stroke="#e2e8f0"
      />

      <XAxis
        dataKey="label"
        tick={{
          fontSize: 12,
          fill: '#475569'
        }}
        axisLine={false}
        tickLine={false}
      />

      <YAxis
        yAxisId="left"
        tick={{
          fontSize: 12,
          fill: '#475569'
        }}
        axisLine={false}
        tickLine={false}
        allowDecimals={false}
      />

      <YAxis
        yAxisId="right"
        orientation="right"
        tick={{
          fontSize: 12,
          fill: '#7e22ce'
        }}
        axisLine={false}
        tickLine={false}
        allowDecimals={false}
      />

      <Tooltip
        formatter={(value, name) => {
          const labels = {
            entries: 'Entradas',
            closures: 'Fechamentos',
            backlog: 'Backlog'
          };

          return [
            formatNumber(value),
            labels[name] || name
          ];
        }}
        labelFormatter={(label, payload) => {
          const item = payload?.[0]?.payload;

          if (!item) {
            return label;
          }

          return `${label} · Saldo: ${
            item.balance > 0 ? '+' : ''
          }${formatNumber(item.balance)}`;
        }}
        contentStyle={{
          borderRadius: 12,
          border: '1px solid #e2e8f0',
          boxShadow:
            '0 8px 20px rgba(15, 23, 42, 0.10)'
        }}
      />

      <Legend />

      <Bar
        yAxisId="left"
        dataKey="entries"
        name="Entradas"
        fill="#2563eb"
        radius={[6, 6, 0, 0]}
        barSize={34}
      />

      <Bar
        yAxisId="left"
        dataKey="closures"
        name="Fechamentos"
        fill="#16a34a"
        radius={[6, 6, 0, 0]}
        barSize={34}
      />

      <Line
        yAxisId="right"
        type="monotone"
        dataKey="backlog"
        name="Backlog"
        stroke="#9333ea"
        strokeWidth={4}
        dot={{
          r: 6,
          fill: '#ffffff',
          stroke: '#9333ea',
          strokeWidth: 3
        }}
        activeDot={{
          r: 8
        }}
      />
    </ComposedChart>
  </ResponsiveContainer>

  <div
    className={`mt-5 rounded-xl border px-4 py-3 ${
      backlogDifference <= 0
        ? 'border-green-200 bg-green-50'
        : 'border-amber-200 bg-amber-50'
    }`}
  >
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <div
          className={`text-sm font-black ${
            backlogDifference <= 0
              ? 'text-green-700'
              : 'text-amber-700'
          }`}
        >
          {backlogDifference < 0
            ? 'Redução do backlog'
            : backlogDifference > 0
              ? 'Aumento do backlog'
              : 'Backlog estável'}
        </div>

        <div className="text-xs text-slate-600 mt-1">
          Início: {formatNumber(startingBacklog)} · Final:{' '}
          {formatNumber(endingBacklog)}
        </div>
      </div>

      <div
        className={`text-2xl font-black ${
          backlogDifference <= 0
            ? 'text-green-700'
            : 'text-amber-700'
        }`}
      >
        {backlogDifference > 0 ? '+' : ''}
        {formatNumber(backlogDifference)}
      </div>
    </div>
  </div>
</ChartCard>

        </section>

      </main>
    </div>
  );
}

function MetricCard({ title, value, icon, description }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">
            {title}
          </p>

          <h3 className="text-2xl font-black text-slate-900 mt-1">
            {value}
          </h3>

          {description && (
            <p className="text-xs text-slate-500 mt-1">
              {description}
            </p>
          )}
        </div>

        <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center shrink-0">
          {icon}
        </div>
      </div>
    </div>
  );
}

function ChartCard({ title, subtitle, children }) {
  return (
    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-slate-800">
          {title}
        </h2>

        {subtitle && (
          <p className="text-sm text-slate-500 mt-1">
            {subtitle}
          </p>
        )}
      </div>

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

function ProductRanking({ data, totalRevenue, formatBRL, formatNumber }) {
  const maxRevenue = Math.max(
    ...data.map((item) => Number(item.receita || 0)),
    1
  );

  return (
    <div className="space-y-4">
      {data.map((item, index) => {
        const receita = Number(item.receita || 0);
        const width = (receita / maxRevenue) * 100;

        const participation =
          totalRevenue > 0
            ? ((receita / totalRevenue) * 100).toFixed(1)
            : '0.0';

        return (
          <div
            key={`${item.name}-${index}`}
            className="rounded-2xl border border-slate-200 bg-slate-50 p-4 hover:bg-slate-100 transition"
          >
            <div className="grid grid-cols-[40px_minmax(0,1fr)_180px_120px] gap-4 items-center">
              <div className="w-9 h-9 rounded-full bg-slate-900 text-white flex items-center justify-center text-sm font-black">
                {index + 1}
              </div>

              <div className="min-w-0">
                <div className="font-black text-slate-900 truncate">
                  {item.name || 'Sem produto'}
                </div>

                <div className="text-xs text-slate-500 mt-1">
                  Leads: {formatNumber(item.leads)} | Won: {formatNumber(item.won)}
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs text-slate-500">
                  Receita
                </div>

                <div className="text-xl font-black text-blue-700">
                  {formatBRL(receita)}
                </div>
              </div>

              <div className="text-right">
                <div className="text-xs text-slate-500">
                  Participação
                </div>

                <div className="text-lg font-black text-slate-800">
                  {participation}%
                </div>
              </div>
            </div>

            <div className="mt-3 w-full h-3 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-700 to-cyan-400 rounded-full"
                style={{
                  width: `${Math.max(width, 2)}%`
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CompactRanking({
  data,
  valueKey = 'receita',
  totalLabel = 'Leads',
  formatBRL,
  formatNumber,
  maxItems = 6
}) {
  const items = [...data]
    .sort((a, b) => Number(b[valueKey] || 0) - Number(a[valueKey] || 0))
    .slice(0, maxItems);

  const maxValue = Math.max(
    ...items.map((item) => Number(item[valueKey] || 0)),
    1
  );

  return (
    <div className="space-y-3">
      {items.map((item, index) => {
        const value = Number(item[valueKey] || 0);
        const width = (value / maxValue) * 100;

        return (
          <div
            key={`${item.name}-${index}`}
            className="rounded-xl border border-slate-200 bg-slate-50 p-3"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="w-7 h-7 rounded-full bg-slate-900 text-white flex items-center justify-center text-xs font-black shrink-0">
                  {index + 1}
                </span>

                <div className="min-w-0">
                  <div className="text-sm font-black text-slate-900 truncate">
                    {item.name || 'Sem informação'}
                  </div>

                  <div className="text-[11px] text-slate-500">
                    {totalLabel}: {formatNumber(item.leads || 0)} | Won: {formatNumber(item.won || 0)}
                  </div>
                </div>
              </div>

              <div className="text-right shrink-0">
                <div className="text-sm font-black text-blue-700">
                  {formatBRL(value)}
                </div>
              </div>
            </div>

            <div className="mt-2 w-full h-2 bg-slate-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-blue-700 to-cyan-400 rounded-full"
                style={{
                  width: `${Math.max(width, 2)}%`
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
