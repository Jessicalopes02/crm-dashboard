const Lead = require('../models/lead');

// Função para obter todos os leads
const getAllLeads = async (req, res) => {
  try {
    const leads = await Lead.find(); // Busca todos os leads no MongoDB
    res.json(leads);
  } catch (error) {
    res.status(500).send('Erro ao obter leads');
  }
};

// Função para obter um lead específico pelo ID
const getLeadById = async (req, res) => {
  const { id } = req.params;
  try {
    const lead = await Lead.findById(id);
    if (!lead) {
      return res.status(404).send('Lead não encontrado');
    }
    res.json(lead);
  } catch (error) {
    res.status(500).send('Erro ao buscar o lead');
  }
};

// Exemplo de função para atualizar um lead
const updateLead = async (req, res) => {
  const { id } = req.params;
  const leadData = req.body;
  try {
    const lead = await Lead.findByIdAndUpdate(id, leadData, { new: true });
    if (!lead) {
      return res.status(404).send('Lead não encontrado');
    }
    res.json(lead);
  } catch (error) {
    res.status(500).send('Erro ao atualizar o lead');
  }
};

// Exportar as funções do controlador
module.exports = {
  getAllLeads,
  getLeadById,
  updateLead
};