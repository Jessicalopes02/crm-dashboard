import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import api from '../services/api';

function TVMode() {
  const [data, setData] = useState(null);
  

  useEffect(() => {
    loadTVData();

    const refresh = setInterval(() => {
      loadTVData();
    }, 60000);

    return () => {
      clearInterval(refresh);
    };
  }, []);

  async function loadTVData() {
    try {
      const response = await api.get('/dashboard/full');
      setData(response.data);
    } catch (error) {
      console.error(error);
    }
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center text-3xl">
        Carregando TV Mode...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-white p-8 overflow-hidden">

      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-5xl font-bold">
            Process CRM TV Mode
          </h1>

          <p className="text-slate-400 mt-2 text-xl">
            Visão comercial em tempo real
          </p>
        </div>

        <div className="text-right">
          <div className="text-3xl font-bold text-blue-400">
            {screens[screen]}
          </div>

          <div className="text-slate-400">
            Atualização automática a cada 60s
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        <motion.div
          key={screen}
          initial={{ opacity: 0, x: 80 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -80 }}
          transition={{ duration: 0.6 }}
        >
          {screen === 0 && <TVGeneral data={data} />}
          {screen === 1 && <TVClosers data={data} />}
          {screen === 2 && <TVSdr data={data} />}
        </motion.div>
      </AnimatePresence>

    </div>
  );
}

function TVGeneral({ data }) {
  const metrics = data.general.metrics;

  return (
    <div className="grid grid-cols-4 gap-6">
      <TVCard title="Leads" value={metrics.totalLeads} />
      <TVCard title="Won" value={metrics.wonLeads} />
      <TVCard title="Lost" value={metrics.lostLeads} />
      <TVCard
        title="Receita"
        value={new Intl.NumberFormat('pt-BR', {
          style: 'currency',
          currency: 'BRL'
        }).format(metrics.totalRevenue)}
      />
    </div>
  );
}

function TVClosers({ data }) {
  return (
    <div className="grid grid-cols-1 gap-4">
      {data.performance.map((item) => (
        <div
          key={item._id}
          className="bg-slate-900 rounded-3xl p-6 border border-slate-800"
        >
          <div className="flex justify-between items-center">
            <div className="text-3xl font-bold">
              {item._id}
            </div>

            <div className="text-4xl font-bold text-blue-400">
              {Number(item.conversionRate || 0).toFixed(1)}%
            </div>
          </div>

          <div className="grid grid-cols-5 gap-4 mt-6 text-center">
            <TVMini label="Leads" value={item.totalLeads} />
            <TVMini label="Won" value={item.wonLeads} />
            <TVMini label="Lost" value={item.lostLeads} />
            <TVMini label="Open" value={item.openLeads} />
            <TVMini
              label="Receita"
              value={new Intl.NumberFormat('pt-BR', {
                style: 'currency',
                currency: 'BRL'
              }).format(item.totalRevenue || 0)}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function TVSdr({ data }) {
  return (
    <div className="bg-slate-900 rounded-3xl p-10 border border-slate-800">
      <h2 className="text-4xl font-bold mb-4">
        SDR
      </h2>

      <p className="text-slate-400 text-2xl">
        Próxima etapa: métricas de qualificação, atividades, tempo de resposta e reuniões.
      </p>
    </div>
  );
}

function TVCard({ title, value }) {
  return (
    <motion.div
      initial={{ scale: 0.95 }}
      animate={{ scale: 1 }}
      className="bg-slate-900 rounded-3xl p-8 border border-slate-800 shadow-xl"
    >
      <div className="text-slate-400 text-xl">
        {title}
      </div>

      <div className="text-5xl font-bold mt-4">
        {value}
      </div>
    </motion.div>
  );
}

function TVMini({ label, value }) {
  return (
    <div className="bg-slate-800 rounded-2xl p-4">
      <div className="text-slate-400 text-sm">
        {label}
      </div>

      <div className="text-2xl font-bold mt-2">
        {value}
      </div>
    </div>
  );
}

export default TVMode;