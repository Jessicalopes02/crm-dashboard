const express = require('express');
const mongoose = require('mongoose');
require('dotenv').config();
const axios = require('axios');
const cron = require('node-cron');
const cors = require('cors');
const leadController = require('./controllers/leadController');

const Lead = require('./models/lead');
const Campaign = require('./models/campaign');
const Goal = require('./models/goal');

const CampaignScoreAdjustment =
  require('./models/campaignScoreAdjustment');
const app = express();

const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');

const path = require('path');

const upload = multer({ dest: 'uploads/' });

const allowedOrigins = [
  'http://localhost:5173',
  'http://localhost:3000',
  'https://crm-dashboard-1-rtpd.onrender.com',
  'https://crm-dashboard-ex08.onrender.com'
];

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      console.error(
        'Origem bloqueada pelo CORS:',
        origin
      );

      return callback(
        new Error(
          `Origem não permitida pelo CORS: ${origin}`
        )
      );
    },

    credentials: true,

    methods: [
      'GET',
      'POST',
      'PUT',
      'PATCH',
      'DELETE',
      'OPTIONS'
    ],

    allowedHeaders: [
      'Content-Type',
      'Authorization'
    ]
  })
);

app.use(express.json());

// ========================================
// CONFIGURAÇÃO NUTSHELL
// ========================================

const NUTSHELL_API_KEY =
  process.env.NUTSHELL_API_KEY;

const NUTSHELL_EMAIL =
  process.env.NUTSHELL_EMAIL;

const PRIORITY_STATUS = [0, 1, 10]; // Open, Won e Peding
const DAILY_STATUS = [11, 12]; // Lost e Cancelado

const DEFAULT_LAST_PAGE = 1183;

// ========================================
// ROTAS BÁSICAS
// ========================================

app.get('/', (req, res) => {
  res.send('Servidor funcionando!');
});

app.get('/test', (req, res) => {
  res.send('Servidor está funcionando!');
});

// ========================================
// ROTAS LEADS MONGODB
// ========================================

app.get('/api/leads', leadController.getAllLeads);
app.get('/api/leads/:id', leadController.getLeadById);
app.put('/api/leads/:id', leadController.updateLead);

// ========================================
// DASHBOARD - LISTA LEVE E PAGINADA
// ========================================

app.get('/api/dashboard/leads-list', async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const skip = (page - 1) * limit;

    const { status, assignee, search, account } = req.query;

    const filter = {};

    if (status !== undefined && status !== '') {
      filter.status = Number(status);
    }

    if (assignee) {
      filter['assignee.name'] = { $regex: assignee, $options: 'i' };
    }

    if (account) {
      filter['primaryAccount.name'] = { $regex: account, $options: 'i' };
    }

    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { 'primaryAccount.name': { $regex: search, $options: 'i' } },
        { 'contacts.name': { $regex: search, $options: 'i' } }
      ];
    }

    const total = await Lead.countDocuments(filter);

    const leads = await Lead.find(filter)
      .select({
        nutshell_id: 1,
        name: 1,
        description: 1,
        status: 1,
        value: 1,
        primaryAccount: 1,
        assignee: 1,
        contacts: 1,
        closedTime: 1,
        dueTime: 1,
        synced_at: 1
      })
      .sort({ closedTime: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    res.json({
      sucesso: true,
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      filters: {
        status: status || null,
        assignee: assignee || null,
        search: search || null,
        account: account || null
      },
      leads
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});


app.get('/api/sync/refresh-may', async (req, res) => {
  try {

    const startDate = new Date('2026-07-01T00:00:00');
    const endDate = new Date('2026-07-31T23:59:59');

    const leads = await Lead.find({
      closedTime: {
        $gte: startDate,
        $lte: endDate
      }
    }).select('nutshell_id');

    let updated = 0;

    for (const item of leads) {

      const detailResponse = await axios.post(
        'https://app.nutshell.com/api/v1/json',
        {
          method: 'getLead',
          params: {
            leadId: item.nutshell_id
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

      const fullLead = detailResponse.data.result;

      if (fullLead) {
        await saveFullLead(fullLead);
        updated++;
      }

    }

    res.json({
      sucesso: true,
      updated
    });

  } catch (error) {

    res.status(500).json({
      sucesso: false,
      erro: error.message
    });

  }
});

// ========================================
// DASHBOARD GERAL
// ========================================

app.get('/api/dashboard/general', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateConditions = {};

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      dateConditions.$gte = start;
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateConditions.$lte = end;
    }

    const hasDateFilter = Object.keys(dateConditions).length > 0;

    const createdFilter = hasDateFilter
      ? {createdTime: dateConditions}
      : {};

    const closedFilter = hasDateFilter
      ? {closedTime: dateConditions}
      : {};

    const openFilter = hasDateFilter
      ? {createdTime: dateConditions}
      : {};

    const matchFilter = createdFilter;

    const ignoredPipelineFilter = {
      'stageset.name': { $ne: 'Processo de Vendas - Global Alliance' }
    };

    let totalLeads = await Lead.countDocuments({
      ...createdFilter,
      ...ignoredPipelineFilter
    });

    const wonLeads = await Lead.countDocuments({
      ...closedFilter,
      ...ignoredPipelineFilter,
      status: 10
    });

    const lostLeads = await Lead.countDocuments({
      ...closedFilter,
      ...ignoredPipelineFilter,
      status: 11
    });

    const openLeads = await Lead.countDocuments({
      ...openFilter,
      ...ignoredPipelineFilter,
      status: 0
    });

    const pendingLeads = await Lead.countDocuments({
      ...openFilter,
      ...ignoredPipelineFilter,
      status: 1
    });

    const canceledLeads = await Lead.countDocuments({
      ...closedFilter,
      ...ignoredPipelineFilter,
      status: 12
    });

    if (hasDateFilter && totalLeads === 0) {
      totalLeads =
        openLeads +
        wonLeads +
        lostLeads +
        pendingLeads +
        canceledLeads;
    }

    const revenueResult = await Lead.aggregate([
      {
        $match: {
          ...closedFilter,
          ...ignoredPipelineFilter,
          status: 10,
          'value.amount': { $type: 'number' }
        }
      },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$value.amount' },
          averageTicket: { $avg: '$value.amount' }
        }
      }
    ]);

    const leadsByStatus = await Lead.aggregate([
      {
        $match: {
         ...closedFilter,
         ...ignoredPipelineFilter
        }
      },
      {
        $group: {
          _id: '$status',
          total: { $sum: 1 },
          revenue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 10] },
                    { $ne: ['$value.amount', null] }
                  ]
                },
                '$value.amount',
                0
              ]
            }
          }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const leadsByAssignee = await Lead.aggregate([
      {
        $match: {
          ...closedFilter,
          ...ignoredPipelineFilter
        }
      },
      {
        $group: {
          _id: '$assignee.name',
          totalLeads: { $sum: 1 },
          wonLeads: {
            $sum: {
              $cond: [{ $eq: ['$status', 10] }, 1, 0]
            }
          },
          openLeads: {
            $sum: {
              $cond: [{ $eq: ['$status', 0] }, 1, 0]
            }
          },
          lostLeads: {
            $sum: {
              $cond: [{ $eq: ['$status', 11] }, 1, 0]
            }
          },
          revenue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 10] },
                    { $ne: ['$value.amount', null] }
                  ]
                },
                '$value.amount',
                0
              ]
            }
          }
        }
      },
      { $sort: { revenue: -1 } }
    ]);


   const leadsByMonth = await Lead.aggregate([
  {
    $match: {
      ...ignoredPipelineFilter,
      ...(hasDateFilter
        ? {
            $or: [
              { createdTime: dateConditions },
              { closedTime: dateConditions }
            ]
          }
        : {})
    }
  },

  {
    $addFields: {
      dashboardDate: {
        $cond: [
          {
            $in: ['$status', [10, 11, 12]]
          },
          '$closedTime',
          '$createdTime'
        ]
      }
    }
  },

  {
    $match: {
      dashboardDate: { $ne: null }
    }
  },

  {
    $group: {
      _id: {
        year: { $year: '$dashboardDate' },
        month: { $month: '$dashboardDate' }
      },

      totalLeads: { $sum: 1 },

      wonLeads: {
        $sum: {
          $cond: [{ $eq: ['$status', 10] }, 1, 0]
        }
      },

      openLeads: {
        $sum: {
          $cond: [{ $eq: ['$status', 0] }, 1, 0]
        }
      },

      lostLeads: {
        $sum: {
          $cond: [{ $eq: ['$status', 11] }, 1, 0]
        }
      },

      revenue: {
        $sum: {
          $cond: [
            {
              $and: [
                { $eq: ['$status', 10] },
                { $ne: ['$value.amount', null] }
              ]
            },
            '$value.amount',
            0
          ]
        }
      }
    }
  },

  {
    $sort: {
      '_id.year': 1,
      '_id.month': 1
    }
  }
]);

    res.json({
      sucesso: true,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null
      },
      metrics: {
        totalLeads,
        wonLeads,
        lostLeads,
        pendingLeads,
        canceledLeads,
        openLeads,
        totalRevenue: revenueResult[0]?.totalRevenue || 0,
        averageTicket: revenueResult[0]?.averageTicket || 0
      },
      charts: {
        leadsByStatus,
        leadsByAssignee,
        leadsByMonth
      }
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

async function getGeneralDashboard(startDate, endDate) {
  const dateConditions = {};

  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    dateConditions.$gte = start;
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    dateConditions.$lte = end;
  }

  const hasDateFilter = Object.keys(dateConditions).length > 0;

  const createdFilter = hasDateFilter
    ? { createdTime: dateConditions }
    : {};

  const closedFilter = hasDateFilter
    ? { closedTime: dateConditions }
    : {};

  const openFilter = hasDateFilter
    ? { createdTime: dateConditions }
    : {};

  const ignoredPipelineFilter = {
    'stageset.name': { $ne: 'Processo de Vendas - Global Alliance' }
  };

  let totalLeads = await Lead.countDocuments({
    ...createdFilter,
    ...ignoredPipelineFilter
  });

  const wonLeads = await Lead.countDocuments({
    ...closedFilter,
    ...ignoredPipelineFilter,
    status: 10
  });

  const lostLeads = await Lead.countDocuments({
    ...closedFilter,
    ...ignoredPipelineFilter,
    status: 11
  });

  const pendingLeads = await Lead.countDocuments({
    ...openFilter,
    ...ignoredPipelineFilter,
    status: 1
  });

  const openLeads = await Lead.countDocuments({
    ...openFilter,
    ...ignoredPipelineFilter,
    status: 0
  });

  const canceledLeads = await Lead.countDocuments({
    ...closedFilter,
    ...ignoredPipelineFilter,
    status: 12
  });

  if (hasDateFilter && totalLeads === 0) {
    totalLeads =
      openLeads +
      wonLeads +
      lostLeads +
      pendingLeads +
      canceledLeads;
  }

  const revenueResult = await Lead.aggregate([
    {
      $match: {
        ...closedFilter,
        ...ignoredPipelineFilter,
        status: 10,
        'value.amount': { $type: 'number' }
      }
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$value.amount' },
        averageTicket: { $avg: '$value.amount' }
      }
    }
  ]);

  const leadsByStatus = await Lead.aggregate([
    {
      $match: {
        ...closedFilter,
        ...ignoredPipelineFilter
      }
    },
    {
      $group: {
        _id: '$status',
        total: { $sum: 1 },
        revenue: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 10] },
                  { $ne: ['$value.amount', null] }
                ]
              },
              '$value.amount',
              0
            ]
          }
        }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  const leadsByAssignee = await Lead.aggregate([
    {
      $match: {
        ...closedFilter,
        ...ignoredPipelineFilter
      }
    },
    {
      $group: {
        _id: '$assignee.name',
        totalLeads: { $sum: 1 },
        wonLeads: {
          $sum: {
            $cond: [{ $eq: ['$status', 10] }, 1, 0]
          }
        },
        openLeads: {
          $sum: {
            $cond: [{ $eq: ['$status', 0] }, 1, 0]
          }
        },
        lostLeads: {
          $sum: {
            $cond: [{ $eq: ['$status', 11] }, 1, 0]
          }
        },
        revenue: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 10] },
                  { $ne: ['$value.amount', null] }
                ]
              },
              '$value.amount',
              0
            ]
          }
        }
      }
    },
    { $sort: { revenue: -1 } }
  ]);

  const leadsByMonth = await Lead.aggregate([
    {
      $match: {
        ...ignoredPipelineFilter,
        ...(hasDateFilter
          ? {
              $or: [
                { createdTime: dateConditions },
                { closedTime: dateConditions }
              ]
            }
          : {})
      }
    },
    {
      $addFields: {
        dashboardDate: {
          $cond: [
            {
              $in: ['$status', [10, 11, 12]]
            },
            '$closedTime',
            '$createdTime'
          ]
        }
      }
    },
    {
      $match: {
        dashboardDate: { $ne: null }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$dashboardDate' },
          month: { $month: '$dashboardDate' }
        },
        totalLeads: { $sum: 1 },
        wonLeads: {
          $sum: {
            $cond: [{ $eq: ['$status', 10] }, 1, 0]
          }
        },
        openLeads: {
          $sum: {
            $cond: [{ $eq: ['$status', 0] }, 1, 0]
          }
        },
        lostLeads: {
          $sum: {
            $cond: [{ $eq: ['$status', 11] }, 1, 0]
          }
        },
        revenue: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 10] },
                  { $ne: ['$value.amount', null] }
                ]
              },
              '$value.amount',
              0
            ]
          }
        }
      }
    },
    { $sort: { '_id.year': 1, '_id.month': 1 } }
  ]);

  return {
    filters: {
      startDate: startDate || null,
      endDate: endDate || null
    },
    metrics: {
      totalLeads,
      wonLeads,
      lostLeads,
      pendingLeads,
      canceledLeads,
      openLeads,
      totalRevenue: revenueResult[0]?.totalRevenue || 0,
      averageTicket: revenueResult[0]?.averageTicket || 0
    },
    charts: {
      leadsByStatus,
      leadsByAssignee,
      leadsByMonth
    }
  };
}

async function getPerformanceDashboard(startDate, endDate, role = 'closer') {
  const dateConditions = {};

  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    dateConditions.$gte = start;
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    dateConditions.$lte = end;
  }

  const hasDateFilter = Object.keys(dateConditions).length > 0;

  const ignoredPipelineFilter = {
    'stageset.name': { $ne: 'Processo de Vendas - Global Alliance' }
  };

  const normalizeUserName = (name) =>
    String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const CLOSER_USERS = [
    {
      displayName: 'Alba Danielly Rezende Lima',
      aliases: ['Alba Danielly Rezende Lima']
    },
    {
      displayName: 'Accounts Grupo',
      aliases: ['Accounts Grupo']
    },
    {
      displayName: 'Beatriz Costa',
      aliases: ['Beatriz Costa', 'Beatriz Costa Costa', 'Beatriz Costa  Costa ']
    },
    {
      displayName: 'Edson da Silva Bomfim Júnior',
      aliases: ['Edson da Silva Bomfim Júnior', 'Edson da Silva Bomfim Junior']
    },
    {
      displayName: 'Fabiane Carvalho Nascimento',
      aliases: ['Fabiane Carvalho Nascimento']
    },
    {
      displayName: 'Fábio Souza',
      aliases: ['Fábio Souza', 'Fabio Souza']
    },
    {
      displayName: 'Gabriel Lopes',
      aliases: ['Gabriel Lopes']
    },
    {
      displayName: 'Giovanna Fernandes',
      aliases: ['Giovanna Fernandes']
    },
    {
      displayName: 'Pedro Scarillo',
      aliases: ['Pedro Scarillo']
    },
    {
      displayName: 'Luiza Carvalho',
      aliases: ['Luiza Carvalho']
    },
    {
      displayName: 'Marcus Vinicius Dias Santana',
      aliases: ['Marcus Vinicius Dias Santana', 'Marcus Santana']
    }
  ];

  const closerAliases = CLOSER_USERS.flatMap((user) => user.aliases);

  const aliasToDisplayName = new Map();

  CLOSER_USERS.forEach((user) => {
    user.aliases.forEach((alias) => {
      aliasToDisplayName.set(
        normalizeUserName(alias),
        user.displayName
      );
    });
  });

  const getDisplayName = (name) => {
    const normalized = normalizeUserName(name);

    return aliasToDisplayName.get(normalized) || name || 'Sem responsável';
  };

  const baseFilter = {
    ...ignoredPipelineFilter,
    'assignee.name': {
      $exists: true,
      $ne: null,
      $ne: ''
    }
  };

  if (role === 'closer') {
    baseFilter['assignee.name'] = {
      $in: closerAliases
    };
  }

  const performanceRaw = await Lead.aggregate([
    {
      $match: baseFilter
    },
    {
      $addFields: {
        performanceDate: {
          $cond: [
            {
              $in: ['$status', [10, 11, 12]]
            },
            '$closedTime',
            '$createdTime'
          ]
        }
      }
    },
    {
      $match: hasDateFilter
        ? {
            performanceDate: {
              ...dateConditions,
              $ne: null
            }
          }
        : {
            performanceDate: {
              $ne: null
            }
          }
    },
    {
      $group: {
        _id: '$assignee.name',

        totalLeads: {
          $sum: 1
        },

        wonLeads: {
          $sum: {
            $cond: [{ $eq: ['$status', 10] }, 1, 0]
          }
        },

        lostLeads: {
          $sum: {
            $cond: [{ $eq: ['$status', 11] }, 1, 0]
          }
        },

        openLeads: {
          $sum: {
            $cond: [{ $eq: ['$status', 0] }, 1, 0]
          }
        },

        pendingLeads: {
          $sum: {
            $cond: [{ $eq: ['$status', 1] }, 1, 0]
          }
        },

        canceledLeads: {
          $sum: {
            $cond: [{ $eq: ['$status', 12] }, 1, 0]
          }
        },

        totalRevenue: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 10] },
                  { $ne: ['$value.amount', null] }
                ]
              },
              '$value.amount',
              0
            ]
          }
        }
      }
    }
  ]);

  const estimatedRaw = await Lead.aggregate([
  {
    $match: {
      ...baseFilter,
      status: {
        $in: [0, 1]
      },
      dueTime: hasDateFilter
        ? {
            ...dateConditions,
            $ne: null
          }
        : {
            $ne: null
          }
    }
  },
  {
    $addFields: {
      estimatedAmount: {
        $ifNull: [
          '$value.amount',
          {
            $ifNull: [
              '$normalizedValue.amount',
              {
                $ifNull: [
                  '$estimatedValue.amount',
                  {
                    $ifNull: [
                      '$rawData.value.amount',
                      0
                    ]
                  }
                ]
              }
            ]
          }
        ]
      }
    }
  },
  {
    $group: {
      _id: '$assignee.name',
      estimatedRevenue: {
        $sum: '$estimatedAmount'
      },
      estimatedLeads: {
        $sum: 1
      },
      openEstimatedLeads: {
        $sum: {
          $cond: [
            {
              $eq: ['$status', 0]
            },
            1,
            0
          ]
        }
      },
      pendingEstimatedLeads: {
        $sum: {
          $cond: [
            {
              $eq: ['$status', 1]
            },
            1,
            0
          ]
        }
      }
    }
  }
]);

  const performanceMap = new Map();

  if (role === 'closer') {
    CLOSER_USERS.forEach((user) => {
      performanceMap.set(user.displayName, {
        _id: user.displayName,
        totalLeads: 0,
        wonLeads: 0,
        lostLeads: 0,
        openLeads: 0,
        pendingLeads: 0,
        canceledLeads: 0,
        totalRevenue: 0,
        averageTicket: 0,
        conversionRate: 0,
        estimatedRevenue: 0,
        estimatedLeads: 0
      });
    });
  }

  performanceRaw.forEach((item) => {
    const displayName = getDisplayName(item._id);

    const current = performanceMap.get(displayName) || {
      _id: displayName,
      totalLeads: 0,
      wonLeads: 0,
      lostLeads: 0,
      openLeads: 0,
      pendingLeads: 0,
      canceledLeads: 0,
      totalRevenue: 0,
      averageTicket: 0,
      conversionRate: 0,
      estimatedRevenue: 0,
      estimatedLeads: 0
    };

    current.totalLeads += Number(item.totalLeads || 0);
    current.wonLeads += Number(item.wonLeads || 0);
    current.lostLeads += Number(item.lostLeads || 0);
    current.openLeads += Number(item.openLeads || 0);
    current.pendingLeads += Number(item.pendingLeads || 0);
    current.canceledLeads += Number(item.canceledLeads || 0);
    current.totalRevenue += Number(item.totalRevenue || 0);

    performanceMap.set(displayName, current);
  });

  estimatedRaw.forEach((item) => {
    const displayName = getDisplayName(item._id);

    const current = performanceMap.get(displayName) || {
      _id: displayName,
      totalLeads: 0,
      wonLeads: 0,
      lostLeads: 0,
      openLeads: 0,
      pendingLeads: 0,
      canceledLeads: 0,
      totalRevenue: 0,
      averageTicket: 0,
      conversionRate: 0,
      estimatedRevenue: 0,
      estimatedLeads: 0
    };

    current.estimatedRevenue += Number(item.estimatedRevenue || 0);
    current.estimatedLeads += Number(item.estimatedLeads || 0);

    performanceMap.set(displayName, current);
  });

  const performance = Array.from(performanceMap.values())
    .map((item) => ({
      ...item,

      averageTicket:
        Number(item.wonLeads || 0) > 0
          ? Number(item.totalRevenue || 0) / Number(item.wonLeads || 0)
          : 0,

      conversionRate:
        Number(item.totalLeads || 0) > 0
          ? (Number(item.wonLeads || 0) / Number(item.totalLeads || 0)) * 100
          : 0
    }))
    .sort((a, b) => {
  return Number(b.totalRevenue || 0) - Number(a.totalRevenue || 0);
});

  return performance;
}

async function getSourcesDashboard(startDate, endDate) {
  const dateConditions = {};

  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    dateConditions.$gte = start;
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    dateConditions.$lte = end;
  }

  const hasDateFilter = Object.keys(dateConditions).length > 0;

  const ignoredPipelineFilter = {
    'stageset.name': { $ne: 'Processo de Vendas - Global Alliance' }
  };

  const sources = await Lead.aggregate([
  {
    $match: {
      ...ignoredPipelineFilter,

      status: 10,

      closedTime: hasDateFilter
        ? {
            ...dateConditions,
            $ne: null
          }
        : {
            $ne: null
          }
    }
  },

  {
    $unwind: {
      path: '$sources',
      preserveNullAndEmptyArrays: true
    }
  },

  {
    $addFields: {
      sourceName: {
        $trim: {
          input: {
            $ifNull: [
              '$sources.name',
              ''
            ]
          }
        }
      }
    }
  },

  {
    $group: {
      _id: {
        $cond: [
          {
            $eq: [
              '$sourceName',
              ''
            ]
          },
          'Sem source',
          '$sourceName'
        ]
      },

      totalLeads: {
        $sum: 1
      },

      wonLeads: {
        $sum: 1
      },

      openLeads: {
        $sum: 0
      },

      lostLeads: {
        $sum: 0
      },

      canceledLeads: {
        $sum: 0
      },

      revenue: {
        $sum: {
          $ifNull: [
            '$value.amount',
            {
              $ifNull: [
                '$rawData.value.amount',
                0
              ]
            }
          ]
        }
      }
    }
  },

  {
    $addFields: {
      conversionRate: 100
    }
  },

  {
    $sort: {
      revenue: -1
    }
  },

  {
    $limit: 15
  }
]);

  return sources;
}

async function getProductsDashboard(startDate, endDate) {
  const dateConditions = {};

  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    dateConditions.$gte = start;
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    dateConditions.$lte = end;
  }

  const hasDateFilter = Object.keys(dateConditions).length > 0;

  const ignoredPipelineFilter = {
    'stageset.name': { $ne: 'Processo de Vendas - Global Alliance' }
  };

  const products = await Lead.aggregate([
  {
    $match: {
      ...ignoredPipelineFilter
    }
  },
  {
    $addFields: {
      productDate: {
        $cond: [
          {
            $in: ['$status', [10, 11, 12]]
          },
          '$closedTime',
          '$createdTime'
        ]
      }
    }
  },
  {
    $match: hasDateFilter
      ? {
          productDate: {
            ...dateConditions,
            $ne: null
          }
        }
      : {
          productDate: {
            $ne: null
          }
        }
  },
  {
    $unwind: {
      path: '$products',
      preserveNullAndEmptyArrays: true
    }
  },
  {
    $addFields: {
      productName: {
        $ifNull: ['$products.name', 'Sem produto']
      },
      productAmount: {
        $ifNull: ['$products.price.amount', 0]
      }
    }
  },
  {
    $group: {
      _id: '$productName',

      totalLeads: {
        $sum: 1
      },

      wonLeads: {
        $sum: {
          $cond: [{ $eq: ['$status', 10] }, 1, 0]
        }
      },

      openLeads: {
        $sum: {
          $cond: [{ $eq: ['$status', 0] }, 1, 0]
        }
      },

      lostLeads: {
        $sum: {
          $cond: [{ $eq: ['$status', 11] }, 1, 0]
        }
      },

      canceledLeads: {
        $sum: {
          $cond: [{ $eq: ['$status', 12] }, 1, 0]
        }
      },

      revenue: {
        $sum: {
          $cond: [
            { $eq: ['$status', 10] },
            '$productAmount',
            0
          ]
        }
      }
    }
  },
  {
    $addFields: {
      conversionRate: {
        $cond: [
          { $gt: ['$totalLeads', 0] },
          {
            $multiply: [
              {
                $divide: ['$wonLeads', '$totalLeads']
              },
              100
            ]
          },
          0
        ]
      }
    }
  },
  {
    $sort: {
      revenue: -1
    }
  },
  {
    $limit: 15
  }
]);

  return products;
}

async function getYearComparisonDashboard(
year = null,
comparisonSource = ''
) {
const currentYear =
Number(year) || new Date().getFullYear();

const previousYear = currentYear - 1;

const startDate = new Date(
previousYear,
0,
1,
0,
0,
0,
0
);

const endDate = new Date(
currentYear,
11,
31,
23,
59,
59,
999
);

const ignoredPipelineFilter = {
'stageset.name': {
$ne: 'Processo de Vendas - Global Alliance'
}
};

const SOURCE_GROUPS = {
  chinaLink: [
    'PARTNER - China Link BR',
    'PARTNER - China Link SC'
  ],

  metodo12p: [
    'PARTNER - Método 12P'
  ]
};

const PROCESS_EXCLUDED_SOURCES = [
  'PARTNER - China Link BR',
  'PARTNER - China Link SC',
  'PARTNER - Método 12P',
  'Cloned Lead'
];

let selectedSources = [];
let sourceFilter = {};

if (comparisonSource === 'chinaLink') {
  selectedSources = SOURCE_GROUPS.chinaLink;

  sourceFilter = {
    'sources.name': {
      $in: selectedSources
    }
  };
}

if (comparisonSource === 'metodo12p') {
  selectedSources = SOURCE_GROUPS.metodo12p;

  sourceFilter = {
    'sources.name': {
      $in: selectedSources
    }
  };
}

if (comparisonSource === 'process') {
  sourceFilter = {
    'sources.name': {
      $nin: PROCESS_EXCLUDED_SOURCES
    }
  };
}

const data = await Lead.aggregate([
{
$match: {
...ignoredPipelineFilter,
...sourceFilter,


    status: 10,

    closedTime: {
      $gte: startDate,
      $lte: endDate,
      $ne: null
    },

    'value.amount': {
      $type: 'number'
    }
  }
},

{
  $group: {
    _id: {
      year: {
        $year: '$closedTime'
      },

      month: {
        $month: '$closedTime'
      }
    },

    totalLeads: {
      $sum: 1
    },

    wonLeads: {
      $sum: 1
    },

    lostLeads: {
      $sum: 0
    },

    revenue: {
      $sum: '$value.amount'
    }
  }
},

{
  $sort: {
    '_id.year': 1,
    '_id.month': 1
  }
}


]);

const months = [
'Jan',
'Fev',
'Mar',
'Abr',
'Mai',
'Jun',
'Jul',
'Ago',
'Set',
'Out',
'Nov',
'Dez'
];

const today = new Date();

const maxMonth =
currentYear === today.getFullYear()
? today.getMonth() + 1
: 12;

const comparison = months
.slice(0, maxMonth)
.map((monthName, index) => {
const month = index + 1;


  const current = data.find(
    (item) =>
      Number(item._id.year) ===
        currentYear &&
      Number(item._id.month) === month
  );

  const previous = data.find(
    (item) =>
      Number(item._id.year) ===
        previousYear &&
      Number(item._id.month) === month
  );

  const currentRevenue =
    Number(current?.revenue || 0);

  const previousRevenue =
    Number(previous?.revenue || 0);

  const revenueGrowth =
    previousRevenue > 0
      ? (
          (currentRevenue -
            previousRevenue) /
          previousRevenue
        ) * 100
      : currentRevenue > 0
        ? 100
        : 0;

  return {
    month,
    monthName,

    currentYear,
    previousYear,

    sourceGroup:
      comparisonSource || 'all',

    current: {
      totalLeads:
        Number(current?.totalLeads || 0),

      wonLeads:
        Number(current?.wonLeads || 0),

      lostLeads:
        Number(current?.lostLeads || 0),

      revenue: currentRevenue
    },

    previous: {
      totalLeads:
        Number(previous?.totalLeads || 0),

      wonLeads:
        Number(previous?.wonLeads || 0),

      lostLeads:
        Number(previous?.lostLeads || 0),

      revenue: previousRevenue
    },

    growth: {
      revenuePercent: revenueGrowth
    }
  };
});


return comparison;
}

async function getFunnelDashboard(startDate, endDate) {
  const dateConditions = {};

  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    dateConditions.$gte = start;
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    dateConditions.$lte = end;
  }

  const hasDateFilter = Object.keys(dateConditions).length > 0;

  const ignoredPipelineFilter = {
    'stageset.name': { $ne: 'Processo de Vendas - Global Alliance' }
  };

  const closedFilter = hasDateFilter
    ? { closedTime: dateConditions }
    : {};

  const createdFilter = hasDateFilter
    ? { createdTime: dateConditions }
    : {};

  const openCount = await Lead.countDocuments({
    ...createdFilter,
    ...ignoredPipelineFilter,
    status: 0
  });

  const pendingCount = await Lead.countDocuments({
    ...createdFilter,
    ...ignoredPipelineFilter,
    status: 1
  });

  const wonCount = await Lead.countDocuments({
    ...closedFilter,
    ...ignoredPipelineFilter,
    status: 10
  });

  const lostCount = await Lead.countDocuments({
    ...closedFilter,
    ...ignoredPipelineFilter,
    status: 11
  });

  const canceledCount = await Lead.countDocuments({
    ...closedFilter,
    ...ignoredPipelineFilter,
    status: 12
  });

  const wonRevenueResult = await Lead.aggregate([
    {
      $match: {
        ...closedFilter,
        ...ignoredPipelineFilter,
        status: 10,
        'value.amount': { $type: 'number' }
      }
    },
    {
      $group: {
        _id: null,
        revenue: { $sum: '$value.amount' }
      }
    }
  ]);

  const wonRevenue = wonRevenueResult[0]?.revenue || 0;

  const totalLeads =
    openCount +
    pendingCount +
    wonCount +
    lostCount +
    canceledCount;

  return [
    {
      key: 'open',
      label: 'Open',
      codes: [0],
      order: 1,
      total: openCount,
      revenue: 0,
      percentOfTotal:
        totalLeads > 0 ? (openCount / totalLeads) * 100 : 0
    },
    {
      key: 'pending',
      label: 'Pending',
      codes: [1],
      order: 2,
      total: pendingCount,
      revenue: 0,
      percentOfTotal:
        totalLeads > 0 ? (pendingCount / totalLeads) * 100 : 0
    },
    {
      key: 'won',
      label: 'Won',
      codes: [10],
      order: 3,
      total: wonCount,
      revenue: wonRevenue,
      percentOfTotal:
        totalLeads > 0 ? (wonCount / totalLeads) * 100 : 0
    },
    {
      key: 'lost',
      label: 'Lost',
      codes: [11],
      order: 4,
      total: lostCount,
      revenue: 0,
      percentOfTotal:
        totalLeads > 0 ? (lostCount / totalLeads) * 100 : 0
    },
    {
      key: 'canceled',
      label: 'Cancelado',
      codes: [12],
      order: 5,
      total: canceledCount,
      revenue: 0,
      percentOfTotal:
        totalLeads > 0 ? (canceledCount / totalLeads) * 100 : 0
    }
  ];
}

async function getLeadActivities(leadId) {
  try {
    const response = await axios.post(
      'https://app.nutshell.com/api/v1/json',
      {
        method: 'findActivities',
        params: {
          query: {
            leadId: Number(leadId)
          },
          orderBy: 'startTime',
          orderDirection: 'ASC',
          limit: 100,
          page: 1,
          stubResponses: false
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

    return Array.isArray(
      response.data?.result
    )
      ? response.data.result
      : [];
  } catch (error) {
    console.error(
      `Erro ao buscar atividades da lead ${leadId}:`,
      error.response?.data ||
        error.message
    );

    return [];
  }
}
function getActivityDate(activity) {
  const rawDate =
    activity?.startTime ||
    activity?.endTime ||
    activity?.createdTime ||
    activity?.modifiedTime ||
    activity?.dueTime ||
    null;

  if (!rawDate) {
    return null;
  }

  const date = new Date(rawDate);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function getActivityLeadIds(activity) {
  const ids = [
    activity?.lead?.id,
    activity?.relatedLead?.id,
    activity?.entity?.entityType === 'Leads'
      ? activity?.entity?.id
      : null,
    activity?.relatedEntity?.entityType ===
    'Leads'
      ? activity?.relatedEntity?.id
      : null,
    activity?.record?.entityType === 'Leads'
      ? activity?.record?.id
      : null,
    activity?.leadId,

    ...(Array.isArray(activity?.leads)
      ? activity.leads.map(
          (lead) => lead?.id
        )
      : [])
  ]
    .map((value) => Number(value))
    .filter(
      (value) =>
        Number.isFinite(value) &&
        value > 0
    );

  return [...new Set(ids)];
}

function formatNutshellDate(date) {
  const value = new Date(date);

  const year = value.getUTCFullYear();
  const month = String(
    value.getUTCMonth() + 1
  ).padStart(2, '0');

  const day = String(
    value.getUTCDate()
  ).padStart(2, '0');

  const hours = String(
    value.getUTCHours()
  ).padStart(2, '0');

  const minutes = String(
    value.getUTCMinutes()
  ).padStart(2, '0');

  const seconds = String(
    value.getUTCSeconds()
  ).padStart(2, '0');

  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

async function findActivitiesPage({
  page,
  start,
  end,
  limit = 100
}) {
  const response = await axios.post(
    'https://app.nutshell.com/api/v1/json',
    {
      method: 'findActivities',

      params: {
        query: {
          startTime:
            `>= ${formatNutshellDate(start)}`,

          endTime:
            `< ${formatNutshellDate(end)}`
        },

        orderBy: 'startTime',
        orderDirection: 'ASC',
        limit,
        page,
        stubResponses: false
      },

      id: String(page)
    },
    {
      auth: {
        username: NUTSHELL_EMAIL,
        password: NUTSHELL_API_KEY
      }
    }
  );

  if (response.data?.error) {
    throw new Error(
      response.data.error.message ||
        'Erro retornado pelo Nutshell'
    );
  }

  return Array.isArray(
    response.data?.result
  )
    ? response.data.result
    : [];
}

async function getActivityDetail(activityId) {
  try {
    const response = await axios.post(
      'https://app.nutshell.com/api/v1/json',
      {
        method: 'getActivity',
        params: {
          activityId: Number(activityId)
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

    return response.data?.result || null;
  } catch (error) {
    console.error(
      `Erro ao detalhar atividade ${activityId}:`,
      error.response?.data ||
        error.message
    );

    return null;
  }
}

async function getLeadActivitiesByLeadId(leadId) {
  try {
    const response = await axios.post(
      'https://app.nutshell.com/api/v1/json',
      {
        method: 'findActivities',
        params: {
          query: String(leadId),
          limit: 100
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

    const activities = response.data.result || [];

    return activities.filter((activity) =>
      normalizeText(
        activity?.name ||
        activity?.activityType?.name ||
        ''
      ).includes('reunião')
    );

  } catch (error) {
    console.error(
      `Erro ao buscar atividades da lead ${leadId}:`,
      error.response?.data || error.message
    );

    return [];
  }
}

async function getLeadTimeDashboard(startDate, endDate) {
  const dateConditions = {};

  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    dateConditions.$gte = start;
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    dateConditions.$lte = end;
  }

  const hasDateFilter = Object.keys(dateConditions).length > 0;

  const ignoredPipelineFilter = {
    'stageset.name': { $ne: 'Processo de Vendas - Global Alliance' }
  };

  const baseFilter = {
    ...ignoredPipelineFilter,
    status: 10,
    createdTime: { $ne: null },
    closedTime: { $ne: null }
  };

  if (hasDateFilter) {
    baseFilter.closedTime = {
      ...dateConditions,
      $ne: null
    };
  }

  const pipelineBase = [
    {
      $match: baseFilter
    },
    {
      $project: {
        createdTime: 1,
        closedTime: 1,
        leadTimeDays: {
          $divide: [
            { $subtract: ['$closedTime', '$createdTime'] },
            1000 * 60 * 60 * 24
          ]
        }
      }
    },
    {
      $match: {
        leadTimeDays: {
          $gte: 0
        }
      }
    }
  ];

  const result = await Lead.aggregate([
    ...pipelineBase,
    {
      $group: {
        _id: null,
        averageLeadTimeDays: { $avg: '$leadTimeDays' },
        totalWon: { $sum: 1 }
      }
    }
  ]);

  const byMonth = await Lead.aggregate([
    ...pipelineBase,
    {
      $project: {
        year: { $year: '$closedTime' },
        month: { $month: '$closedTime' },
        leadTimeDays: 1
      }
    },
    {
      $group: {
        _id: {
          year: '$year',
          month: '$month'
        },
        averageLeadTimeDays: { $avg: '$leadTimeDays' },
        totalWon: { $sum: 1 }
      }
    },
    {
      $sort: {
        '_id.year': 1,
        '_id.month': 1
      }
    }
  ]);

  return {
    summary: {
      averageLeadTimeDays: result[0]?.averageLeadTimeDays || 0,
      totalWon: result[0]?.totalWon || 0
    },
    byMonth
  };
}

async function getStatesDashboard(startDate, endDate) {
  const dateConditions = {};

  if (startDate) {
    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);
    dateConditions.$gte = start;
  }

  if (endDate) {
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    dateConditions.$lte = end;
  }

  const hasDateFilter = Object.keys(dateConditions).length > 0;

  const ignoredPipelineFilter = {
    'stageset.name': { $ne: 'Processo de Vendas - Global Alliance' }
  };

  const states = await Lead.aggregate([
    {
      $match: {
        ...ignoredPipelineFilter
      }
    },
    {
      $addFields: {
        stateDate: {
          $cond: [
            {
              $in: ['$status', [10, 11, 12]]
            },
            '$closedTime',
            '$createdTime'
          ]
        },
        stateName: {
          $ifNull: [
            '$territory.name',
            {
              $ifNull: [
                { $arrayElemAt: ['$primaryAccount.regions', 0] },
                'Sem estado'
              ]
            }
          ]
        }
      }
    },
    {
      $match: hasDateFilter
        ? {
            stateDate: {
              ...dateConditions,
              $ne: null
            }
          }
        : {
            stateDate: {
              $ne: null
            }
          }
    },
    {
      $group: {
        _id: '$stateName',

        totalLeads: {
          $sum: 1
        },

        wonLeads: {
          $sum: {
            $cond: [{ $eq: ['$status', 10] }, 1, 0]
          }
        },

        openLeads: {
          $sum: {
            $cond: [{ $eq: ['$status', 0] }, 1, 0]
          }
        },

        lostLeads: {
          $sum: {
            $cond: [{ $eq: ['$status', 11] }, 1, 0]
          }
        },

        canceledLeads: {
          $sum: {
            $cond: [{ $eq: ['$status', 12] }, 1, 0]
          }
        },

        revenue: {
          $sum: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 10] },
                  { $ne: ['$value.amount', null] }
                ]
              },
              '$value.amount',
              0
            ]
          }
        }
      }
    },
    {
      $addFields: {
        conversionRate: {
          $cond: [
            { $gt: ['$totalLeads', 0] },
            {
              $multiply: [
                {
                  $divide: ['$wonLeads', '$totalLeads']
                },
                100
              ]
            },
            0
          ]
        }
      }
    },
    {
      $sort: {
        revenue: -1
      }
    },
    {
      $limit: 30
    }
  ]);

  return states;
}

async function getDataQualityDashboard() {
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);

  const totalLeads = await Lead.countDocuments();

  const withCreatedTime = await Lead.countDocuments({
    createdTime: { $ne: null }
  });

  const withClosedTime = await Lead.countDocuments({
    closedTime: { $ne: null }
  });

  const withAssignee = await Lead.countDocuments({
    'assignee.name': { $exists: true, $ne: null, $ne: '' }
  });

  const withRawAssignee = await Lead.countDocuments({
    'rawData.assignee.name': { $exists: true, $ne: null, $ne: '' }
  });

  const createdToday = await Lead.countDocuments({
    createdTime: {
      $gte: todayStart,
      $lte: todayEnd
    }
  });

  const closedToday = await Lead.countDocuments({
    closedTime: {
      $gte: todayStart,
      $lte: todayEnd
    }
  });

  const modifiedToday = await Lead.countDocuments({
    modifiedTime: {
      $gte: todayStart,
      $lte: todayEnd
    }
  });

  const statusDistribution = await Lead.aggregate([
    {
      $group: {
        _id: '$status',
        total: { $sum: 1 }
      }
    },
    {
      $sort: { _id: 1 }
    }
  ]);

  return {
    totalLeads,
    fields: {
      withCreatedTime,
      withClosedTime,
      withAssignee,
      withRawAssignee
    },
    today: {
      createdToday,
      closedToday,
      modifiedToday
    },
    statusDistribution
  };
}

async function getCommercialFlowDashboard(startDate, endDate) {
const now = new Date();

const rangeStart = startDate
? new Date(startDate)
: new Date(
now.getFullYear(),
now.getMonth() - 11,
1,
0,
0,
0,
0
);

rangeStart.setHours(0, 0, 0, 0);

const rangeEnd = endDate
? new Date(endDate)
: new Date(
now.getFullYear(),
now.getMonth() + 1,
0,
23,
59,
59,
999
);

rangeEnd.setHours(23, 59, 59, 999);

if (
Number.isNaN(rangeStart.getTime()) ||
Number.isNaN(rangeEnd.getTime())
) {
throw new Error(
'Datas inválidas no fluxo comercial mensal.'
);
}

const ignoredPipelineFilter = {
'stageset.name': {
$ne: 'Processo de Vendas - Global Alliance'
}
};

const [
entriesRaw,
closuresRaw,
startingBacklog
] = await Promise.all([
Lead.aggregate([
{
$match: {
...ignoredPipelineFilter,
createdTime: {
$gte: rangeStart,
$lte: rangeEnd,
$ne: null
}
}
},
{
$group: {
_id: {
year: {
$year: '$createdTime'
},
month: {
$month: '$createdTime'
}
},
entries: {
$sum: 1
}
}
},
{
$sort: {
'_id.year': 1,
'_id.month': 1
}
}
]),


Lead.aggregate([
  {
    $match: {
      ...ignoredPipelineFilter,

      status: 10,

      closedTime: {
        $gte: rangeStart,
        $lte: rangeEnd,
        $ne: null
      }
    }
  },
  {
    $group: {
      _id: {
        year: {
          $year: '$closedTime'
        },
        month: {
          $month: '$closedTime'
        }
      },

      closures: {
        $sum: 1
      },

      won: {
        $sum: 1
      },

      lost: {
        $sum: 0
      },

      cancelled: {
        $sum: 0
      }
    }
  },
  {
    $sort: {
      '_id.year': 1,
      '_id.month': 1
    }
  }
]),

Lead.countDocuments({
  ...ignoredPipelineFilter,

  createdTime: {
    $lt: rangeStart,
    $ne: null
  },

  $or: [
    {
      status: {
        $ne: 10
      }
    },
    {
      status: 10,
      closedTime: null
    },
    {
      status: 10,
      closedTime: {
        $exists: false
      }
    },
    {
      status: 10,
      closedTime: {
        $gte: rangeStart
      }
    }
  ]
})


]);

const entriesMap = new Map(
entriesRaw.map((item) => [
`${item._id.year}-${item._id.month}`,
Number(item.entries || 0)
])
);

const closuresMap = new Map(
closuresRaw.map((item) => [
`${item._id.year}-${item._id.month}`,
{
closures: Number(item.closures || 0),
won: Number(item.won || 0),
lost: Number(item.lost || 0),
cancelled: Number(item.cancelled || 0)
}
])
);

const monthNames = [
'Jan',
'Fev',
'Mar',
'Abr',
'Mai',
'Jun',
'Jul',
'Ago',
'Set',
'Out',
'Nov',
'Dez'
];

const months = [];

const cursor = new Date(
rangeStart.getFullYear(),
rangeStart.getMonth(),
1
);

const finalMonth = new Date(
rangeEnd.getFullYear(),
rangeEnd.getMonth(),
1
);

let backlog = 0;

while (cursor <= finalMonth) {
const year = cursor.getFullYear();
const month = cursor.getMonth() + 1;
const key = `${year}-${month}`;


const entries =
  entriesMap.get(key) || 0;

const closureData =
  closuresMap.get(key) || {
    closures: 0,
    won: 0,
    lost: 0,
    cancelled: 0
  };

const balance =
  entries - closureData.closures;

backlog = Math.max(
  backlog + balance,
  0
);

months.push({
  year,
  month,
  monthName: monthNames[month - 1],
  label: `${monthNames[month - 1]}/${year}`,
  entries,
  closures: closureData.closures,
  won: closureData.won,
  lost: closureData.lost,
  cancelled: closureData.cancelled,
  balance,
  backlog
});

cursor.setMonth(
  cursor.getMonth() + 1
);


}

const totals = months.reduce(
(acc, item) => {
acc.entries += item.entries;
acc.closures += item.closures;
acc.won += item.won;
acc.lost += item.lost;
acc.cancelled += item.cancelled;
acc.balance += item.balance;


  return acc;
},
{
  entries: 0,
  closures: 0,
  won: 0,
  lost: 0,
  cancelled: 0,
  balance: 0
}


);

return {
filters: {
startDate: rangeStart,
endDate: rangeEnd
},


startingBacklog: 0,

endingBacklog:
  months.length > 0
    ? months[months.length - 1].backlog
    : 0,

totals,

months


};
}

// ========================================
// DASHBOARD - PERFORMANCE SDR / CLOSER
// ========================================

app.get(
  '/api/dashboard/team-performance',
  async (req, res) => {
    try {
      const {
        role = 'closer',
        startDate,
        endDate
      } = req.query;

      if (
        !['sdr', 'closer'].includes(role)
      ) {
        return res.status(400).json({
          sucesso: false,
          erro:
            'Role inválido. Utilize role=sdr ou role=closer.'
        });
      }

      const result =
        await getTeamPerformanceDashboard({
          role,
          startDate,
          endDate
        });

      res.json({
        sucesso: true,
        ...result
      });
    } catch (error) {
      console.error(
        'ERRO TEAM PERFORMANCE:',
        error.stack || error
      );

      res.status(500).json({
        sucesso: false,
        erro: error.message
      });
    }
  }
);


// ========================================
// DASHBOARD - FULL DATA
// ========================================

app.get('/api/dashboard/full', async (req, res) => {
  const {
    startDate,
    endDate,
    comparisonSource
  } = req.query;

async function runDashboardStep(stepName, callback) {
try {
console.log(
`[DASHBOARD FULL] Iniciando: ${stepName}`
);

  const result = await callback();

  console.log(
    `[DASHBOARD FULL] Finalizado: ${stepName}`
  );

  return result;
} catch (error) {
  console.error(
    `[DASHBOARD FULL] ERRO EM ${stepName}:`,
    error.stack || error
  );

  error.dashboardStep = stepName;

  throw error;
}


}

try {
const general = await runDashboardStep(
'general',
() =>
getGeneralDashboard(
startDate,
endDate
)
);


const performance = await runDashboardStep(
  'performance',
  () =>
    getPerformanceDashboard(
      startDate,
      endDate,
      'closer'
    )
);

const sources = await runDashboardStep(
  'sources',
  () =>
    getSourcesDashboard(
      startDate,
      endDate
    )
);

const products = await runDashboardStep(
  'products',
  () =>
    getProductsDashboard(
      startDate,
      endDate
    )
);

const comparison = await runDashboardStep(
  'comparison',
  () =>
    getYearComparisonDashboard(
      null,
      comparisonSource || ''
    )
);

const funnel = await runDashboardStep(
  'funnel',
  () =>
    getFunnelDashboard(
      startDate,
      endDate
    )
);

const leadTime = await runDashboardStep(
  'leadTime',
  () =>
    getLeadTimeDashboard(
      startDate,
      endDate
    )
);

const states = await runDashboardStep(
  'states',
  () =>
    getStatesDashboard(
      startDate,
      endDate
    )
);

const dataQuality = await runDashboardStep(
  'dataQuality',
  () =>
    getDataQualityDashboard()
);

const commercialFlow = await runDashboardStep(
  'commercialFlow',
  () =>
    getCommercialFlowDashboard(
      startDate,
      endDate
    )
);

res.json({
  sucesso: true,
  general,
  performance,
  sources,
  products,
  comparison,
  funnel,
  leadTime,
  states,
  dataQuality,
  commercialFlow
});


} catch (error) {
console.error(
'ERRO DASHBOARD FULL:',
error.stack || error
);


res.status(500).json({
  sucesso: false,
  etapa: error.dashboardStep || 'desconhecida',
  erro: error.message
});
}
});


app.get('/api/dashboard/sdr', async (req, res) => {
  try {
    const {
      startDate,
      endDate
    } = req.query;

    const filters = {};

    if (startDate || endDate) {
      filters.createdTime = {};

      if (startDate) {
        filters.createdTime.$gte = new Date(startDate);
      }

      if (endDate) {
        filters.createdTime.$lte = new Date(endDate);
      }
    }

    const totalLeads =
      await Lead.countDocuments(filters);

    const qualified =
      await Lead.countDocuments({
        ...filters,
        status: 1
      });

    const won =
      await Lead.countDocuments({
        ...filters,
        status: 10
      });

    const lost =
      await Lead.countDocuments({
        ...filters,
        status: 11
      });

    const meetingsScheduled = 0;
    const meetingsDone = 0;
    const noShow = 0;
    const rework = 0;
    const disqualified = 0;
    const icp = 0;
    const firstResponseMinutes = 0;

    res.json({
      received: totalLeads,
      qualified,
      meetingsScheduled,
      meetingsDone,
      noShow,
      rework,
      disqualified,
      icp,
      firstResponseMinutes,
      won,
      lost
    });

  } catch (error) {
    console.error(error);

    res.status(500).json({
      erro: 'Erro ao carregar SDR dashboard'
    });
  }
});


app.get('/api/audit/won-assignees', async (req, res) => {
  try {
    const start = new Date('2026-07-01T00:00:00');
    const end = new Date('2026-07-31T23:59:59');

    const result = await Lead.aggregate([
      {
        $match: {
          status: 10,
          closedTime: {
            $gte: start,
            $lte: end
          }
        }
      },
      {
        $group: {
          _id: {
            assignee: '$assignee.name',
            rawAssignee: '$rawData.assignee.name',
            owner: '$owner.name',
            rawOwner: '$rawData.owner.name',
            stageset: '$stageset.name'
          },
          total: { $sum: 1 },
          revenue: { $sum: { $ifNull: ['$value.amount', 0] } }
        }
      },
      { $sort: { revenue: -1 } }
    ]);

    res.json({
      sucesso: true,
      result
    });
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

app.get('/api/audit/estimated-by-assignee', async (req, res) => {
  try {
    const { startDate, endDate, assignee } = req.query;

    const dateConditions = {};

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      dateConditions.$gte = start;
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateConditions.$lte = end;
    }

    const filter = {
      status: {
        $nin: [10, 11, 12]
      },
      closedTime: {
        ...dateConditions,
        $ne: null
      },
      'stageset.name': {
        $ne: 'Processo de Vendas - Global Alliance'
      }
    };

    if (assignee) {
      filter['assignee.name'] = {
        $regex: assignee,
        $options: 'i'
      };
    }

    const leads = await Lead.find(filter)
      .select({
        nutshell_id: 1,
        name: 1,
        status: 1,
        value: 1,
        closedTime: 1,
        modifiedTime: 1,
        assignee: 1,
        rawData: 1,
        htmlUrl: 1,
        synced_at: 1
      })
      .sort({
        closedTime: 1
      })
      .lean();

    const totalRevenue = leads.reduce(
      (sum, lead) => sum + Number(lead.value?.amount || 0),
      0
    );

    res.json({
      sucesso: true,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        assignee: assignee || null
      },
      summary: {
        totalLeads: leads.length,
        totalRevenue
      },
      leads: leads.map((lead) => ({
        nutshell_id: lead.nutshell_id,
        name: lead.name,
        status: lead.status,
        value: lead.value?.amount || 0,
        closedTime: lead.closedTime,
        modifiedTime: lead.modifiedTime,
        assignee: lead.assignee?.name,
        rawAssignee: lead.rawData?.assignee?.name,
        htmlUrl: lead.htmlUrl || lead.rawData?.htmlUrl,
        synced_at: lead.synced_at
      }))
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

app.get('/api/audit/test-estimates', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const start = new Date(startDate || '2026-07-01');
    const end = new Date(endDate || '2026-07-31');

    const leads = await Lead.find({
      closedTime: {
        $gte: start,
        $lte: end
      }
    })
      .select({
        nutshell_id: 1,
        name: 1,
        status: 1,
        value: 1,
        closedTime: 1,
        assignee: 1
      })
      .limit(50)
      .lean();

    const summary = {
      total: leads.length,
      withValue: 0,
      withoutValue: 0,
      status0: 0,
      status10: 0,
      status11: 0,
      status12: 0
    };

    leads.forEach((l) => {
      const value = l.value?.amount || 0;

      if (value > 0) summary.withValue++;
      else summary.withoutValue++;

      if (l.status === 0) summary.status0++;
      if (l.status === 10) summary.status10++;
      if (l.status === 11) summary.status11++;
      if (l.status === 12) summary.status12++;
    });

    res.json({
      sucesso: true,
      range: { start, end },
      summary,
      sample: leads.slice(0, 10)
    });
  } catch (err) {
    res.status(500).json({
      sucesso: false,
      erro: err.message
    });
  }
});


app.get('/api/audit/person-search', async (req, res) => {
  try {
    const { name } = req.query;

    const leads = await Lead.find({
      $or: [
        { 'assignee.name': { $regex: name, $options: 'i' } },
        { 'rawData.assignee.name': { $regex: name, $options: 'i' } }
      ]
    })
      .select({
        nutshell_id: 1,
        name: 1,
        status: 1,
        value: 1,
        closedTime: 1,
        modifiedTime: 1,
        assignee: 1,
        stageset: 1,
        milestone: 1
      })
      .sort({ modifiedTime: -1 })
      .limit(50)
      .lean();

    res.json({ sucesso: true, total: leads.length, leads });
  } catch (error) {
    res.status(500).json({ sucesso: false, erro: error.message });
  }
});


app.get('/api/audit/won-current-nutshell-compare', async (req, res) => {
  try {
    const { period = '2026-07' } = req.query;

    const [year, month] = period.split('-').map(Number);

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const leads = await Lead.find({
      status: 10,
      closedTime: {
        $gte: startDate,
        $lte: endDate
      }
    })
      .select({
        nutshell_id: 1,
        name: 1,
        status: 1,
        value: 1,
        closedTime: 1,
        modifiedTime: 1,
        assignee: 1,
        stageset: 1,
        milestone: 1,
        htmlUrl: 1,
        synced_at: 1
      })
      .sort({ closedTime: -1 })
      .lean();

    const audit = [];
    let changedAssignee = 0;
    let changedStatus = 0;
    let changedValue = 0;
    let errors = 0;

    for (const lead of leads) {
      try {
        const detailResponse = await axios.post(
          'https://app.nutshell.com/api/v1/json',
          {
            method: 'getLead',
            params: {
              leadId: lead.nutshell_id
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

        const nutshellLead = detailResponse.data.result;

        const mongoAssignee = lead.assignee?.name || null;
        const nutshellAssignee = nutshellLead?.assignee?.name || null;

        const mongoValue = Number(lead.value?.amount || 0);
        const nutshellValue = Number(nutshellLead?.value?.amount || 0);

        const assigneeDifferent = mongoAssignee !== nutshellAssignee;
        const statusDifferent = Number(lead.status) !== Number(nutshellLead?.status);
        const valueDifferent = mongoValue !== nutshellValue;

        if (assigneeDifferent) changedAssignee++;
        if (statusDifferent) changedStatus++;
        if (valueDifferent) changedValue++;

        audit.push({
          nutshell_id: lead.nutshell_id,
          name: lead.name,
          mongo: {
            status: lead.status,
            value: mongoValue,
            assignee: mongoAssignee,
            closedTime: lead.closedTime,
            synced_at: lead.synced_at
          },
          nutshell: {
            status: nutshellLead?.status,
            value: nutshellValue,
            assignee: nutshellAssignee,
            closedTime: nutshellLead?.closedTime,
            modifiedTime: nutshellLead?.modifiedTime
          },
          differences: {
            assigneeDifferent,
            statusDifferent,
            valueDifferent
          },
          htmlUrl: lead.htmlUrl || nutshellLead?.htmlUrl
        });

        await new Promise((resolve) => setTimeout(resolve, 150));

      } catch (leadError) {
        errors++;

        audit.push({
          nutshell_id: lead.nutshell_id,
          name: lead.name,
          erro: leadError.response?.data || leadError.message
        });
      }
    }

    res.json({
      sucesso: true,
      period,
      totalWonLeads: leads.length,
      summary: {
        changedAssignee,
        changedStatus,
        changedValue,
        errors
      },
      audit
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.response?.data || error.message
    });
  }
});


app.get('/api/sync/nutshell/won-period-current', async (req, res) => {
  try {
    const { period = '2026-07' } = req.query;

    const [year, month] = period.split('-').map(Number);

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const leads = await Lead.find({
      status: 10,
      closedTime: {
        $gte: startDate,
        $lte: endDate
      }
    })
      .select({
        nutshell_id: 1,
        name: 1,
        assignee: 1,
        value: 1,
        status: 1,
        closedTime: 1
      })
      .sort({ closedTime: -1 })
      .lean();

    let checked = 0;
    let updated = 0;
    let errors = 0;

    const details = [];

    for (const lead of leads) {
      try {
        checked++;

        const before = {
          assignee: lead.assignee?.name || null,
          status: lead.status,
          value: lead.value?.amount || 0,
          closedTime: lead.closedTime
        };

        const detailResponse = await axios.post(
          'https://app.nutshell.com/api/v1/json',
          {
            method: 'getLead',
            params: {
              leadId: lead.nutshell_id
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

        const fullLead = detailResponse.data.result;

        if (!fullLead) {
          details.push({
            nutshell_id: lead.nutshell_id,
            name: lead.name,
            updated: false,
            reason: 'Lead não encontrada no Nutshell'
          });

          continue;
        }

        await saveFullLead(fullLead);

        updated++;

        details.push({
          nutshell_id: lead.nutshell_id,
          name: lead.name,
          updated: true,
          before,
          after: {
            assignee: fullLead.assignee?.name || null,
            status: fullLead.status,
            value: fullLead.value?.amount || 0,
            closedTime: fullLead.closedTime,
            modifiedTime: fullLead.modifiedTime
          }
        });

        await new Promise((resolve) => setTimeout(resolve, 150));

      } catch (leadError) {
        errors++;

        details.push({
          nutshell_id: lead.nutshell_id,
          name: lead.name,
          updated: false,
          error: leadError.response?.data || leadError.message
        });
      }
    }

    res.json({
      sucesso: true,
      period,
      checked,
      updated,
      errors,
      details
    });

  } catch (error) {
    console.error('ERRO SYNC WON PERIOD CURRENT:', error.response?.data || error.message);

    res.status(500).json({
      sucesso: false,
      erro: error.response?.data || error.message
    });
  }
});

// ========================================
// TESTE API NUTSHELL - LISTA RESUMIDA
// ========================================

app.get('/api/nutshell/leads', async (req, res) => {
  try {
    const response = await axios.post(
      'https://app.nutshell.com/api/v1/json',
      {
        method: 'findLeads',
        params: { query: {}, limit: 500 },
        id: 1
      },
      {
        auth: {
          username: NUTSHELL_EMAIL,
          password: NUTSHELL_API_KEY
        }
      }
    );

    res.json({
      sucesso: true,
      total: response.data.result?.length || 0,
      dados: response.data
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.response?.data || error.message
    });
  }
});

// ========================================
// TESTE API NUTSHELL - PAGINAÇÃO
// ========================================

app.get('/api/nutshell/leads-page-test', async (req, res) => {
  try {
    const page = Number(req.query.page) || 2;
    const limit = Number(req.query.limit) || 10;

    const response = await axios.post(
      'https://app.nutshell.com/api/v1/json',
      {
        method: 'findLeads',
        params: { query: {}, limit, page },
        id: 1
      },
      {
        auth: {
          username: NUTSHELL_EMAIL,
          password: NUTSHELL_API_KEY
        }
      }
    );

    res.json({
      sucesso: true,
      page,
      limit,
      total: response.data.result?.length || 0,
      dados: response.data
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.response?.data || error.message
    });
  }
});

// ========================================
// TESTE API NUTSHELL - LEAD COMPLETO POR ID
// ========================================

app.get('/api/nutshell/leads/:id', async (req, res) => {
  try {
    const leadId = Number(req.params.id);

    const response = await axios.post(
      'https://app.nutshell.com/api/v1/json',
      {
        method: 'getLead',
        params: { leadId },
        id: 1
      },
      {
        auth: {
          username: NUTSHELL_EMAIL,
          password: NUTSHELL_API_KEY
        }
      }
    );

    res.json({
      sucesso: true,
      dados: response.data
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.response?.data || error.message
    });
  }
});

async function enrichNonPriorityLeads({ limit = 300 } = {}) {
  const leads = await Lead.find({
    status: { $in: DAILY_STATUS },
    $or: [
      { createdTime: { $exists: false } },
      { createdTime: null },
      { modifiedTime: { $exists: false } },
      { modifiedTime: null },
      { 'assignee.name': { $exists: false } },
      { 'assignee.name': null },
      { 'assignee.name': '' },
      { sources: { $exists: false } },
      { sources: null },
      { sources: { $size: 0 } },
      { 'rawData.sources': { $exists: false } },
      { 'rawData.sources': null },
      { 'rawData.sources': { $size: 0 } },
      { products: { $exists: false } },
      { products: null },
      { products: { $size: 0 } }
    ]
  })
    .sort({ synced_at: -1 })
    .limit(limit)
    .select({ nutshell_id: 1 })
    .lean();

  let enriched = 0;
  let errors = 0;

  for (const lead of leads) {
    try {
      const detailResponse = await axios.post(
        'https://app.nutshell.com/api/v1/json',
        {
          method: 'getLead',
          params: {
            leadId: lead.nutshell_id
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

      const fullLead = detailResponse.data.result;

      if (fullLead) {
        await saveFullLead(fullLead);
        enriched++;
      }

      await sleep(300);

    } catch (error) {
      errors++;
      console.error(
        `Erro ao enriquecer lead não prioritária ${lead.nutshell_id}:`,
        error.response?.data || error.message
      );
    }
  }

  return {
    checked: leads.length,
    enriched,
    errors
  };
}

app.get('/api/sync/nutshell/enrich-daily', async (req, res) => {
  try {
    const result = await enrichNonPriorityLeads({
      limit: Number(req.query.limit) || 300
    });

    res.json({
      sucesso: true,
      result
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.response?.data || error.message
    });
  }
});

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function syncRecentLeads({
  limit = 20,
  lastPage = null,
  pagesBack = 5
} = {}) {
  if (!lastPage) {
  lastPage = await getNutshellLastPage(limit);
  }
  let totalChecked = 0;
  let totalCreatedOrUpdated = 0;

  for (let page = lastPage; page > lastPage - pagesBack; page--) {
    const nutshellResponse = await axios.post(
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

    const leads = nutshellResponse.data.result || [];

    for (const lead of leads) {
      totalChecked++;

      const existingLead = await Lead.findOne({
        nutshell_id: lead.id
      });

      if (!existingLead || existingLead.rev !== lead.rev) {
        await saveSummaryLead(lead);
        totalCreatedOrUpdated++;
      }
    }
  }

  return {
    totalChecked,
    totalCreatedOrUpdated
  };
}

// ========================================
// CRON SYNC NUTSHELL
// ========================================

const syncLeads = require('./scripts/syncNutshellLeads');

//cron.schedule('*/15 * * * *', async () => {
  //console.log('Iniciando sincronização automática...');

  //try {
    //await syncLeads();
    //console.log('Sincronização finalizada.');
  //} catch (err) {
    //console.error('Erro na sincronização:', err);
  //}
//});
async function enrichPriorityLeads({ limit = 50 } = {}) {
  const leads = await Lead.find({
    status: { $in: PRIORITY_STATUS },
    $or: [
      { createdTime: { $exists: false } },
      { createdTime: null },
      { 'assignee.name': { $exists: false } },
      { 'assignee.name': null },
      { 'assignee.name': '' },
      { sources: { $exists: false } },
      { sources: null },
      { sources: { $size: 0 } },
      { 'rawData.sources': { $exists: false } },
      { 'rawData.sources': null },
      { 'rawData.sources': { $size: 0 } },
      { products: { $exists: false } },
      { products: null },
      { products: { $size: 0 } }
    ]
  })
    .sort({ synced_at: -1 })
    .limit(limit)
    .select({ nutshell_id: 1 })
    .lean();

  let enriched = 0;
  let errors = 0;

  for (const lead of leads) {
    try {
      const detailResponse = await axios.post(
        'https://app.nutshell.com/api/v1/json',
        {
          method: 'getLead',
          params: {
            leadId: lead.nutshell_id
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

      const fullLead = detailResponse.data.result;

      if (fullLead) {
        await saveFullLead(fullLead);
        enriched++;
      }

      await sleep(300);

    } catch (error) {
      errors++;
      console.error(
        `Erro ao enriquecer lead prioridade ${lead.nutshell_id}:`,
        error.response?.data || error.message
      );
    }
  }

  return {
    checked: leads.length,
    enriched,
    errors
  };
}


app.get('/api/sync/nutshell/auto', async (req, res) => {
  try {
    const recentSync = await syncRecentLeads({
      limit: Number(req.query.limit) || 20,
      lastPage: req.query.lastPage
        ? Number(req.query.lastPage)
        : null,
      pagesBack: Number(req.query.pagesBack) || 5
    });

    const priorityEnrich = await enrichPriorityLeads({
      limit: Number(req.query.enrichLimit) || 50
    });

    res.json({
      sucesso: true,
      recentSync,
      priorityEnrich
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.response?.data || error.message
    });
  }
});

async function syncCurrentMonthClosedLeads() {
  try {
    console.log('Rodando sync de close date do mês atual...');

    const now = new Date();

    const startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

    const endDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

    const urlStart = startDate.toISOString().slice(0, 10);
    const urlEnd = endDate.toISOString().slice(0, 10);

    const response = await axios.get(
      `${process.env.API_BASE_URL || 'http://localhost:3000'}/api/sync/nutshell/leads/closed-period?startDate=${urlStart}&endDate=${urlEnd}&maxPages=5`
    );

    console.log('Sync mês atual finalizada:', response.data);

  } catch (error) {
    console.error(
      'Erro no sync de close date do mês atual:',
      error.response?.data || error.message
    );
  }
}

cron.schedule('*/15 * * * *', () => {
  syncCurrentMonthClosedLeads();
});

cron.schedule('0 3 * * *', async () => {
  console.log('Rodando enriquecimento diário de leads não prioritárias...');

  try {
    const result = await enrichNonPriorityLeads({
      limit: 300
    });

    console.log('Enriquecimento diário finalizado:', result);

  } catch (error) {
    console.error('Erro no enriquecimento diário:', error.message);
  }
});




async function getNutshellLastPage(limit = 20) {
  const estimatedTotal = await Lead.countDocuments();

  return Math.max(Math.ceil(estimatedTotal / limit), 1);
}

// ========================================
// FUNÇÕES AUXILIARES
// ========================================

const ROAD_TO_GLORY_TAG = 'Road to the Glory - Junho';

function createMonthRange(period = '2026-07') {
  const match = String(period).match(/^(\d{4})-(\d{2})$/);

  if (!match) {
    throw new Error(
      'Período inválido. Utilize o formato YYYY-MM.'
    );
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  const start = new Date(
    year,
    month - 1,
    1,
    0,
    0,
    0,
    0
  );

  const end = new Date(
    year,
    month,
    0,
    23,
    59,
    59,
    999
  );

  return {
    period,
    start,
    end
  };
}

function getActivityDate(activity) {
  const rawDate =
    activity?.startTime ||
    activity?.endTime ||
    activity?.createdTime ||
    activity?.modifiedTime ||
    null;

  if (!rawDate) {
    return null;
  }

  const date = new Date(rawDate);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

function normalizeName(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isMeetingActivity(activity) {
  const activityName = normalizeName(
    activity?.name ||
    activity?.activityType?.name ||
    ''
  );

  return (
    activityName.includes('reuniao efetiva') ||
    activityName.includes('reuniao agendada') ||
    activityName.includes('reuniao reagendada') ||
    activityName.includes('reuniao realizada')
  );
}

function hasRoadToGloryTag(tags = []) {
  if (!Array.isArray(tags)) {
    return false;
  }

  return tags.some(
    (tag) =>
      normalizeName(tag) ===
      normalizeName(ROAD_TO_GLORY_TAG)
  );
}

async function saveSummaryLead(lead) {
  const existingLead = await Lead.findOne({ nutshell_id: lead.id });

  const valueHistory = [];

  const oldValue = existingLead?.value?.amount;
  const newValue = lead?.value?.amount;

  if (oldValue !== newValue) {
    valueHistory.push({
      value: newValue || 0,
      currency: lead?.value?.currency || 'BRL',
      changed_at: new Date()
    });
  }

  const updatePayload = {
    $set: {
      nutshell_id: lead.id,
      entityType: lead.entityType,
      rev: lead.rev,
      name: lead.name,
      description: lead.description,
      status: lead.status,
      completion: lead.completion,
      value: lead.value,
      primaryAccount: { name: lead.primaryAccountName },
      contacts: lead.primaryContactName ? [{ name: lead.primaryContactName }] : [],
      isOverdue: lead.isOverdue,
      lastContactedDate: lead.lastContactedDate,
      dueTime: lead.dueTime ?? null,
      closedTime: lead.closedTime ?? null,
      synced_at: new Date(),
      rawData: lead
    }
  };

  if (valueHistory.length > 0) {
    updatePayload.$push = {
      value_history: {
        $each: valueHistory
      }
    };
  }

  await Lead.findOneAndUpdate(
    { nutshell_id: lead.id },
    updatePayload,
    { upsert: true, returnDocument: 'after' }
  );
}

async function saveFullLead(fullLead) {
  const existingLead = await Lead.findOne({ nutshell_id: fullLead.id });

  const valueHistory = [];

  const oldValue = existingLead?.value?.amount;
  const newValue = fullLead?.value?.amount;

  if (oldValue !== newValue) {
    valueHistory.push({
      value: newValue || 0,
      currency: fullLead?.value?.currency || 'BRL',
      changed_at: new Date()
    });
  }

  const updatePayload = {
    $set: {
      nutshell_id: fullLead.id,
      entityType: fullLead.entityType,
      rev: fullLead.rev,
      name: fullLead.name,
      description: fullLead.description,
      htmlUrl: fullLead.htmlUrl,
      status: fullLead.status,
      confidence: fullLead.confidence,
      completion: fullLead.completion,
      urgency: fullLead.urgency,
      value: fullLead.value ?? null,
      normalizedValue: fullLead.normalizedValue ?? null,
      estimatedValue: fullLead.estimatedValue ?? null,
      primaryAccount: fullLead.primaryAccount,
      assignee: fullLead.assignee
  ? {
      ...fullLead.assignee,
      name: fullLead.assignee.name
        ?.replace(/\s+/g, ' ')
        ?.trim()
    }
  : null,
      milestone: fullLead.milestone,
      stageset: fullLead.stageset,
      contacts: fullLead.contacts || [],
      products: fullLead.products || [],
      sources: fullLead.sources || [],
      tags: fullLead.tags || [],
      
      activities:
        fullLead.activities !== undefined
          ? fullLead.activities
          : existingLead?.activities || [],
      
      customFields: fullLead.customFields || {},
      processes: fullLead.processes || [],
      createdTime: fullLead.createdTime,
      modifiedTime: fullLead.modifiedTime,
      dueTime: fullLead.dueTime ?? null,
      closedTime: fullLead.closedTime ?? null,
      synced_at: new Date(),
      rawData: fullLead
    }
  };

  if (valueHistory.length > 0) {
    updatePayload.$push = {
      value_history: {
        $each: valueHistory
      }
    };
  }

  await Lead.findOneAndUpdate(
    { nutshell_id: fullLead.id },
    updatePayload,
    { upsert: true, new: true, runValidators: true }
  );
}

const PERFORMANCE_TEAMS = {
  closer: [
    {
      displayName: 'Alba Danielly Rezende Lima',
      aliases: [
        'Alba Danielly Rezende Lima'
      ]
    },
    {
      displayName: 'Beatriz Costa',
      aliases: [
        'Beatriz Costa',
        'Beatriz Costa Costa',
        'Beatriz Costa  Costa'
      ]
    },
    {
      displayName: 'Edson da Silva Bomfim Júnior',
      aliases: [
        'Edson da Silva Bomfim Júnior',
        'Edson da Silva Bomfim Junior'
      ]
    },
    {
      displayName: 'Fabiane Carvalho Nascimento',
      aliases: [
        'Fabiane Carvalho Nascimento'
      ]
    },
    {
      displayName: 'Fábio Souza',
      aliases: [
        'Fábio Souza',
        'Fabio Souza'
      ]
    },
    {
      displayName: 'Gabriel Lopes',
      aliases: [
        'Gabriel Lopes'
      ]
    },
    {
      displayName: 'Luiza Carvalho',
      aliases: [
        'Luiza Carvalho'
      ]
    },
    {
      displayName: 'Marcus Vinicius Dias Santana',
      aliases: [
        'Marcus Vinicius Dias Santana',
        'Marcus Santana'
      ]
    }
  ],

  sdr: [
    {
      displayName: 'Leticia Barbosa',
      aliases: ['Leticia Barbosa']
    },
    {
      displayName: 'Luma Farias Silva Santos',
      aliases: ['Luma Farias Silva Santos']
    },
    {
      displayName: 'Pedro Scarillo',
      aliases: ['Pedro Scarillo']
    },
    {
      displayName: 'Gisele Santos Gama',
      aliases: ['Gisele Santos Gama']
    },
    {
      displayName: 'Guilherme Velloso',
      aliases: ['Guilherme Velloso']
    }
  ]
};

function normalizePerformanceName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function createPerformanceDateRange(
  startDate,
  endDate
) {
  const now = new Date();

  const start = startDate
    ? new Date(`${startDate}T00:00:00`)
    : new Date(
        now.getFullYear(),
        now.getMonth(),
        1,
        0,
        0,
        0,
        0
      );

  const end = endDate
    ? new Date(`${endDate}T23:59:59.999`)
    : new Date(
        now.getFullYear(),
        now.getMonth() + 1,
        0,
        23,
        59,
        59,
        999
      );

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    throw new Error(
      'Datas inválidas. Utilize YYYY-MM-DD.'
    );
  }

  if (start > end) {
    throw new Error(
      'A data inicial não pode ser maior que a data final.'
    );
  }

  return {
    start,
    end
  };
}

async function getTeamPerformanceDashboard({
  role = 'closer',
  startDate,
  endDate
}) {
  if (!['sdr', 'closer'].includes(role)) {
    throw new Error(
      'Role inválido. Utilize sdr ou closer.'
    );
  }

  const {
    start: rangeStart,
    end: rangeEnd
  } = createPerformanceDateRange(
    startDate,
    endDate
  );

  const team =
    PERFORMANCE_TEAMS[role] || [];

  const period = `${rangeEnd.getFullYear()}-${String(
    rangeEnd.getMonth() + 1
  ).padStart(2, '0')}`;

  const ignoredPipelineFilter = {
    'stageset.name': {
      $ne:
        'Processo de Vendas - Global Alliance'
    }
  };

  if (team.length === 0) {
    return {
      role,

      filters: {
        startDate: rangeStart,
        endDate: rangeEnd,
        period
      },

      totals: {
        received: 0,
        open: 0,
        pending: 0,
        won: 0,
        lost: 0,
        cancelled: 0,

        workedLeads: null,
        activities: null,
        meetingsScheduled: null,
        meetingsCompleted: null,
        noMovement: null,

        revenue: 0,
        estimatedRevenue: 0,
        projectedRevenue: 0,
        averageTicket: 0,
        conversionRate: 0,

        targetRevenue: 0,
        goalAchievement: null,
        projectedGoalAchievement: null
      },

      users: [],

      warning:
        `Nenhum usuário foi configurado para a equipe ${role}.`
    };
  }

  const goals =
    role === 'closer'
      ? await Goal.find({
          period,
          sector: 'closer'
        }).lean()
      : [];

  const goalsMap = new Map();

  goals.forEach((goal) => {
    goalsMap.set(
      normalizePerformanceName(
        goal.userName
      ),
      goal
    );
  });

  const users = await Promise.all(
    team.map(async (teamUser) => {
      const aliases =
        Array.isArray(teamUser.aliases)
          ? teamUser.aliases
          : [];

      const assigneeFilter = {
        ...ignoredPipelineFilter,

        'assignee.name': {
          $in: aliases
        }
      };

      const receivedFilter = {
        ...assigneeFilter,

        createdTime: {
          $gte: rangeStart,
          $lte: rangeEnd
        }
      };

      const closedFilter = {
        ...assigneeFilter,

        closedTime: {
          $gte: rangeStart,
          $lte: rangeEnd
        }
      };

      const estimatedFilter = {
        ...assigneeFilter,

        status: {
          $in: [0, 1]
        },

        dueTime: {
          $gte: rangeStart,
          $lte: rangeEnd,
          $ne: null
        }
      };

      const [
        received,
        open,
        pending,
        won,
        lost,
        cancelled,
        revenueResult,
        estimatedResult
      ] = await Promise.all([
        Lead.countDocuments(
          receivedFilter
        ),

        Lead.countDocuments({
          ...assigneeFilter,
          status: 0
        }),

        Lead.countDocuments({
          ...assigneeFilter,
          status: 1
        }),

        Lead.countDocuments({
          ...closedFilter,
          status: 10
        }),

        Lead.countDocuments({
          ...closedFilter,
          status: 11
        }),

        Lead.countDocuments({
          ...closedFilter,
          status: 12
        }),

        Lead.aggregate([
          {
            $match: {
              ...closedFilter,
              status: 10
            }
          },

          {
            $addFields: {
              performanceRevenue: {
                $ifNull: [
                  '$value.amount',
                  {
                    $ifNull: [
                      '$normalizedValue.amount',
                      {
                        $ifNull: [
                          '$rawData.value.amount',
                          0
                        ]
                      }
                    ]
                  }
                ]
              }
            }
          },

          {
            $group: {
              _id: null,

              revenue: {
                $sum:
                  '$performanceRevenue'
              },

              averageTicket: {
                $avg:
                  '$performanceRevenue'
              }
            }
          }
        ]),

        Lead.aggregate([
          {
            $match:
              estimatedFilter
          },

          {
            $addFields: {
              performanceEstimate: {
                $ifNull: [
                  '$estimatedValue.amount',
                  {
                    $ifNull: [
                      '$value.amount',
                      {
                        $ifNull: [
                          '$normalizedValue.amount',
                          {
                            $ifNull: [
                              '$rawData.estimatedValue.amount',
                              {
                                $ifNull: [
                                  '$rawData.value.amount',
                                  0
                                ]
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            }
          },

          {
            $group: {
              _id: null,

              estimatedRevenue: {
                $sum:
                  '$performanceEstimate'
              },

              estimatedLeads: {
                $sum: 1
              }
            }
          }
        ])
      ]);

      const revenue = Number(
        revenueResult[0]?.revenue || 0
      );

      const averageTicket = Number(
        revenueResult[0]?.averageTicket || 0
      );

      const estimatedRevenue = Number(
        estimatedResult[0]
          ?.estimatedRevenue || 0
      );

      const estimatedLeads = Number(
        estimatedResult[0]
          ?.estimatedLeads || 0
      );

      const closedDecisions =
        Number(won || 0) +
        Number(lost || 0) +
        Number(cancelled || 0);

      const conversionRate =
        closedDecisions > 0
          ? (
              Number(won || 0) /
              closedDecisions
            ) * 100
          : 0;

      const projectedRevenue =
        revenue +
        estimatedRevenue;

      const goal =
        role === 'closer'
          ? aliases
              .map((alias) =>
                goalsMap.get(
                  normalizePerformanceName(alias)
                )
            )
            .filter(Boolean)[0] || null
          : null;


      const targetRevenue =
        role === 'closer'
          ? Number(
              goal?.targetRevenue || 0
            )
          : 0;

      const goalAchievement =
        targetRevenue > 0
          ? (
              revenue /
              targetRevenue
            ) * 100
          : 0;

      const projectedGoalAchievement =
        targetRevenue > 0
          ? (
              projectedRevenue /
              targetRevenue
            ) * 100
          : 0;

      return {
        name:
          teamUser.displayName,

        aliases,

        received,
        open,
        pending,

        won,
        lost,
        cancelled,

        closedDecisions,
        conversionRate,

        revenue,
        estimatedRevenue,
        estimatedLeads,
        projectedRevenue,
        averageTicket,

        workedLeads: null,
        activities: null,
        meetingsScheduled: null,
        meetingsCompleted: null,
        noMovement: null,

        goal:
          role === 'closer'
            ? {
                targetRevenue,

                targetLeads: Number(
                  goal?.targetLeads || 0
                ),

                targetMeetings: Number(
                  goal?.targetMeetings || 0
                ),

                targetWon: Number(
                  goal?.targetWon || 0
                ),

                achievement:
                  goalAchievement,

                projectedAchievement:
                  projectedGoalAchievement,

                remaining: Math.max(
                  targetRevenue -
                    revenue,
                  0
                )
              }
            : null
      };
    })
  );

  const totals = users.reduce(
    (acc, user) => {
      acc.received += Number(
        user.received || 0
      );

      acc.open += Number(
        user.open || 0
      );

      acc.pending += Number(
        user.pending || 0
      );

      acc.won += Number(
        user.won || 0
      );

      acc.lost += Number(
        user.lost || 0
      );

      acc.cancelled += Number(
        user.cancelled || 0
      );

      acc.revenue += Number(
        user.revenue || 0
      );

      acc.estimatedRevenue += Number(
        user.estimatedRevenue || 0
      );

      acc.estimatedLeads += Number(
        user.estimatedLeads || 0
      );

      acc.targetRevenue += Number(
        user.goal?.targetRevenue || 0
      );

      return acc;
    },
    {
      received: 0,
      open: 0,
      pending: 0,

      won: 0,
      lost: 0,
      cancelled: 0,

      revenue: 0,
      estimatedRevenue: 0,
      estimatedLeads: 0,
      targetRevenue: 0
    }
  );

  const totalClosedDecisions =
    totals.won +
    totals.lost +
    totals.cancelled;

  totals.closedDecisions =
    totalClosedDecisions;

  totals.conversionRate =
    totalClosedDecisions > 0
      ? (
          totals.won /
          totalClosedDecisions
        ) * 100
      : 0;

  totals.averageTicket =
    totals.won > 0
      ? totals.revenue /
        totals.won
      : 0;

  totals.projectedRevenue =
    totals.revenue +
    totals.estimatedRevenue;

  totals.goalAchievement =
    role === 'closer' &&
    totals.targetRevenue > 0
      ? (
          totals.revenue /
          totals.targetRevenue
        ) * 100
      : null;

  totals.projectedGoalAchievement =
    role === 'closer' &&
    totals.targetRevenue > 0
      ? (
          totals.projectedRevenue /
          totals.targetRevenue
        ) * 100
      : null;

  totals.workedLeads = null;
  totals.activities = null;
  totals.meetingsScheduled = null;
  totals.meetingsCompleted = null;
  totals.noMovement = null;

  return {
    role,

    filters: {
      startDate: rangeStart,
      endDate: rangeEnd,
      period
    },

    configuration: {
      usersConfigured:
        team.length,

      goalsFound:
        goals.length
    },

    totals,

    users: users.sort((a, b) => {
      if (role === 'closer') {
        return (
          Number(b.revenue || 0) -
          Number(a.revenue || 0)
        );
      }

      return (
        Number(b.received || 0) -
        Number(a.received || 0)
      );
    }),

    dataAvailability: {
      received: true,
      open: true,
      pending: true,

      won: true,
      lost: true,
      cancelled: true,

      revenue:
        role === 'closer',

      estimatedRevenue:
        role === 'closer',

      goals:
        role === 'closer',

      workedLeads: false,
      activities: false,
      meetings: false,
      noMovement: false
    }
  };
}

// ========================================
// SYNC INCREMENTAL
// ========================================

async function syncIncrementalLeads() {
  console.log('Iniciando sync incremental...');

  const limit = 100;
  const maxPages = 5;

  let page = 1;
  let totalChecked = 0;
  let totalSynced = 0;
  let totalErrors = 0;

  try {
    while (page <= maxPages) {
      console.log(
        `Sync incremental - página ${page}`
      );

      const nutshellResponse = await axios.post(
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

      const leads =
        nutshellResponse.data.result || [];

      if (leads.length === 0) {
        break;
      }

      for (const summaryLead of leads) {
        totalChecked++;

        try {
          const leadId = Number(
            summaryLead.id
          );

          if (!leadId) {
            totalErrors++;
            continue;
          }

          const detailResponse =
            await axios.post(
              'https://app.nutshell.com/api/v1/json',
              {
                method: 'getLead',
                params: {
                  leadId
                },
                id: 1
              },
              {
                auth: {
                  username:
                    NUTSHELL_EMAIL,
                  password:
                    NUTSHELL_API_KEY
                }
              }
            );

          const fullLead =
            detailResponse.data.result;

          if (!fullLead) {
            totalErrors++;
            continue;
          }

          /*
           * Não buscar atividades aqui.
           * O objetivo da incremental é atualizar
           * status, valor, closer e fechamento.
           */
          await saveFullLead(fullLead);

          totalSynced++;
        } catch (leadError) {
          totalErrors++;

          console.error(
            `Erro ao sincronizar lead ${summaryLead?.id}:`,
            leadError.response?.data ||
              leadError.message
          );
        }
      }

      if (leads.length < limit) {
        break;
      }

      page++;
    }

    const result = {
      routeVersion:
        'incremental-fast-v4',
      pagesProcessed: page,
      totalChecked,
      totalSynced,
      totalErrors
    };

    console.log(
      'Sync incremental finalizada:',
      result
    );

    return result;
  } catch (error) {
    console.error(
      'Erro geral na sync incremental:',
      error.response?.data ||
        error.message
    );

    throw error;
  }
}

//========================================

async function syncRecentLeadActivities() {
  console.log('Iniciando sincronização de atividades...');

  const limit = 100;
  const maxPages = 5;

  let page = 1;
  let checked = 0;
  let updated = 0;
  let errors = 0;

  while (page <= maxPages) {
    const nutshellResponse = await axios.post(
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

    const leads =
      nutshellResponse.data.result || [];

    if (leads.length === 0) {
      break;
    }

    for (const lead of leads) {
      checked++;

      try {
        const leadId = Number(lead.id);

        if (!leadId) {
          errors++;
          continue;
        }

        const activities =
          await getLeadActivities(leadId);

        await Lead.updateOne(
          {
            nutshell_id: leadId
          },
          {
            $set: {
              activities:
                Array.isArray(activities)
                  ? activities
                  : [],

              activitiesSyncedAt:
                new Date()
            }
          }
        );

        updated++;
      } catch (error) {
        errors++;

        console.error(
          `Erro ao atualizar atividades da lead ${lead?.id}:`,
          error.response?.data ||
            error.message
        );
      }
    }

    if (leads.length < limit) {
      break;
    }

    page++;
  }

  const result = {
    routeVersion:
      'activity-sync-v1',
    pagesProcessed: page,
    checked,
    updated,
    errors
  };

  console.log(
    'Sincronização de atividades finalizada:',
    result
  );

  return result;
}

let incrementalSyncRunning = false;

let incrementalSyncStartedAt = null;

function isIncrementalSyncStuck() {
  if (!incrementalSyncRunning) {
    return false;
  }

  if (!incrementalSyncStartedAt) {
    return true;
  }

  const maximumDuration =
    20 * 60 * 1000;

  return (
    Date.now() -
      incrementalSyncStartedAt.getTime() >
    maximumDuration
  );
}



// ========================================
// SYNC INCREMENTAL MANUAL
// ========================================

app.get(
  '/api/sync/nutshell/leads/incremental',
  async (req, res) => {
    /*
     * Caso esteja travada há mais de 20 minutos,
     * libera uma nova execução.
     */
    if (isIncrementalSyncStuck()) {
      console.warn(
        'Sync incremental antiga liberada por timeout'
      );

      incrementalSyncRunning = false;
      incrementalSyncStartedAt = null;
    }

    if (incrementalSyncRunning) {
      return res.status(409).json({
        sucesso: false,
        mensagem:
          'Já existe uma sincronização incremental em andamento',
        iniciadaEm:
          incrementalSyncStartedAt
      });
    }

    try {
      incrementalSyncRunning = true;
      incrementalSyncStartedAt =
        new Date();

      const result =
        await syncIncrementalLeads();

      res.json({
        sucesso: true,
        routeVersion:
          'incremental-route-v3',
        mensagem:
          'Sync incremental executada com sucesso',
        resultado: result
      });
    } catch (error) {
      console.error(
        'ERRO SYNC INCREMENTAL:',
        error.response?.data ||
          error.message
      );

      res.status(500).json({
        sucesso: false,
        erro:
          error.response?.data ||
          error.message
      });
    } finally {
      incrementalSyncRunning = false;
      incrementalSyncStartedAt = null;
    }
  }
);

app.get(
  '/api/sync/nutshell/activities',
  async (req, res) => {
    try {
      const result =
        await syncRecentLeadActivities();

      res.json({
        sucesso: true,
        ...result
      });
    } catch (error) {
      console.error(
        'ERRO SYNC ATIVIDADES:',
        error.response?.data ||
          error.message
      );

      res.status(500).json({
        sucesso: false,
        erro:
          error.response?.data ||
          error.message
      });
    }
  }
);

cron.schedule('*/15 * * * *', async () => {
  // cron atual das leads
});

cron.schedule('0 6 * * *', async () => {
  try {
    await syncRecentLeadActivities();
  } catch (error) {
    console.error(
      'Erro no cron de atividades:',
      error.response?.data || error.message
    );
  }
});

cron.schedule(
  '0 3 * * *',
  async () => {
    try {
      const period =
        getCurrentMonthPeriod();

      console.log(
        `Iniciando sincronização diária de atividades: ${period}`
      );

      const backendUrl =
        process.env.BACKEND_PUBLIC_URL;

      if (!backendUrl) {
        console.error(
          'BACKEND_PUBLIC_URL não configurada.'
        );

        return;
      }

      const response = await axios.get(
        `${backendUrl}/api/sync/nutshell/activities-period`,
        {
          params: {
            period
          },
          timeout: 15 * 60 * 1000
        }
      );

      console.log(
        'Sincronização diária concluída:',
        {
          period,
          activitiesSaved:
            response.data?.activitiesSaved,
          activitiesInsidePeriod:
            response.data
              ?.activitiesInsidePeriod,
          leadsUpdated:
            response.data?.leadsUpdated
        }
      );
    } catch (error) {
      console.error(
        'Erro na sincronização diária de atividades:',
        error.response?.data ||
          error.message
      );
    }
  },
  {
    timezone: 'America/Sao_Paulo'
  }
);

// ========================================
// SYNC INCREMENTAL AUTOMÁTICA
// ========================================

cron.schedule('*/15 * * * *', async () => {
  if (isIncrementalSyncStuck()) {
    console.warn(
      'Sync automática anterior liberada por timeout'
    );

    incrementalSyncRunning = false;
    incrementalSyncStartedAt = null;
  }

  if (incrementalSyncRunning) {
    console.log(
      'Sync automática ignorada: outra execução está ativa'
    );

    return;
  }

  try {
    incrementalSyncRunning = true;
    incrementalSyncStartedAt =
      new Date();

    console.log(
      'Sync incremental automática iniciada'
    );

    const result =
      await syncIncrementalLeads();

    console.log(
      'Sync incremental automática finalizada:',
      result
    );
  } catch (error) {
    console.error(
      'Erro no cron incremental:',
      error.response?.data ||
        error.message
    );
  } finally {
    incrementalSyncRunning = false;
    incrementalSyncStartedAt = null;
  }
});

// ========================================
// SYNC RESUMIDA
// ========================================

app.get('/api/sync/nutshell/leads/summary', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 500;
    const maxPages = Number(req.query.maxPages) || 3;

    let page = 1;
    let totalSynced = 0;
    let keepGoing = true;

    while (keepGoing && page <= maxPages) {
      const nutshellResponse = await axios.post(
        'https://app.nutshell.com/api/v1/json',
        {
          method: 'findLeads',
          params: { query: {}, limit, page },
          id: 1
        },
        {
          auth: {
            username: NUTSHELL_EMAIL,
            password: NUTSHELL_API_KEY
          }
        }
      );

      const leads = nutshellResponse.data.result || [];

      if (leads.length === 0) {
        keepGoing = false;
        break;
      }

      for (const lead of leads) {
        await saveSummaryLead(lead);
        totalSynced++;
      }

      page++;
    }

    res.json({
      sucesso: true,
      totalSynced,
      pagesProcessed: page - 1,
      limitPerPage: limit
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.response?.data || error.message
    });
  }
});

async function syncClosedPeriod(startDateParam, endDateParam, maxPagesParam = 5) {
  const start = new Date(startDateParam);
  start.setHours(0, 0, 0, 0);

  const end = new Date(endDateParam);
  end.setHours(23, 59, 59, 999);

  const limit = 500;
  const maxPages = Number(maxPagesParam) || 5;

  let page = 1;
  let totalChecked = 0;
  let totalMatched = 0;
  let totalSynced = 0;

  while (page <= maxPages) {
    const nutshellResponse = await axios.post(
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

    const leads = nutshellResponse.data.result || [];

    if (leads.length === 0) break;

    for (const lead of leads) {
      totalChecked++;

      const leadClosedTime = lead.closedTime
        ? new Date(lead.closedTime)
        : null;

      if (
        leadClosedTime &&
        leadClosedTime >= start &&
        leadClosedTime <= end
      ) {
        totalMatched++;

        const detailResponse = await axios.post(
          'https://app.nutshell.com/api/v1/json',
          {
            method: 'getLead',
            params: {
              leadId: lead.id
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

        const fullLead = detailResponse.data.result;

        if (fullLead) {
          await saveFullLead(fullLead);
          totalSynced++;
        }
      }
    }

    page++;
  }

  return {
    startDate: startDateParam,
    endDate: endDateParam,
    pagesProcessed: page - 1,
    totalChecked,
    totalMatched,
    totalSynced
  };
}

app.get('/api/sync/nutshell/leads/closed-period', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Informe startDate e endDate'
      });
    }

    const result = await syncClosedPeriod(
      startDate,
      endDate,
      req.query.maxPages || 10
    );

    res.json({
      sucesso: true,
      ...result
    });

  } catch (error) {
    console.error(
      'ERRO SYNC CLOSED PERIOD:',
      error.response?.data || error.message
    );

    res.status(500).json({
      sucesso: false,
      erro: error.response?.data || error.message
    });
  }
});

// ========================================
// SYNC COMPLETA POR LOTE
// ========================================

app.get('/api/sync/nutshell/leads/full', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const maxPages = Number(req.query.maxPages) || 500;

    let page = 1;
    let checked = 0;
    let synced = 0;
    let errors = 0;

    while (page <= maxPages) {
      console.log(`Sync full - página ${page}`);

      const nutshellResponse = await axios.post(
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

      const leads = nutshellResponse.data.result || [];

      if (leads.length === 0) break;

      for (const lead of leads) {
        try {
          checked++;

          const detailResponse = await axios.post(
            'https://app.nutshell.com/api/v1/json',
            {
              method: 'getLead',
              params: {
                leadId: lead.id
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

          const fullLead = detailResponse.data.result;

          if (!fullLead) continue;

          const activities = await getLeadActivities(fullLead.id);
          fullLead.activities = activities;
          await saveFullLead(fullLead);

          synced++;

        } catch (leadError) {
          errors++;

          console.error(
            `Erro ao sincronizar lead ${lead.id}:`,
            leadError.response?.data || leadError.message
          );
        }
      }

      page++;
    }

    res.json({
      sucesso: true,
      checked,
      synced,
      errors,
      pagesProcessed: page - 1
    });

  } catch (error) {
    console.error('ERRO SYNC FULL:', error.response?.data || error.message);

    res.status(500).json({
      sucesso: false,
      erro: error.response?.data || error.message
    });
  }
});
// ========================================
// AUDITORIA - LEADS POR DATA E STATUS
// ========================================

app.get('/api/audit/leads-by-date-status', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Informe startDate e endDate. Exemplo: ?startDate=2026-05-13&endDate=2026-05-13'
      });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);

    const dateFilter = {
      $gte: start,
      $lte: end
    };

    const filter = {
      $or: [
        { createdTime: dateFilter },
        { dueTime: dateFilter },
        { closedTime: dateFilter },
        { modifiedTime: dateFilter },
        { 'rawData.dueTime': { $gte: startDate, $lte: endDate } },
        { 'rawData.closedTime': { $gte: startDate, $lte: endDate } },
        { 'rawData.createdTime': { $gte: startDate, $lte: endDate } },
        { 'rawData.modifiedTime': { $gte: startDate, $lte: endDate } }
      ]
    };

    const statusSummary = await Lead.aggregate([
      {
        $match: filter
      },
      {
        $group: {
          _id: '$status',
          total: { $sum: 1 }
        }
      },
      {
        $sort: {
          _id: 1
        }
      }
    ]);

    const dateFieldSummary = await Lead.aggregate([
      {
        $project: {
          status: 1,
          createdTime: 1,
          dueTime: 1,
          closedTime: 1,
          modifiedTime: 1,

          hasCreatedInRange: {
            $and: [
              { $gte: ['$createdTime', start] },
              { $lte: ['$createdTime', end] }
            ]
          },

          hasDueInRange: {
            $and: [
              { $gte: ['$dueTime', start] },
              { $lte: ['$dueTime', end] }
            ]
          },

          hasClosedInRange: {
            $and: [
              { $gte: ['$closedTime', start] },
              { $lte: ['$closedTime', end] }
            ]
          },

          hasModifiedInRange: {
            $and: [
              { $gte: ['$modifiedTime', start] },
              { $lte: ['$modifiedTime', end] }
            ]
          }
        }
      },
      {
        $match: {
          $or: [
            { hasCreatedInRange: true },
            { hasDueInRange: true },
            { hasClosedInRange: true },
            { hasModifiedInRange: true }
          ]
        }
      },
      {
        $group: {
          _id: '$status',

          total: { $sum: 1 },

          createdTimeCount: {
            $sum: {
              $cond: ['$hasCreatedInRange', 1, 0]
            }
          },

          dueTimeCount: {
            $sum: {
              $cond: ['$hasDueInRange', 1, 0]
            }
          },

          closedTimeCount: {
            $sum: {
              $cond: ['$hasClosedInRange', 1, 0]
            }
          },

          modifiedTimeCount: {
            $sum: {
              $cond: ['$hasModifiedInRange', 1, 0]
            }
          }
        }
      },
      {
        $sort: {
          _id: 1
        }
      }
    ]);

    const leads = await Lead.find(filter)
      .select({
        nutshell_id: 1,
        name: 1,
        status: 1,
        description: 1,
        createdTime: 1,
        dueTime: 1,
        closedTime: 1,
        modifiedTime: 1,
        assignee: 1,
        primaryAccount: 1,
        value: 1,
        rawData: 1
      })
      .sort({
        closedTime: -1,
        dueTime: -1,
        createdTime: -1
      })
      .limit(100)
      .lean();

    res.json({
      sucesso: true,
      filters: {
        startDate,
        endDate
      },
      statusSummary,
      dateFieldSummary,
      totalLeadsReturned: leads.length,
      leads
    });

  } catch (error) {
    console.error('ERRO AUDIT DATE STATUS:', error.message);

    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});


app.get('/api/audit/products-won', async (req, res) => {
  try {
    const start = new Date('2026-07-01T00:00:00');
    const end = new Date('2026-07-31T23:59:59');

    const result = await Lead.aggregate([
      {
        $match: {
          status: 10,
          closedTime: {
            $gte: start,
            $lte: end
          }
        }
      },
      { $unwind: '$products' },
      {
        $group: {
          _id: '$products.name',
          total: { $sum: 1 },
          revenue: { $sum: { $ifNull: ['$value.amount', 0] } }
        }
      },
      { $sort: { revenue: -1 } }
    ]);

    res.json({
      sucesso: true,
      result
    });
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

app.get('/api/audit/product-detail', async (req, res) => {
  try {
    const {
      product = 'Desembaraço Aduaneiro',
      startDate,
      endDate
    } = req.query;

    const dateConditions = {};

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      dateConditions.$gte = start;
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateConditions.$lte = end;
    }

    const hasDateFilter = Object.keys(dateConditions).length > 0;

    const filter = {
      status: 10,
      'products.name': {
        $regex: product,
        $options: 'i'
      }
    };

    if (hasDateFilter) {
      filter.closedTime = dateConditions;
    }

    const leads = await Lead.find(filter)
      .select({
        nutshell_id: 1,
        name: 1,
        status: 1,
        value: 1,
        closedTime: 1,
        modifiedTime: 1,
        assignee: 1,
        primaryAccount: 1,
        products: 1,
        htmlUrl: 1,
        rawData: 1,
        synced_at: 1
      })
      .sort({ closedTime: -1 })
      .lean();

    const totalRevenue = leads.reduce(
      (sum, lead) => sum + Number(lead.value?.amount || 0),
      0
    );

    res.json({
      sucesso: true,
      product,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null
      },
      summary: {
        totalWonLeads: leads.length,
        totalRevenue
      },
      leads: leads.map((lead) => ({
        nutshell_id: lead.nutshell_id,
        name: lead.name,
        value: lead.value?.amount || 0,
        closedTime: lead.closedTime,
        assignee: lead.assignee?.name,
        account: lead.primaryAccount?.name,
        products: lead.products?.map((item) => item.name) || [],
        htmlUrl: lead.htmlUrl || lead.rawData?.htmlUrl,
        synced_at: lead.synced_at
      }))
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

// ========================================
// AUDITORIA - QUALIDADE DOS DADOS
// ========================================

app.get('/api/audit/data-quality', async (req, res) => {
  try {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const todayEnd = new Date();
    todayEnd.setHours(23, 59, 59, 999);

    const totalLeads = await Lead.countDocuments();

    const withCreatedTime = await Lead.countDocuments({
      createdTime: { $ne: null }
    });

    const withClosedTime = await Lead.countDocuments({
      closedTime: { $ne: null }
    });

    const withAssignee = await Lead.countDocuments({
      'assignee.name': { $exists: true, $ne: null, $ne: '' }
    });

    const withRawAssignee = await Lead.countDocuments({
      'rawData.assignee.name': { $exists: true, $ne: null, $ne: '' }
    });

    const createdToday = await Lead.countDocuments({
      createdTime: {
        $gte: todayStart,
        $lte: todayEnd
      }
    });

    const closedToday = await Lead.countDocuments({
      closedTime: {
        $gte: todayStart,
        $lte: todayEnd
      }
    });

    const modifiedToday = await Lead.countDocuments({
      modifiedTime: {
        $gte: todayStart,
        $lte: todayEnd
      }
    });

    const statusDistribution = await Lead.aggregate([
      {
        $group: {
          _id: '$status',
          total: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]);

    const sampleToday = await Lead.find({
      $or: [
        {
          createdTime: {
            $gte: todayStart,
            $lte: todayEnd
          }
        },
        {
          modifiedTime: {
            $gte: todayStart,
            $lte: todayEnd
          }
        },
        {
          closedTime: {
            $gte: todayStart,
            $lte: todayEnd
          }
        }
      ]
    })
      .select({
        nutshell_id: 1,
        name: 1,
        status: 1,
        createdTime: 1,
        modifiedTime: 1,
        closedTime: 1,
        dueTime: 1,
        assignee: 1,
        primaryAccount: 1,
        value: 1,
        rawData: 1
      })
      .limit(10)
      .lean();

    res.json({
      sucesso: true,
      totalLeads,
      fields: {
        withCreatedTime,
        withClosedTime,
        withAssignee,
        withRawAssignee
      },
      today: {
        createdToday,
        closedToday,
        modifiedToday
      },
      statusDistribution,
      sampleToday
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

// ========================================
// TESTE NUTSHELL - LEADS RECENTES
// ========================================

app.get('/api/nutshell/recent-leads-test', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const page = Number(req.query.page) || 1;

    const response = await axios.post(
      'https://app.nutshell.com/api/v1/json',
      {
        method: 'findLeads',
        params: {
          query: {},
          limit,
          page,
          sort: 'modifiedTime',
          direction: 'DESC'
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

    const leads = response.data.result || [];

    res.json({
      sucesso: true,
      page,
      limit,
      totalReturned: leads.length,
      leads: leads.map((lead) => ({
        id: lead.id,
        name: lead.name,
        status: lead.status,
        description: lead.description,
        primaryAccountName: lead.primaryAccountName,
        primaryContactName: lead.primaryContactName,
        value: lead.value,
        dueTime: lead.dueTime,
        closedTime: lead.closedTime,
        modifiedTime: lead.modifiedTime,
        createdTime: lead.createdTime,
        raw: lead
      }))
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.response?.data || error.message
    });
  }
});

// ========================================
// AUDITORIA
// ========================================

app.get('/api/audit/lead', async (req, res) => {
  try {
    const { id } = req.query;

    const lead = await Lead.findOne({
      nutshell_id: Number(id)
    }).lean();

    res.json({
      sucesso: true,
      lead
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

app.get('/api/audit/revenue-check', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const filter = {
      status: 10
    };

    if (startDate || endDate) {
      filter.closedTime = {};

      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        filter.closedTime.$gte = start;
      }

      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.closedTime.$lte = end;
      }
    }

    const wonLeads = await Lead.find(filter)
      .select({
        nutshell_id: 1,
        name: 1,
        status: 1,
        value: 1,
        closedTime: 1,
        modifiedTime: 1,
        assignee: 1,
        sources: 1,
        rawData: 1
      })
      .sort({ closedTime: -1 })
      .limit(30)
      .lean();

    const summary = await Lead.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalWon: { $sum: 1 },
          totalRevenue: {
            $sum: {
              $cond: [
                { $ne: ['$value.amount', null] },
                '$value.amount',
                0
              ]
            }
          },
          withValue: {
            $sum: {
              $cond: [
                { $ne: ['$value.amount', null] },
                1,
                0
              ]
            }
          },
          withoutValue: {
            $sum: {
              $cond: [
                { $eq: ['$value.amount', null] },
                1,
                0
              ]
            }
          }
        }
      }
    ]);

    res.json({
      sucesso: true,
      filter,
      summary: summary[0] || {
        totalWon: 0,
        totalRevenue: 0,
        withValue: 0,
        withoutValue: 0
      },
      sample: wonLeads.map((lead) => ({
        nutshell_id: lead.nutshell_id,
        name: lead.name,
        status: lead.status,
        value: lead.value,
        rawValue: lead.rawData?.value,
        closedTime: lead.closedTime,
        modifiedTime: lead.modifiedTime,
        assignee: lead.assignee?.name,
        source: lead.sources?.[0]?.name || lead.rawData?.sources?.[0]?.name || null
      }))
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});


app.get('/api/audit/nutshell-compare', async (req, res) => {
  try {
    const start = new Date('2026-07-01T00:00:00');
    const end = new Date('2026-07-31T23:59:59');

    const filter = {
      status: { $in: [0, 10] },
      closedTime: {
        $gte: start,
        $lte: end
      }
    };

    const byStatus = await Lead.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$status',
          total: { $sum: 1 },
          revenue: { $sum: { $ifNull: ['$value.amount', 0] } }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    const byPipeline = await Lead.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$stageset.name',
          total: { $sum: 1 },
          won: {
            $sum: {
              $cond: [{ $eq: ['$status', 10] }, 1, 0]
            }
          },
          open: {
            $sum: {
              $cond: [{ $eq: ['$status', 0] }, 1, 0]
            }
          },
          revenue: { $sum: { $ifNull: ['$value.amount', 0] } }
        }
      },
      { $sort: { revenue: -1 } }
    ]);

    const byAssignee = await Lead.aggregate([
      { $match: filter },
      {
        $group: {
          _id: '$assignee.name',
          total: { $sum: 1 },
          won: {
            $sum: {
              $cond: [{ $eq: ['$status', 10] }, 1, 0]
            }
          },
          open: {
            $sum: {
              $cond: [{ $eq: ['$status', 0] }, 1, 0]
            }
          },
          revenue: { $sum: { $ifNull: ['$value.amount', 0] } }
        }
      },
      { $sort: { revenue: -1 } }
    ]);

    const sample = await Lead.find(filter)
      .select({
        nutshell_id: 1,
        name: 1,
        status: 1,
        value: 1,
        closedTime: 1,
        modifiedTime: 1,
        assignee: 1,
        stageset: 1,
        milestone: 1,
        rawData: 1
      })
      .sort({ closedTime: -1 })
      .limit(80)
      .lean();

    res.json({
      sucesso: true,
      expectedNutshell: {
        won: 54,
        wonRevenue: 188438.96,
        openPlusWon: 138,
        openPlusWonRevenue: 700183.07
      },
      mongo: {
        byStatus,
        byPipeline,
        byAssignee
      },
      sample: sample.map((lead) => ({
        nutshell_id: lead.nutshell_id,
        name: lead.name,
        status: lead.status,
        value: lead.value?.amount || 0,
        closedTime: lead.closedTime,
        modifiedTime: lead.modifiedTime,
        assignee: lead.assignee?.name,
        stageset: lead.stageset?.name || lead.rawData?.stageset?.name,
        milestone: lead.milestone?.name || lead.rawData?.milestone?.name
      }))
    });
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

app.get(
  '/api/sync/nutshell/road-to-glory',
  async (req, res) => {
    try {
      const campaignTag =
        'Road to the Glory - Junho';

      const limit = Math.min(
        Math.max(Number(req.query.limit) || 50, 1),
        100
      );

      const maxPages = Math.min(
        Math.max(Number(req.query.maxPages) || 5, 1),
        20
      );

      let page = 1;
      let checked = 0;
      let matched = 0;
      let synced = 0;
      let errors = 0;

      const details = [];

      while (page <= maxPages) {
        console.log(
          `[ROAD TO GLORY TAG] Buscando página ${page}`
        );

        const response = await axios.post(
          'https://app.nutshell.com/api/v1/json',
          {
            method: 'findLeads',
            params: {
              query: {
                tag: [campaignTag]
              },
              orderBy: 'modifiedTime',
              orderDirection: 'DESC',
              limit,
              page,
              stubResponses: false
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

        if (response.data?.error) {
          throw response.data;
        }

        const leads =
          Array.isArray(response.data?.result)
            ? response.data.result
            : [];

        if (leads.length === 0) {
          break;
        }

        for (const fullLead of leads) {
          checked++;

          try {
            const tags =
              Array.isArray(fullLead.tags)
                ? fullLead.tags
                : [];

            const hasExactTag = tags.some(
              (tag) =>
                normalizeName(tag) ===
                normalizeName(campaignTag)
            );

            if (!hasExactTag) {
              details.push({
                nutshell_id: fullLead.id,
                name: fullLead.name,
                synced: false,
                reason: 'Tag exata não encontrada',
                tags
              });

              continue;
            }

            matched++;

            if (
              !Array.isArray(fullLead.activities) ||
              fullLead.activities.length === 0
            ) {
              delete fullLead.activities;
            }

            await saveFullLead(fullLead);

            synced++;

            details.push({
              nutshell_id: fullLead.id,
              name: fullLead.name,
              assignee:
                fullLead.assignee?.name || null,
              createdTime:
                fullLead.createdTime || null,
              modifiedTime:
                fullLead.modifiedTime || null,
              tags,
              synced: true
            });
          } catch (leadError) {
            errors++;

            details.push({
              nutshell_id: fullLead.id,
              name: fullLead.name,
              synced: false,
              error:
                leadError.response?.data ||
                leadError.message
            });
          }
        }

        if (leads.length < limit) {
          break;
        }

        page++;

        await sleep(150);
      }

      const mongoCampaignLeads =
        await Lead.find({
          tags: {
            $elemMatch: {
              $regex:
                '^Road to the Glory - Junho$',
              $options: 'i'
            }
          }
        })
          .select({
            nutshell_id: 1,
            name: 1,
            assignee: 1,
            tags: 1,
            createdTime: 1,
            modifiedTime: 1
          })
          .sort({
            modifiedTime: -1
          })
          .lean();

      res.json({
        sucesso: true,

        routeVersion:
          'road-to-glory-tag-filter-v1',

        campaignTag,

        search: {
          method: 'findLeads',
          query: {
            tag: [campaignTag]
          },
          limit,
          maxPages,
          pagesProcessed:
            Math.min(page, maxPages)
        },

        checked,
        matched,
        synced,
        errors,

        mongoAfterSync: {
          total: mongoCampaignLeads.length,
          leads: mongoCampaignLeads
        },

        details
      });
    } catch (error) {
      const apiError =
        error.response?.data ||
        error;

      console.error(
        'ERRO SYNC ROAD TO GLORY TAG:',
        apiError
      );

      res.status(500).json({
        sucesso: false,

        routeVersion:
          'road-to-glory-tag-filter-v1',

        erro:
          apiError?.error ||
          apiError?.message ||
          apiError
      });
    }
  }
);



app.get('/api/sync/nutshell/road-to-glory-meetings', async (req, res) => {
  try {
    const leads = await Lead.find({
      tags: {
        $in: [
         
          'Road to the Glory - Junho'
        ]
      }
    })
      .select('nutshell_id name')
      .lean();

    let checked = 0;
    let updated = 0;
    let meetingsFound = 0;

    for (const lead of leads) {
      checked++;

      const meetings = await getLeadActivitiesByLeadId(lead.nutshell_id);

      await Lead.updateOne(
        { nutshell_id: lead.nutshell_id },
        {
          $set: {
            activities: meetings,
            activities_synced_at: new Date()
          }
        }
      );

      if (meetings.length > 0) {
        updated++;
        meetingsFound += meetings.length;
      }

      await new Promise((resolve) => setTimeout(resolve, 150));
    }

    res.json({
      sucesso: true,
      checked,
      updated,
      meetingsFound
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.response?.data || error.message
    });
  }
});
// ========================================
// SINCRONIZAR LEADS RECENTES DO NUTSHELL
// Busca das últimas páginas para trás
// ========================================

app.get('/api/sync/nutshell/leads/recent', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 20;
    const lastPage = Number(req.query.lastPage) || 1183;
    const pagesBack = Number(req.query.pagesBack) || 3;

    let totalChecked = 0;
    let totalCreatedOrUpdated = 0;
    let pagesProcessed = [];

    for (let page = lastPage; page > lastPage - pagesBack; page--) {
      console.log(`Sincronizando página recente ${page}...`);

      const nutshellResponse = await axios.post(
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

      const leads = nutshellResponse.data.result || [];

      pagesProcessed.push({
        page,
        total: leads.length
      });

      for (const lead of leads) {
        totalChecked++;

        const existingLead = await Lead.findOne({
          nutshell_id: lead.id
        });

        if (!existingLead || existingLead.rev !== lead.rev) {
          await saveSummaryLead(lead);
          totalCreatedOrUpdated++;
        }
      }
    }

    res.json({
      sucesso: true,
      limit,
      lastPage,
      pagesBack,
      pagesProcessed,
      totalChecked,
      totalCreatedOrUpdated
    });

  } catch (error) {
    console.error('ERRO SYNC RECENT:', error.response?.data || error.message);

    res.status(500).json({
      sucesso: false,
      erro: error.response?.data || error.message
    });
  }
});
// ========================================
// ENRIQUECER LEADS SEM RESPONSÁVEL
// ========================================

app.get('/api/sync/nutshell/enrich-missing-assignee', async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 100, 500);

    const leadsMissingAssignee = await Lead.find({
      $or: [
        { 'assignee.name': { $exists: false } },
        { 'assignee.name': null },
        { 'assignee.name': '' }
      ]
    })
      .select({
        nutshell_id: 1,
        name: 1
      })
      .limit(limit)
      .lean();

    let enriched = 0;
    let errors = 0;

    for (const lead of leadsMissingAssignee) {
      try {
        const detailResponse = await axios.post(
          'https://app.nutshell.com/api/v1/json',
          {
            method: 'getLead',
            params: {
              leadId: lead.nutshell_id
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

        const fullLead = detailResponse.data.result;

        if (!fullLead) {
          continue;
        }

        await saveFullLead(fullLead);

        enriched++;

      } catch (error) {
        errors++;
        console.error(
          `Erro ao enriquecer lead ${lead.nutshell_id}:`,
          error.response?.data || error.message
        );
      }
    }

    const remaining = await Lead.countDocuments({
      $or: [
        { 'assignee.name': { $exists: false } },
        { 'assignee.name': null },
        { 'assignee.name': '' }
      ]
    });

    res.json({
      sucesso: true,
      checked: leadsMissingAssignee.length,
      enriched,
      errors,
      remaining
    });

  } catch (error) {
    console.error('ERRO ENRICH ASSIGNEE:', error.response?.data || error.message);

    res.status(500).json({
      sucesso: false,
      erro: error.response?.data || error.message
    });
  }
});

// ========================================
// AUDITORIA - LEADS SEM SOURCE NA PERFORMANCE
// ========================================

app.get('/api/audit/performance-missing-sources', async (req, res) => {
  try {
    const {
      period,
      assignee,
      showAll = 'false'
    } = req.query;

    const now = new Date();

    const defaultPeriod = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, '0')}`;

    const selectedPeriod =
      period || defaultPeriod;

    const [year, month] = selectedPeriod
      .split('-')
      .map(Number);

    const start = new Date(
      Date.UTC(
        year,
        month - 1,
        1,
        3,
        0,
        0,
        0
      )
    );

    const end = new Date(
      Date.UTC(
        year,
        month,
        1,
        3,
        0,
        0,
        0
      )
    );

    const filter = {
      'stageset.name': {
        $ne: 'Processo de Vendas - Global Alliance'
      },

      'assignee.name': {
        $exists: true,
        $nin: [null, '']
      },

      createdTime: {
        $gte: start,
        $lt: end,
        $ne: null
      }
    };

    if (assignee) {
      filter['assignee.name'] = {
        $regex: assignee,
        $options: 'i'
      };
    }

    const leads = await Lead.find(filter)
      .select({
        nutshell_id: 1,
        name: 1,
        status: 1,
        createdTime: 1,
        modifiedTime: 1,
        closedTime: 1,
        assignee: 1,
        sources: 1,
        rawData: 1,
        htmlUrl: 1
      })
      .sort({
        createdTime: -1
      })
      .lean();

    const formatted = leads.map((lead) => {
      const topSources = Array.isArray(
        lead.sources
      )
        ? lead.sources
        : [];

      const rawSources = Array.isArray(
        lead.rawData?.sources
      )
        ? lead.rawData.sources
        : [];

      const allSources = [
        ...topSources,
        ...rawSources
      ];

      const sourceNames = allSources
        .map((source) => {
          if (typeof source === 'string') {
            return source;
          }

          return source?.name || '';
        })
        .map((name) =>
          String(name || '')
            .replace(/\s+/g, ' ')
            .trim()
        )
        .filter(Boolean);

      const sourceName =
        sourceNames[0] || 'Sem source';

      return {
        nutshell_id: lead.nutshell_id,
        name: lead.name,
        status: lead.status,

        assignee:
          lead.assignee?.name || null,

        createdTime:
          lead.createdTime || null,

        modifiedTime:
          lead.modifiedTime || null,

        closedTime:
          lead.closedTime || null,

        sourceName,

        sources: topSources,
        rawSources,

        topSourcesCount:
          topSources.length,

        rawSourcesCount:
          rawSources.length,

        htmlUrl:
          lead.htmlUrl ||
          lead.rawData?.htmlUrl ||
          null
      };
    });

    const result =
      showAll === 'true'
        ? formatted
        : formatted.filter(
            (lead) =>
              lead.sourceName === 'Sem source'
          );

    res.json({
      sucesso: true,
      routeVersion:
        'performance-missing-sources-v1',

      period: selectedPeriod,

      filters: {
        assignee: assignee || null,
        showAll
      },

      periodRange: {
        startDate: start,
        endDate: end
      },

      summary: {
        totalLeadsCreatedInPeriod:
          formatted.length,

        totalWithoutSource:
          formatted.filter(
            (lead) =>
              lead.sourceName === 'Sem source'
          ).length,

        totalWithSource:
          formatted.filter(
            (lead) =>
              lead.sourceName !== 'Sem source'
          ).length
      },

      leads: result
    });

  } catch (error) {
    console.error(
      'ERRO AUDIT PERFORMANCE MISSING SOURCES:',
      error
    );

    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

// ========================================
// SYNC - COMPLETAR SOURCES DAS LEADS DA PERFORMANCE
// ========================================

app.get('/api/sync/nutshell/performance-missing-sources', async (req, res) => {
  try {
    const {
      period,
      assignee,
      limit = 100
    } = req.query;

    const now = new Date();

    const defaultPeriod = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, '0')}`;

    const selectedPeriod =
      period || defaultPeriod;

    const [year, month] = selectedPeriod
      .split('-')
      .map(Number);

    const start = new Date(
      Date.UTC(
        year,
        month - 1,
        1,
        3,
        0,
        0,
        0
      )
    );

    const end = new Date(
      Date.UTC(
        year,
        month,
        1,
        3,
        0,
        0,
        0
      )
    );

    const missingSourceFilter = {
      'stageset.name': {
        $ne: 'Processo de Vendas - Global Alliance'
      },

      'assignee.name': {
        $exists: true,
        $nin: [null, '']
      },

      createdTime: {
        $gte: start,
        $lt: end,
        $ne: null
      },

      $or: [
        {
          sources: {
            $exists: false
          }
        },
        {
          sources: null
        },
        {
          sources: {
            $size: 0
          }
        },
        {
          rawData: {
            $exists: false
          }
        },
        {
          'rawData.sources': {
            $exists: false
          }
        },
        {
          'rawData.sources': null
        },
        {
          'rawData.sources': {
            $size: 0
          }
        }
      ]
    };

    if (assignee) {
      missingSourceFilter['assignee.name'] = {
        $regex: assignee,
        $options: 'i'
      };
    }

    const leads = await Lead.find(
      missingSourceFilter
    )
      .select({
        nutshell_id: 1,
        name: 1,
        status: 1,
        assignee: 1,
        createdTime: 1,
        sources: 1,
        rawData: 1
      })
      .sort({
        createdTime: -1
      })
      .limit(
        Math.min(
          Math.max(Number(limit) || 100, 1),
          500
        )
      )
      .lean();

    let checked = 0;
    let updatedWithSource = 0;
    let stillWithoutSource = 0;
    let errors = 0;

    const details = [];

    for (const lead of leads) {
      checked++;

      try {
        const response = await axios.post(
          'https://app.nutshell.com/api/v1/json',
          {
            method: 'getLead',
            params: {
              leadId: Number(
                lead.nutshell_id
              )
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

        const fullLead =
          response.data?.result;

        if (!fullLead) {
          errors++;

          details.push({
            nutshell_id:
              lead.nutshell_id,
            name: lead.name,
            updated: false,
            reason:
              'Lead não encontrada no Nutshell'
          });

          continue;
        }

        await saveFullLead(fullLead);

        const sourceNames =
          Array.isArray(fullLead.sources)
            ? fullLead.sources
                .map((source) =>
                  String(
                    source?.name || ''
                  ).trim()
                )
                .filter(Boolean)
            : [];

        if (sourceNames.length > 0) {
          updatedWithSource++;
        } else {
          stillWithoutSource++;
        }

        details.push({
          nutshell_id:
            fullLead.id,

          name:
            fullLead.name,

          status:
            fullLead.status,

          assignee:
            fullLead.assignee?.name || null,

          createdTime:
            fullLead.createdTime || null,

          sources:
            sourceNames,

          updated: true
        });

        await sleep(120);
      } catch (leadError) {
        errors++;

        details.push({
          nutshell_id:
            lead.nutshell_id,

          name:
            lead.name,

          updated: false,

          error:
            leadError.response?.data ||
            leadError.message
        });
      }
    }

    res.json({
      sucesso: true,

      routeVersion:
        'performance-missing-sources-sync-v1',

      period: selectedPeriod,

      filters: {
        assignee: assignee || null,
        limit: Number(limit) || 100
      },

      periodRange: {
        startDate: start,
        endDate: end
      },

      beforeSync:
        leads.length,

      checked,
      updatedWithSource,
      stillWithoutSource,
      errors,

      details
    });

  } catch (error) {
    console.error(
      'ERRO SYNC PERFORMANCE MISSING SOURCES:',
      error.response?.data ||
        error.message
    );

    res.status(500).json({
      sucesso: false,
      erro:
        error.response?.data ||
        error.message
    });
  }
});


// ========================================
// SYNC - ATUALIZAR LEADS DA PERFORMANCE
// STATUS / ASSIGNEE / CLOSED TIME / VALUE / SOURCES
// ========================================

app.get('/api/sync/nutshell/performance-period', async (req, res) => {
  try {
    const {
      period,
      startDate,
      endDate,
      assignee,
      limit = 300,
      pagesBack = 15
    } = req.query;

    let start;
    let end;
    let selectedPeriod = null;

    if (startDate && endDate) {
      start = new Date(`${startDate}T00:00:00`);
      start.setHours(0, 0, 0, 0);

      end = new Date(`${endDate}T23:59:59.999`);
      end.setHours(23, 59, 59, 999);
    } else {
      const now = new Date();

      selectedPeriod =
        period ||
        `${now.getFullYear()}-${String(
          now.getMonth() + 1
        ).padStart(2, '0')}`;

      const [year, month] = selectedPeriod
        .split('-')
        .map(Number);

      start = new Date(
        Date.UTC(
          year,
          month - 1,
          1,
          3,
          0,
          0,
          0
        )
      );

      end = new Date(
        Date.UTC(
          year,
          month,
          1,
          3,
          0,
          0,
          0
        )
      );
    }

    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      return res.status(400).json({
        sucesso: false,
        erro:
          'Datas inválidas. Use period=YYYY-MM ou startDate/endDate.'
      });
    }

    /*
     * Primeiro puxa leads recentes.
     * Isso ajuda quando uma lead acabou de ser criada
     * e ainda nem entrou completa no Mongo.
     */
    const recentSync =
      await syncRecentLeads({
        limit: 20,
        pagesBack:
          Math.min(
            Math.max(Number(pagesBack) || 15, 1),
            50
          )
      });

    const baseFilter = {
      'stageset.name': {
        $ne: 'Processo de Vendas - Global Alliance'
      },

      'assignee.name': {
        $exists: true,
        $nin: [null, '']
      },

      $or: [
        {
          createdTime: {
            $gte: start,
            $lt: end,
            $ne: null
          }
        },
        {
          closedTime: {
            $gte: start,
            $lt: end,
            $ne: null
          }
        },
        {
          modifiedTime: {
            $gte: start,
            $lt: end,
            $ne: null
          }
        },
        {
          status: {
            $in: [0, 1]
          },
          createdTime: {
            $lt: end,
            $ne: null
          }
        }
      ]
    };

    if (assignee) {
      baseFilter['assignee.name'] = {
        $regex: assignee,
        $options: 'i'
      };
    }

    const leads = await Lead.find(baseFilter)
      .select({
        nutshell_id: 1,
        name: 1,
        status: 1,
        assignee: 1,
        createdTime: 1,
        modifiedTime: 1,
        closedTime: 1,
        value: 1,
        sources: 1,
        htmlUrl: 1
      })
      .sort({
        modifiedTime: -1,
        createdTime: -1
      })
      .limit(
        Math.min(
          Math.max(Number(limit) || 300, 1),
          1000
        )
      )
      .lean();

    let checked = 0;
    let updated = 0;
    let changedStatus = 0;
    let changedAssignee = 0;
    let changedClosedTime = 0;
    let changedValue = 0;
    let errors = 0;

    const details = [];

    for (const lead of leads) {
      checked++;

      try {
        const beforeStatus =
          Number(lead.status);

        const beforeAssignee =
          lead.assignee?.name || null;

        const beforeClosedTime =
          lead.closedTime
            ? new Date(lead.closedTime).toISOString()
            : null;

        const beforeValue =
          Number(lead.value?.amount || 0);

        const response = await axios.post(
          'https://app.nutshell.com/api/v1/json',
          {
            method: 'getLead',
            params: {
              leadId: Number(
                lead.nutshell_id
              )
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

        const fullLead =
          response.data?.result;

        if (!fullLead) {
          errors++;

          details.push({
            nutshell_id:
              lead.nutshell_id,
            name: lead.name,
            updated: false,
            reason:
              'Lead não encontrada no Nutshell'
          });

          continue;
        }

        const afterStatus =
          Number(fullLead.status);

        const afterAssignee =
          fullLead.assignee?.name || null;

        const afterClosedTime =
          fullLead.closedTime
            ? new Date(fullLead.closedTime).toISOString()
            : null;

        const afterValue =
          Number(fullLead.value?.amount || 0);

        if (beforeStatus !== afterStatus) {
          changedStatus++;
        }

        if (
          String(beforeAssignee || '').trim() !==
          String(afterAssignee || '').trim()
        ) {
          changedAssignee++;
        }

        if (
          String(beforeClosedTime || '') !==
          String(afterClosedTime || '')
        ) {
          changedClosedTime++;
        }

        if (beforeValue !== afterValue) {
          changedValue++;
        }

        await saveFullLead(fullLead);

        updated++;

        details.push({
          nutshell_id:
            fullLead.id,

          name:
            fullLead.name,

          updated: true,

          before: {
            status: beforeStatus,
            assignee: beforeAssignee,
            closedTime: beforeClosedTime,
            value: beforeValue
          },

          after: {
            status: afterStatus,
            assignee: afterAssignee,
            closedTime: afterClosedTime,
            value: afterValue,
            sources:
              Array.isArray(fullLead.sources)
                ? fullLead.sources
                    .map((source) =>
                      source?.name
                    )
                    .filter(Boolean)
                : []
          },

          htmlUrl:
            fullLead.htmlUrl ||
            lead.htmlUrl ||
            null
        });

        await sleep(120);
      } catch (leadError) {
        errors++;

        details.push({
          nutshell_id:
            lead.nutshell_id,

          name:
            lead.name,

          updated: false,

          error:
            leadError.response?.data ||
            leadError.message
        });
      }
    }

    res.json({
      sucesso: true,

      routeVersion:
        'performance-period-sync-v1',

      period:
        selectedPeriod || null,

      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        assignee: assignee || null,
        limit: Number(limit) || 300,
        pagesBack: Number(pagesBack) || 15
      },

      periodRange: {
        startDate: start,
        endDate: end
      },

      recentSync,

      candidatesFound:
        leads.length,

      checked,
      updated,
      errors,

      changes: {
        changedStatus,
        changedAssignee,
        changedClosedTime,
        changedValue
      },

      details
    });

  } catch (error) {
    console.error(
      'ERRO SYNC PERFORMANCE PERIOD:',
      error.response?.data ||
        error.message
    );

    res.status(500).json({
      sucesso: false,
      erro:
        error.response?.data ||
        error.message
    });
  }
});

// ========================================
// DASHBOARD - PERFORMANCE POR RESPONSÁVEL
// ========================================

app.get('/api/dashboard/performance-by-assignee', async (req, res) => {
  try {
    const {
      period,
      startDate,
      endDate,
      status
    } = req.query;

    // ========================================
    // PERÍODO
    // PADRÃO: MÊS CORRENTE
    // ========================================

    const now = new Date();

    const defaultPeriod = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, '0')}`;

    const selectedPeriod =
      period || defaultPeriod;

    const [year, month] = selectedPeriod
      .split('-')
      .map(Number);

    let start;
    let end;

    if (startDate && endDate) {
  const [startYear, startMonth, startDay] =
    startDate.split('-').map(Number);

  const [endYear, endMonth, endDay] =
    endDate.split('-').map(Number);

  start = new Date(
    Date.UTC(
      startYear,
      startMonth - 1,
      startDay,
      3,
      0,
      0,
      0
    )
  );

  end = new Date(
    Date.UTC(
      endYear,
      endMonth - 1,
      endDay + 1,
      3,
      0,
      0,
      0
    )
  );
} else {
      /*
       * Início do mês no horário de Brasília.
       * O MongoDB armazena em UTC.
       */
      start = new Date(
        Date.UTC(
          year,
          month - 1,
          1,
          3,
          0,
          0,
          0
        )
      );

      /*
       * Início do próximo mês.
       * Utilizado com $lt.
       */
      end = new Date(
        Date.UTC(
          year,
          month,
          1,
          3,
          0,
          0,
          0
        )
      );
    }

    const fiveDaysAgo = new Date(
      Date.now() - 5 * 24 * 60 * 60 * 1000
    );

    // ========================================
    // RESPONSÁVEIS CLOSERS
    // ========================================

    const CLOSER_ASSIGNEES = [
      'Alba Danielly Rezende Lima',
      'Beatriz Costa',
      'Beatriz Costa  Costa',
      'Edson da Silva Bomfim Júnior',
      'Fabiane Carvalho Nascimento',
      'Fábio Souza',
      'Gabriel Lopes',
      'Luiza Carvalho',
      'Marcus Santana',
      'Marcus Vinicius Dias Santana'
    ];

    function normalizeName(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    }

    const normalizedCloserNames = new Set(
      CLOSER_ASSIGNEES.map(normalizeName)
    );

    const ignoredNames = new Set([
       'accounts grupo',
       'transportes',
       'geral',
       'faturamento log & comex',
       'sem responsável',
       'sem responsavel',
       'giovanna fernandes',
       'pedro scarillo',
       'lucio lage'
    ]);

    // ========================================
    // FILTRO PRINCIPAL
    // ========================================

    const baseFilter = {
      'stageset.name': {
        $ne: 'Processo de Vendas - Global Alliance'
      },

      'assignee.name': {
        $exists: true,
        $nin: [null, '']
      }
    };

    if (
      status !== undefined &&
      status !== ''
    ) {
      baseFilter.status = Number(status);
    }

   // ========================================
// LEADS ABERTAS NO PERÍODO
// TOTAL LEADS, OPEN E PENDING
// REGRA: CREATED TIME
// ========================================

const openedPerformance =
  await Lead.aggregate([
    {
      $match: {
        ...baseFilter,

        createdTime: {
          $gte: start,
          $lt: end,
          $ne: null
        }
      }
    },

    {
      $group: {
        _id: '$assignee.name',

        /*
         * Total de leads abertas no período,
         * independentemente do status atual.
         */
        totalLeads: {
          $sum: 1
        },

        /*
         * Leads abertas no período
         * que permanecem Open.
         */
        openLeads: {
          $sum: {
            $cond: [
              {
                $eq: [
                  '$status',
                  0
                ]
              },
              1,
              0
            ]
          }
        },

        /*
         * Leads abertas no período
         * que permanecem Pending.
         */
        pendingLeads: {
          $sum: {
            $cond: [
              {
                $eq: [
                  '$status',
                  1
                ]
              },
              1,
              0
            ]
          }
        }
      }
    },

    {
      $sort: {
        totalLeads: -1
      }
    }
  ]);
// ========================================
// FECHAMENTOS NO PERÍODO
// WON / LOST / CANCELADO
// REGRA: CLOSED TIME
// ========================================

const closedPerformance =
  await Lead.aggregate([
    {
      $match: {
        ...baseFilter,

        status: {
          $in: [
            10,
            11,
            12
          ]
        },

        closedTime: {
          $gte: start,
          $lt: end,
          $ne: null
        }
      }
    },

    {
      $group: {
        _id: '$assignee.name',

        wonLeads: {
          $sum: {
            $cond: [
              {
                $eq: [
                  '$status',
                  10
                ]
              },
              1,
              0
            ]
          }
        },

        lostLeads: {
          $sum: {
            $cond: [
              {
                $eq: [
                  '$status',
                  11
                ]
              },
              1,
              0
            ]
          }
        },

        canceledLeads: {
          $sum: {
            $cond: [
              {
                $eq: [
                  '$status',
                  12
                ]
              },
              1,
              0
            ]
          }
        },

        totalRevenue: {
          $sum: {
            $cond: [
              {
                $eq: [
                  '$status',
                  10
                ]
              },

              {
                $ifNull: [
                  '$value.amount',
                  {
                    $ifNull: [
                      '$rawData.value.amount',
                      0
                    ]
                  }
                ]
              },

              0
            ]
          }
        },

        totalWonWithValue: {
          $sum: {
            $cond: [
              {
                $and: [
                  {
                    $eq: [
                      '$status',
                      10
                    ]
                  },

                  {
                    $gt: [
                      {
                        $ifNull: [
                          '$value.amount',
                          {
                            $ifNull: [
                              '$rawData.value.amount',
                              0
                            ]
                          }
                        ]
                      },
                      0
                    ]
                  }
                ]
              },

              1,
              0
            ]
          }
        }
      }
    },

    {
      $addFields: {

        averageTicket: {
          $cond: [
            {
              $gt: [
                '$totalWonWithValue',
                0
              ]
            },

            {
              $divide: [
                '$totalRevenue',
                '$totalWonWithValue'
              ]
            },

            0
          ]
        },

        conversionRate: {
          $cond: [
            {
              $gt: [
                {
                  $add: [
                    '$wonLeads',
                    '$lostLeads'
                  ]
                },

                0
              ]
            },

            {
              $multiply: [
                {
                  $divide: [
                    '$wonLeads',
                    {
                      $add: [
                        '$wonLeads',
                        '$lostLeads'
                      ]
                    }
                  ]
                },

                100
              ]
            },

            0
          ]
        }
      }
    }
  ]);
// ========================================
// SOURCES DAS LEADS POR RESPONSÁVEL
// CONSIDERA UMA LEAD APENAS UMA VEZ
// ========================================

const sourcesByAssignee =
  await Lead.aggregate([
    {
      $match: baseFilter
    },

    {
  $addFields: {
    performanceDate: '$createdTime'
  }
},

    {
      $match: {
        performanceDate: {
          $gte: start,
          $lt: end,
          $ne: null
        }
      }
    },

 /*
 * Usa o primeiro source válido.
 * Aceita source em vários formatos:
 * - { name: 'Site Process' }
 * - 'Site Process'
 * - rawData.sources
 * - label/value, se vier nesses campos
 */
{
  $addFields: {
    allSources: {
      $concatArrays: [
        {
          $cond: [
            {
              $isArray: '$sources'
            },
            '$sources',
            []
          ]
        },
        {
          $cond: [
            {
              $isArray: '$rawData.sources'
            },
            '$rawData.sources',
            []
          ]
        }
      ]
    }
  }
},

{
  $addFields: {
    sourceNames: {
      $filter: {
        input: {
          $map: {
            input: '$allSources',
            as: 'source',
            in: {
              $trim: {
                input: {
                  $switch: {
                    branches: [
                      {
                        case: {
                          $eq: [
                            {
                              $type: '$$source'
                            },
                            'string'
                          ]
                        },
                        then: '$$source'
                      },
                      {
                        case: {
                          $eq: [
                            {
                              $type: '$$source.name'
                            },
                            'string'
                          ]
                        },
                        then: '$$source.name'
                      },
                      {
                        case: {
                          $eq: [
                            {
                              $type: '$$source.label'
                            },
                            'string'
                          ]
                        },
                        then: '$$source.label'
                      },
                      {
                        case: {
                          $eq: [
                            {
                              $type: '$$source.value'
                            },
                            'string'
                          ]
                        },
                        then: '$$source.value'
                      }
                    ],
                    default: ''
                  }
                }
              }
            }
          }
        },

        as: 'sourceName',

        cond: {
          $ne: [
            '$$sourceName',
            ''
          ]
        }
      }
    }
  }
},

{
  $addFields: {
    sourceName: {
      $ifNull: [
        {
          $arrayElemAt: [
            '$sourceNames',
            0
          ]
        },
        'Sem source'
      ]
    }
  }
},

    {
      $group: {
        _id: {
          assignee:
            '$assignee.name',

          source:
            '$sourceName'
        },

        total: {
          $sum: 1
        }
      }
    },

    {
      $group: {
        _id:
          '$_id.assignee',

        sources: {
          $push: {
            name:
              '$_id.source',

            total:
              '$total'
          }
        },

        totalLeadsBySource: {
          $sum:
            '$total'
        }
      }
    }
  ]);

// ========================================
// ATIVIDADES REALIZADAS NO PERÍODO
// AGRUPADAS POR QUEM EXECUTOU
// ========================================

const activitiesByAssignee =
  await Lead.aggregate([
    {
      $match: {
        activities: {
          $exists: true,
          $ne: []
        }
      }
    },

    {
      $unwind: '$activities'
    },

    {
      $addFields: {
        activityDate: {
          $convert: {
            input: {
              $ifNull: [
                '$activities.startTime',
                {
                  $ifNull: [
                    '$activities.endTime',
                    {
                      $ifNull: [
                        '$activities.createdTime',
                        {
                          $ifNull: [
                            '$activities.modifiedTime',
                            '$activities.dueTime'
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            },

            to: 'date',
            onError: null,
            onNull: null
          }
        },

        activityOwner: {
          $ifNull: [
            '$activities.loggedBy.name',
            {
              $ifNull: [
                '$activities.user.name',
                {
                  $ifNull: [
                    '$activities.owner.name',
                    {
                      $ifNull: [
                        '$activities.assignee.name',
                        {
                          $arrayElemAt: [
                            '$activities.participants.name',
                            0
                          ]
                        }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        },

        activityDescription: {
          $toLower: {
            $concat: [
              {
                $ifNull: [
                  '$activities.name',
                  ''
                ]
              },
              ' ',
              {
                $ifNull: [
                  '$activities.activityType.name',
                  ''
                ]
              }
            ]
          }
        }
      }
    },

    {
      $addFields: {
        activityCategory: {
          $switch: {
            branches: [
              // No Show
              {
                case: {
                  $regexMatch: {
                    input:
                      '$activityDescription',
                    regex:
                      'no\\s*show|no-show|nao\\s*compareceu|não\\s*compareceu',
                    options: 'i'
                  }
                },
                then: 'noShow'
              },
              // Proposta de projeto — Simulação
              {
                case: {
                  $regexMatch: {
                    input:
                      '$activityDescription',
                    regex:
                      'envio de proposta de projeto.*simulacao|envio de proposta de projeto.*simulação',
                    options: 'i'
                  }
                },
                then: 'simulationProposal'
              },

              // Propostas avulsas
              {
                case: {
                  $regexMatch: {
                    input:
                      '$activityDescription',
                    regex:
                      'envio de proposta.*desembaraco aduaneiro|envio de proposta.*desembaraço aduaneiro|envio de proposta.*frete internacional|envio de proposta.*rodoviario|envio de proposta.*rodoviário|envio de proposta de gerenciamento.*completo|envio de proposta de gerenciamento.*consultoria|envio de proposta de gerenciamento.*essencial',
                    options: 'i'
                  }
                },
                then: 'standaloneProposal'
              },

              // Reunião — Primeiro contato
              {
                case: {
                  $regexMatch: {
                    input:
                      '$activityDescription',
                    regex:
                      'reuni.*primeiro contato|primeiro contato.*reuni',
                    options: 'i'
                  }
                },
                then: 'firstContactMeeting'
              },

              // Reunião — Follow-up
              {
                case: {
                  $regexMatch: {
                    input:
                      '$activityDescription',
                    regex:
                      'reuni.*follow.?up|follow.?up.*reuni',
                    options: 'i'
                  }
                },
                then: 'followUpMeeting'
              },

              // Demais reuniões
              {
                case: {
                  $regexMatch: {
                    input:
                      '$activityDescription',
                    regex:
                      'reuni|meeting|call de diagnostico|call de diagnóstico',
                    options: 'i'
                  }
                },
                then: 'meeting'
              },

              // WhatsApp pontual
              {
                case: {
                  $regexMatch: {
                    input:
                      '$activityDescription',
                    regex:
                      'whatsapp.*mensagem pontual',
                    options: 'i'
                  }
                },
                then: 'whatsappMessage'
              },

              // WhatsApp com diálogo
              {
                case: {
                  $regexMatch: {
                    input:
                      '$activityDescription',
                    regex:
                      'whatsapp.*houve dialogo|whatsapp.*houve diálogo',
                    options: 'i'
                  }
                },
                then: 'whatsappDialogue'
              },

              // Ligação não efetiva
              {
                case: {
                  $regexMatch: {
                    input:
                      '$activityDescription',
                    regex:
                      'ligacao.*nao efetiva|ligação.*não efetiva',
                    options: 'i'
                  }
                },
                then: 'nonEffectiveCall'
              },

              // Ligação efetiva
              {
                case: {
                  $regexMatch: {
                    input:
                      '$activityDescription',
                    regex:
                      'ligacao.*efetiva|ligação.*efetiva',
                    options: 'i'
                  }
                },
                then: 'effectiveCall'
              },

              // E-mail de prospecção
              {
                case: {
                  $regexMatch: {
                    input:
                      '$activityDescription',
                    regex:
                      'e-mail.*prospeccao|e-mail.*prospecção|email.*prospeccao|email.*prospecção',
                    options: 'i'
                  }
                },
                then: 'prospectingEmail'
              }
            ],

            default: 'other'
          }
        }
      }
    },

    {
      $match: {
        activityDate: {
          $gte: start,
          $lt: end,
          $ne: null
        },

        activityOwner: {
          $exists: true,
          $nin: [null, '']
        }
      }
    },

    {
      $group: {
        _id: '$activityOwner',

        activitiesCount: {
          $sum: 1
        },

        meetingsCount: {
          $sum: {
            $cond: [
              {
                $in: [
                  '$activityCategory',
                  [
                    'meeting',
                    'firstContactMeeting',
                    'followUpMeeting'
                  ]
                ]
              },
              1,
              0
            ]
          }
        },

        firstContactMeetingsCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  '$activityCategory',
                  'firstContactMeeting'
                ]
              },
              1,
              0
            ]
          }
        },

        followUpMeetingsCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  '$activityCategory',
                  'followUpMeeting'
                ]
              },
              1,
              0
            ]
          }
        },

        generalMeetingsCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  '$activityCategory',
                  'meeting'
                ]
              },
              1,
              0
            ]
          }
        },

        simulationProposalCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  '$activityCategory',
                  'simulationProposal'
                ]
              },
              1,
              0
            ]
          }
        },

        standaloneProposalCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  '$activityCategory',
                  'standaloneProposal'
                ]
              },
              1,
              0
            ]
          }
        },

        effectiveCallsCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  '$activityCategory',
                  'effectiveCall'
                ]
              },
              1,
              0
            ]
          }
        },

        nonEffectiveCallsCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  '$activityCategory',
                  'nonEffectiveCall'
                ]
              },
              1,
              0
            ]
          }
        },

        whatsappDialogueCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  '$activityCategory',
                  'whatsappDialogue'
                ]
              },
              1,
              0
            ]
          }
        },

        whatsappMessageCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  '$activityCategory',
                  'whatsappMessage'
                ]
              },
              1,
              0
            ]
          }
        },

        prospectingEmailCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  '$activityCategory',
                  'prospectingEmail'
                ]
              },
              1,
              0
            ]
          }
        },

        noShowCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  '$activityCategory',
                  'noShow'
                ]
              },
              1,
              0
            ]
          }
        },
        otherActivitiesCount: {
          $sum: {
            $cond: [
              {
                $eq: [
                  '$activityCategory',
                  'other'
                ]
              },
              1,
              0
            ]
          }
        }
      }
    },

    {
      $sort: {
        activitiesCount: -1
      }
    }
  ]);

    // ========================================
    // OPEN OU PENDING SEM ATUALIZAÇÃO
    // HÁ MAIS DE 5 DIAS
    // ========================================

    const staleLeadsByAssignee =
      await Lead.aggregate([

          {
             $match: {
               ...baseFilter,

               status: {
                 $in: [0, 1]
               },

               createdTime: {
                 $gte: start,
                 $lt: end,
                 $ne: null
               },

               modifiedTime: {
                 $lt: fiveDaysAgo,
                 $ne: null
               }
             }
            },
        {
          $group: {
            _id: '$assignee.name',

            staleOpenPending: {
              $sum: 1
            }
          }
        }
      ]);


const sourcesMap = new Map(
  sourcesByAssignee.map((item) => [
    normalizeName(item._id),

    {
      totalLeadsBySource: Number(
        item.totalLeadsBySource || 0
      ),

      sources: Array.isArray(
        item.sources
      )
        ? [...item.sources].sort(
            (first, second) =>
              Number(
                second.total || 0
              ) -
              Number(
                first.total || 0
              )
          )
        : []
    }
  ])
);
      
    // ========================================
    // MAPAS AUXILIARES
    // ========================================

    const activitiesMap = new Map(
  activitiesByAssignee.map((item) => [
    normalizeName(item._id),

    {
      displayName:
        item._id ||
        'Sem responsável',

      activitiesCount: Number(
        item.activitiesCount || 0
      ),

      meetingsCount: Number(
        item.meetingsCount || 0
      ),

      activityBreakdown: {
        effectiveCall: Number(
          item.effectiveCallsCount || 0
        ),

        nonEffectiveCall: Number(
          item.nonEffectiveCallsCount || 0
        ),

        whatsappDialogue: Number(
          item.whatsappDialogueCount || 0
        ),

        whatsappMessage: Number(
          item.whatsappMessageCount || 0
        ),

        noShow: Number(
          item.noShowCount || 0
        ),

        prospectingEmail: Number(
          item.prospectingEmailCount || 0
        ),

        meetings: Number(
          item.meetingsCount || 0
        ),

        firstContactMeetings: Number(
          item.firstContactMeetingsCount || 0
        ),

        followUpMeetings: Number(
          item.followUpMeetingsCount || 0
        ),

        generalMeetings: Number(
          item.generalMeetingsCount || 0
        ),

        simulationProposal: Number(
          item.simulationProposalCount || 0
        ),

        standaloneProposal: Number(
          item.standaloneProposalCount || 0
        ),

        other: Number(
          item.otherActivitiesCount || 0
        )
      }
    }
  ])
);

    const staleMap = new Map(
      staleLeadsByAssignee.map((item) => [
        normalizeName(item._id),
        Number(item.staleOpenPending || 0)
      ])
    );

 
   // ========================================
// MAPA DAS LEADS ABERTAS
// CREATED TIME
// ========================================

const openedPerformanceMap =
  new Map(
    openedPerformance.map((item) => [
      normalizeName(item._id),

      {
        _id:
          item._id ||
          'Sem responsável',

        totalLeads: Number(
          item.totalLeads || 0
        ),

        openLeads: Number(
          item.openLeads || 0
        ),

        pendingLeads: Number(
          item.pendingLeads || 0
        )
      }
    ])
  );

// ========================================
// MAPA DOS FECHAMENTOS
// CLOSED TIME
// ========================================

const closedPerformanceMap =
  new Map(
    closedPerformance.map((item) => [
      normalizeName(item._id),

      {
        _id:
          item._id ||
          'Sem responsável',

        wonLeads: Number(
          item.wonLeads || 0
        ),

        lostLeads: Number(
          item.lostLeads || 0
        ),

        canceledLeads: Number(
          item.canceledLeads || 0
        ),

        totalRevenue: Number(
          item.totalRevenue || 0
        ),

        averageTicket: Number(
          item.averageTicket || 0
        ),

        conversionRate: Number(
          item.conversionRate || 0
        )
      }
    ])
  );

/*
 * Junta responsáveis encontrados na pipeline
 * com responsáveis encontrados nas atividades.
 *
 * Assim, mesmo quem não teve lead no período,
 * mas realizou atividades, aparece no módulo.
 */
const allResponsibleNames = new Set([
  ...openedPerformanceMap.keys(),
  ...closedPerformanceMap.keys(),
  ...activitiesMap.keys(),
  ...sourcesMap.keys()
]);

const completePerformance = Array.from(
  allResponsibleNames
).map((normalizedName) => {
  const openedData =
    openedPerformanceMap.get(
      normalizedName
    );

  const closedData =
    closedPerformanceMap.get(
      normalizedName
    );

  const activity =
    activitiesMap.get(
      normalizedName
    );

  const sourceData =
    sourcesMap.get(
      normalizedName
    ); 

return {
  _id:
    openedData?._id ||
    closedData?._id ||
    activity?.displayName ||
    'Sem responsável',

  /*
   * LEADS ABERTAS NO PERÍODO
   * createdTime
   */
  totalLeads: Number(
    openedData?.totalLeads || 0
  ),

  openLeads: Number(
    openedData?.openLeads || 0
  ),

  pendingLeads: Number(
    openedData?.pendingLeads || 0
  ),

  /*
   * LEADS FECHADAS NO PERÍODO
   * closedTime
   */
  wonLeads: Number(
    closedData?.wonLeads || 0
  ),

  lostLeads: Number(
    closedData?.lostLeads || 0
  ),

  canceledLeads: Number(
    closedData?.canceledLeads || 0
  ),

  totalRevenue: Number(
    closedData?.totalRevenue || 0
  ),

  averageTicket: Number(
    closedData?.averageTicket || 0
  ),

  conversionRate: Number(
    closedData?.conversionRate || 0
  ),

  /*
   * Mantido para compatibilidade,
   * mas representa os Won por closedTime.
   */
  wonLeadsByCloseDate: Number(
    closedData?.wonLeads || 0
  ),

  /*
   * ATIVIDADES
   */
  activitiesCount: Number(
    activity?.activitiesCount || 0
  ),

  meetingsCount: Number(
    activity?.meetingsCount || 0
  ),

  activityBreakdown:
    activity?.activityBreakdown || {
      effectiveCall: 0,
      nonEffectiveCall: 0,
      whatsappDialogue: 0,
      whatsappMessage: 0,
      prospectingEmail: 0,
      noShow: 0,

      meetings: 0,
      firstContactMeetings: 0,
      followUpMeetings: 0,
      generalMeetings: 0,

      simulationProposal: 0,
      standaloneProposal: 0,

      other: 0
    },

  /*
   * SOURCES DAS LEADS ABERTAS
   */
  sourcesBreakdown:
    sourceData?.sources || [],

  totalLeadsBySource: Number(
    sourceData?.totalLeadsBySource || 0
  ),

  staleOpenPending: Number(
    staleMap.get(normalizedName) || 0
  )
};
});
    // ========================================
    // SEPARAÇÃO CLOSERS E SDRS
    // ========================================

    const closers = completePerformance
  .filter((item) =>
    normalizedCloserNames.has(
      normalizeName(item._id)
    )
  )
  .sort(
    (first, second) =>
      Number(
        second.activitiesCount || 0
      ) -
      Number(
        first.activitiesCount || 0
      )
  );

const sdrs = completePerformance
  .filter((item) => {
    const normalizedName =
      normalizeName(item._id);

    return (
      normalizedName &&
      !normalizedCloserNames.has(
        normalizedName
      ) &&
      !ignoredNames.has(
        normalizedName
      )
    );
  })
  .sort(
    (first, second) =>
      Number(
        second.activitiesCount || 0
      ) -
      Number(
        first.activitiesCount || 0
      )
  );

    res.json({
      sucesso: true,

      routeVersion:
        'performance-by-assignee-v2',

      period: selectedPeriod,

      periodRange: {
        startDate: start,
        endDate: end
      },

      staleRule: {
        statuses: [0, 1],
        daysWithoutUpdate: 5,
        referenceDate: fiveDaysAgo
      },

      totalClosers: closers.length,
      totalSdrs: sdrs.length,

      closers,
      sdrs,

      /*
       * Mantido para não quebrar o frontend
       * antigo durante a alteração.
       */
      performance: completePerformance
    });

  } catch (error) {
    console.error(
      'ERRO PERFORMANCE ASSIGNEE:',
      error
    );

    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

// ========================================
// DASHBOARD - PERFORMANCE POR SOURCE
// ========================================

app.get('/api/dashboard/by-source', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateConditions = {};

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      dateConditions.$gte = start;
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateConditions.$lte = end;
    }

    const hasDateFilter = Object.keys(dateConditions).length > 0;

    const ignoredPipelineFilter = {
      'stageset.name': { $ne: 'Processo de Vendas - Global Alliance' }
    };

    const sources = await Lead.aggregate([
  {
    $match: {
      ...ignoredPipelineFilter,

      status: 10,

      closedTime: hasDateFilter
        ? {
            ...dateConditions,
            $ne: null
          }
        : {
            $ne: null
          }
    }
  },

  {
    $unwind: {
      path: '$sources',
      preserveNullAndEmptyArrays: true
    }
  },

  {
    $addFields: {
      sourceName: {
        $trim: {
          input: {
            $ifNull: [
              '$sources.name',
              ''
            ]
          }
        }
      }
    }
  },

  {
    $group: {
      _id: {
        $cond: [
          {
            $eq: [
              '$sourceName',
              ''
            ]
          },
          'Sem source',
          '$sourceName'
        ]
      },

      totalLeads: {
        $sum: 1
      },

      wonLeads: {
        $sum: 1
      },

      openLeads: {
        $sum: 0
      },

      lostLeads: {
        $sum: 0
      },

      canceledLeads: {
        $sum: 0
      },

      revenue: {
        $sum: {
          $ifNull: [
            '$value.amount',
            {
              $ifNull: [
                '$rawData.value.amount',
                0
              ]
            }
          ]
        }
      }
    }
  },

  {
    $addFields: {
      conversionRate: 100
    }
  },

  {
    $sort: {
      revenue: -1
    }
  },

  {
    $limit: 15
  }
]);

    res.json({
      sucesso: true,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null
      },
      totalSources: sources.length,
      sources
    });

  } catch (error) {
    console.error('ERRO SOURCES:', error.message);

    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

// ========================================
// DASHBOARD - PERFORMANCE POR PRODUTO
// ========================================

app.get('/api/dashboard/by-product', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateConditions = {};

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      dateConditions.$gte = start;
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateConditions.$lte = end;
    }

    const hasDateFilter = Object.keys(dateConditions).length > 0;

    const ignoredPipelineFilter = {
      'stageset.name': { $ne: 'Processo de Vendas - Global Alliance' }
    };

    const products = await Lead.aggregate([
      {
        $match: {
          ...ignoredPipelineFilter
        }
      },
      {
        $addFields: {
          productDate: {
            $cond: [
              {
                $in: ['$status', [10, 11, 12]]
              },
              '$closedTime',
              '$createdTime'
            ]
          }
        }
      },
      {
        $match: hasDateFilter
          ? {
              productDate: {
                ...dateConditions,
                $ne: null
              }
            }
          : {
              productDate: {
                $ne: null
              }
            }
      },
      {
        $unwind: {
          path: '$products',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $group: {
          _id: {
            $ifNull: ['$products.name', 'Sem produto']
          },

          totalLeads: {
            $sum: 1
          },

          wonLeads: {
            $sum: {
              $cond: [{ $eq: ['$status', 10] }, 1, 0]
            }
          },

          openLeads: {
            $sum: {
              $cond: [{ $eq: ['$status', 0] }, 1, 0]
            }
          },

          lostLeads: {
            $sum: {
              $cond: [{ $eq: ['$status', 11] }, 1, 0]
            }
          },

          canceledLeads: {
            $sum: {
              $cond: [{ $eq: ['$status', 12] }, 1, 0]
            }
          },

          revenue: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 10] },
                    { $ne: ['$value.amount', null] }
                  ]
                },
                '$value.amount',
                0
              ]
            }
          }
        }
      },
      {
        $addFields: {
          conversionRate: {
            $cond: [
              { $gt: ['$totalLeads', 0] },
              {
                $multiply: [
                  {
                    $divide: ['$wonLeads', '$totalLeads']
                  },
                  100
                ]
              },
              0
            ]
          }
        }
      },
      {
        $sort: {
          revenue: -1
        }
      },
      {
        $limit: 15
      }
    ]);

    res.json({
      sucesso: true,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null
      },
      totalProducts: products.length,
      products
    });

  } catch (error) {
    console.error('ERRO PRODUCTS:', error.message);

    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});


app.get('/api/dashboard/transport-estimate', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Informe startDate e endDate.'
      });
    }

    const start = new Date(startDate);
    start.setHours(0, 0, 0, 0);

    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);


    if (
      Number.isNaN(start.getTime()) ||
      Number.isNaN(end.getTime())
    ) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Datas inválidas.'
      });
    }

    const result = await Lead.aggregate([
      {
        $match: {
          status: {
            $in: [0, 1]
          },
          dueTime: {
            $gte: start,
            $lte: end,
            $ne: null
          },
          'products.name': 'Transporte Rodoviário',
          'stageset.name': {
            $ne: 'Processo de Vendas - Global Alliance'
          }
        }
      },
      {
        $addFields: {
          transportEstimatedAmount: {
            $ifNull: [
              '$value.amount',
              {
                $ifNull: [
                  '$normalizedValue.amount',
                  {
                    $ifNull: [
                      '$estimatedValue.amount',
                      {
                        $ifNull: [
                          '$rawData.value.amount',
                          0
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          }
        }
      },
      {
        $group: {
          _id: null,
          estimatedRevenue: {
            $sum: '$transportEstimatedAmount'
          },
          estimatedLeads: {
            $sum: 1
          }
        }
      }
    ]);

    res.json({
      sucesso: true,
      estimatedRevenue:
        Number(result[0]?.estimatedRevenue || 0),
      estimatedLeads:
        Number(result[0]?.estimatedLeads || 0)
    });
  } catch (error) {
    console.error(
      'ERRO TRANSPORT ESTIMATE:',
      error.message
    );

    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});


// ========================================
// DASHBOARD - COMPARATIVO ANUAL
// ========================================

app.get('/api/dashboard/year-comparison', async (req, res) => {
try {
const currentYear =
Number(req.query.year) ||
new Date().getFullYear();


const previousYear =
  currentYear - 1;

const comparisonSource =
  req.query.comparisonSource || '';

const startDate =
  new Date(previousYear, 0, 1);

const endDate =
  new Date(
    currentYear,
    11,
    31,
    23,
    59,
    59,
    999
  );

const ignoredPipelineFilter = {
  'stageset.name': {
    $ne:
      'Processo de Vendas - Global Alliance'
  }
};

const SOURCE_GROUPS = {
  chinaLink: [
    'PARTNER - China Link BR',
    'PARTNER - China Link SC'
  ],

  metodo12p: [
    'PARTNER - Método 12P'
  ]
};

const PROCESS_EXCLUDED_SOURCES = [
  'PARTNER - China Link BR',
  'PARTNER - China Link SC',
  'PARTNER - Método 12P',
  'Cloned Lead'
];

let selectedSources = [];
let sourceFilter = {};

if (comparisonSource === 'chinaLink') {
  selectedSources = SOURCE_GROUPS.chinaLink;

  sourceFilter = {
    'sources.name': {
      $in: selectedSources
    }
  };
}

if (comparisonSource === 'metodo12p') {
  selectedSources = SOURCE_GROUPS.metodo12p;

  sourceFilter = {
    'sources.name': {
      $in: selectedSources
    }
  };
}

if (comparisonSource === 'process') {
  sourceFilter = {
    'sources.name': {
      $nin: PROCESS_EXCLUDED_SOURCES
    }
  };
}

const data = await Lead.aggregate([
  {
    $match: {
      ...ignoredPipelineFilter,
      ...sourceFilter,

      status: 10,

      closedTime: {
        $gte: startDate,
        $lte: endDate,
        $ne: null
      },

      'value.amount': {
        $type: 'number'
      }
    }
  },

  {
    $group: {
      _id: {
        year: {
          $year: '$closedTime'
        },

        month: {
          $month: '$closedTime'
        }
      },

      totalLeads: {
        $sum: 1
      },

      wonLeads: {
        $sum: 1
      },

      lostLeads: {
        $sum: 0
      },

      revenue: {
        $sum: '$value.amount'
      }
    }
  },

  {
    $sort: {
      '_id.year': 1,
      '_id.month': 1
    }
  }
]);

const months = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez'
];

const today = new Date();

const maxMonth =
  currentYear === today.getFullYear()
    ? today.getMonth() + 1
    : 12;

const comparison = months
  .slice(0, maxMonth)
  .map((monthName, index) => {
    const month = index + 1;

    const current = data.find(
      (item) =>
        Number(item._id.year) ===
          currentYear &&
        Number(item._id.month) ===
          month
    );

    const previous = data.find(
      (item) =>
        Number(item._id.year) ===
          previousYear &&
        Number(item._id.month) ===
          month
    );

    const currentRevenue =
      Number(current?.revenue || 0);

    const previousRevenue =
      Number(previous?.revenue || 0);

    const revenueGrowth =
      previousRevenue > 0
        ? (
            (currentRevenue -
              previousRevenue) /
            previousRevenue
          ) * 100
        : currentRevenue > 0
          ? 100
          : 0;

    return {
      month,
      monthName,
      currentYear,
      previousYear,

      sourceGroup:
        comparisonSource || 'all',

      current: {
        totalLeads:
          Number(
            current?.totalLeads || 0
          ),

        wonLeads:
          Number(
            current?.wonLeads || 0
          ),

        lostLeads:
          Number(
            current?.lostLeads || 0
          ),

        revenue:
          currentRevenue
      },

      previous: {
        totalLeads:
          Number(
            previous?.totalLeads || 0
          ),

        wonLeads:
          Number(
            previous?.wonLeads || 0
          ),

        lostLeads:
          Number(
            previous?.lostLeads || 0
          ),

        revenue:
          previousRevenue
      },

      growth: {
        revenuePercent:
          revenueGrowth
      }
    };
  });

res.json({
  sucesso: true,

  filters: {
  year: currentYear,

  comparisonSource:
    comparisonSource || 'all',

  sources:
    comparisonSource === 'process'
      ? {
          rule: 'Todas, exceto',
          excluded: PROCESS_EXCLUDED_SOURCES
        }
      : selectedSources
},

  currentYear,
  previousYear,
  comparison
});


} catch (error) {
console.error(
'ERRO YEAR COMPARISON:',
error.message
);


res.status(500).json({
  sucesso: false,
  erro: error.message
});


}
});


// ========================================
// DASHBOARD - FUNIL COMERCIAL
// ========================================

app.get('/api/dashboard/funnel', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateConditions = {};

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      dateConditions.$gte = start;
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateConditions.$lte = end;
    }

    const hasDateFilter = Object.keys(dateConditions).length > 0;

    const ignoredPipelineFilter = {
      'stageset.name': { $ne: 'Processo de Vendas - Global Alliance' }
    };

    const closedFilter = hasDateFilter
      ? {
          closedTime: dateConditions
        }
      : {};

    const createdFilter = hasDateFilter
      ? {
          createdTime: dateConditions
        }
      : {};

    const openCount = await Lead.countDocuments({
      ...createdFilter,
      ...ignoredPipelineFilter,
      status: 0
    });

    const pendingCount = await Lead.countDocuments({
      ...createdFilter,
      ...ignoredPipelineFilter,
      status: 1
    });

    const wonCount = await Lead.countDocuments({
      ...closedFilter,
      ...ignoredPipelineFilter,
      status: 10
    });

    const lostCount = await Lead.countDocuments({
      ...closedFilter,
      ...ignoredPipelineFilter,
      status: 11
    });

    const canceledCount = await Lead.countDocuments({
      ...closedFilter,
      ...ignoredPipelineFilter,
      status: 12
    });

    const wonRevenueResult = await Lead.aggregate([
      {
        $match: {
          ...closedFilter,
          ...ignoredPipelineFilter,
          status: 10,
          'value.amount': { $type: 'number' }
        }
      },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$value.amount' }
        }
      }
    ]);

    const wonRevenue = wonRevenueResult[0]?.revenue || 0;

    const totalLeads =
      openCount +
      pendingCount +
      wonCount +
      lostCount +
      canceledCount;

    const funnel = [
      {
        key: 'open',
        label: 'Open',
        codes: [0],
        order: 1,
        total: openCount,
        revenue: 0,
        percentOfTotal:
          totalLeads > 0 ? (openCount / totalLeads) * 100 : 0
      },
      {
        key: 'pending',
        label: 'Pending',
        codes: [1],
        order: 2,
        total: pendingCount,
        revenue: 0,
        percentOfTotal:
          totalLeads > 0 ? (pendingCount / totalLeads) * 100 : 0
      },
      {
        key: 'won',
        label: 'Won',
        codes: [10],
        order: 3,
        total: wonCount,
        revenue: wonRevenue,
        percentOfTotal:
          totalLeads > 0 ? (wonCount / totalLeads) * 100 : 0
      },
      {
        key: 'lost',
        label: 'Lost',
        codes: [11],
        order: 4,
        total: lostCount,
        revenue: 0,
        percentOfTotal:
          totalLeads > 0 ? (lostCount / totalLeads) * 100 : 0
      },
      {
        key: 'canceled',
        label: 'Cancelado',
        codes: [12],
        order: 5,
        total: canceledCount,
        revenue: 0,
        percentOfTotal:
          totalLeads > 0 ? (canceledCount / totalLeads) * 100 : 0
      }
    ];

    res.json({
      sucesso: true,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null
      },
      totalLeads,
      funnel
    });

  } catch (error) {
    console.error('ERRO FUNNEL:', error.message);

    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

// ========================================
// DASHBOARD - LEAD TIME MÉDIO - manter
// ========================================

app.get('/api/dashboard/lead-time', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const dateConditions = {};

    if (startDate) {
      const start = new Date(startDate);
      start.setHours(0, 0, 0, 0);
      dateConditions.$gte = start;
    }

    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      dateConditions.$lte = end;
    }

    const hasDateFilter = Object.keys(dateConditions).length > 0;

    const ignoredPipelineFilter = {
      'stageset.name': { $ne: 'Processo de Vendas - Global Alliance' }
    };

    const baseFilter = {
      ...ignoredPipelineFilter,
      status: 10,
      createdTime: { $ne: null },
      closedTime: { $ne: null }
    };

    if (hasDateFilter) {
      baseFilter.closedTime = {
        ...dateConditions,
        $ne: null
      };
    }

    const pipelineBase = [
      {
        $match: baseFilter
      },
      {
        $project: {
          createdTime: 1,
          closedTime: 1,
          leadTimeDays: {
            $divide: [
              { $subtract: ['$closedTime', '$createdTime'] },
              1000 * 60 * 60 * 24
            ]
          }
        }
      },
      {
        $match: {
          leadTimeDays: {
            $gte: 0
          }
        }
      }
    ];

    const result = await Lead.aggregate([
      ...pipelineBase,
      {
        $group: {
          _id: null,
          averageLeadTimeDays: { $avg: '$leadTimeDays' },
          totalWon: { $sum: 1 }
        }
      }
    ]);

    const byMonth = await Lead.aggregate([
      ...pipelineBase,
      {
        $project: {
          year: { $year: '$closedTime' },
          month: { $month: '$closedTime' },
          leadTimeDays: 1
        }
      },
      {
        $group: {
          _id: {
            year: '$year',
            month: '$month'
          },
          averageLeadTimeDays: { $avg: '$leadTimeDays' },
          totalWon: { $sum: 1 }
        }
      },
      {
        $sort: {
          '_id.year': 1,
          '_id.month': 1
        }
      }
    ]);

    res.json({
      sucesso: true,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null
      },
      summary: {
        averageLeadTimeDays: result[0]?.averageLeadTimeDays || 0,
        totalWon: result[0]?.totalWon || 0
      },
      byMonth
    });

  } catch (error) {
    console.error('ERRO LEAD TIME:', error.message);

    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

// ========================================
// CAMPANHAS
// ========================================

app.post('/api/campaigns', async (req, res) => {
  try {
    const campaign = await Campaign.create(req.body);

    res.status(201).json({
      sucesso: true,
      campaign
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

app.get('/api/campaigns', async (req, res) => {
  try {
    const campaigns = await Campaign.find()
      .sort({ startDate: -1 })
      .lean();

    res.json({
      sucesso: true,
      total: campaigns.length,
      campaigns
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

// ========================================
// METAS
// ========================================

app.post('/api/goals', async (req, res) => {
  try {
    const goal = await Goal.create(req.body);

    res.status(201).json({
      sucesso: true,
      goal
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});



app.post(
  '/api/goals/import-csv',
  upload.single('file'),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          sucesso: false,
          erro: 'Arquivo CSV não enviado'
        });
      }

      const results = [];

      fs.createReadStream(req.file.path)
        .pipe(
          csv({
            separator: ';',
            mapHeaders: ({ header }) =>
             header
              .replace(/^\uFEFF/, '')
              .trim()
         })
       )
        .on('data', (data) => results.push(data))
        .on('end', async () => {
          try {
            if (results.length === 0) {
              return res.status(400).json({
                sucesso: false,
                erro: 'CSV vazio'
              });
            }

            const periods = [
              ...new Set(
                results
                  .map((row) => row.period?.trim())
                  .filter(Boolean)
              )
            ];

            if (periods.length === 0) {
              return res.status(400).json({
                sucesso: false,
                erro: 'Coluna period não encontrada'
              });
            }

            await Goal.deleteMany({
              period: { $in: periods }
            });

            let imported = 0;
            let skipped = 0;

            for (const row of results) {
              const period = row.period?.trim();
              const sector = row.sector?.trim().toLowerCase();
              const userName = row.userName?.trim() || null;

              if (!period || !sector) {
                skipped++;
                continue;
              }

              await Goal.updateOne(
                {
                  period,
                  sector,
                  userName
                },
                {
                  $set: {
                    period,
                    campaignId: null,
                    sector,
                    userName,
                    product: null,
                    source: null,
                    targetRevenue: Number(row.targetRevenue || 0),
                    targetLeads: Number(row.targetLeads || 0),
                    targetMeetings: Number(row.targetMeetings || 0),
                    targetWon: Number(row.targetWon || 0),
                    notes: row.notes?.trim() || ''
                  }
                },
                { upsert: true }
              );

              imported++;
            }

            fs.unlinkSync(req.file.path);

            res.json({
              sucesso: true,
              periods,
              imported,
              updated: 0,
              skipped
            });

          } catch (innerError) {
            console.error('Erro ao processar CSV:', innerError);

            res.status(500).json({
              sucesso: false,
              erro: innerError.message
            });
          }
        });

    } catch (error) {
      console.error('Erro import CSV:', error);

      res.status(500).json({
        sucesso: false,
        erro: error.message
      });
    }
  }
);

app.get('/api/goals', async (req, res) => {
  try {
    const { period, sector, userName, campaignId } = req.query;

    const filter = {};

    if (period) filter.period = period;
    if (sector) filter.sector = sector;
    if (userName) filter.userName = userName;
    if (campaignId) filter.campaignId = campaignId;

    const goals = await Goal.find(filter)
      .populate('campaignId')
      .sort({ period: -1 })
      .lean();

    res.json({
      sucesso: true,
      total: goals.length,
      goals
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

app.get('/api/goals/current', async (req, res) => {
  try {
    const { period } = req.query;

    const goal = await Goal.findOne({ period }).sort({ createdAt: -1 });

    res.json({
      sucesso: true,
      goal
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

// ========================================
// ATINGIMENTO DE METAS
// COM REGRA DE DATA POR CAMPANHA
// ========================================

app.get('/api/goals/achievement', async (req, res) => {
  try {
    const { period, userName, sector, campaignId } = req.query;

    if (!period) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Informe o period. Exemplo: 2026-05'
      });
    }

    const [year, month] = period.split('-').map(Number);

const defaultStartDate = new Date(
  Date.UTC(year, month - 1, 1, 3, 0, 0, 0)
);
const defaultEndDate = new Date(
  Date.UTC(year, month, 1, 3, 0, 0, 0)
);

    const goalFilter = { period };

    if (userName) goalFilter.userName = userName;
    if (sector) goalFilter.sector = sector;
    if (campaignId) goalFilter.campaignId = campaignId;

    const goals = await Goal.find(goalFilter)
      .populate('campaignId')
      .lean();

    const results = [];

    for (const goal of goals) {
      const campaign = goal.campaignId || null;

      const startDate = campaign?.startDate
        ? new Date(campaign.startDate)
        : defaultStartDate;

      const endDate = campaign?.endDate
        ? new Date(campaign.endDate)
        : defaultEndDate;

      const dateRule = campaign?.dateRule || 'closed_only';

  const baseFilter = {
  $and: [
    {
      $or: [
        {
          status: 10
        },
        {
          'rawData.status': 10
        }
      ]
    },
    {
      $or: [
        {
          closedTime: {
            $gte: startDate,
            $lt: endDate
          }
        },
        {
          'rawData.closedTime': {
            $gte: startDate,
            $lt: endDate
          }
        }
      ]
    }
  ]
};

if (goal.sector?.toLowerCase() === 'transportes') {
  baseFilter['products.name'] = {
    $regex: 'transporte rodoviário',
    $options: 'i'
  };
} else if (
  goal.sector?.toLowerCase() !== 'geral' &&
  goal.userName
) {
  const cleanNameParts = String(goal.userName)
  .replace(/\s+/g, ' ')
  .trim()
  .split(' ');

const cleanName = cleanNameParts
  .filter((word, index) => {
    if (index === 0) return true;

    return (
      word.toLowerCase() !==
      cleanNameParts[index - 1].toLowerCase()
    );
  })
  .join(' ');

  const escapedName = cleanName
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');

  const nameRegex = {
    $regex: `^\\s*${escapedName}\\s*$`,
    $options: 'i'
  };

  baseFilter.$and.push({
    $or: [
      {
        'assignee.name': nameRegex
      },
      {
        'rawData.assignee.name': nameRegex
      }
    ]
  });
}
      if (goal.product) {
        baseFilter['products.name'] = {
          $regex: goal.product,
          $options: 'i'
        };
      }

      if (goal.source) {
        baseFilter['sources.name'] = {
          $regex: goal.source,
          $options: 'i'
        };
      }
    const estimatedLeads = await Lead.find({
      ...baseFilter,
      status: 0,
      closedTime: {
      $gte: startDate,
      $lte: endDate
    }
    }).lean();


    const actual = await Lead.aggregate([
  { $match: baseFilter },
  {
    $group: {
      _id: null,
      revenue: {
  $sum: {
    $ifNull: [
      '$value.amount',
      {
        $ifNull: [
          '$rawData.value.amount',
          0
        ]
      }
    ]
  }
},
      leads: { $sum: 1 },
      won: { $sum: 1 }
    }
  }
]);

      const revenue = actual[0]?.revenue || 0;
      const leads = actual[0]?.leads || 0;
      const won = actual[0]?.won || 0;
      const meetings = 0;

      const estimatedRevenue = estimatedLeads.reduce(
        (sum, lead) => sum + Number(lead.value?.amount || 0),
        0
        );

        
      // ========================================
      // FILTRO PARA LEADS
      // ========================================

      const leadsFilter = {
        ...baseFilter
      };

      if (dateRule === 'created_only') {
        leadsFilter.createdTime = {
          $gte: startDate,
          $lte: endDate
        };
      }

      if (dateRule === 'closed_only') {
        leadsFilter.closedTime = {
          $gte: startDate,
          $lte: endDate
        };
      }

      if (dateRule === 'created_and_closed') {
        leadsFilter.createdTime = {
          $gte: startDate,
          $lte: endDate
        };

        leadsFilter.closedTime = {
          $gte: startDate,
          $lte: endDate
        };
      }

      // ========================================
      // FILTRO PARA WON / RECEITA
      // ========================================

      const wonFilter = {
        ...baseFilter,
        status: 10
      };

      if (dateRule === 'created_only') {
        wonFilter.createdTime = {
          $gte: startDate,
          $lte: endDate
        };
      }

      if (dateRule === 'closed_only') {
        wonFilter.closedTime = {
          $gte: startDate,
          $lte: endDate
        };
      }

      if (dateRule === 'created_and_closed') {
        wonFilter.createdTime = {
          $gte: startDate,
          $lte: endDate
        };

        wonFilter.closedTime = {
          $gte: startDate,
          $lte: endDate
        };
      }

      const actualLeads = await Lead.countDocuments(leadsFilter);
      const actualWon = await Lead.countDocuments(wonFilter);

      const revenueResult = await Lead.aggregate([
        {
          $match: {
            ...wonFilter,
            'value.amount': { $type: 'number' }
          }
        },
        {
          $group: {
            _id: null,
            actualRevenue: {
              $sum: '$value.amount'
            }
          }
        }
      ]);

      const actualRevenue = revenueResult[0]?.actualRevenue || 0;

      results.push({
        goal,

        campaign: campaign
          ? {
              _id: campaign._id,
              name: campaign.name,
              startDate: campaign.startDate,
              endDate: campaign.endDate,
              dateRule: campaign.dateRule
            }
          : null,

        periodRange: {
          startDate,
          endDate,
          dateRule
        },

        actual: {
          revenue,
          estimatedRevenue,
          leads,
          won,
          meetings
        },

        achievement: {
          revenuePercent: goal.targetRevenue > 0
            ? (actualRevenue / goal.targetRevenue) * 100
            : 0,

          leadsPercent: goal.targetLeads > 0
            ? (actualLeads / goal.targetLeads) * 100
            : 0,

          wonPercent: goal.targetWon > 0
            ? (actualWon / goal.targetWon) * 100
            : 0,

          meetingsPercent: goal.targetMeetings > 0
            ? 0
            : 0
        }
      });
    }

    res.json({
      sucesso: true,
      period,
      totalGoals: goals.length,
      results
    });

  } catch (error) {
    console.error('ERRO GOALS ACHIEVEMENT:', error.message);

    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

app.get('/api/debug/closer-sales', async (req, res) => {
  try {
    const searchName = String(req.query.name || '')
      .replace(/\s+/g, ' ')
      .trim();

    if (!searchName) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Informe o nome. Exemplo: ?name=Alba'
      });
    }

    const startDate = new Date(
      Date.UTC(2026, 5, 1, 3, 0, 0, 0)
    );

    const endDate = new Date(
      Date.UTC(2026, 6, 1, 3, 0, 0, 0)
    );

    const leads = await Lead.find({
      $and: [
        {
          $or: [
            {
              'assignee.name': {
                $regex: searchName,
                $options: 'i'
              }
            },
            {
              'rawData.assignee.name': {
                $regex: searchName,
                $options: 'i'
              }
            }
          ]
        },
        {
          $or: [
            {
              closedTime: {
                $gte: startDate,
                $lt: endDate
              }
            },
            {
              'rawData.closedTime': {
                $gte: startDate,
                $lt: endDate
              }
            },
            {
              modifiedTime: {
                $gte: startDate,
                $lt: endDate
              }
            }
          ]
        }
      ]
    })
      .select({
        nutshell_id: 1,
        name: 1,
        status: 1,
        closedTime: 1,
        modifiedTime: 1,
        value: 1,
        assignee: 1,
        rawData: 1
      })
      .sort({
        modifiedTime: -1
      })
      .lean();

    const formatted = leads.map((lead) => ({
      nutshell_id: lead.nutshell_id,
      name: lead.name,

      status: lead.status,
      rawStatus: lead.rawData?.status,

      assignee:
        lead.assignee?.name || null,

      rawAssignee:
        lead.rawData?.assignee?.name || null,

      value:
        lead.value?.amount || null,

      rawValue:
        lead.rawData?.value?.amount || null,

      closedTime:
        lead.closedTime || null,

      rawClosedTime:
        lead.rawData?.closedTime || null,

      modifiedTime:
        lead.modifiedTime || null
    }));

    res.json({
      sucesso: true,
      routeVersion: 'debug-closer-sales-v1',
      searchName,
      period: {
        startDate,
        endDate
      },
      total: formatted.length,
      leads: formatted
    });
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

app.get('/api/debug/activities/:name', async (req, res) => {
  try {
    const searchName = String(req.params.name || '')
      .replace(/\s+/g, ' ')
      .trim();

    const lead = await Lead.findOne({
      'assignee.name': {
        $regex: searchName,
        $options: 'i'
      },
      activities: {
        $exists: true,
        $ne: []
      }
    })
      .select({
        nutshell_id: 1,
        name: 1,
        assignee: 1,
        activities: 1,
        activitiesSyncedAt: 1
      })
      .lean();

    res.json({
      sucesso: true,
      searchName,
      encontrada: Boolean(lead),
      lead: lead
        ? {
            nutshell_id: lead.nutshell_id,
            name: lead.name,
            assignee: lead.assignee?.name,
            activitiesSyncedAt:
              lead.activitiesSyncedAt || null,
            totalActivities:
              Array.isArray(lead.activities)
                ? lead.activities.length
                : 0,
            firstActivities:
              Array.isArray(lead.activities)
                ? lead.activities.slice(0, 5)
                : []
          }
        : null
    });
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

app.get('/api/audit/goals-achievement-detail', async (req, res) => {
  try {
    const { period, userName, sector = 'closer' } = req.query;

    if (!period) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Informe o period. Exemplo: ?period=2026-07'
      });
    }

    const [year, month] = period.split('-').map(Number);

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const normalize = (text) =>
      String(text || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    const expectedClosers = [
      'Gabriel Lopes',
      'Edson da Silva Bomfim Júnior',
      'Alba Danielly Rezende Lima',
      'Fábio Souza',
      'Giovanna Fernandes',
      'Pedro Scarillo',
      'Luiza Carvalho',
      'Fabiane Carvalho Nascimento',
      'Beatriz Costa',
      'Marcus Vinicius Dias Santana'
    ];

    const goalFilter = {
      period
    };

    if (sector) {
      goalFilter.sector = sector;
    }

    if (userName) {
      goalFilter.userName = {
        $regex: userName,
        $options: 'i'
      };
    }

    const goals = await Goal.find(goalFilter).lean();

    const goalsByName = new Set(
      goals.map((goal) => normalize(goal.userName))
    );

    const missingGoals = expectedClosers.filter(
      (name) => !goalsByName.has(normalize(name))
    );

    const details = [];

    for (const goal of goals) {
      const cleanName = String(goal.userName || '')
        .replace(/\s+/g, ' ')
        .trim();

      const assigneeRegex = new RegExp(
        `^\\s*${cleanName
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          .replace(/\s+/g, '\\s+')}\\s*$`,
        'i'
      );

      const filter = {
        status: 10,
        closedTime: {
          $gte: startDate,
          $lte: endDate
        },
        'assignee.name': assigneeRegex
      };

      const leads = await Lead.find(filter)
        .select({
          nutshell_id: 1,
          name: 1,
          status: 1,
          value: 1,
          closedTime: 1,
          modifiedTime: 1,
          assignee: 1,
          owner: 1,
          primaryAccount: 1,
          stageset: 1,
          milestone: 1,
          products: 1,
          sources: 1,
          htmlUrl: 1,
          rawData: 1,
          synced_at: 1
        })
        .sort({ closedTime: -1 })
        .lean();

      const totalRevenue = leads.reduce(
        (sum, lead) => sum + Number(lead.value?.amount || 0),
        0
      );

      details.push({
        goal: {
          userName: goal.userName,
          sector: goal.sector,
          targetRevenue: goal.targetRevenue,
          period: goal.period
        },
        summary: {
          totalLeadsWon: leads.length,
          totalRevenue
        },
        leads: leads.map((lead) => ({
          nutshell_id: lead.nutshell_id,
          name: lead.name,
          status: lead.status,
          value: lead.value?.amount || 0,
          closedTime: lead.closedTime,
          modifiedTime: lead.modifiedTime,
          assignee: lead.assignee?.name,
          owner: lead.owner?.name,
          account: lead.primaryAccount?.name,
          pipeline: lead.stageset?.name || lead.rawData?.stageset?.name,
          milestone: lead.milestone?.name || lead.rawData?.milestone?.name,
          products: lead.products?.map((product) => product.name) || [],
          sources: lead.sources?.map((source) => source.name) || [],
          htmlUrl: lead.htmlUrl || lead.rawData?.htmlUrl,
          synced_at: lead.synced_at
        }))
      });
    }

    res.json({
      sucesso: true,
      period,
      range: {
        startDate,
        endDate
      },
      filters: {
        sector,
        userName: userName || null
      },
      totalGoalsFound: goals.length,
      missingGoals,
      details
    });

  } catch (error) {
    console.error('ERRO AUDIT GOALS ACHIEVEMENT:', error);

    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

async function getRoadToGloryProgress(req, res) {
  try {
    const start = new Date('2026-07-31T03:00:00.000Z');
    const end = new Date('2026-08-01T02:59:59.999Z');

    const limitMiles = 6000;
    const campaignTag = 'Road to the Glory - Agosto';

    const normalizeName = (value) =>
      String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    const teams = {
  redbull: [
    'alba danielly rezende lima',
    'fabiane carvalho nascimento',
    'gisele santos gama'
  ],

  mercedes: [
    'fabio souza',
    'edson da silva bomfim junior',
    'guilherme velloso',
    'leticia barbosa'
  ],

  ferrari: [
    'giovanna fernandes',
    'pedro scarillo',
    'luma farias silva santos',
    'luiza carvalho'
  ]
};
    const result = {
      redbull: {
        team: 'Red Bull',
        miles: 0
      },

      mercedes: {
        team: 'Mercedes',
        miles: 0
      },

      ferrari: {
        team: 'Ferrari',
        miles: 0
      }
    };

    const teamByUser = {};

Object.entries(teams).forEach(([teamKey, users]) => {
  users.forEach((user) => {
    teamByUser[normalizeName(user)] = teamKey;
  });
});
    const isInsidePeriod = (dateValue) => {
      if (!dateValue) return false;

      const date = new Date(dateValue);

      return (
        !Number.isNaN(date.getTime()) &&
        date >= start &&
        date <= end
      );
    };

    /*
     * Compara o dia no horário de Brasília.
     * Evita uma atividade à noite cair no dia
     * seguinte por causa do UTC.
     */
    const getBrazilDateKey = (dateValue) => {
      if (!dateValue) return null;

      const date = new Date(dateValue);

      if (Number.isNaN(date.getTime())) {
        return null;
      }

      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Sao_Paulo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(date);
    };

    const isSameBrazilDay = (dateA, dateB) => {
      const first = getBrazilDateKey(dateA);
      const second = getBrazilDateKey(dateB);

      return Boolean(
        first &&
        second &&
        first === second
      );
    };

    const getTeamFromNames = (names = []) => {
      for (const name of names) {
        const normalized = normalizeName(name);

        if (teamByUser[normalized]) {
          return {
            teamKey: teamByUser[normalized],
            userName: name
          };
        }
      }

      return {
        teamKey: null,
        userName: null
      };
    };

    const getLeadUser = (lead) => {
      return getTeamFromNames([
        lead.owner?.name,
        lead.rawData?.owner?.name,
        lead.assignee?.name,
        lead.rawData?.assignee?.name,
        lead.creator?.name,
        lead.rawData?.creator?.name,
        lead.createdBy?.name,
        lead.rawData?.createdBy?.name
      ]);
    };

    const getActivityDate = (activity) => {
      return (
        activity?.startTime ||
        activity?.dueTime ||
        activity?.createdTime ||
        activity?.modifiedTime ||
        activity?.logNote?.date ||
        activity?.logNote?.createdTime ||
        null
      );
    };

    const getActivityUser = (activity, lead) => {
      const activityUser = getTeamFromNames([
        activity?.user?.name,
        activity?.assignee?.name,
        activity?.owner?.name,
        activity?.createdBy?.name,
        activity?.logNote?.user?.name,
        activity?.rawData?.user?.name,
        activity?.rawData?.logNote?.user?.name
      ]);

      if (activityUser.teamKey) {
        return activityUser;
      }

      return getLeadUser(lead);
    };

    const isMeetingActivity = (activity) => {
  const activityName = normalizeName(
    activity?.name ||
    activity?.activityType?.name ||
    ''
  );

  const isMeeting =
    activityName.includes('reuniao agendada') ||
    activityName.includes('reuniao reagendada') ||
    activityName.includes('reuniao realizada') ||
    activityName.includes('meeting agendado') ||
    activityName.includes('scheduled meeting');

  const isCancelled =
    activityName.includes('cancelada') ||
    activityName.includes('cancelado');

  return isMeeting && !isCancelled;
};

    const hasMeetingStage = (lead) => {
      const milestoneName = normalizeName(
        lead.milestone?.name ||
        lead.rawData?.milestone?.name ||
        ''
      );

      return (
        milestoneName.includes('reuniao agendada') ||
        milestoneName.includes('reuniao reagendada')
      );
    };

    const hasExactCampaignTag = (lead) => {
      return (
        Array.isArray(lead.tags) &&
        lead.tags.some(
          (tag) =>
            normalizeName(tag) ===
            normalizeName(campaignTag)
        )
      );
    };

    /*
     * Não restringimos somente por createdTime,
     * porque reunião de lead antiga também conta.
     */
    const leads = await Lead.find({
      tags: {
        $elemMatch: {
          $regex: '^Road to the Glory - Junho$',
          $options: 'i'
        }
      }
    }).lean();

    const details = [];
    const ignored = [];

    for (const lead of leads) {
      if (!hasExactCampaignTag(lead)) {
        continue;
      }

      const createdDate =
        lead.createdTime ||
        lead.rawData?.createdTime ||
        null;

      const closedDate =
        lead.closedTime ||
        lead.rawData?.closedTime ||
        null;

      const isNewLead =
        isInsidePeriod(createdDate);

      const leadUser = getLeadUser(lead);

      const activities = Array.isArray(lead.activities)
        ? lead.activities
        : [];

      /*
       * Somente reuniões agendadas dentro
       * do período da campanha.
       */
      const meetingActivities = activities.filter(
        (activity) => {
          const activityDate =
            getActivityDate(activity);

          return (
            isMeetingActivity(activity) &&
            isInsidePeriod(activityDate)
          );
        }
      );

      /*
       * Não deixa a mesma atividade contar
       * mais de uma vez.
       */
      const uniqueMeetingActivities = [];
      const meetingActivityKeys = new Set();

      meetingActivities.forEach((activity, index) => {
        const activityDate =
          getActivityDate(activity);

        const key =
          activity.id ||
          activity._id ||
          [
            normalizeName(
              activity.name ||
              activity.activityType?.name
            ),
            activityDate,
            index
          ].join('|');

        if (!meetingActivityKeys.has(String(key))) {
          meetingActivityKeys.add(String(key));
          uniqueMeetingActivities.push(activity);
        }
      });

      const meetingEvents = [];

      uniqueMeetingActivities.forEach((activity) => {
        const activityDate =
          getActivityDate(activity);

        const activityUser =
          getActivityUser(activity, lead);

        if (!activityUser.teamKey) {
          ignored.push({
            leadId: lead.nutshell_id,
            leadName: lead.name,
            event: 'meeting_activity',
            activityName:
              activity.name ||
              activity.activityType?.name ||
              null,
            activityDate,
            reason:
              'Não foi possível identificar a equipe do usuário da atividade',
            activityUser:
              activity.user?.name ||
              activity.logNote?.user?.name ||
              null,
            owner: lead.owner?.name || null,
            assignee:
              lead.assignee?.name || null
          });

          return;
        }

        meetingEvents.push({
          source: 'activity',
          date: activityDate,
          teamKey: activityUser.teamKey,
          userName: activityUser.userName,
          activityId:
            activity.id ||
            activity._id ||
            null,
          activityName:
            activity.name ||
            activity.activityType?.name ||
            null
        });
      });

      /*
       * Se nenhuma atividade de reunião foi
       * encontrada, usa o stage Reunião Agendada.
       */
      if (
        meetingEvents.length === 0 &&
        hasMeetingStage(lead)
      ) {
        const stageDate =
          lead.milestone?.modifiedTime ||
          lead.rawData?.milestone?.modifiedTime ||
          lead.modifiedTime ||
          lead.rawData?.modifiedTime ||
          null;

        if (
          isInsidePeriod(stageDate) &&
          leadUser.teamKey
        ) {
          meetingEvents.push({
            source: 'stage',
            date: stageDate,
            teamKey: leadUser.teamKey,
            userName: leadUser.userName,
            activityId: null,
            activityName:
              lead.milestone?.name ||
              lead.rawData?.milestone?.name ||
              'Reunião Agendada'
          });
        }
      }

      const sameDayMeeting = meetingEvents.find(
        (meeting) =>
          isNewLead &&
          isSameBrazilDay(
            createdDate,
            meeting.date
          )
      );

      /*
       * REGRA 1:
       * Lead nova + reunião no mesmo dia = 100.
       * Nesse caso não soma 10 + 50.
       */
      if (sameDayMeeting) {
        result[sameDayMeeting.teamKey].miles += 100;

        details.push({
          leadId: lead.nutshell_id,
          leadName: lead.name,
          event:
            'new_lead_meeting_same_day',
          miles: 100,
          team:
            result[sameDayMeeting.teamKey].team,
          user:
            sameDayMeeting.userName,
          source:
            sameDayMeeting.source,
          createdDate,
          meetingDate:
            sameDayMeeting.date
        });
      } else {
        /*
         * REGRA 2:
         * Lead nova = 10.
         */
        if (isNewLead) {
          if (leadUser.teamKey) {
            result[leadUser.teamKey].miles += 10;

            details.push({
              leadId: lead.nutshell_id,
              leadName: lead.name,
              event: 'new_lead',
              miles: 10,
              team:
                result[leadUser.teamKey].team,
              user:
                leadUser.userName,
              createdDate
            });
          } else {
            ignored.push({
              leadId: lead.nutshell_id,
              leadName: lead.name,
              event: 'new_lead',
              reason:
                'Lead nova sem usuário associado a uma equipe',
              owner:
                lead.owner?.name || null,
              assignee:
                lead.assignee?.name || null
            });
          }
        }

        /*
         * REGRA 3:
         * Cada reunião agendada = 50.
         *
         * Mesmo uma lead antiga pode pontuar.
         */
        meetingEvents.forEach((meeting) => {
          result[meeting.teamKey].miles += 50;

          details.push({
            leadId: lead.nutshell_id,
            leadName: lead.name,
            event: 'scheduled_meeting',
            miles: 50,
            team:
              result[meeting.teamKey].team,
            user:
              meeting.userName,
            source:
              meeting.source,
            meetingDate:
              meeting.date,
            activityName:
              meeting.activityName
          });
        });
      }

      const isWon =
        Number(lead.status) === 10;

      const closedInPeriod =
        isInsidePeriod(closedDate);

      /*
       * REGRA 4:
       * Lead nova fechada no mesmo dia = +200.
       */
      if (
        isWon &&
        isNewLead &&
        closedInPeriod &&
        isSameBrazilDay(
          createdDate,
          closedDate
        )
      ) {
        if (leadUser.teamKey) {
          result[leadUser.teamKey].miles += 200;

          details.push({
            leadId: lead.nutshell_id,
            leadName: lead.name,
            event: 'new_lead_won_same_day',
            miles: 200,
            team:
              result[leadUser.teamKey].team,
            user:
              leadUser.userName,
            createdDate,
            closedDate
          });
        }
      }

      /*
       * REGRA 5:
       * 1 milha por cada R$ 100 vendidos.
       */
      if (
        isWon &&
        closedInPeriod
      ) {
        const amount = Number(
          lead.value?.amount ||
          lead.rawData?.value?.amount ||
          0
        );

        const saleMiles =
          Math.floor(amount / 100);

        if (
          saleMiles > 0 &&
          leadUser.teamKey
        ) {
          result[leadUser.teamKey].miles +=
            saleMiles;

          details.push({
            leadId: lead.nutshell_id,
            leadName: lead.name,
            event: 'sale_value',
            miles: saleMiles,
            amount,
            team:
              result[leadUser.teamKey].team,
            user:
              leadUser.userName,
            closedDate
          });
        }
      }
    }

    const manualAdjustments = {
  ferrari: 350,
  redbull:760,
  mercedes:460
};

// aplica ajuste ANTES do ranking
Object.keys(result).forEach((team) => {
  result[team].miles =
    (result[team].miles || 0) +
    (manualAdjustments[team] || 0);
});

    const ranking = Object.values(result)
      .sort(
        (first, second) =>
          second.miles - first.miles
      )
      .map((item, index) => ({
        ...item,
        position: index + 1,
        percent: Math.min(
          (item.miles / limitMiles) * 100,
          100
        ),
        milesFormatted:
          item.miles.toLocaleString('pt-BR')
      }));

    const totalMiles = ranking.reduce(
      (sum, item) =>
        sum + Number(item.miles || 0),
      0
    );

    res.json({
      sucesso: true,
      routeVersion:
        'road-to-glory-unified-v1',

      period: {
        start,
        end,
        timezone:
          'America/Sao_Paulo'
      },

      rules: {
        sale:
          '1 milha a cada R$ 100',
        newLead: 10,
        scheduledMeeting: 50,
        newLeadMeetingSameDay: 100,
        newLeadWonSameDayBonus: 200
      },

      limit: limitMiles,
      totalMiles,
      totalMilesFormatted:
        totalMiles.toLocaleString('pt-BR'),

      podium: {
        first: ranking[0],
        second: ranking[1],
        third: ranking[2]
      },

      ranking,

      summary: {
        campaignLeads: leads.length,
        scoredEvents: details.length,
        ignoredEvents: ignored.length
      },

      details,
      ignored
    });
  } catch (error) {
    console.error(
      'ERRO ROAD TO GLORY:',
      error
    );

    res.status(500).json({
      sucesso: false,
      routeVersion:
        'road-to-glory-unified-v1',
      erro: error.message
    });
  }
}

/*
 * As duas URLs utilizam exatamente
 * a mesma função e retornam os mesmos pontos.
 */
app.get(
  '/api/campaigns/road-to-glory/progress',
  getRoadToGloryProgress
);

app.get(
  '/api/campaigns/road-to-glory/progress-v2',
  getRoadToGloryProgress
);


app.get('/api/audit/road-to-glory-summary', async (req, res) => {
  const leads = await Lead.find({
    tags: { $in: ['Road to the Glory - Junho'] }
  }).select('name assignee.name tags milestone.name stageset.name activities value status').lean();

  const normalizeName = (name) =>
    String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

  const summary = leads.map((lead) => ({
    lead: lead.name,
    assignee: lead.assignee?.name,
    milestone: lead.milestone?.name,
    pipeline: lead.stageset?.name,
    activitiesCount: lead.activities?.length || 0,
    meetingActivities: (lead.activities || []).filter((a) =>
      normalizeName(a?.name || a?.activityType?.name || '').includes('reuniao')
    ).map((a) => ({
      name: a.name,
      startTime: a.startTime
    })),
    tags: lead.tags
  }));

  res.json({
    sucesso: true,
    total: summary.length,
    summary
  });
});

app.get('/api/sync/nutshell/road-to-glory-open-date', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const maxPages = Number(req.query.maxPages) || 20;

    let page = 1;
    let checked = 0;
    let matched = 0;
    let synced = 0;

    while (page <= maxPages) {
      const nutshellResponse = await axios.post(
        'https://app.nutshell.com/api/v1/json',
        {
          method: 'findLeads',
          params: {
            query: 'Road to the Glory - Junho',
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

      const leads = nutshellResponse.data.result || [];
      if (leads.length === 0) break;

      for (const lead of leads) {
        checked++;

        const detailResponse = await axios.post(
          'https://app.nutshell.com/api/v1/json',
          {
            method: 'getLead',
            params: { leadId: lead.id },
            id: 1
          },
          {
            auth: {
              username: NUTSHELL_EMAIL,
              password: NUTSHELL_API_KEY
            }
          }
        );
    const fullLead = detailResponse.data.result;

    if (!fullLead) continue;

    const hasRoadTag = (fullLead.tags || []).some((tag) => {
      const normalizedTag = String(tag || '').toLowerCase();

      return (
        normalizedTag.includes('road to the glory - junho') 
       );
     });

    if (!hasRoadTag) continue;

    matched++;

    await saveFullLead(fullLead);

    synced++;
    }

      page++;
    }

    res.json({
      sucesso: true,
      checked,
      matched,
      synced,
      pagesProcessed: page - 1
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.response?.data || error.message
    });
  }
});

app.get('/api/audit/road-to-glory-period', async (req, res) => {
  try {
    const start = new Date('2026-07-31T03:00:00.000Z');
    const end = new Date('2026-08-01T02:59:59.999Z');

    const leads = await Lead.find({
  tags: {
    $in: [

      'Road to the Glory - Agosto'
    ]
  },
  $or: [
    { createdTime: { $gte: start, $lte: end } },
    { modifiedTime: { $gte: start, $lte: end } },
    { closedTime: { $gte: start, $lte: end } }
  ]
})
      .select('name assignee.name tags createdTime modifiedTime closedTime milestone.name stageset.name status value products.name')
      .lean();

    res.json({
      sucesso: true,
      total: leads.length,
      leads
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

app.get('/api/audit/redbull-meetings', async (req, res) => {
  const start = new Date('2026-07-31T03:00:00.000Z');
  const end = new Date('2026-08-01T02:59:59.999Z');

  const normalizeName = (name) =>
    String(name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

  const leads = await Lead.find({
    'assignee.name': {
      $in: [
        'Alba Danielly Rezende Lima',
        'Fabiane Carvalho Nascimento',
        'Gisele Santos Gama'
      ]
    },
    tags: {
      $in: [
        
        'Road to the Glory - Junho'
      ]
    }
  }).lean();

  const audit = leads.map((lead) => {
    const commercialProcess = Array.isArray(lead.processes)
      ? lead.processes.find((process) =>
          normalizeName(process.name).includes('processo comercial') ||
          normalizeName(process.name).includes('novos negocios') ||
          normalizeName(process.name).includes('sdr')
        )
      : null;

    const openDate = commercialProcess?.startedTime
      ? new Date(commercialProcess.startedTime)
      : lead.createdTime
        ? new Date(lead.createdTime)
        : null;

    const meetings = (lead.activities || [])
      .filter((activity) =>
        normalizeName(activity?.name || activity?.activityType?.name || '').includes('reuniao')
      )
      .map((activity) => ({
        name: activity.name,
        startTime: activity.startTime,
        sameOpenDate:
          openDate &&
          activity.startTime &&
          openDate.toISOString().slice(0, 10) ===
            new Date(activity.startTime).toISOString().slice(0, 10),
        inPeriod:
          activity.startTime &&
          new Date(activity.startTime) >= start &&
          new Date(activity.startTime) <= end
      }));

    return {
      lead: lead.name,
      assignee: lead.assignee?.name,
      milestone: lead.milestone?.name,
      openDate,
      openInPeriod: openDate && openDate >= start && openDate <= end,
      meetings
    };
  });

  res.json({ sucesso: true, total: audit.length, audit });
});

app.get('/api/audit/road-to-glory-points', async (req, res) => {
  try {
    const start = new Date('2026-07-31T03:00:00.000Z');
    const end = new Date('2026-08-01T02:59:59.999Z');

    const normalizeName = (name) =>
      String(name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    const leads = await Lead.find({
      tags: {
        $in: [
         
          'Road to the Glory - Agosto'
        ]
      }
    }).lean();

    const audit = leads.map((lead) => {
      const commercialProcess = Array.isArray(lead.processes)
        ? lead.processes.find((process) =>
            normalizeName(process.name).includes('processo comercial') ||
            normalizeName(process.name).includes('novos negocios')
          )
        : null;

      const openDate = commercialProcess?.startedTime
        ? new Date(commercialProcess.startedTime)
        : lead.createdTime
          ? new Date(lead.createdTime)
          : null;

      return {
        nutshell_id: lead.nutshell_id,
        name: lead.name,
        assignee: lead.assignee?.name,
        tags: lead.tags,
        status: lead.status,
        milestone: lead.milestone?.name,
        stageset: lead.stageset?.name,
        openDate,
        createdTime: lead.createdTime,
        modifiedTime: lead.modifiedTime,
        closedTime: lead.closedTime,
        value: lead.value?.amount || 0,
        products: lead.products?.map((p) => p.name) || []
      };
    });

    res.json({
      sucesso: true,
      total: audit.length,
      audit
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

app.get(
  '/api/sync/nutshell/road-to-glory-reconcile',
  async (req, res) => {
    try {
      const dryRun =
        String(req.query.dryRun || 'true')
          .toLowerCase() !== 'false';

      const campaignLeads = await Lead.find({
        tags: ROAD_TO_GLORY_TAG
      })
        .select({
          nutshell_id: 1,
          name: 1,
          assignee: 1,
          tags: 1
        })
        .lean();

      let checked = 0;
      let valid = 0;
      let stale = 0;
      let cleaned = 0;
      let errors = 0;

      const details = [];

      for (const lead of campaignLeads) {
        checked++;

        try {
          const response = await axios.post(
            'https://app.nutshell.com/api/v1/json',
            {
              method: 'getLead',
              params: {
                leadId: lead.nutshell_id
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

          const nutshellLead =
            response.data?.result || null;

          const stillExists =
            Boolean(nutshellLead);

          const stillHasTag =
            stillExists &&
            hasRoadToGloryTag(
              nutshellLead.tags || []
            );

          if (stillExists && stillHasTag) {
            valid++;

            details.push({
              nutshell_id: lead.nutshell_id,
              name: lead.name,
              assignee:
                lead.assignee?.name || null,
              status: 'valid'
            });

            continue;
          }

          stale++;

          details.push({
            nutshell_id: lead.nutshell_id,
            name: lead.name,
            assignee:
              lead.assignee?.name || null,
            status: stillExists
              ? 'tag_removed_in_nutshell'
              : 'lead_not_found_in_nutshell',
            action: dryRun
              ? 'would_remove_campaign_tag'
              : 'campaign_tag_removed'
          });

          if (!dryRun) {
            const updateResult =
              await Lead.updateOne(
                {
                  nutshell_id:
                    lead.nutshell_id
                },
                {
                  $pull: {
                    tags:
                      ROAD_TO_GLORY_TAG
                  },

                  $set: {
                    activities: [],
                    campaign_reconciled_at:
                      new Date()
                  },

                  $unset: {
                    activities_period: '',
                    activities_synced_at: ''
                  }
                }
              );

            if (
              updateResult.modifiedCount > 0
            ) {
              cleaned++;
            }
          }
        } catch (leadError) {
          /*
           * Quando uma lead foi apagada, o Nutshell
           * pode responder com erro em vez de result null.
           * Nesse caso consideramos a referência obsoleta.
           */

          stale++;

          details.push({
            nutshell_id: lead.nutshell_id,
            name: lead.name,
            assignee:
              lead.assignee?.name || null,
            status:
              'nutshell_request_failed',
            nutshellError:
              leadError.response?.data ||
              leadError.message,
            action: dryRun
              ? 'would_remove_campaign_tag'
              : 'campaign_tag_removed'
          });

          if (!dryRun) {
            const updateResult =
              await Lead.updateOne(
                {
                  nutshell_id:
                    lead.nutshell_id
                },
                {
                  $pull: {
                    tags:
                      ROAD_TO_GLORY_TAG
                  },

                  $set: {
                    activities: [],
                    campaign_reconciled_at:
                      new Date()
                  },

                  $unset: {
                    activities_period: '',
                    activities_synced_at: ''
                  }
                }
              );

            if (
              updateResult.modifiedCount > 0
            ) {
              cleaned++;
            }
          }

          errors++;
        }

        await sleep(150);
      }

      res.json({
        sucesso: true,
        dryRun,
        tag: ROAD_TO_GLORY_TAG,
        checked,
        valid,
        stale,
        cleaned,
        errors,
        details
      });
    } catch (error) {
      console.error(
        'ERRO ROAD TO GLORY RECONCILE:',
        error.response?.data ||
          error.message
      );

      res.status(500).json({
        sucesso: false,
        erro:
          error.response?.data ||
          error.message
      });
    }
  }
);

app.get('/api/test/nutshell/activity-detail', async (req, res) => {
  try {
    const activityId = Number(req.query.activityId);

    const response = await axios.post(
      'https://app.nutshell.com/api/v1/json',
      {
        method: 'getActivity',
        params: {
          activityId
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

    res.json({
      sucesso: true,
      result: response.data.result
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.response?.data || error.message
    });
  }
});

app.get(
  '/api/test/nutshell/search-road-to-glory',
  async (req, res) => {
    try {
      const campaignTag =
        'Road to the Glory - Junho';

      const response = await axios.post(
        'https://app.nutshell.com/api/v1/json',
        {
          method: 'searchLeads',
          params: {
            string: campaignTag,
            limit: 100
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

      res.json({
        sucesso: true,
        campaignTag,
        total:
          response.data.result?.length || 0,
        result:
          response.data.result || []
      });
    } catch (error) {
      res.status(500).json({
        sucesso: false,
        erro:
          error.response?.data ||
          error.message
      });
    }
  }
);

app.get(
  '/api/sync/nutshell/road-to-glory-activities',
  async (req, res) => {
    try {
      const campaignTag =
        'Road to the Glory - Junho';

      const limit = Math.min(
        Math.max(Number(req.query.limit) || 100, 1),
        100
      );

      const maxPagesPerLead = Math.min(
        Math.max(
          Number(req.query.pagesPerLead) || 5,
          1
        ),
        20
      );

      const campaignLeads = await Lead.find({
        tags: {
          $in: [campaignTag]
        }
      })
        .select(
          'nutshell_id name activities'
        )
        .lean();

      let checkedLeads = 0;
      let leadsWithActivities = 0;
      let totalActivities = 0;
      let meetingActivities = 0;
      let updatedLeads = 0;
      let errors = 0;

      const details = [];
      const errorDetails = [];

      const normalizeText = (value) =>
        String(value || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();

      const isMeetingActivity = (activity) => {
  const activityName = normalizeText(
    activity?.name ||
    activity?.activityType?.name ||
    ''
  );

  const isMeeting =
    activityName.includes('reuniao agendada') ||
    activityName.includes('reuniao reagendada') ||
    activityName.includes('reuniao realizada') ||
    activityName.includes('meeting agendado') ||
    activityName.includes('scheduled meeting');

  const isCancelled =
    activityName.includes('cancelada') ||
    activityName.includes('cancelado');

  return isMeeting && !isCancelled;
};
      const getActivityUser = (activity) => {
        return (
          activity?.user?.name ||
          activity?.logNote?.user?.name ||
          activity?.assignee?.name ||
          activity?.owner?.name ||
          activity?.createdBy?.name ||
          null
        );
      };

      const getActivityDate = (activity) => {
  
  return (
    activity?.createdTime ||
    activity?.modifiedTime ||
    activity?.startTime ||
    activity?.dueTime ||
    null
  );
};

      for (const campaignLead of campaignLeads) {
        checkedLeads++;

        const nutshellId =
          Number(campaignLead.nutshell_id);

        if (!nutshellId) {
          errors++;

          errorDetails.push({
            leadName:
              campaignLead.name,
            error:
              'Lead sem nutshell_id'
          });

          continue;
        }

        try {
          const activitiesById = new Map();

          /*
           * Preserva atividades que já estejam
           * salvas no MongoDB.
           */
          const existingActivities =
            Array.isArray(
              campaignLead.activities
            )
              ? campaignLead.activities
              : [];

          existingActivities.forEach(
            (activity) => {
              if (activity?.id) {
                activitiesById.set(
                  String(activity.id),
                  activity
                );
              }
            }
          );

          let pagesProcessed = 0;
          let activitiesFoundForLead = 0;

          for (
            let page = 1;
            page <= maxPagesPerLead;
            page++
          ) {
            const response =
              await axios.post(
                'https://app.nutshell.com/api/v1/json',
                {
                  method: 'findActivities',

                  params: {
                    /*
                     * Usa o ID interno da lead,
                     * por exemplo 103338.
                     */
                    query: {
                      leadId: nutshellId
                    },

                    limit,
                    page,

                    /*
                     * Solicita os objetos completos.
                     * Assim não precisamos chamar
                     * getActivity separadamente.
                     */
                    stubResponses: false
                  },

                  id: 1
                },
                {
                  auth: {
                    username:
                      NUTSHELL_EMAIL,

                    password:
                      NUTSHELL_API_KEY
                  }
                }
              );

            if (response.data?.error) {
              throw response.data;
            }

            const activities =
              Array.isArray(
                response.data?.result
              )
                ? response.data.result
                : [];

            if (activities.length === 0) {
              break;
            }

            pagesProcessed++;
            activitiesFoundForLead +=
              activities.length;

            activities.forEach(
              (activity) => {
                const activityKey =
                  String(
                    activity.id ||
                    [
                      activity.name,
                      getActivityDate(activity)
                    ].join('|')
                  );

                activitiesById.set(
                  activityKey,
                  activity
                );
              }
            );

            if (activities.length < limit) {
              break;
            }

            await new Promise(
              (resolve) =>
                setTimeout(resolve, 100)
            );
          }

          const savedActivities =
            Array.from(
              activitiesById.values()
            );

          const meetings =
            savedActivities.filter(
              isMeetingActivity
            );

          await Lead.updateOne(
            {
              nutshell_id: nutshellId
            },
            {
              $set: {
                activities:
                  savedActivities,

                activities_synced_at:
                  new Date()
              }
            }
          );

          updatedLeads++;
          totalActivities +=
            savedActivities.length;

          meetingActivities +=
            meetings.length;

          if (
            savedActivities.length > 0
          ) {
            leadsWithActivities++;
          }

          details.push({
            nutshell_id: nutshellId,
            leadName:
              campaignLead.name,

            pagesProcessed,

            activitiesFound:
              activitiesFoundForLead,

            activitiesSaved:
              savedActivities.length,

            meetingsFound:
              meetings.length,

            meetings:
              meetings.map(
                (activity) => ({
                  activityId:
                    activity.id,

                  name:
                    activity.name ||
                    activity
                      .activityType?.name ||
                    null,

                  date:
                    getActivityDate(
                      activity
                    ),

                  user:
                    getActivityUser(
                      activity
                    ),

                  status:
                    activity.status
                })
              )
          });

          await new Promise(
            (resolve) =>
              setTimeout(resolve, 120)
          );
        } catch (leadError) {
          errors++;

          errorDetails.push({
            nutshell_id:
              nutshellId,

            leadName:
              campaignLead.name,

            error:
              leadError.response?.data ||
              leadError.error ||
              leadError.message ||
              leadError
          });
        }
      }

      res.json({
        sucesso: true,

        routeVersion:
          'road-activities-by-lead-v1',

        campaignTag,

        campaignLeads:
          campaignLeads.length,

        checkedLeads,
        leadsWithActivities,
        totalActivities,
        meetingActivities,
        updatedLeads,
        errors,

        details,
        errorDetails
      });
    } catch (error) {
      const apiError =
        error.response?.data ||
        error;

      console.error(
        'ERRO SYNC ROAD ACTIVITIES:',
        apiError
      );

      res.status(500).json({
        sucesso: false,

        routeVersion:
          'road-activities-by-lead-v1',

        erro:
          apiError?.error ||
          apiError?.message ||
          apiError
      });
    }
  }
);

app.get('/api/audit/road-to-glory-activities', async (req, res) => {
  const leads = await Lead.find({
    tags: {
      $in: [
        
        'Road to the Glory - Junho'
      ]
    }
  })
    .select('nutshell_id name assignee.name milestone.name activities')
    .lean();

  res.json({
    sucesso: true,
    total: leads.length,
    withActivities: leads.filter((lead) => Array.isArray(lead.activities) && lead.activities.length > 0).length,
    sample: leads
      .filter((lead) => Array.isArray(lead.activities) && lead.activities.length > 0)
      .slice(0, 10)
  });
});

app.get(
  '/api/audit/road-to-glory-activity-users',
  async (req, res) => {
    try {
      const leads = await Lead.find({
        tags: {
          $in: [
            'Road to the Glory - Junho'
          ]
        }
      })
        .select(
          'nutshell_id name assignee.name activities'
        )
        .lean();

      const users = {};
      const meetings = [];

      const normalizeText = (value) =>
        String(value || '')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
          .toLowerCase();

      for (const lead of leads) {
        const activities =
          Array.isArray(lead.activities)
            ? lead.activities
            : [];

        for (const activity of activities) {
          const activityName =
            activity?.name ||
            activity?.activityType?.name ||
            '';

          const normalizedName =
            normalizeText(activityName);

          const isMeeting =
            normalizedName.includes(
              'reuniao agendada'
            ) ||
            normalizedName.includes(
              'reuniao reagendada'
            ) ||
            normalizedName.includes(
              'scheduled meeting'
            );

          if (!isMeeting) {
            continue;
          }

          const user =
            activity?.user?.name ||
            activity?.logNote?.user?.name ||
            activity?.assignee?.name ||
            activity?.owner?.name ||
            lead.assignee?.name ||
            'Sem usuário';

          users[user] =
            (users[user] || 0) + 1;

          meetings.push({
            leadId: lead.nutshell_id,
            leadName: lead.name,
            activityId: activity.id,
            activityName,
            user,
            createdTime:
              activity.createdTime || null,
            startTime:
              activity.startTime || null,
            status:
              activity.status
          });
        }
      }

      res.json({
        sucesso: true,
        totalMeetingActivities:
          meetings.length,
        users,
        meetings
      });
    } catch (error) {
      res.status(500).json({
        sucesso: false,
        erro: error.message
      });
    }
  }
);

app.get('/api/test/nutshell/activities', async (req, res) => {
  try {
    const requestedLeadId = Number(req.query.leadId);

    if (!requestedLeadId) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Informe o leadId na URL.'
      });
    }

    const response = await axios.post(
      'https://app.nutshell.com/api/v1/json',
      {
        method: 'findActivities',
        params: {
          query: {},
          limit: 100
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

    const activities = Array.isArray(
      response.data?.result
    )
      ? response.data.result
      : [];

    const details = [];

    for (const activity of activities) {
      try {
        const detailResponse = await axios.post(
          'https://app.nutshell.com/api/v1/json',
          {
            method: 'getActivity',
            params: {
              activityId: activity.id
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

        const detail =
          detailResponse.data?.result;

        if (!detail) continue;

        const possibleLeadIds = [
          detail?.lead?.id,
          detail?.relatedLead?.id,
          detail?.entity?.id,
          detail?.leadId,
          detail?.logNote?.lead?.id,
          detail?.relatedEntity?.id,
          detail?.record?.id
        ]
          .map((value) => Number(value))
          .filter(
            (value) =>
              Number.isFinite(value) &&
              value > 0
          );

        const belongsToRequestedLead =
          possibleLeadIds.includes(
            requestedLeadId
          );

        details.push({
          activityId: detail.id,
          name:
            detail.name ||
            detail.activityType?.name ||
            null,

          belongsToRequestedLead,

          possibleLeadIds,

          lead: detail.lead || null,
          relatedLead:
            detail.relatedLead || null,
          entity: detail.entity || null,
          relatedEntity:
            detail.relatedEntity || null,
          record: detail.record || null,

          startTime:
            detail.startTime || null,
          createdTime:
            detail.createdTime || null,
          modifiedTime:
            detail.modifiedTime || null,

          user:
            detail.logNote?.user?.name ||
            detail.user?.name ||
            detail.assignee?.name ||
            detail.owner?.name ||
            null
        });

        await new Promise((resolve) =>
          setTimeout(resolve, 80)
        );
      } catch (activityError) {
        details.push({
          activityId: activity.id,
          erro:
            activityError.response?.data ||
            activityError.message
        });
      }
    }

    const matched = details.filter(
      (item) =>
        item.belongsToRequestedLead
    );

    res.json({
      sucesso: true,
      requestedLeadId,
      checked: activities.length,
      matchedCount: matched.length,
      matched,
      samples: details.slice(0, 20)
    });
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro:
        error.response?.data ||
        error.message
    });
  }
});

app.get('/api/audit/road-to-glory', async (req, res) => {
  try {

    const leads = await Lead.find({
      tags: 'Road to the Glory - Junho'
    })
      .select({
        name: 1,
        assignee: 1,
        tags: 1,
        createdTime: 1,
        modifiedTime: 1,
        closedTime: 1,
        milestone: 1,
        stageset: 1,
        status: 1,
        value: 1,
        products: 1
      })
      .limit(50)
      .lean();

    res.json({
      sucesso: true,
      total: leads.length,
      leads
    });

  } catch (error) {

    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

async function syncForecastPeriod(
  startDateParam,
  endDateParam,
  maxPagesParam = 60
) {
  const start = new Date(`${startDateParam}T00:00:00.000`);
  const end = new Date(`${endDateParam}T23:59:59.999`);

  if (
    Number.isNaN(start.getTime()) ||
    Number.isNaN(end.getTime())
  ) {
    throw new Error('Datas inválidas. Utilize o formato YYYY-MM-DD.');
  }

  const limit = 500;
  const maxPages = Math.max(Number(maxPagesParam) || 60, 1);

  let page = 1;
  let totalChecked = 0;
  let totalMatched = 0;
  let totalSynced = 0;
  let totalErrors = 0;

  const details = [];

  while (page <= maxPages) {
    console.log(`Sync previsão mensal - página ${page}`);

    const nutshellResponse = await axios.post(
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

    const leads = nutshellResponse.data.result || [];

    if (leads.length === 0) {
      break;
    }

    for (const lead of leads) {
      totalChecked++;

      const status = Number(lead.status);

      const dueDate = lead.dueTime
        ? new Date(lead.dueTime)
        : null;

      const isActiveStatus = [0, 1].includes(status);

      const dueTimeInPeriod =
        dueDate &&
        !Number.isNaN(dueDate.getTime()) &&
        dueDate >= start &&
        dueDate <= end;

      if (!isActiveStatus || !dueTimeInPeriod) {
        continue;
      }

      totalMatched++;

      try {
        const detailResponse = await axios.post(
          'https://app.nutshell.com/api/v1/json',
          {
            method: 'getLead',
            params: {
              leadId: lead.id
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

        const fullLead = detailResponse.data.result;

        if (!fullLead) {
          details.push({
            nutshell_id: lead.id,
            name: lead.name,
            synced: false,
            reason: 'Lead não encontrada no getLead'
          });

          continue;
        }

        await saveFullLead(fullLead);

        totalSynced++;

        details.push({
          nutshell_id: fullLead.id,
          name: fullLead.name,
          status: fullLead.status,
          assignee: fullLead.assignee?.name || null,
          value: Number(fullLead.value?.amount || 0),
          estimatedValue: Number(
            fullLead.estimatedValue?.amount || 0
          ),
          dueTime: fullLead.dueTime || null,
          closedTime: fullLead.closedTime || null,
          synced: true
        });

        await sleep(120);
      } catch (leadError) {
        totalErrors++;

        details.push({
          nutshell_id: lead.id,
          name: lead.name,
          synced: false,
          error:
            leadError.response?.data ||
            leadError.message
        });
      }
    }

    page++;
  }

  return {
    startDate: startDateParam,
    endDate: endDateParam,
    statuses: [0, 1],
    dateField: 'dueTime',
    pagesProcessed: page - 1,
    totalChecked,
    totalMatched,
    totalSynced,
    totalErrors,
    details
  };
}

app.get(
  '/api/sync/nutshell/leads/forecast-period',
  async (req, res) => {
    try {
      const {
        startDate,
        endDate,
        maxPages = 60
      } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          sucesso: false,
          erro: 'Informe startDate e endDate no formato YYYY-MM-DD.'
        });
      }

      const result = await syncForecastPeriod(
        startDate,
        endDate,
        maxPages
      );

      res.json({
        sucesso: true,
        ...result
      });
    } catch (error) {
      console.error(
        'ERRO SYNC FORECAST PERIOD:',
        error.response?.data || error.message
      );

      res.status(500).json({
        sucesso: false,
        erro:
          error.response?.data ||
          error.message
      });
    }
  }
);

app.get('/api/reports/road-to-glory', async (req, res) => {
  try {
    const campaignTags = [
      'All Hands - Road to the Glory',
      'Road to the Glory - Maio',
      'Road to the Glory - Junho'
    ];

    const officialCampaignResults = {
  'All Hands - Road to the Glory': {
    totalLeads: 107,
    wonLeads: 4,
    openLeads: 26,
    lostLeads: 77,
    meetingsCount: 16,
    referenceLabel: '30/04/2026'
  },

  'Road to the Glory - Maio': {
    totalLeads: 140,
    wonLeads: 8,
    openLeads: 29,
    lostLeads: 103,
    meetingsCount: 57,
    referenceLabel:
      '25/05/2026 a 29/05/2026'
  },

  'Road to the Glory - Junho': {
    totalLeads: 65,
    wonLeads: 2,
    openLeads: 42,
    lostLeads: 21,
    meetingsCount: 12,
    referenceLabel: '30/06/2026'
  }
};

const campaignPeriods = {
  'All Hands - Road to the Glory': {
    start: new Date(
      '2026-04-30T03:00:00.000Z'
    ),
    end: new Date(
      '2026-05-01T03:00:00.000Z'
    )
  },

  'Road to the Glory - Maio': {
    start: new Date(
      '2026-05-25T03:00:00.000Z'
    ),
    end: new Date(
      '2026-05-31T03:00:00.000Z'
    )
  },

  'Road to the Glory - Junho': {
    start: new Date(
      '2026-06-30T03:00:00.000Z'
    ),
    end: new Date(
      '2026-07-01T03:00:00.000Z'
    )
  }
};

    /*
     * Composição dos times válida para os três períodos.
     */
    const teams = {
      ferrari: {
        name: 'Ferrari',
        members: [
          'giovanna fernandes',
          'pedro scarillo',
          'luma farias silva santos',
          'gabriel lopes'
        ]
      },

      mercedes: {
        name: 'Mercedes',
        members: [
          'edson da silva bomfim junior',
          'fabio souza',
          'guilherme velloso',
          'leticia barbosa'
        ]
      },

      redbull: {
        name: 'Red Bull',
        members: [
          'gisele santos gama',
          'alba danielly rezende lima',
          'luiza carvalho'
        ]
      }
    };

    /*
     * Pontuação manual.
     * Depois você poderá trocar somente estes números.
     */
    const manualPoints = {
      'All Hands - Road to the Glory': {
        ferrari: 0,
        mercedes: 0,
        redbull: 0
      },

      'Road to the Glory - Maio': {
        ferrari: 0,
        mercedes: 0,
        redbull: 0
      },

      'Road to the Glory - Junho': {
        ferrari: 0,
        mercedes: 0,
        redbull: 0
      }
    };

    function normalizeCampaignName(value) {
      return String(value || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    }

    function getTeamKeyByPerson(personName) {
      const normalizedPerson =
        normalizeCampaignName(personName);

      for (const [teamKey, teamData] of Object.entries(teams)) {
        if (teamData.members.includes(normalizedPerson)) {
          return teamKey;
        }
      }

      return null;
    }

    function createEmptyMetrics(teamKey) {
      return {
        teamKey,
        team: teams[teamKey].name,

        totalLeads: 0,
        openLeads: 0,
        wonLeads: 0,
        lostLeads: 0,
        canceledLeads: 0,

        activitiesCount: 0,
        meetingsCount: 0,
        wonRevenue: 0,


        conversionRate: 0,

        manualPoints: 0
      };
    }

  const scoreAdjustments =
  await CampaignScoreAdjustment.find({
    campaignTag: {
      $in: campaignTags
    }
  })
    .sort({
      createdAt: -1
    })
    .lean();

function getManualPoints(
  campaignTag,
  teamKey
) {
  return scoreAdjustments
    .filter(
      (adjustment) =>
        adjustment.campaignTag ===
          campaignTag &&
        adjustment.teamKey === teamKey
    )
    .reduce(
      (total, adjustment) =>
        total +
        Number(adjustment.points || 0),
      0
    );
}  

function getLeadOpenDate(lead) {
  const processes = Array.isArray(
    lead?.processes
  )
    ? lead.processes
    : [];

  const commercialProcess =
    processes.find((process) => {
      const processName =
        normalizeName(
          process?.name || ''
        );

      return (
        processName.includes(
          'processo comercial'
        ) ||
        processName.includes(
          'novos negocios'
        ) ||
        processName.includes('sdr')
      );
    });

  const rawDate =
    commercialProcess?.startedTime ||
    lead?.createdTime ||
    lead?.rawData?.createdTime ||
    null;

  if (!rawDate) {
    return null;
  }

  const date = new Date(rawDate);

  return Number.isNaN(date.getTime())
    ? null
    : date;
}

    const campaigns = [];

    for (const campaignTag of campaignTags) {
      const leads = await Lead.find({
        tags: {
          $elemMatch: {
            $regex: `^${campaignTag.replace(
              /[.*+?^${}()|[\]\\]/g,
              '\\$&'
            )}$`,
            $options: 'i'
          }
        }
      })
        .select({
          name: 1,
          status: 1,
          assignee: 1,
          tags: 1,
          activities: 1,
          value: 1,
          createdTime: 1,
          processes: 1,
          rawData: 1
        })
        .lean();

      const teamsResult = {
        ferrari: createEmptyMetrics('ferrari'),
        mercedes: createEmptyMetrics('mercedes'),
        redbull: createEmptyMetrics('redbull')
      };

      let totalLeads = 0;
      let openLeads = 0;
      let wonLeads = 0;
      let lostLeads = 0;
      let canceledLeads = 0;
      let activitiesCount = 0;
      let meetingsCount = 0;
      let wonRevenue = 0;

      for (const lead of leads) {
        const assigneeName =
          lead?.assignee?.name || '';

        const leadTeamKey =
          getTeamKeyByPerson(assigneeName);

        const campaignPeriod =
  campaignPeriods[campaignTag];

const openDate =
  getLeadOpenDate(lead);

const openedDuringCampaign =
  Boolean(
    campaignPeriod &&
    openDate &&
    openDate >= campaignPeriod.start &&
    openDate < campaignPeriod.end
  );

const isWon =
  Number(lead.status) === 10;

const leadRevenue =
  Number(
    lead?.value?.amount ||
    lead?.rawData?.value?.amount ||
    0
  );

if (
  isWon &&
  openedDuringCampaign
) {
  wonRevenue += leadRevenue;

  if (leadTeamKey) {
    teamsResult[
      leadTeamKey
    ].wonRevenue += leadRevenue;
  }
}

        /*
         * Leads sem responsável ou de pessoas fora dos três
         * times entram no total geral, mas não entram em um time.
         */
        totalLeads += 1;

        if (Number(lead.status) === 0) {
          openLeads += 1;
        }

        if (Number(lead.status) === 10) {
          wonLeads += 1;
        }

        if (Number(lead.status) === 11) {
          lostLeads += 1;
        }

        if (Number(lead.status) === 12) {
          canceledLeads += 1;
        }

        if (leadTeamKey) {
          const teamResult =
            teamsResult[leadTeamKey];

          teamResult.totalLeads += 1;

          if (Number(lead.status) === 0) {
            teamResult.openLeads += 1;
          }

          if (Number(lead.status) === 10) {
            teamResult.wonLeads += 1;
          }

          if (Number(lead.status) === 11) {
            teamResult.lostLeads += 1;
          }

          if (Number(lead.status) === 12) {
            teamResult.canceledLeads += 1;
          }
        }

        const activities =
          Array.isArray(lead.activities)
            ? lead.activities
            : [];

        for (const activity of activities) {
          activitiesCount += 1;

          const activityName =
            `${activity?.name || ''} ${
              activity?.activityType?.name || ''
            }`;

          const isMeeting =
            /reuni/i.test(activityName);

          if (isMeeting) {
            meetingsCount += 1;
          }

          /*
           * Atividades e reuniões são atribuídas a quem
           * realmente registrou a atividade.
           */
          const activityOwner =
            activity?.loggedBy?.name ||
            activity?.participants?.[0]?.name ||
            '';

          const activityTeamKey =
            getTeamKeyByPerson(activityOwner);

          if (activityTeamKey) {
            teamsResult[
              activityTeamKey
            ].activitiesCount += 1;

            if (isMeeting) {
              teamsResult[
                activityTeamKey
              ].meetingsCount += 1;
            }
          }
        }
      }

      for (const teamKey of Object.keys(teamsResult)) {
        const teamResult =
          teamsResult[teamKey];

        teamResult.conversionRate =
          teamResult.totalLeads > 0
            ? Number(
                (
                  (
                    teamResult.wonLeads /
                    teamResult.totalLeads
                  ) * 100
                ).toFixed(2)
              )
            : 0;

        teamResult.manualPoints =
          getManualPoints(
            campaignTag,
            teamKey
          );

        teamResult.automaticPoints = 0;

        teamResult.totalPoints =
          teamResult.automaticPoints +
          teamResult.manualPoints;
      }

      const teamsArray =
        Object.values(teamsResult);

      const rankingByPoints = [
        ...teamsArray
      ].sort((first, second) => {
        if (
          second.manualPoints !==
          first.manualPoints
        ) {
          return (
            second.manualPoints -
            first.manualPoints
          );
        }

        if (
          second.wonLeads !==
          first.wonLeads
        ) {
          return (
            second.wonLeads -
            first.wonLeads
          );
        }

        if (
          second.meetingsCount !==
          first.meetingsCount
        ) {
          return (
            second.meetingsCount -
            first.meetingsCount
          );
        }

        return (
          second.conversionRate -
          first.conversionRate
        );
      });

      const rankingByPerformance = [
        ...teamsArray
      ].sort((first, second) => {
        if (
          second.wonLeads !==
          first.wonLeads
        ) {
          return (
            second.wonLeads -
            first.wonLeads
          );
        }

        if (
          second.meetingsCount !==
          first.meetingsCount
        ) {
          return (
            second.meetingsCount -
            first.meetingsCount
          );
        }

        if (
          second.conversionRate !==
          first.conversionRate
        ) {
          return (
            second.conversionRate -
            first.conversionRate
          );
        }

        return (
          second.totalLeads -
          first.totalLeads
        );
      });

      campaigns.push({
        tag: campaignTag,

        totalLeads,
        openLeads,
        wonLeads,
        lostLeads,
        canceledLeads,


        wonRevenue,
        
        activitiesCount,
        meetingsCount,

        conversionRate:
          totalLeads > 0
            ? Number(
                (
                  (
                    wonLeads /
                    totalLeads
                  ) * 100
                ).toFixed(2)
              )
            : 0,

        teams: teamsArray,

        rankingByPoints:
          rankingByPoints.map(
            (team, index) => ({
              position: index + 1,
              ...team
            })
          ),

        rankingByPerformance:
          rankingByPerformance.map(
            (team, index) => ({
              position: index + 1,
              ...team
            })
          ),

        winnerByPoints:
          rankingByPoints[0] || null,

        bestPerformance:
          rankingByPerformance[0] || null
      });
    }

    const comparison = campaigns.map(
      (campaign) => ({
        tag: campaign.tag,

        totalLeads:
          campaign.totalLeads,

        openLeads:
          campaign.openLeads,

        wonLeads:
          campaign.wonLeads,

        lostLeads:
          campaign.lostLeads,

        activitiesCount:
          campaign.activitiesCount,

        meetingsCount:
          campaign.meetingsCount,

        conversionRate:
          campaign.conversionRate,

        bestTeam:
          campaign.bestPerformance
            ?.team || null
      })
    );

    const bestCampaignByLeads =
      [...campaigns].sort(
        (first, second) =>
          second.totalLeads -
          first.totalLeads
      )[0] || null;

    const bestCampaignByWon =
      [...campaigns].sort(
        (first, second) =>
          second.wonLeads -
          first.wonLeads
      )[0] || null;

    const bestCampaignByMeetings =
      [...campaigns].sort(
        (first, second) =>
          second.meetingsCount -
          first.meetingsCount
      )[0] || null;

    const bestCampaignByConversion =
      [...campaigns].sort(
        (first, second) =>
          second.conversionRate -
          first.conversionRate
      )[0] || null;

    res.json({
      sucesso: true,

      routeVersion:
        'road-to-glory-report-v1',

      tags: campaignTags,

      teams,

      campaigns,

      comparison,

      highlights: {
        highestLeadVolume:
          bestCampaignByLeads
            ? {
                tag:
                  bestCampaignByLeads.tag,
                value:
                  bestCampaignByLeads.totalLeads
              }
            : null,

        highestWon:
          bestCampaignByWon
            ? {
                tag:
                  bestCampaignByWon.tag,
                value:
                  bestCampaignByWon.wonLeads
              }
            : null,

        highestMeetings:
          bestCampaignByMeetings
            ? {
                tag:
                  bestCampaignByMeetings.tag,
                value:
                  bestCampaignByMeetings.meetingsCount
              }
            : null,

        bestConversion:
          bestCampaignByConversion
            ? {
                tag:
                  bestCampaignByConversion.tag,
                value:
                  bestCampaignByConversion.conversionRate
              }
            : null
      }
    });

  } catch (error) {
    console.error(
      'ERRO RELATÓRIO ROAD TO GLORY:',
      error
    );

    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

app.post(
  '/api/reports/road-to-glory/adjustments',
  async (req, res) => {
    try {
      const {
        campaignTag,
        teamKey,
        points,
        reason
      } = req.body;

      if (!campaignTag) {
        return res.status(400).json({
          sucesso: false,
          erro: 'A campanha é obrigatória.'
        });
      }

      const validTeams = [
        'ferrari',
        'mercedes',
        'redbull',
        'general'
      ];

      if (!validTeams.includes(teamKey)) {
        return res.status(400).json({
          sucesso: false,
          erro: 'Time inválido.'
        });
      }

      const numericPoints =
        Number(points);

      if (!Number.isFinite(numericPoints)) {
        return res.status(400).json({
          sucesso: false,
          erro: 'Pontuação inválida.'
        });
      }

      const adjustment =
        await CampaignScoreAdjustment.create({
          campaignTag,
          teamKey,
          points: numericPoints,
          reason: String(
            reason || ''
          ).trim()
        });

      res.status(201).json({
        sucesso: true,
        adjustment
      });
    } catch (error) {
      console.error(
        'ERRO AJUSTE ROAD TO GLORY:',
        error
      );

      res.status(500).json({
        sucesso: false,
        erro: error.message
      });
    }
  }
);


app.get('/api/audit/forecast-current', async (req, res) => {
  try {
    const {
      period = '2026-07',
      assignee = ''
    } = req.query;

    const [year, month] = period.split('-').map(Number);

    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(
      year,
      month,
      0,
      23,
      59,
      59,
      999
    );

    const filter = {
      status: {
        $in: [0, 1]
      },
      dueTime: {
        $gte: startDate,
        $lte: endDate,
        $ne: null
      },
      'stageset.name': {
        $ne: 'Processo de Vendas - Global Alliance'
      }
    };

    if (assignee) {
      filter['assignee.name'] = {
        $regex: assignee,
        $options: 'i'
      };
    }

    const mongoLeads = await Lead.find(filter)
      .select({
        nutshell_id: 1,
        name: 1,
        status: 1,
        value: 1,
        normalizedValue: 1,
        estimatedValue: 1,
        assignee: 1,
        dueTime: 1,
        closedTime: 1,
        modifiedTime: 1,
        synced_at: 1,
        stageset: 1,
        htmlUrl: 1
      })
      .sort({
        'assignee.name': 1,
        dueTime: 1
      })
      .lean();

    const audit = [];

    for (const mongoLead of mongoLeads) {
      try {
        const response = await axios.post(
          'https://app.nutshell.com/api/v1/json',
          {
            method: 'getLead',
            params: {
              leadId: mongoLead.nutshell_id
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

        const nutshellLead = response.data?.result;

        const nutshellDueTime = nutshellLead?.dueTime
          ? new Date(nutshellLead.dueTime)
          : null;

        const nutshellQualifies =
          [0, 1].includes(Number(nutshellLead?.status)) &&
          nutshellDueTime &&
          nutshellDueTime >= startDate &&
          nutshellDueTime <= endDate;

        const mongoAmount = Number(
          mongoLead.estimatedValue?.amount ??
          mongoLead.value?.amount ??
          mongoLead.normalizedValue?.amount ??
          0
        );

        const nutshellAmount = Number(
          nutshellLead?.estimatedValue?.amount ??
          nutshellLead?.value?.amount ??
          nutshellLead?.normalizedValue?.amount ??
          0
        );

        audit.push({
          nutshell_id: mongoLead.nutshell_id,
          name: mongoLead.name,
          htmlUrl:
            nutshellLead?.htmlUrl ||
            mongoLead.htmlUrl ||
            `https://app.nutshell.com/lead/${mongoLead.nutshell_id}`,

          mongo: {
            status: mongoLead.status,
            assignee: mongoLead.assignee?.name || null,
            amount: mongoAmount,
            value: mongoLead.value?.amount ?? null,
            estimatedValue:
              mongoLead.estimatedValue?.amount ?? null,
            dueTime: mongoLead.dueTime || null,
            closedTime: mongoLead.closedTime || null,
            synced_at: mongoLead.synced_at || null
          },

          nutshell: {
            status: nutshellLead?.status ?? null,
            assignee: nutshellLead?.assignee?.name || null,
            amount: nutshellAmount,
            value: nutshellLead?.value?.amount ?? null,
            estimatedValue:
              nutshellLead?.estimatedValue?.amount ?? null,
            dueTime: nutshellLead?.dueTime || null,
            closedTime: nutshellLead?.closedTime || null,
            qualifies: Boolean(nutshellQualifies)
          },

          differences: {
            statusDifferent:
              Number(mongoLead.status) !==
              Number(nutshellLead?.status),

            assigneeDifferent:
              String(mongoLead.assignee?.name || '').trim() !==
              String(nutshellLead?.assignee?.name || '').trim(),

            amountDifferent:
              mongoAmount !== nutshellAmount,

            dueTimeDifferent:
              String(mongoLead.dueTime || '') !==
              String(nutshellLead?.dueTime || ''),

            shouldBeRemovedFromEstimate:
              !nutshellQualifies
          }
        });

        await sleep(120);
      } catch (leadError) {
        audit.push({
          nutshell_id: mongoLead.nutshell_id,
          name: mongoLead.name,
          erro:
            leadError.response?.data ||
            leadError.message
        });
      }
    }

    const validNutshellLeads = audit.filter(
      (item) => item.nutshell?.qualifies
    );

    const mongoTotal = audit.reduce(
      (sum, item) =>
        sum + Number(item.mongo?.amount || 0),
      0
    );

    const nutshellTotal = validNutshellLeads.reduce(
      (sum, item) =>
        sum + Number(item.nutshell?.amount || 0),
      0
    );

    res.json({
      sucesso: true,
      period,
      assignee: assignee || null,

      summary: {
        mongoLeads: mongoLeads.length,
        validNutshellLeads:
          validNutshellLeads.length,
        mongoTotal,
        nutshellTotal,
        shouldBeRemoved:
          audit.filter(
            (item) =>
              item.differences
                ?.shouldBeRemovedFromEstimate
          ).length,
        statusDifferences:
          audit.filter(
            (item) =>
              item.differences?.statusDifferent
          ).length,
        amountDifferences:
          audit.filter(
            (item) =>
              item.differences?.amountDifferent
          ).length
      },

      audit
    });
  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro:
        error.response?.data ||
        error.message
    });
  }
});

app.get('/api/sync/nutshell/reconcile-forecast', async (req, res) => {
  try {
    const {
      startDate,
      endDate
    } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Informe startDate e endDate no formato YYYY-MM-DD'
      });
    }

    const start = new Date(`${startDate}T00:00:00.000`);
    const end = new Date(`${endDate}T23:59:59.999`);

    const mongoLeads = await Lead.find({
      status: {
        $in: [0, 1]
      },
      dueTime: {
        $gte: start,
        $lte: end,
        $ne: null
      },
      'stageset.name': {
        $ne: 'Processo de Vendas - Global Alliance'
      }
    })
      .select({
        nutshell_id: 1,
        name: 1,
        status: 1,
        dueTime: 1,
        value: 1,
        assignee: 1
      })
      .lean();

    let checked = 0;
    let updated = 0;
    let removedFromForecast = 0;
    let changedAssignee = 0;
    let changedStatus = 0;
    let errors = 0;

    const details = [];

    for (const mongoLead of mongoLeads) {
      try {
        checked++;

        const response = await axios.post(
          'https://app.nutshell.com/api/v1/json',
          {
            method: 'getLead',
            params: {
              leadId: mongoLead.nutshell_id
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

        const fullLead = response.data?.result;

        if (!fullLead) {
          details.push({
            nutshell_id: mongoLead.nutshell_id,
            name: mongoLead.name,
            updated: false,
            reason: 'Lead não encontrada no Nutshell'
          });

          continue;
        }

        const currentDueTime = fullLead.dueTime
          ? new Date(fullLead.dueTime)
          : null;

        const currentlyQualifies =
          [0, 1].includes(Number(fullLead.status)) &&
          currentDueTime &&
          !Number.isNaN(currentDueTime.getTime()) &&
          currentDueTime >= start &&
          currentDueTime <= end;

        const assigneeWasChanged =
          String(mongoLead.assignee?.name || '').trim() !==
          String(fullLead.assignee?.name || '').trim();

        const statusWasChanged =
          Number(mongoLead.status) !==
          Number(fullLead.status);

        if (!currentlyQualifies) {
          removedFromForecast++;
        }

        if (assigneeWasChanged) {
          changedAssignee++;
        }

        if (statusWasChanged) {
          changedStatus++;
        }

        await saveFullLead(fullLead);

        updated++;

        details.push({
          nutshell_id: fullLead.id,
          name: fullLead.name,
          updated: true,
          currentlyQualifies: Boolean(currentlyQualifies),

          before: {
            status: mongoLead.status,
            assignee: mongoLead.assignee?.name || null,
            value: Number(mongoLead.value?.amount || 0),
            dueTime: mongoLead.dueTime || null
          },

          after: {
            status: fullLead.status,
            assignee: fullLead.assignee?.name || null,
            value: Number(fullLead.value?.amount || 0),
            estimatedValue: Number(
              fullLead.estimatedValue?.amount || 0
            ),
            dueTime: fullLead.dueTime ?? null,
            closedTime: fullLead.closedTime ?? null
          }
        });

        await sleep(120);
      } catch (leadError) {
        errors++;

        details.push({
          nutshell_id: mongoLead.nutshell_id,
          name: mongoLead.name,
          updated: false,
          error:
            leadError.response?.data ||
            leadError.message
        });
      }
    }

    res.json({
      sucesso: true,
      startDate,
      endDate,
      summary: {
        mongoForecastCandidates: mongoLeads.length,
        checked,
        updated,
        removedFromForecast,
        changedAssignee,
        changedStatus,
        errors
      },
      details
    });
  } catch (error) {
    console.error(
      'ERRO RECONCILE FORECAST:',
      error.response?.data || error.message
    );

    res.status(500).json({
      sucesso: false,
      erro:
        error.response?.data ||
        error.message
    });
  }
});

app.use(express.static(path.join(__dirname, '../frontend/dist')));


const frontendPath = path.join(__dirname, '../frontend/dist');


app.use(express.static(frontendPath));

// ========================================
// DIAGNÓSTICO DE ATIVIDADES SALVAS
// ========================================

app.get(
  '/api/debug/activities-summary',
  async (req, res) => {
    try {
      const period =
        req.query.period || '2026-07';

      const [year, month] = period
        .split('-')
        .map(Number);

      const start = new Date(
        Date.UTC(
          year,
          month - 1,
          1,
          3,
          0,
          0,
          0
        )
      );

      const end = new Date(
        Date.UTC(
          year,
          month,
          1,
          3,
          0,
          0,
          0
        )
      );

      const totalLeadsWithActivities =
        await Lead.countDocuments({
          activities: {
            $exists: true,
            $ne: []
          }
        });

      const storedActivities =
        await Lead.aggregate([
          {
            $match: {
              activities: {
                $exists: true,
                $ne: []
              }
            }
          },

          {
            $unwind: '$activities'
          },

          {
            $addFields: {
              activityDate: {
                $convert: {
                  input: {
                    $ifNull: [
                      '$activities.startTime',
                      {
                        $ifNull: [
                          '$activities.endTime',
                          {
                            $ifNull: [
                              '$activities.createdTime',
                              {
                                $ifNull: [
                                  '$activities.modifiedTime',
                                  '$activities.dueTime'
                                ]
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  },

                  to: 'date',
                  onError: null,
                  onNull: null
                }
              },

              activityOwner: {
                $ifNull: [
                  '$activities.loggedBy.name',
                  {
                    $ifNull: [
                      '$activities.user.name',
                      {
                        $ifNull: [
                          '$activities.owner.name',
                          {
                            $ifNull: [
                              '$activities.assignee.name',
                              {
                                $arrayElemAt: [
                                  '$activities.participants.name',
                                  0
                                ]
                              }
                            ]
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            }
          },

          {
            $facet: {
              allStored: [
                {
                  $count: 'total'
                }
              ],

              insidePeriod: [
                {
                  $match: {
                    activityDate: {
                      $gte: start,
                      $lt: end
                    }
                  }
                },
                {
                  $count: 'total'
                }
              ],

              missingDate: [
                {
                  $match: {
                    activityDate: null
                  }
                },
                {
                  $count: 'total'
                }
              ],

              missingOwner: [
                {
                  $match: {
                    $or: [
                      {
                        activityOwner: null
                      },
                      {
                        activityOwner: ''
                      }
                    ]
                  }
                },
                {
                  $count: 'total'
                }
              ],

              ownersInsidePeriod: [
                {
                  $match: {
                    activityDate: {
                      $gte: start,
                      $lt: end
                    }
                  }
                },
                {
                  $group: {
                    _id: '$activityOwner',
                    total: {
                      $sum: 1
                    }
                  }
                },
                {
                  $sort: {
                    total: -1
                  }
                }
              ],

              samples: [
                {
                  $limit: 10
                },
                {
                  $project: {
                    _id: 0,
                    activityDate: 1,
                    activityOwner: 1,
                    activity: '$activities'
                  }
                }
              ]
            }
          }
        ]);

      const result =
        storedActivities[0] || {};

      res.json({
        sucesso: true,
        period,
        range: {
          start,
          end
        },

        totalLeadsWithActivities,

        allStored:
          result.allStored?.[0]?.total || 0,

        insidePeriod:
          result.insidePeriod?.[0]?.total ||
          0,

        missingDate:
          result.missingDate?.[0]?.total ||
          0,

        missingOwner:
          result.missingOwner?.[0]?.total ||
          0,

        ownersInsidePeriod:
          result.ownersInsidePeriod || [],

        samples:
          result.samples || []
      });
    } catch (error) {
      console.error(
        'ERRO DEBUG ATIVIDADES:',
        error
      );

      res.status(500).json({
        sucesso: false,
        erro: error.message
      });
    }
  }
);

app.get(
  '/api/sync/nutshell/activities-period',
  async (req, res) => {
    try {
      const {
  period,
  startDate,
  endDate
} = req.query;

let start;
let end;
let selectedPeriod = null;

if (startDate && endDate) {
  start = new Date(
    `${startDate}T03:00:00.000Z`
  );

  end = new Date(
    `${endDate}T03:00:00.000Z`
  );

  /*
   * Soma um dia porque o filtro final usa $lt.
   * Assim, o endDate inteiro será incluído.
   */
  end.setUTCDate(
    end.getUTCDate() + 1
  );
} else {
  selectedPeriod = String(
    period || '2026-07'
  );

  const match = selectedPeriod.match(
    /^(\d{4})-(\d{2})$/
  );

  if (!match) {
    return res.status(400).json({
      sucesso: false,
      erro:
        'Período inválido. Utilize YYYY-MM.'
    });
  }

  const year = Number(match[1]);
  const month = Number(match[2]);

  start = new Date(
    Date.UTC(
      year,
      month - 1,
      1,
      3,
      0,
      0,
      0
    )
  );

  end = new Date(
    Date.UTC(
      year,
      month,
      1,
      3,
      0,
      0,
      0
    )
  );
}

function getCurrentMonthPeriod() {
  const now = new Date();

  const formatter =
    new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit'
    });

  const parts =
    formatter.formatToParts(now);

  const year = parts.find(
    (part) => part.type === 'year'
  )?.value;

  const month = parts.find(
    (part) => part.type === 'month'
  )?.value;

  return `${year}-${month}`;
}

      const PAGE_LIMIT = 100;
      const MAX_PAGES = 200;

      let page = 1;
      let checked = 0;
      let activitiesInsidePeriod = 0;
      let activitiesWithoutLead = 0;
      let detailsRequested = 0;

      const seenActivityIds = new Set();
      const activitiesByLead = new Map();

      while (page <= MAX_PAGES) {
        const pageActivities =
          await findActivitiesPage({
            page,
            start,
            end,
            limit: PAGE_LIMIT
          });

        if (pageActivities.length === 0) {
          break;
        }

        /*
         * Proteção caso a API ignore o parâmetro
         * page e retorne sempre a mesma página.
         */
        const pageIds = pageActivities
          .map((activity) =>
            String(activity?.id || '')
          )
          .filter(Boolean);

        const newIds = pageIds.filter(
          (id) =>
            !seenActivityIds.has(id)
        );

        if (
          page > 1 &&
          newIds.length === 0
        ) {
          console.log(
            `Página ${page} repetida. Encerrando paginação.`
          );

          break;
        }

        for (
          const activitySummary of
          pageActivities
        ) {
          const activityId =
            activitySummary?.id;

          if (!activityId) {
            continue;
          }

          const activityKey =
            String(activityId);

          if (
            seenActivityIds.has(
              activityKey
            )
          ) {
            continue;
          }

          seenActivityIds.add(
            activityKey
          );

          checked++;

          let activity =
            activitySummary;

          /*
           * Se a listagem não trouxer a lead,
           * buscamos o detalhe da atividade.
           */
          let leadIds =
            getActivityLeadIds(activity);

          if (leadIds.length === 0) {
            const detail =
              await getActivityDetail(
                activityId
              );

            detailsRequested++;

            if (detail) {
              activity = detail;
              leadIds =
                getActivityLeadIds(
                  activity
                );
            }

            await new Promise(
              (resolve) =>
                setTimeout(
                  resolve,
                  40
                )
            );
          }

          const activityDate =
            getActivityDate(activity);

          if (!activityDate) {
            continue;
          }

          const insidePeriod =
            activityDate >= start &&
            activityDate < end;

          if (!insidePeriod) {
            continue;
          }

          activitiesInsidePeriod++;

          if (leadIds.length === 0) {
            activitiesWithoutLead++;
            continue;
          }

          for (const leadId of leadIds) {
            if (
              !activitiesByLead.has(
                leadId
              )
            ) {
              activitiesByLead.set(
                leadId,
                []
              );
            }

            activitiesByLead
              .get(leadId)
              .push(activity);
          }
        }

        console.log(
          `Atividades página ${page}:`,
          {
            recebidas:
              pageActivities.length,
            checked,
            activitiesInsidePeriod
          }
        );

        if (
          pageActivities.length <
          PAGE_LIMIT
        ) {
          break;
        }

        page++;

        await new Promise((resolve) =>
          setTimeout(resolve, 100)
        );
      }

      const nutshellLeadIds = [
        ...activitiesByLead.keys()
      ];

      const leads = await Lead.find({
        nutshell_id: {
          $in: nutshellLeadIds
        }
      })
        .select({
          _id: 1,
          nutshell_id: 1,
          activities: 1
        })
        .lean();

      const bulkOperations = [];

      let leadsUpdated = 0;
      let activitiesSaved = 0;

      for (const lead of leads) {
        const leadId = Number(
          lead.nutshell_id
        );

        const newActivities =
          activitiesByLead.get(
            leadId
          ) || [];

        const currentActivities =
          Array.isArray(
            lead.activities
          )
            ? lead.activities
            : [];

        /*
         * Mantém atividades de outros meses.
         * Remove apenas as atividades do período
         * que será novamente sincronizado.
         */
        const activitiesOutsidePeriod =
          currentActivities.filter(
            (activity) => {
              const date =
                getActivityDate(
                  activity
                );

              if (!date) {
                return true;
              }

              return !(
                date >= start &&
                date < end
              );
            }
          );

        const uniqueActivities =
          new Map();

        for (
          const activity of [
            ...activitiesOutsidePeriod,
            ...newActivities
          ]
        ) {
          const key = String(
            activity?.id ||
              `${getActivityDate(
                activity
              )?.toISOString()}-${activity?.name || ''}`
          );

          uniqueActivities.set(
            key,
            activity
          );
        }

        const mergedActivities = [
          ...uniqueActivities.values()
        ];

        bulkOperations.push({
          updateOne: {
            filter: {
              _id: lead._id
            },
            update: {
              $set: {
                activities:
                  mergedActivities,
                activitiesSyncedAt:
                  new Date()
              }
            }
          }
        });

        leadsUpdated++;
        activitiesSaved +=
          newActivities.length;
      }

      if (bulkOperations.length > 0) {
        await Lead.bulkWrite(
          bulkOperations,
          {
            ordered: false
          }
        );
      }

      res.json({
  sucesso: true,

  period: selectedPeriod,
  startDate: startDate || null,
  endDate: endDate || null,

  range: {
    start,
    end
  },

  pagesProcessed: page,
  checked,
  activitiesInsidePeriod,
  activitiesWithoutLead,
  detailsRequested,
  leadsWithActivities:
    activitiesByLead.size,
  leadsFoundInMongo:
    leads.length,
  leadsUpdated,
  activitiesSaved
});
    } catch (error) {
      console.error(
        'ERRO AO SINCRONIZAR ATIVIDADES:',
        error.response?.data ||
          error.message
      );

      res.status(500).json({
  sucesso: false,

  erro:
    error.response?.data?.error
      ?.message ||
    error.response?.data ||
    error.message,

  detalhes:
    error.response?.data || null
});
    }
  }
);

// ========================================
// SINCRONIZAR WON SEM SOURCE POR CLOSE DATE
// ========================================

app.get(
  '/api/sync/nutshell/won-sources-period',
  async (req, res) => {
    try {
      const {
        startDate,
        endDate,
        limit = 500
      } = req.query;

      if (!startDate || !endDate) {
        return res.status(400).json({
          sucesso: false,
          erro:
            'Informe startDate e endDate no formato YYYY-MM-DD.'
        });
      }

      const start = new Date(
        `${startDate}T00:00:00.000`
      );

      const end = new Date(
        `${endDate}T23:59:59.999`
      );

      const missingSourceFilter = {
        status: 10,

        closedTime: {
          $gte: start,
          $lte: end,
          $ne: null
        },

        'stageset.name': {
          $ne:
            'Processo de Vendas - Global Alliance'
        },

        $or: [
          {
            sources: {
              $exists: false
            }
          },
          {
            sources: null
          },
          {
            sources: {
              $size: 0
            }
          },
          {
            sources: {
              $elemMatch: {
                name: {
                  $in: [
                    null,
                    ''
                  ]
                }
              }
            }
          }
        ]
      };

      const leads =
        await Lead.find(
          missingSourceFilter
        )
          .select({
            nutshell_id: 1,
            name: 1,
            closedTime: 1,
            sources: 1
          })
          .limit(
            Math.min(
              Math.max(
                Number(limit) || 500,
                1
              ),
              2000
            )
          )
          .lean();

      let checked = 0;
      let updated = 0;
      let stillWithoutSource = 0;
      let errors = 0;

      const details = [];

      for (const lead of leads) {
        checked++;

        try {
          const response =
            await axios.post(
              'https://app.nutshell.com/api/v1/json',
              {
                method: 'getLead',

                params: {
                  leadId: Number(
                    lead.nutshell_id
                  )
                },

                id: 1
              },
              {
                auth: {
                  username:
                    NUTSHELL_EMAIL,

                  password:
                    NUTSHELL_API_KEY
                }
              }
            );

          const fullLead =
            response.data?.result;

          if (!fullLead) {
            errors++;

            details.push({
              nutshell_id:
                lead.nutshell_id,

              name:
                lead.name,

              updated: false,

              reason:
                'Lead não encontrada no Nutshell'
            });

            continue;
          }

          await saveFullLead(
            fullLead
          );

          const sourceNames =
            Array.isArray(
              fullLead.sources
            )
              ? fullLead.sources
                  .map(
                    (source) =>
                      String(
                        source?.name || ''
                      ).trim()
                  )
                  .filter(Boolean)
              : [];

          if (
            sourceNames.length > 0
          ) {
            updated++;
          } else {
            stillWithoutSource++;
          }

          details.push({
            nutshell_id:
              fullLead.id,

            name:
              fullLead.name,

            closedTime:
              fullLead.closedTime ||
              null,

            sources:
              sourceNames,

            updated: true
          });

          await sleep(120);
        } catch (leadError) {
          errors++;

          details.push({
            nutshell_id:
              lead.nutshell_id,

            name:
              lead.name,

            updated: false,

            error:
              leadError.response?.data ||
              leadError.message
          });
        }
      }

      const remaining =
        await Lead.countDocuments(
          missingSourceFilter
        );

      res.json({
        sucesso: true,

        routeVersion:
          'won-sources-period-v1',

        filters: {
          status: 10,
          dateField:
            'closedTime',
          startDate,
          endDate
        },

        beforeSync:
          leads.length,

        checked,
        updated,
        stillWithoutSource,
        errors,
        remaining,
        details
      });
    } catch (error) {
      console.error(
        'ERRO SYNC WON SOURCES:',
        error.response?.data ||
          error.message
      );

      res.status(500).json({
        sucesso: false,
        erro:
          error.response?.data ||
          error.message
      });
    }
  }
);

// ========================================
// AUDITORIA - LEADS CRIADAS NO DIA
// ========================================

app.get('/api/audit/created-leads-day', async (req, res) => {
  try {
    const {
      startDate,
      endDate
    } = req.query;

    if (!startDate || !endDate) {
      return res.status(400).json({
        sucesso: false,
        erro:
          'Informe startDate e endDate. Exemplo: ?startDate=2026-07-07&endDate=2026-07-07'
      });
    }

    const [startYear, startMonth, startDay] =
      startDate.split('-').map(Number);

    const [endYear, endMonth, endDay] =
      endDate.split('-').map(Number);

    const start = new Date(
      Date.UTC(
        startYear,
        startMonth - 1,
        startDay,
        3,
        0,
        0,
        0
      )
    );

    const end = new Date(
      Date.UTC(
        endYear,
        endMonth - 1,
        endDay + 1,
        3,
        0,
        0,
        0
      )
    );

    const leads = await Lead.find({
      createdTime: {
        $gte: start,
        $lt: end,
        $ne: null
      }
    })
      .select({
        nutshell_id: 1,
        name: 1,
        status: 1,
        createdTime: 1,
        modifiedTime: 1,
        closedTime: 1,
        assignee: 1,
        stageset: 1,
        milestone: 1,
        sources: 1,
        htmlUrl: 1,
        rawData: 1
      })
      .sort({
        createdTime: 1
      })
      .lean();

    const ignoredNames = [
      'accounts grupo',
      'transportes',
      'geral',
      'faturamento log & comex',
      'sem responsável',
      'sem responsavel',
      'giovanna fernandes',
      'pedro scarillo'
    ];

    const formatLead = (lead) => {
      const assigneeName =
        lead.assignee?.name ||
        lead.rawData?.assignee?.name ||
        'Sem responsável';

      const pipelineName =
        lead.stageset?.name ||
        lead.rawData?.stageset?.name ||
        null;

      const normalizedAssignee =
        String(assigneeName)
          .trim()
          .toLowerCase();

      const isIgnored =
        ignoredNames.includes(
          normalizedAssignee
        );

      const isGlobalAlliance =
        pipelineName ===
        'Processo de Vendas - Global Alliance';

      const entersPerformance =
        Boolean(assigneeName) &&
        !isIgnored &&
        !isGlobalAlliance;

      let reason = 'Entra na performance';

      if (isGlobalAlliance) {
        reason =
          'Não entra: pipeline Global Alliance';
      } else if (isIgnored) {
        reason =
          'Não entra: responsável ignorado na TV';
      } else if (!assigneeName) {
        reason =
          'Não entra: sem responsável';
      }

      return {
        nutshell_id:
          lead.nutshell_id,

        name:
          lead.name,

        status:
          lead.status,

        assignee:
          assigneeName,

        pipeline:
          pipelineName,

        milestone:
          lead.milestone?.name ||
          lead.rawData?.milestone?.name ||
          null,

        createdTime:
          lead.createdTime,

        createdTimeBR:
          lead.createdTime
            ? new Date(
                lead.createdTime
              ).toLocaleString('pt-BR', {
                timeZone:
                  'America/Sao_Paulo'
              })
            : null,

        closedTime:
          lead.closedTime || null,

        source:
          lead.sources?.[0]?.name ||
          lead.rawData?.sources?.[0]?.name ||
          null,

        htmlUrl:
          lead.htmlUrl ||
          lead.rawData?.htmlUrl ||
          null,

        entersPerformance,
        reason
      };
    };

    const formatted =
      leads.map(formatLead);

    const byAssignee = formatted.reduce(
      (acc, lead) => {
        const key =
          lead.assignee ||
          'Sem responsável';

        if (!acc[key]) {
          acc[key] = {
            total: 0,
            entersPerformance: 0,
            skipped: 0
          };
        }

        acc[key].total += 1;

        if (lead.entersPerformance) {
          acc[key].entersPerformance += 1;
        } else {
          acc[key].skipped += 1;
        }

        return acc;
      },
      {}
    );

    res.json({
      sucesso: true,

      routeVersion:
        'created-leads-day-audit-v1',

      filters: {
        startDate,
        endDate
      },

      periodRange: {
        startDate: start,
        endDate: end
      },

      summary: {
        totalCreatedInPeriod:
          formatted.length,

        totalEnteringPerformance:
          formatted.filter(
            (lead) =>
              lead.entersPerformance
          ).length,

        totalSkipped:
          formatted.filter(
            (lead) =>
              !lead.entersPerformance
          ).length
      },

      byAssignee,

      leads: formatted
    });

  } catch (error) {
    console.error(
      'ERRO AUDIT CREATED LEADS DAY:',
      error
    );

    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({
      sucesso: false,
      erro: 'API não encontrada'
    });
  }

  res.sendFile(path.join(frontendPath, 'index.html'));
});



// ========================================
// CONEXÃO MONGODB
// ========================================

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Conectado ao MongoDB Atlas'))
  .catch((err) => console.error('Erro ao conectar ao MongoDB:', err));

// ========================================
// START SERVIDOR
// ========================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
