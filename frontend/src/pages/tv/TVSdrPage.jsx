import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Chart from 'react-apexcharts';
import api from '../../services/api';

function TVSdrPage() {
  const [data, setData] = useState(null);
  const [period, setPeriod] = useState('month');

  useEffect(() => {
    loadData();

    const interval = setInterval(() => {
      loadData();
    }, 60000);

    return () => clearInterval(interval);
  }, [period]);

  async function loadData() {
    try {
      const now = new Date();

let startDate = new Date();
let endDate = new Date();

if (period === 'day') {
  startDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    0,
    0,
    0
  );

  endDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59
  );
}

if (period === 'week') {
  const firstDay = new Date(now);

  firstDay.setDate(now.getDate() - now.getDay());

  startDate = new Date(
    firstDay.getFullYear(),
    firstDay.getMonth(),
    firstDay.getDate(),
    0,
    0,
    0
  );

  endDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59
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

  endDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59
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

  endDate = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59
  );
}

const response = await api.get('/dashboard/sdr', {
  params: {
    startDate: startDate.toLocaleString('sv-SE').replace(' ', 'T'),
    endDate: endDate.toLocaleString('sv-SE').replace(' ', 'T')
  }
});

      setData(response.data);
    } catch (error) {
      console.error(error);
    }
  }

  const formatNumber = (value) => {
    return new Intl.NumberFormat('pt-BR').format(value || 0);
  };

  if (!data) {
    return (
      <div className="h-screen bg-slate-950 text-white flex items-center justify-center text-3xl font-bold">
        Carregando TV SDR...
      </div>
    );
  }

  const conversionRate =
    data.received > 0
      ? (data.won / data.received) * 100
      : 0;
   
  const visibleSources = (data.sources || []).slice(0, 4);
  
  const funnelOptions = {
  chart: {
    type: 'bar',
    toolbar: { show: false },
    background: 'transparent'
  },
  plotOptions: {
    bar: {
      horizontal: true,
      isFunnel: true,
      borderRadius: 6,
      distributed: true,
      barHeight: '75%'
    }
  },
  dataLabels: {
    enabled: true,
    formatter: function (val, opt) {
      return `${opt.w.globals.labels[opt.dataPointIndex]}: ${val}`;
    },
    style: {
      fontSize: '12px',
      fontWeight: 700
    }
  },
  xaxis: {
    categories: (data.funnel || []).map((item) => item.label || item._id)
  },
  theme: {
    mode: 'dark'
  },
  tooltip: {
    theme: 'dark'
  },
  legend: {
    show: false
  },
  colors: ['#2563eb', '#0891b2', '#0f766e', '#16a34a', '#65a30d']
};

  const funnelSeries = [
  {
    name: 'Leads',
    data: (data.funnel || []).map((item) => item.total)
  }
];
  return (
  <div className="h-screen text-white p-3 overflow-hidden bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950">

    <header className="flex items-center justify-between mb-2 bg-white/5 border border-white/10 rounded-2xl px-3 py-2 shadow-2xl backdrop-blur">
      <div>
        <h1 className="text-3xl font-black tracking-tight">
          ProcessLog&Comex - SDR
        </h1>

        <p className="text-slate-400 text-sm mt-1">
          Acompanhamento de conversão, funil e qualidade comercial
        </p>
      </div>

      <div className="flex items-center gap-3">

        <div className="flex items-center gap-2">

          {[
            { key: 'day', label: 'Hoje' },
            { key: 'week', label: 'Semana' },
            { key: 'month', label: 'Mês Atual' },
            { key: 'quarter', label: 'Trimestre' }
          ].map((item) => (
            <button
              key={item.key}
              onClick={() => setPeriod(item.key)}
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
            Atualização automática
          </div>

          <div className="text-base font-bold text-blue-400">
            a cada 60s
          </div>

          <div className="flex items-center justify-end gap-2 mt-1 text-green-400 text-xs font-bold">
            <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
            AO VIVO
          </div>
        </div>
      </div>
    </header>

    <section className="grid grid-cols-4 gap-3 mb-3">
    

      <BigKpi
        title="Leads Trabalhadas"
        value={formatNumber(data.received)}
        subtitle="No período"
      />

      <BigKpi
        title="Won"
        value={formatNumber(data.won)}
        subtitle="Fechamentos"
      />

      <BigKpi
        title="Lost"
        value={formatNumber(data.lost)}
        subtitle="Perdas"
      />

      <BigKpi
        title="Conversão"
        value={`${conversionRate.toFixed(1)}%`}
        subtitle="Won / Leads"
      />

    </section>

    <section className="grid grid-cols-12 grid-rows-2 gap-3 h-[calc(100vh-178px)]">

      <Card title="Funil Comercial" className="col-span-5">

  <div className="flex flex-col gap-3 mt-2">

    {(data.funnel || []).map((item, index) => {
      const widths = ['100%', '85%', '70%', '55%', '40%'];

      return (
        <motion.div
          key={index}
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: index * 0.1 }}
          className="mx-auto"
          style={{
            width: widths[index] || '35%'
          }}
        >
          <div className="bg-gradient-to-r from-blue-600 to-cyan-500 rounded-xl px-4 py-3 shadow-lg shadow-blue-900/30">

            <div className="flex items-center justify-between">
              <span className="font-bold text-sm truncate">
                {item.label || item._id}
              </span>

              <span className="font-black text-lg">
                {item.total}
              </span>
            </div>

          </div>
        </motion.div>
      );
    })}

  </div>

</Card>

      <Card title="Qualidade dos Leads" className="col-span-4">
        <div className="grid grid-cols-2 gap-2">
          <MiniKpi label="Qualificados" value="-" />
          <MiniKpi label="Desqualificados" value="-" />
          <MiniKpi label="Retrabalho" value="-" />
          <MiniKpi label="ICP" value="-" />
        </div>
      </Card>

      <Card title="Motivos de Lost" className="col-span-4">
        <EmptyInfo text="Próxima etapa: puxar outcomes/motivos de lost do Nutshell." />
      </Card>

      <Card title="Fechamentos por Tentativa" className="col-span-4">
        <EmptyInfo text="Próxima etapa: identificar tentativa pelo milestone/processo." />
      </Card>

      <Card title="Source" className="col-span-4">

        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{
            duration: 4,
            repeat: Infinity,
            ease: 'easeInOut'
          }}
          className="space-y-2"
        >
          {visibleSources.map((item, index) => (
            <SourceLine
              key={`${item._id}-${index}`}
              name={item._id}
              leads={item.totalLeads}
              won={item.wonLeads}
            />
          ))}
        </motion.div>

      </Card>

    </section>

  </div>
);
}
function BigKpi({ title, value, subtitle }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-white/10 backdrop-blur rounded-3xl p-4 h-[72px] border border-white/10 shadow-2xl overflow-hidden"
    >
      <div className="text-slate-400 text-xs">
        {title}
      </div>

      <div className="text-sm xl:text-base font-black mt-2 leading-tight truncate">
        {value}
      </div>

      <div className="text-slate-500 mt-1 text-xs">
        {subtitle}
      </div>
    </motion.div>
  );
}

function Card({ title, className = '', children }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${className} bg-white/10 backdrop-blur rounded-2xl p-2 border border-white/10 shadow-2xl min-w-0 overflow-hidden`}
    >
      <h2 className="text-base font-bold mb-2">
        {title}
      </h2>

      {children}
    </motion.div>
  );
}

function MiniKpi({ label, value }) {
  return (
    <div className="bg-slate-950/50 rounded-2xl p-2 border border-white/5">
      <div className="text-slate-400 text-xs">
        {label}
      </div>

      <div className="text-base font-bold mt-1">
        {value}
      </div>
    </div>
  );
}

function SourceLine({ name, leads, won }) {
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
        {won} won no período
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