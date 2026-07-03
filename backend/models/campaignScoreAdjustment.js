const mongoose = require('mongoose');

const campaignScoreAdjustmentSchema =
  new mongoose.Schema(
    {
      campaignTag: {
        type: String,
        required: true,
        trim: true
      },

      teamKey: {
        type: String,
        required: true,
        enum: [
          'ferrari',
          'mercedes',
          'redbull',
          'general'
        ]
      },

      points: {
        type: Number,
        required: true,
        default: 0
      },

      reason: {
        type: String,
        default: '',
        trim: true
      }
    },
    {
      timestamps: true
    }
  );

module.exports =
  mongoose.models.CampaignScoreAdjustment ||
  mongoose.model(
    'CampaignScoreAdjustment',
    campaignScoreAdjustmentSchema
  );
