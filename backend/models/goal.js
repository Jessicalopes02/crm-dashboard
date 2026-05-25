const mongoose = require('mongoose');

const goalSchema = new mongoose.Schema({
  period: {
    type: String,
    required: true
  },

  campaignId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    default: null
  },

  sector: {
    type: String,
    enum: ['geral', 'sdr', 'closer', 'accounts', 'comercial'],
    default: 'geral'
  },

  userName: {
    type: String,
    default: null
  },

  product: {
    type: String,
    default: null
  },

  source: {
    type: String,
    default: null
  },

  targetRevenue: {
    type: Number,
    default: 0
  },

  targetLeads: {
    type: Number,
    default: 0
  },

  targetMeetings: {
    type: Number,
    default: 0
  },

  targetWon: {
    type: Number,
    default: 0
  },

  notes: String,

  created_at: {
    type: Date,
    default: Date.now
  },

  updated_at: {
    type: Date,
    default: Date.now
  }
});

goalSchema.index({ period: 1 });
goalSchema.index({ campaignId: 1 });
goalSchema.index({ sector: 1 });
goalSchema.index({ userName: 1 });

const Goal = mongoose.model('Goal', goalSchema);

module.exports = Goal;