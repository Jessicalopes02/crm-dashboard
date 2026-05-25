const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true
  },

  description: String,

  type: {
    type: String,
    default: 'comercial'
  },

  sector: {
    type: String,
    enum: ['geral', 'sdr', 'closer', 'accounts', 'comercial'],
    default: 'geral'
  },

  startDate: {
    type: Date,
    required: true
  },

  endDate: {
    type: Date,
    required: true
  },

  dateRule: {
    type: String,
    enum: ['created_and_closed', 'closed_only', 'created_only'],
    default: 'closed_only'
  },

  isActive: {
    type: Boolean,
    default: true
  },

  rules: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },

  created_at: {
    type: Date,
    default: Date.now
  },

  updated_at: {
    type: Date,
    default: Date.now
  }
});

campaignSchema.index({ startDate: 1, endDate: 1 });
campaignSchema.index({ isActive: 1 });
campaignSchema.index({ sector: 1 });
campaignSchema.index({ dateRule: 1 });

const Campaign = mongoose.model('Campaign', campaignSchema);

module.exports = Campaign;