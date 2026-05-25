const mongoose = require('mongoose');

const leadSchema = new mongoose.Schema({

  // ========================================
  // IDENTIFICAÇÃO
  // ========================================

  nutshell_id: {
    type: Number,
    unique: true,
    required: true
  },

  entityType: String,
  rev: String,

  // ========================================
  // DADOS PRINCIPAIS
  // ========================================

  name: String,
  description: String,
  htmlUrl: String,

  status: Number,
  confidence: Number,
  completion: Number,
  urgency: String,

  // ========================================
  // VALORES
  // ========================================

  value: {
    currency: String,
    amount: Number
  },

  normalizedValue: {
    currency: String,
    amount: Number
  },

  estimatedValue: {
    currency: String,
    amount: Number
  },

  // ========================================
  // EMPRESA
  // ========================================

  primaryAccount: {
    id: Number,
    name: String,
    regions: [String]
  },

  // ========================================
  // RESPONSÁVEL
  // ========================================

  assignee: {
    id: Number,
    name: String,
    emails: [String]
  },

  // ========================================
  // PIPELINE / STAGE
  // ========================================

  milestone: {
    id: Number,
    name: String
  },

  stageset: {
    id: Number,
    name: String
  },

  // ========================================
  // CONTATOS
  // ========================================

  contacts: [
    {
      id: Number,
      name: String,
      jobTitle: String
    }
  ],

  // ========================================
  // PRODUTOS
  // ========================================

  products: [
    {
      id: Number,
      name: String,
      quantity: Number,
      price: {
        currency: String,
        amount: Number
      }
    }
  ],

  // ========================================
  // SOURCES / TAGS
  // ========================================

  sources: [
    {
      id: Number,
      name: String
    }
  ],

  tags: [String],

  // ========================================
  // CAMPOS CUSTOMIZADOS
  // ========================================

  customFields: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  // ========================================
  // PROCESSOS
  // ========================================

  processes: {
    type: [mongoose.Schema.Types.Mixed],
    default: []
  },
  // ========================================
  // HISTÓRICO DE VALORES
  // ========================================

  value_history: [
    {
      value: Number,
      currency: String,
      changed_at: {
        type: Date,
        default: Date.now
      }
    }
  ],

  // ========================================
  // INTERAÇÕES
  // ========================================

  interactions: [
    {
      interaction_type: String,
      date: {
        type: Date,
        default: Date.now
      },
      notes: String
    }
  ],

  // ========================================
  // TASKS
  // ========================================

  tasks: [
    {
      task_name: String,
      assigned_to: String,
      due_date: Date,
      status: String
    }
  ],

  // ========================================
  // DATAS
  // ========================================

  createdTime: Date,
  modifiedTime: Date,
  dueTime: Date,
  closedTime: Date,

  synced_at: {
    type: Date,
    default: Date.now
  },

  // ========================================
  // RAW DATA COMPLETO DO NUTSHELL
  // ========================================

  rawData: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }

});

// ========================================
// ÍNDICES PERFORMANCE
// ========================================

// Não criar índice duplicado para nutshell_id.
// Ele já é criado automaticamente por unique: true.

leadSchema.index({ status: 1 });
leadSchema.index({ 'assignee.name': 1 });
leadSchema.index({ modifiedTime: -1 });
leadSchema.index({ synced_at: -1 });

const Lead = mongoose.model('Lead', leadSchema);

module.exports = Lead;