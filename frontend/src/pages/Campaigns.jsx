import { useEffect, useState } from 'react';
import api from '../services/api';

function Campaigns() {
  const [campaigns, setCampaigns] = useState([]);
  const [achievement, setAchievement] = useState(null);
  const [period, setPeriod] = useState('2026-05');
  const [csvFile, setCsvFile] = useState(null);

  const [form, setForm] = useState({
  name: '',
  description: '',
  type: 'comercial',
  sector: 'closer',
  startDate: '',
  endDate: '',
  dateRule: 'closed_only',
  isActive: true,
  commissionPercent: '',
  bonusPercent: '',
  condition: '',
  notes: ''
});

const [goalForm, setGoalForm] = useState({
  period: '2026-05',
  campaignId: '',
  sector: 'closer',
  userName: '',
  product: '',
  source: '',
  targetRevenue: '',
  targetLeads: '',
  targetMeetings: '',
  targetWon: '',
  notes: ''
});
  useEffect(() => {
    loadCampaigns();
    loadAchievement();
  }, []);

  async function loadCampaigns() {
    try {
      const response = await api.get('/campaigns');
      setCampaigns(response.data.campaigns || []);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadAchievement() {
    try {
      const response = await api.get('/goals/achievement', {
        params: { period }
      });

      setAchievement(response.data);

    } catch (error) {
      console.error(error);
    }
  }

  function formatBRL(value) {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value || 0);
  }

  function formatPercent(value) {
    return `${Number(value || 0).toFixed(2)}%`;
  }

  async function handleCreateCampaign(e) {
  e.preventDefault();

  try {
    await api.post('/campaigns', {
      name: form.name,
      description: form.description,
      type: form.type,
      sector: form.sector,
      startDate: form.startDate,
      endDate: form.endDate,
      dateRule: form.dateRule,
      isActive: form.isActive,
      rules: {
        commissionPercent: Number(form.commissionPercent || 0),
        bonusPercent: Number(form.bonusPercent || 0),
        condition: form.condition,
        notes: form.notes
      }
    });

    setForm({
      name: '',
      description: '',
      type: 'comercial',
      sector: 'closer',
      startDate: '',
      endDate: '',
      dateRule: 'closed_only',
      isActive: true,
      commissionPercent: '',
      bonusPercent: '',
      condition: '',
      notes: ''
    });

    await loadCampaigns();

    alert('Campanha cadastrada com sucesso!');

  } catch (error) {
    console.error(error);
    alert('Erro ao cadastrar campanha');
  }
}

  async function handleCreateGoal(e) {
  e.preventDefault();

  try {
    await api.post('/goals', {
      period: goalForm.period,
      campaignId: goalForm.campaignId || null,
      sector: goalForm.sector,
      userName: goalForm.userName || null,
      product: goalForm.product || null,
      source: goalForm.source || null,
      targetRevenue: Number(goalForm.targetRevenue || 0),
      targetLeads: Number(goalForm.targetLeads || 0),
      targetMeetings: Number(goalForm.targetMeetings || 0),
      targetWon: Number(goalForm.targetWon || 0),
      notes: goalForm.notes
    });

    setGoalForm({
      period: '2026-05',
      campaignId: '',
      sector: 'closer',
      userName: '',
      product: '',
      source: '',
      targetRevenue: '',
      targetLeads: '',
      targetMeetings: '',
      targetWon: '',
      notes: ''
    });

    await loadAchievement();

    alert('Meta cadastrada com sucesso!');

  } catch (error) {
    console.error(error);
    alert('Erro ao cadastrar meta');
  }
}

async function handleImportCsv() {
  try {
    if (!csvFile) {
      alert('Selecione um arquivo CSV');
      return;
    }

    const formData = new FormData();

formData.append('file', csvFile);

const response = await api.post('/goals/import-csv', formData, {
  headers: {
    'Content-Type': 'multipart/form-data'
  }
});

    alert(
  `Importação concluída!

Importados: ${response.data.imported || 0}
Atualizados: ${response.data.updated || 0}
Ignorados: ${response.data.skipped || 0}`
);

    await loadAchievement();

  } catch (error) {
    console.error(error);

    alert(
      error.response?.data?.erro ||
      'Erro ao importar CSV'
    );
  }
}

  return (
    <div className="p-8 space-y-8">

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold">
            Campanhas e Metas
          </h1>

          <p className="text-slate-500 mt-1">
            Acompanhamento de metas manuais com realizado automático do Nutshell
          </p>
        </div>

        <div className="flex gap-2">
          <input
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className="border rounded-xl px-4 py-2"
          />

          <button
            onClick={loadAchievement}
            className="bg-blue-600 text-white px-5 py-2 rounded-xl"
          >
            Atualizar
          </button>
        </div>
      </div>

      <section className="bg-white rounded-2xl shadow p-6">

  <h2 className="text-xl font-semibold mb-4">
    Nova Campanha
  </h2>

  <form
    onSubmit={handleCreateCampaign}
    className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4"
  >

    <input
      type="text"
      placeholder="Nome da campanha"
      value={form.name}
      onChange={(e) => setForm({ ...form, name: e.target.value })}
      className="border rounded-xl px-4 py-2"
      required
    />

    <input
      type="text"
      placeholder="Descrição"
      value={form.description}
      onChange={(e) => setForm({ ...form, description: e.target.value })}
      className="border rounded-xl px-4 py-2"
    />

    <select
      value={form.sector}
      onChange={(e) => setForm({ ...form, sector: e.target.value })}
      className="border rounded-xl px-4 py-2"
    >
      <option value="geral">Geral</option>
      <option value="sdr">SDR</option>
      <option value="closer">Closer</option>
      <option value="accounts">Accounts</option>
      <option value="comercial">Comercial</option>
    </select>

    <select
      value={form.dateRule}
      onChange={(e) => setForm({ ...form, dateRule: e.target.value })}
      className="border rounded-xl px-4 py-2"
    >
      <option value="closed_only">Somente Close Date</option>
      <option value="created_only">Somente Open/Created Date</option>
      <option value="created_and_closed">Open Date + Close Date</option>
    </select>

    <input
      type="date"
      value={form.startDate}
      onChange={(e) => setForm({ ...form, startDate: e.target.value })}
      className="border rounded-xl px-4 py-2"
      required
    />

    <input
      type="date"
      value={form.endDate}
      onChange={(e) => setForm({ ...form, endDate: e.target.value })}
      className="border rounded-xl px-4 py-2"
      required
    />

    <input
      type="number"
      step="0.01"
      placeholder="% comissão"
      value={form.commissionPercent}
      onChange={(e) => setForm({ ...form, commissionPercent: e.target.value })}
      className="border rounded-xl px-4 py-2"
    />

    <input
      type="number"
      step="0.01"
      placeholder="% bônus"
      value={form.bonusPercent}
      onChange={(e) => setForm({ ...form, bonusPercent: e.target.value })}
      className="border rounded-xl px-4 py-2"
    />

    <textarea
      placeholder="Condição da comissão"
      value={form.condition}
      onChange={(e) => setForm({ ...form, condition: e.target.value })}
      className="border rounded-xl px-4 py-2 md:col-span-2"
    />

    <textarea
      placeholder="Observações / regulamento"
      value={form.notes}
      onChange={(e) => setForm({ ...form, notes: e.target.value })}
      className="border rounded-xl px-4 py-2 md:col-span-2"
    />

    <label className="flex items-center gap-2 text-sm text-slate-600">
      <input
        type="checkbox"
        checked={form.isActive}
        onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
      />
      Campanha ativa
    </label>

    <button
      type="submit"
      className="bg-blue-600 text-white px-5 py-2 rounded-xl"
    >
      Salvar Campanha
    </button>

  </form>

</section>

    <section className="bg-white rounded-2xl shadow p-6">

  <h2 className="text-xl font-semibold mb-4">
    Nova Meta
  </h2>

   <section className="bg-white rounded-2xl shadow p-6">

  <h2 className="text-xl font-semibold mb-4">
    Importar Metas via CSV
  </h2>

  <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">

    <input
      type="file"
      accept=".csv"
      onChange={(e) => setCsvFile(e.target.files[0])}
      className="border rounded-xl px-4 py-2"
    />

    <button
      onClick={handleImportCsv}
      className="bg-blue-600 text-white px-5 py-2 rounded-xl"
    >
      Importar CSV
    </button>

  </div>

  <div className="mt-4 text-sm text-slate-500">
    Colunas obrigatórias:
    <br />
    period, sector, userName, targetRevenue, targetLeads,
    targetMeetings, targetWon, notes
  </div>

</section>

  <form
    onSubmit={handleCreateGoal}
    className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4"
  >

    <input
      type="month"
      value={goalForm.period}
      onChange={(e) => setGoalForm({ ...goalForm, period: e.target.value })}
      className="border rounded-xl px-4 py-2"
      required
    />

    <select
      value={goalForm.campaignId}
      onChange={(e) => setGoalForm({ ...goalForm, campaignId: e.target.value })}
      className="border rounded-xl px-4 py-2"
    >
      <option value="">Sem campanha vinculada</option>

      {campaigns.map((campaign) => (
        <option
          key={campaign._id}
          value={campaign._id}
        >
          {campaign.name}
        </option>
      ))}
    </select>

    <select
      value={goalForm.sector}
      onChange={(e) => setGoalForm({ ...goalForm, sector: e.target.value })}
      className="border rounded-xl px-4 py-2"
    >
      <option value="geral">Geral</option>
      <option value="sdr">SDR</option>
      <option value="closer">Closer</option>
      <option value="accounts">Accounts</option>
      <option value="comercial">Comercial</option>
    </select>

    <input
      type="text"
      placeholder="Responsável"
      value={goalForm.userName}
      onChange={(e) => setGoalForm({ ...goalForm, userName: e.target.value })}
      className="border rounded-xl px-4 py-2"
    />

    <input
      type="text"
      placeholder="Produto"
      value={goalForm.product}
      onChange={(e) => setGoalForm({ ...goalForm, product: e.target.value })}
      className="border rounded-xl px-4 py-2"
    />

    <input
      type="text"
      placeholder="Source"
      value={goalForm.source}
      onChange={(e) => setGoalForm({ ...goalForm, source: e.target.value })}
      className="border rounded-xl px-4 py-2"
    />

    <input
      type="number"
      step="0.01"
      placeholder="Meta de receita"
      value={goalForm.targetRevenue}
      onChange={(e) => setGoalForm({ ...goalForm, targetRevenue: e.target.value })}
      className="border rounded-xl px-4 py-2"
    />

    <input
      type="number"
      placeholder="Meta de leads"
      value={goalForm.targetLeads}
      onChange={(e) => setGoalForm({ ...goalForm, targetLeads: e.target.value })}
      className="border rounded-xl px-4 py-2"
    />

    <input
      type="number"
      placeholder="Meta de reuniões"
      value={goalForm.targetMeetings}
      onChange={(e) => setGoalForm({ ...goalForm, targetMeetings: e.target.value })}
      className="border rounded-xl px-4 py-2"
    />

    <input
      type="number"
      placeholder="Meta de Won"
      value={goalForm.targetWon}
      onChange={(e) => setGoalForm({ ...goalForm, targetWon: e.target.value })}
      className="border rounded-xl px-4 py-2"
    />

    <textarea
      placeholder="Observações da meta"
      value={goalForm.notes}
      onChange={(e) => setGoalForm({ ...goalForm, notes: e.target.value })}
      className="border rounded-xl px-4 py-2 md:col-span-2"
    />

    <button
      type="submit"
      className="bg-blue-600 text-white px-5 py-2 rounded-xl"
    >
      Salvar Meta
    </button>

  </form>

</section>
      <section>
        <h2 className="text-xl font-semibold mb-4">
          Campanhas cadastradas
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {campaigns.map((campaign) => (
            <div
              key={campaign._id}
              className="bg-white rounded-2xl p-5 shadow border border-slate-200"
            >
              <div className="flex justify-between items-start gap-3">
                <div>
                  <h3 className="font-bold text-lg">
                    {campaign.name}
                  </h3>

                  <p className="text-sm text-slate-500 mt-1">
                    {campaign.description}
                  </p>
                </div>

                <span
                  className={`text-xs px-3 py-1 rounded-full ${
                    campaign.isActive
                      ? 'bg-green-100 text-green-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {campaign.isActive ? 'Ativa' : 'Inativa'}
                </span>
              </div>

              <div className="mt-4 text-sm text-slate-600 space-y-1">
                <p>
                  <strong>Setor:</strong> {campaign.sector}
                </p>

                <p>
                  <strong>Regra:</strong> {campaign.dateRule}
                </p>

                <p>
                  <strong>Período:</strong>{' '}
                  {new Date(campaign.startDate).toLocaleDateString('pt-BR')} até{' '}
                  {new Date(campaign.endDate).toLocaleDateString('pt-BR')}
                </p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-semibold mb-4">
          Atingimento de Metas
        </h2>

        <div className="bg-white rounded-2xl shadow overflow-hidden">

          <table className="w-full">
            <thead className="bg-slate-100">
              <tr className="text-left text-sm text-slate-600">
                <th className="p-4">Responsável</th>
                <th className="p-4">Campanha</th>
                <th className="p-4">Meta Receita</th>
                <th className="p-4">Receita Real</th>
                <th className="p-4">% Receita</th>
                <th className="p-4">Meta Leads</th>
                <th className="p-4">Leads Real</th>
                <th className="p-4">% Leads</th>
                <th className="p-4">Meta Won</th>
                <th className="p-4">Won Real</th>
                <th className="p-4">% Won</th>
              </tr>
            </thead>

            <tbody>
              {achievement?.results?.map((item) => (
                <tr
                  key={item.goal._id}
                  className="border-t hover:bg-slate-50"
                >
                  <td className="p-4 font-semibold">
                    {item.goal.userName || 'Geral'}
                  </td>

                  <td className="p-4">
                    {item.campaign?.name || '-'}
                  </td>

                  <td className="p-4">
                    {formatBRL(item.goal.targetRevenue)}
                  </td>

                  <td className="p-4 font-semibold">
                    {formatBRL(item.actual.revenue)}
                  </td>

                  <td className="p-4">
                    <Badge value={item.achievement.revenuePercent} />
                  </td>

                  <td className="p-4">
                    {item.goal.targetLeads}
                  </td>

                  <td className="p-4 font-semibold">
                    {item.actual.leads}
                  </td>

                  <td className="p-4">
                    <Badge value={item.achievement.leadsPercent} />
                  </td>

                  <td className="p-4">
                    {item.goal.targetWon}
                  </td>

                  <td className="p-4 font-semibold">
                    {item.actual.won}
                  </td>

                  <td className="p-4">
                    <Badge value={item.achievement.wonPercent} />
                  </td>
                </tr>
              ))}

              {(!achievement || achievement.results.length === 0) && (
                <tr>
                  <td colSpan="11" className="p-8 text-center text-slate-500">
                    Nenhuma meta encontrada para o período.
                  </td>
                </tr>
              )}
            </tbody>
          </table>

        </div>
      </section>

    </div>
  );
}

function Badge({ value }) {
  const numeric = Number(value || 0);

  const color =
    numeric >= 100
      ? 'bg-green-100 text-green-700'
      : numeric >= 70
        ? 'bg-yellow-100 text-yellow-700'
        : 'bg-red-100 text-red-700';

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${color}`}>
      {numeric.toFixed(2)}%
    </span>
  );
}

export default Campaigns;