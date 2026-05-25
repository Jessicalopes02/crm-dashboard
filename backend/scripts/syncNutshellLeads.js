require('dotenv').config();

const mongoose = require('mongoose');
const axios = require('axios');
const Lead = require('../models/lead');

const {
  MONGODB_URI,
  NUTSHELL_EMAIL,
  NUTSHELL_API_KEY,
  NUTSHELL_LIMIT = 50
} = process.env;

function mapLead(lead) {
  return {
    nutshell_id: lead.id,
    entityType: lead.entityType,
    rev: lead.rev,

    name: lead.name,
    description: lead.description,
    htmlUrl: lead.htmlUrl,

    status: lead.status,
    confidence: lead.confidence,
    completion: lead.completion,
    urgency: lead.urgency,

    value: lead.value,
    normalizedValue: lead.normalizedValue,
    estimatedValue: lead.estimatedValue,

    primaryAccount: lead.primaryAccount
      ? {
          id: lead.primaryAccount.id,
          name: lead.primaryAccount.name,
          regions: lead.primaryAccount.regions || []
        }
      : undefined,

    assignee: lead.assignee
      ? {
          id: lead.assignee.id,
          name: lead.assignee.name,
          emails: lead.assignee.emails || []
        }
      : undefined,

    milestone: lead.milestone
      ? {
          id: lead.milestone.id,
          name: lead.milestone.name
        }
      : undefined,

    stageset: lead.stageset
      ? {
          id: lead.stageset.id,
          name: lead.stageset.name
        }
      : undefined,

    contacts: lead.contacts || [],
    products: lead.products || [],
    sources: lead.sources || [],
    tags: lead.tags || [],

    customFields: lead.customFields || {},
    processes: lead.processes || [],

    createdTime: lead.createdTime,
    modifiedTime: lead.modifiedTime,
    dueTime: lead.dueTime,
    closedTime: lead.closedTime,

    synced_at: new Date(),
    rawData: lead
  };
}

async function getNutshellLeads(page = 1, limit = 50) {
  const response = await axios.post(
    'https://app.nutshell.com/api/v1/json',
    {
      method: 'findLeads',
      params: {
        query: {},
        limit,
        page
      },
      id: 1
    },
    {
      auth: {
        username: NUTSHELL_EMAIL,
        password: NUTSHELL_API_KEY
      }
    }
  );

  return response.data.result || [];
}

async function syncLeads() {
  console.log('Conectado ao MongoDB Atlas');

  let page = 1;
  let totalChecked = 0;
  let totalCreated = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;

  const limit = Number(NUTSHELL_LIMIT);

  while (true) {
    console.log(`Buscando página ${page}...`);

    const leads = await getNutshellLeads(page, limit);

    if (!leads.length) {
      console.log('Nenhum lead restante encontrado.');
      break;
    }

    for (const lead of leads) {
      totalChecked++;

      const existingLead = await Lead.findOne({
        nutshell_id: lead.id
      });

      const mappedLead = mapLead(lead);

      if (!existingLead) {
        await Lead.create(mappedLead);
        totalCreated++;
        continue;
      }

      if (existingLead.rev !== lead.rev) {
        await Lead.updateOne(
          { nutshell_id: lead.id },
          { $set: mappedLead }
        );

        totalUpdated++;
        continue;
      }

      totalSkipped++;
    }

    page++;
  }

  console.log('==============================');
  console.log('SYNC FINALIZADO');
  console.log('Total verificado:', totalChecked);
  console.log('Criados:', totalCreated);
  console.log('Atualizados:', totalUpdated);
  console.log('Ignorados sem alteração:', totalSkipped);
  console.log('==============================');

}

syncLeads().catch(async (err) => {
  console.error('Erro ao sincronizar leads:', err);

  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  process.exit(1);
});

module.exports = syncLeads;

if (require.main === module) {
  syncLeads().catch(async (err) => {
    console.error('Erro ao sincronizar leads:', err);

    process.exit(1);
  });
}