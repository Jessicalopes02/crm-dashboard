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
const app = express();

const multer = require('multer');
const csv = require('csv-parser');
const fs = require('fs');

const path = require('path');

const upload = multer({ dest: 'uploads/' });

app.use(cors());
app.use(express.json());

// ========================================
// CONFIGURAÇÃO NUTSHELL
// ========================================

const NUTSHELL_API_KEY = '327640e18841297b60cb6e2f4c5f19995a4bc4ef';
const NUTSHELL_EMAIL = 'edormundo@processlogcomex.com.br';

const PRIORITY_STATUS = [0, 10]; // Open e Won
const DAILY_STATUS = [1, 11, 12]; // Pending, Lost e Cancelado

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

    const startDate = new Date('2026-06-01T00:00:00');
    const endDate = new Date('2026-06-30T23:59:59');

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

  const CLOSER_ASSIGNEES = [
    'Alba Danielly Rezende Lima',
    'Accounts Grupo',
    'Beatriz Costa',
    'Edson da Silva Bomfim Junior',
    'Fabiane Carvalho Nascimento',
    'Fabio Souza',
    'Gabriel Lopes',
    'Giovanna Fernandes',
    'Pedro Scarillo',
    'Luiza Carvalho',
    'Marcus Santana'
  ];

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
      $in: CLOSER_ASSIGNEES
    };
  }

  const performance = await Lead.aggregate([
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
        },

        averageTicket: {
          $avg: {
            $cond: [
              {
                $and: [
                  { $eq: ['$status', 10] },
                  { $ne: ['$value.amount', null] }
                ]
              },
              '$value.amount',
              null
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
        totalRevenue: -1
      }
    }
  ]);

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
        ...ignoredPipelineFilter
      }
    },
    {
      $addFields: {
        sourceDate: {
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
            sourceDate: {
              ...dateConditions,
              $ne: null
            }
          }
        : {
            sourceDate: {
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
      $group: {
        _id: {
          $ifNull: ['$sources.name', 'Sem source']
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

async function getYearComparisonDashboard(year = null) {
  const currentYear = Number(year) || new Date().getFullYear();
  const previousYear = currentYear - 1;

  const startDate = new Date(previousYear, 0, 1);
  const endDate = new Date(currentYear, 11, 31, 23, 59, 59);

  const ignoredPipelineFilter = {
    'stageset.name': { $ne: 'Processo de Vendas - Global Alliance' }
  };

  const data = await Lead.aggregate([
    {
      $match: {
        ...ignoredPipelineFilter,
        closedTime: {
          $gte: startDate,
          $lte: endDate
        }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$closedTime' },
          month: { $month: '$closedTime' }
        },

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

  const months = [
    'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
    'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
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
          item._id.year === currentYear &&
          item._id.month === month
      );

      const previous = data.find(
        (item) =>
          item._id.year === previousYear &&
          item._id.month === month
      );

      const currentRevenue = current?.revenue || 0;
      const previousRevenue = previous?.revenue || 0;

      const revenueGrowth =
        previousRevenue > 0
          ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
          : currentRevenue > 0
            ? 100
            : 0;

      return {
        month,
        monthName,

        currentYear,
        previousYear,

        current: {
          totalLeads: current?.totalLeads || 0,
          wonLeads: current?.wonLeads || 0,
          lostLeads: current?.lostLeads || 0,
          revenue: currentRevenue
        },

        previous: {
          totalLeads: previous?.totalLeads || 0,
          wonLeads: previous?.wonLeads || 0,
          lostLeads: previous?.lostLeads || 0,
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

    const activities = response.data.result || [];

    return activities.filter((activity) => {
      const note = JSON.stringify(activity || {}).toLowerCase();
      return note.includes(`lead/${leadId}`);
    });

  } catch (error) {
    console.error(
      `Erro ao buscar atividades do lead ${leadId}:`,
      error.response?.data || error.message
    );

    return [];
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
// ========================================
// DASHBOARD - FULL DATA
// ========================================

app.get('/api/dashboard/full', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const [
      general,
      performance,
      sources,
      products,
      comparison,
      funnel,
      leadTime,
      states,
      dataQuality
    ] = await Promise.all([
      getGeneralDashboard(startDate, endDate),
      getPerformanceDashboard(startDate, endDate, 'closer'),
      getSourcesDashboard(startDate, endDate),
      getProductsDashboard(startDate, endDate),
      getYearComparisonDashboard(),
      getFunnelDashboard(startDate, endDate),
      getLeadTimeDashboard(startDate, endDate),
      getStatesDashboard(startDate, endDate),
      getDataQualityDashboard()
    ]);

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
      dataQuality
    });

  } catch (error) {
    console.error('ERRO DASHBOARD FULL:', error.message);

    res.status(500).json({
      sucesso: false,
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
    const start = new Date('2026-06-01T00:00:00');
    const end = new Date('2026-06-30T23:59:59');

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
    const { period = '2026-06' } = req.query;

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
    const { period = '2026-06' } = req.query;

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
      { products: { $exists: false } }
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
      { products: { $exists: false } }
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
      dueTime: lead.dueTime,
      closedTime: lead.closedTime,
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
      value: fullLead.value,
      normalizedValue: fullLead.normalizedValue,
      estimatedValue: fullLead.estimatedValue,
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
      activities: fullLead.activities || [],
      customFields: fullLead.customFields || {},
      processes: fullLead.processes || [],
      createdTime: fullLead.createdTime,
      modifiedTime: fullLead.modifiedTime,
      dueTime: fullLead.dueTime,
      closedTime: fullLead.closedTime,
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
    { upsert: true, returnDocument: 'after' }
  );
}

// ========================================
// SYNC INCREMENTAL
// ========================================

async function syncIncrementalLeads() {
  try {
    console.log('Iniciando sync incremental...');

    const limit = 500;
    const maxPages = 2;

    let page = 1;
    let totalChecked = 0;
    let totalUpdated = 0;

    while (page <= maxPages) {
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

      if (leads.length === 0) break;

      for (const lead of leads) {
        totalChecked++;

        const existingLead = await Lead.findOne({ nutshell_id: lead.id });

        if (!existingLead || existingLead.rev !== lead.rev) {
          await saveSummaryLead(lead);
          totalUpdated++;
        }
      }

      page++;
    }

    console.log(`Sync incremental finalizada. Verificados: ${totalChecked} | Atualizados: ${totalUpdated}`);

  } catch (error) {
    console.error('Erro na sync incremental:', error.response?.data || error.message);
  }
}

app.get('/api/sync/nutshell/leads/incremental', async (req, res) => {
  try {
    await syncIncrementalLeads();

    res.json({
      sucesso: true,
      mensagem: 'Sync incremental executada com sucesso'
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.response?.data || error.message
    });
  }
});

cron.schedule('*/15 * * * *', () => {
  syncIncrementalLeads();
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
    const start = new Date('2026-06-01T00:00:00');
    const end = new Date('2026-06-30T23:59:59');

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
    const start = new Date('2026-06-01T00:00:00');
    const end = new Date('2026-06-30T23:59:59');

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


app.get('/api/sync/nutshell/road-to-glory', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const pagesBack = Number(req.query.pagesBack) || 25;

    const lastPage = await getNutshellLastPage(limit);

    let page = lastPage;
    let checked = 0;
    let matched = 0;
    let synced = 0;
    let errors = 0;

    while (page > lastPage - pagesBack && page > 0) {
      console.log(`Buscando página recente ${page}...`);

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

          const hasRoadTag = (fullLead.tags || []).some((tag) =>
            String(tag || '')
              .toLowerCase()
              .includes('road to the glory')
          );

          if (!hasRoadTag) continue;

          matched++;

          fullLead.activities = fullLead.activities || [];

          await saveFullLead(fullLead);

          const pagesBack = Number(req.query.pagesBack) || 25;

          synced++;
        } catch (leadError) {
          errors++;
          console.error(
            `Erro ao sincronizar lead ${lead.id}:`,
            leadError.response?.data || leadError.message
          );
        }
      }

      page--;
    }

    res.json({
      sucesso: true,
      direction: 'recent_to_old',
      lastPage,
      checked,
      matched,
      synced,
      errors,
      pagesProcessed: lastPage - page
    });

  } catch (error) {
    console.error('ERRO SYNC ROAD TO GLORY:', error.response?.data || error.message);

    res.status(500).json({
      sucesso: false,
      erro: error.response?.data || error.message
    });
  }
});


app.get('/api/sync/nutshell/road-to-glory-meetings', async (req, res) => {
  try {
    const leads = await Lead.find({
      tags: {
        $in: [
          'All Hands - Road to the Glory',
          'Road to the Glory - Maio'
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
// DASHBOARD - PERFORMANCE POR RESPONSÁVEL
// ========================================

app.get('/api/dashboard/performance-by-assignee', async (req, res) => {
  try {
    const { startDate, endDate, status, role } = req.query;

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

    const CLOSER_ASSIGNEES = [
      'Alba Danielly Rezende Lima',
      'Beatriz Costa',
      'Edson da Silva Bomfim Júnior',
      'Fabiane Carvalho Nascimento',
      'Fábio Souza',
      'Gabriel Lopes',
      'Giovanna Fernandes',
      'Luiza Carvalho',
      'Pedro Scarillo',
      'Marcus Vinicius Dias Santana',
      'Accounts Grupo'
    ];
    const baseFilter = {
      ...ignoredPipelineFilter,
      'assignee.name': {
        $exists: true,
        $ne: null,
        $ne: ''
      }
    };

    if (role === 'closer') {
      baseFilter['assignee.name'] = { $in: CLOSER_ASSIGNEES };
    }

    if (status !== undefined && status !== '') {
      baseFilter.status = Number(status);
    }

    const performance = await Lead.aggregate([
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
          },

          averageTicket: {
            $avg: {
              $cond: [
                {
                  $and: [
                    { $eq: ['$status', 10] },
                    { $ne: ['$value.amount', null] }
                  ]
                },
                '$value.amount',
                null
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
          totalRevenue: -1
        }
      }
    ]);

    res.json({
      sucesso: true,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        status: status || null,
        role: role || null
      },
      totalAssignees: performance.length,
      performance
    });

  } catch (error) {
    console.error('ERRO PERFORMANCE ASSIGNEE:', error.message);

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
          ...ignoredPipelineFilter
        }
      },
      {
        $addFields: {
          sourceDate: {
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
              sourceDate: {
                ...dateConditions,
                $ne: null
              }
            }
          : {
              sourceDate: {
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
        $group: {
          _id: {
            $ifNull: ['$sources.name', 'Sem source']
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

// ========================================
// DASHBOARD - COMPARATIVO ANUAL
// ========================================

app.get('/api/dashboard/year-comparison', async (req, res) => {
  try {
    const currentYear = Number(req.query.year) || new Date().getFullYear();
    const previousYear = currentYear - 1;

    const startDate = new Date(previousYear, 0, 1);
    const endDate = new Date(currentYear, 11, 31, 23, 59, 59);

    const ignoredPipelineFilter = {
      'stageset.name': { $ne: 'Processo de Vendas - Global Alliance' }
    };

    const data = await Lead.aggregate([
      {
        $match: {
          ...ignoredPipelineFilter,
          closedTime: {
            $gte: startDate,
            $lte: endDate
          }
        }
      },
      {
        $group: {
          _id: {
            year: { $year: '$closedTime' },
            month: { $month: '$closedTime' }
          },

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

    const months = [
      'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun',
      'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'
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
            item._id.year === currentYear &&
            item._id.month === month
        );

        const previous = data.find(
          (item) =>
            item._id.year === previousYear &&
            item._id.month === month
        );

        const currentRevenue = current?.revenue || 0;
        const previousRevenue = previous?.revenue || 0;

        const revenueGrowth =
          previousRevenue > 0
            ? ((currentRevenue - previousRevenue) / previousRevenue) * 100
            : currentRevenue > 0
              ? 100
              : 0;

        return {
          month,
          monthName,

          currentYear,
          previousYear,

          current: {
            totalLeads: current?.totalLeads || 0,
            wonLeads: current?.wonLeads || 0,
            lostLeads: current?.lostLeads || 0,
            revenue: currentRevenue
          },

          previous: {
            totalLeads: previous?.totalLeads || 0,
            wonLeads: previous?.wonLeads || 0,
            lostLeads: previous?.lostLeads || 0,
            revenue: previousRevenue
          },

          growth: {
            revenuePercent: revenueGrowth
          }
        };
      });

    res.json({
      sucesso: true,
      currentYear,
      previousYear,
      comparison
    });

  } catch (error) {
    console.error('ERRO YEAR COMPARISON:', error.message);

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
// DASHBOARD - LEAD TIME MÉDIO
// ========================================

app.get('/api/dashboard/lead-time', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const filter = {
      status: 10,
      createdTime: { $ne: null },
      closedTime: { $ne: null }
    };

    if (startDate || endDate) {
      filter.closedTime = {};

      if (startDate) {
        filter.closedTime.$gte = new Date(startDate);
      }

      if (endDate) {
        filter.closedTime.$lte = new Date(endDate);
      }
    }

    const result = await Lead.aggregate([
      {
        $match: filter
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
      },
      {
        $group: {
          _id: null,
          averageLeadTimeDays: { $avg: '$leadTimeDays' },
          totalWon: { $sum: 1 }
        }
      }
    ]);
     
    const byMonth = await Lead.aggregate([
      {
        $match: filter
      },
      {
        $project: {
          year: { $year: '$closedTime' },
          month: { $month: '$closedTime' },
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
// DASHBOARD - LEAD TIME MÉDIO
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

app.get('/api/goals', async (req, res) => {
  try {
    const goals = await Goal.find().sort({ createdAt: -1 });

    res.json({
      sucesso: true,
      goals
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

    const defaultStartDate = new Date(year, month - 1, 1);
    const defaultEndDate = new Date(year, month, 0, 23, 59, 59);

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
  status: 10,
  closedTime: {
    $gte: startDate,
    $lte: endDate
  }
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
  const cleanName = String(goal.userName)
    .replace(/\s+/g, ' ')
    .trim();

  baseFilter['assignee.name'] = {
  $regex: `^\\s*${cleanName
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+')}\\s*$`,
  $options: 'i'
};
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
          $ifNull: ['$value.amount', 0]
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

app.get('/api/audit/goals-achievement-detail', async (req, res) => {
  try {
    const { period, userName, sector = 'closer' } = req.query;

    if (!period) {
      return res.status(400).json({
        sucesso: false,
        erro: 'Informe o period. Exemplo: ?period=2026-06'
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

app.get('/api/campaigns/road-to-glory/progress', async (req, res) => {
  try {
    const start = new Date('2026-05-25T03:00:00.000Z');
    const end = new Date('2026-05-30T02:59:59.999Z');

    const normalizeName = (name) =>
      String(name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    const teams = {
      redbull: ['Alba Danielly Rezende Lima', 'Fabiane Carvalho Nascimento', 'Gisele Santos Gama'],
      mercedes: ['Fábio Souza', 'Edson da Silva Bomfim Júnior', 'Guilherme Velloso', 'Leticia Barbosa'],
      ferrari: ['Giovanna Fernandes', 'Pedro Scarillo', 'Luma Farias Silva Santos', 'Luiza Carvalho']
    };

    const teamByUser = {};

    Object.entries(teams).forEach(([team, users]) => {
      users.forEach((user) => {
        teamByUser[normalizeName(user)] = team;
      });
    });

    const leads = await Lead.find({
  $and: [
    {
      $or: [
        {
          tags: {
            $elemMatch: {
              $regex: 'Road to the Glory - Maio',
              $options: 'i'
            }
          }
        },
        {
          tags: {
            $regex: 'Road to the Glory - Maio',
            $options: 'i'
          }
        }
      ]
    },
    {
      $or: [
        { createdTime: { $gte: start, $lte: end } },
        { modifiedTime: { $gte: start, $lte: end } },
        { closedTime: { $gte: start, $lte: end } }
      ]
    }
  ]
}).lean();

    const result = {
      redbull: { team: 'Red Bull', miles: 0 },
      mercedes: { team: 'Mercedes', miles: 0 },
      ferrari: { team: 'Ferrari', miles: 0 }
    };

    const details = [];

    for (const lead of leads) {
      const assigneeName = normalizeName(lead.assignee?.name);
      const team = teamByUser[assigneeName];

if (!team) continue;

 

const milestoneName = normalizeName(lead.milestone?.name || '');
const stageSetName = normalizeName(lead.stageset?.name || '');

const hasMayRoadTag =
  Array.isArray(lead.tags) &&
  lead.tags.some((tag) =>
    normalizeName(tag).includes('road to the glory')
  );

const isNewLeadPipeline =
  stageSetName.includes('sdr') ||
  stageSetName.includes('novos negocios');

const isMeeting =
  milestoneName.includes('reuniao agendada');

const isProjection =
  milestoneName.includes('projecao de custos');

const isOffer =
  milestoneName.includes('oferta gerenciamento') ||
  milestoneName.includes('consultoria');

if (!team) continue;

const isQualifiedStage =
  milestoneName.includes('reuniao') ||
  milestoneName.includes('projecao') ||
  milestoneName.includes('oferta') ||
  milestoneName.includes('proposta') ||
  milestoneName.includes('gerenciamento') ||
  milestoneName.includes('consultoria') ||
  milestoneName.includes('custos') ||
  milestoneName.includes('aceita') ||
  milestoneName.includes('won');
  isMeeting ||
  isProjection ||
  isOffer;

const validMeetingActivities = [
  'reuniao efetiva',
  'reuniao agendada',
  'reuniao reagendada'
];

const hasMeetingActivity =
  Array.isArray(lead.activities) &&
  lead.activities.some((activity) => {
    const activityName = normalizeName(
      activity?.name ||
      activity?.activityType?.name ||
      ''
    );

    const activityDate = activity?.startTime
      ? new Date(activity.startTime)
      : null;

    const inPeriod =
      activityDate &&
      activityDate >= start &&
      activityDate <= end;

    return (
      inPeriod &&
      validMeetingActivities.some((item) =>
        activityName.includes(item)
      )
    );
  });


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

      const created = lead.createdTime ? new Date(lead.createdTime) : null;
      const modified = lead.modifiedTime ? new Date(lead.modifiedTime) : null;
      const closed = lead.closedTime ? new Date(lead.closedTime) : null;
      const processStarted = Array.isArray(lead.processes)
       ? lead.processes
      .map((process) => process.startedTime ? new Date(process.startedTime) : null)
      .filter(Boolean)
      .sort((a, b) => b - a)[0]
      : null;

    
      const createdInPeriod = openDate && openDate >= start && openDate <= end;
      const modifiedInPeriod = modified && modified >= start && modified <= end;
      const closedInPeriod = closed && closed >= start && closed <= end;

      const sameCreatedModifiedDay =
        created &&
        modified &&
        openDate.toISOString().slice(0, 10) === modified.toISOString().slice(0, 10);

      const sameCreatedClosedDay =
        created &&
        closed &&
        openDate.toISOString().slice(0, 10) === closed.toISOString().slice(0, 10);

      if (
  createdInPeriod &&
  modifiedInPeriod &&
  sameCreatedModifiedDay &&
  isMeeting
) {
  result[team].miles += 100;
  
}

if (hasMayRoadTag && isNewLeadPipeline) {
  result[team].miles += 10;
}

if (hasMayRoadTag && isQualifiedStage) {
  result[team].miles += 50;
}
      if (
        createdInPeriod &&
        closedInPeriod &&
        sameCreatedClosedDay &&
        lead.status === 10
      ) {
        result[team].miles += 200;
      
      }

      if (lead.status === 10 && closedInPeriod) {
        let canCountWonValue = true;

        if (normalizeName(lead.assignee?.name) === normalizeName('Gabriel Lopes')) {
          canCountWonValue = (lead.products || []).some((product) =>
            normalizeName(product.name).includes(normalizeName('Gerenciamento de Importação'))
          );
        }

        if (canCountWonValue) {
          result[team].miles += Math.floor(Number(lead.value?.amount || 0) / 100);
        }
      }
    }

  const manualAdjustments = {
  mercedes: 2374,
  ferrari: 1550,
  redbull: 902
};

Object.keys(result).forEach((team) => {
  result[team].miles = manualAdjustments[team] || 0;
});
    const ranking = Object.values(result)
      .sort((a, b) => b.miles - a.miles)
      .map((item, index) => ({
        ...item,
        position: index + 1,
        percent: Math.min((item.miles / 6000) * 100, 100),
        milesFormatted: item.miles.toLocaleString('pt-BR')
      }));

    const podium = {
      first: ranking[0],
      second: ranking[1],
      third: ranking[2]
    };

    const totalMiles = ranking.reduce(
      (sum, item) => sum + Number(item.miles || 0),
      0
    );

    res.json({
      sucesso: true,
      limit: 6000,
      totalMiles,
      totalMilesFormatted: totalMiles.toLocaleString('pt-BR'),
      podium,
      ranking,
      details
    });

  } catch (error) {
    console.error('ERRO ROAD TO GLORY:', error);

    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});

app.get('/api/campaigns/road-to-glory/progress-v2', async (req, res) => {
  try {
    const start = new Date('2026-05-25T03:00:00.000Z');
    const end = new Date('2026-05-30T02:59:59.999Z');
    const limitMiles = 6000;

    const normalizeName = (name) =>
      String(name || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();

    const teams = {
      redbull: ['Alba Danielly Rezende Lima', 'Fabiane Carvalho Nascimento', 'Gisele Santos Gama'],
      mercedes: ['Fábio Souza', 'Edson da Silva Bomfim Júnior', 'Guilherme Velloso', 'Leticia Barbosa'],
      ferrari: ['Giovanna Fernandes', 'Pedro Scarillo', 'Luma Farias Silva Santos', 'Luma Farias']
    };

    const result = {
      redbull: { team: 'Red Bull', miles: 0 },
      mercedes: { team: 'Mercedes', miles: 0 },
      ferrari: { team: 'Ferrari', miles: 0 }
    };

    const teamByUser = {};
    Object.entries(teams).forEach(([team, users]) => {
      users.forEach((user) => {
        teamByUser[normalizeName(user)] = team;
      });
    });

    const leads = await Lead.find({
      tags: {
        $in: [
          'All Hands - Road to the Glory',
          'Road to the Glory - Maio'
        ]
      }
    }).lean();

    for (const lead of leads) {
      const team = teamByUser[normalizeName(lead.assignee?.name)];
      if (!team) continue;

      const milestoneName = normalizeName(lead.milestone?.name || '');
      const stageSetName = normalizeName(lead.stageset?.name || '');

      const hasRoadTag = Array.isArray(lead.tags) && lead.tags.some((tag) =>
        normalizeName(tag).includes('road to the glory')
      );

      if (!hasRoadTag) continue;

      const isNewLeadPipeline =
        stageSetName.includes('sdr') ||
        stageSetName.includes('novos negocios');

      const isQualifiedStage =
        milestoneName.includes('reuniao') ||
        milestoneName.includes('projecao') ||
        milestoneName.includes('custos') ||
        milestoneName.includes('oferta') ||
        milestoneName.includes('proposta') ||
        milestoneName.includes('gerenciamento') ||
        milestoneName.includes('consultoria') ||
        milestoneName.includes('aceita') ||
        milestoneName.includes('won');

      const meetingActivityInPeriod =
        Array.isArray(lead.activities) &&
        lead.activities.some((activity) => {
          const activityName = normalizeName(
            activity?.name ||
            activity?.activityType?.name ||
            ''
          );

          const activityDate = activity?.startTime
            ? new Date(activity.startTime)
            : null;

          return (
            activityName.includes('reuniao') &&
            activityDate &&
            activityDate >= start &&
            activityDate <= end
          );
        });

        const meetingSameOpenDate =
  Array.isArray(lead.activities) &&
  lead.activities.some((activity) => {
    const activityName = normalizeName(
      activity?.name ||
      activity?.activityType?.name ||
      ''
    );

    const activityDate = activity?.startTime
      ? new Date(activity.startTime)
      : null;

    return (
      activityName.includes('reuniao') &&
      openDate &&
      activityDate &&
      openDate.toISOString().slice(0, 10) ===
        activityDate.toISOString().slice(0, 10)
    );
  });
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

      const modified = lead.modifiedTime ? new Date(lead.modifiedTime) : null;
      const closed = lead.closedTime ? new Date(lead.closedTime) : null;

      const openInPeriod = openDate && openDate >= start && openDate <= end;
      const modifiedInPeriod = modified && modified >= start && modified <= end;
      const closedInPeriod = closed && closed >= start && closed <= end;

      const sameOpenModifiedDay =
        openDate &&
        modified &&
        openDate.toISOString().slice(0, 10) === modified.toISOString().slice(0, 10);

      const sameOpenClosedDay =
        openDate &&
        closed &&
        openDate.toISOString().slice(0, 10) === closed.toISOString().slice(0, 10);

      if (isNewLeadPipeline) {
        result[team].miles += 10;
      }

      if (isQualifiedStage || meetingActivityInPeriod) {
        result[team].miles += 50;
      }

      if (
  hasMayRoadTag &&
  openInPeriod &&
  meetingSameOpenDate
) {
  result[team].miles += 100;
}

      if (openInPeriod && closedInPeriod && sameOpenClosedDay && lead.status === 10) {
        result[team].miles += 200;
      }

      if (lead.status === 10 && closedInPeriod) {
        result[team].miles += Math.floor(Number(lead.value?.amount || 0) / 100);
      }
    }

    const ranking = Object.values(result)
      .sort((a, b) => b.miles - a.miles)
      .map((item, index) => ({
        ...item,
        position: index + 1,
        percent: Math.min((item.miles / limitMiles) * 100, 100),
        milesFormatted: item.miles.toLocaleString('pt-BR')
      }));

    res.json({
      sucesso: true,
      limit: limitMiles,
      totalMiles: ranking.reduce((sum, item) => sum + item.miles, 0),
      totalMilesFormatted: ranking.reduce((sum, item) => sum + item.miles, 0).toLocaleString('pt-BR'),
      podium: {
        first: ranking[0],
        second: ranking[1],
        third: ranking[2]
      },
      ranking
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.message
    });
  }
});


app.get('/api/audit/road-to-glory-summary', async (req, res) => {
  const leads = await Lead.find({
    tags: { $in: ['All Hands - Road to the Glory', 'Road to the Glory - Maio'] }
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
            query: {
              createdTime: {
                from: '2026-05-25',
                to: '2026-05-29'
              }
            },
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
        normalizedTag.includes('road to the glory - maio') ||
        normalizedTag.includes('all hands - road to the glory')
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
    const start = new Date('2026-05-25T03:00:00.000Z');
    const end = new Date('2026-05-30T02:59:59.999Z');

    const leads = await Lead.find({
  tags: {
    $in: [
      'All Hands - Road to the Glory',
      'Road to the Glory - Maio'
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
  const start = new Date('2026-05-25T03:00:00.000Z');
  const end = new Date('2026-05-30T02:59:59.999Z');

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
        'All Hands - Road to the Glory',
        'Road to the Glory - Maio'
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
    const start = new Date('2026-05-25T03:00:00.000Z');
    const end = new Date('2026-05-30T02:59:59.999Z');

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
          'All Hands - Road to the Glory',
          'Road to the Glory - Maio'
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

function normalizeName(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

app.get('/api/sync/nutshell/road-to-glory-activities', async (req, res) => {
  try {
    const limit = Number(req.query.limit) || 100;
    const pages = Number(req.query.pages) || 20;

    const campaignLeads = await Lead.find({
      tags: {
        $in: [
          'All Hands - Road to the Glory',
          'Road to the Glory - Maio'
        ]
      }
    })
      .select('nutshell_id name')
      .lean();

    const leadIds = new Set(
      campaignLeads.map((lead) => Number(lead.nutshell_id))
    );

    const activitiesByLead = {};
    let checkedActivities = 0;
    let matchedActivities = 0;

    for (let page = 1; page <= pages; page++) {
  console.log(`Buscando atividades página ${page}...`);

  const response = await axios.post(
    'https://app.nutshell.com/api/v1/json',
    {
      method: 'findActivities',
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

  const activities = response.data.result || [];

  if (activities.length === 0) break;

  for (const activity of activities) {
    checkedActivities++;

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

    const activityDetail = detailResponse.data.result;

const leadId = Number(activityDetail?.lead?.id);

if (!leadIds.has(leadId)) continue;

const activityName = normalizeName(
  activityDetail?.name ||
  activityDetail?.activityType?.name ||
  ''
);

if (!activityName.includes('reuniao')) continue;

if (!activitiesByLead[leadId]) {
      activitiesByLead[leadId] = [];
    }

    activitiesByLead[leadId].push(activityDetail);
    matchedActivities++;

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  await new Promise((resolve) => setTimeout(resolve, 150));
}

    let updatedLeads = 0;

    for (const [nutshellId, activities] of Object.entries(activitiesByLead)) {
      await Lead.updateOne(
        { nutshell_id: Number(nutshellId) },
        {
          $set: {
            activities,
            activities_synced_at: new Date()
          }
        }
      );

      updatedLeads++;
    }

    res.json({
      sucesso: true,
      campaignLeads: campaignLeads.length,
      checkedActivities,
      matchedActivities,
      updatedLeads
    });

  } catch (error) {
    console.error('ERRO SYNC ROAD ACTIVITIES:', error.response?.data || error.message);

    res.status(500).json({
      sucesso: false,
      erro: error.response?.data || error.message
    });
  }
});

app.get('/api/audit/road-to-glory-activities', async (req, res) => {
  const leads = await Lead.find({
    tags: {
      $in: [
        'All Hands - Road to the Glory',
        'Road to the Glory - Maio'
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


app.get('/api/test/nutshell/activities', async (req, res) => {
  try {
    const leadId = Number(req.query.leadId);

    const response = await axios.post(
      'https://app.nutshell.com/api/v1/json',
      {
        method: 'findActivities',
        params: {
          query: {},
          limit: 20
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
      leadId,
      result: response.data.result
    });

  } catch (error) {
    res.status(500).json({
      sucesso: false,
      erro: error.response?.data || error.message
    });
  }
});

app.get('/api/audit/road-to-glory', async (req, res) => {
  try {

    const leads = await Lead.find({
      tags: 'Road to the Glory - Maio'
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

app.use(express.static(path.join(__dirname, '../frontend/dist')));




const frontendPath = path.join(__dirname, '../frontend/dist');

app.use(express.static(frontendPath));

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
