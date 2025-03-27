const dayjs = require('dayjs');

let forecasts = [
  {
    table: 'org_fc4_forecasts',
    nodule: 'orgs/org/fc4/forecasts',
    access: {
      admin: true,
    },
    fields: [
      'id',
      'created',
      'updated',
      'status',
      {
        name: 'name',
        label: 'Name',
      },
      {
        name: 'interval',
        field_type: 'dropdown',
        options: {
          model: 'orgs/org:$/fc4/intervals',
        },
        label: 'Interval',
      },
      {
        name: 'segment',
        field_type: 'dropdown',
        required: true,
        options: {
          zero_select: true,
          items: [
            {
              id: 'entities',
              sortorder: 1,
              name: 'Entities',
            },
            {
              id: 'currencies',
              sortorder: 2,
              name: 'Currencies',
            },
            {
              id: 'accounts',
              sortorder: 3,
              name: 'Custom Segment',
            },
          ],
        },
        label: 'Segment',
      },
      {
        name: 'accounts',
        field_type: 'multidown',
        format: 'json',
        default: '[]',
        type: 'json',
        transform: (data) => {
          if (!data) data = [];
          if (!Array.isArray(data)) data = [];
          return data;
        },
        config: {
          display_test: {
            tests: [
              {
                test: 'require_match',
                field: 'segment',
                value: 'accounts',
              },
            ],
          },
        },
        options: {
          model: 'orgs/org:$/accounts/list',
        },
        label: 'Accounts',
      },
      {
        name: 'entities',
        field_type: 'multidown',
        format: 'json',
        type: 'json',
        default: '[]',
        transform: (data) => {
          if (!data) data = [];
          if (!Array.isArray(data)) data = [];
          return data;
        },
        config: {
          display_test: {
            tests: [
              {
                test: 'require_match',
                field: 'segment',
                value: 'entities',
              },
            ],
          },
        },
        options: {
          model: 'orgs/org:$/entities/list',
        },
        label: 'Entities',
      },
      {
        name: 'currencies',
        field_type: 'multidown',
        format: 'json',
        type: 'json',
        default: '[]',
        transform: (data) => {
          if (!data) data = [];
          if (!Array.isArray(data)) data = [];
          return data;
        },
        config: {
          display_test: {
            tests: [
              {
                test: 'require_match',
                field: 'segment',
                value: 'currencies',
              },
            ],
          },
        },
        options: {
          model: 'config/currencies',
        },
        label: 'Currencies',
      },
      {
        name: 'grouping',
        field_type: 'dropdown',
        required: true,
        options: {
          zero_select: true,
          items: [
            {
              id: 'accounts_categories',
              sortorder: 1,
              name: 'Accounts / Categories',
            },
            {
              id: 'accounts_codes',
              sortorder: 2,
              name: 'Accounts / BAI Codes',
            },
            {
              id: 'categories',
              sortorder: 3,
              name: 'Categories',
            },
            {
              id: 'codes',
              sortorder: 4,
              name: 'BAI Codes',
            },
          ],
        },
        label: 'Grouping',
      },
      {
        name: 'periods',
        default: 12,
        label: 'Periods',
      },
    ],
    models: {
      list: {
        subscribe: true,
        fields: [
          'id',
          'created',
          'updated',
          'name',
          'interval',
          'periods',
          'segment',
          'accounts',
          'entities',
          'currencies',
          'grouping',
        ],
      },
    },
    forms: {
      create: {
        title: 'Create Forecast Segment',
        options: {
          instructions:
            'Forecast across accounts by entity, business unit, region, currency, or any custom operating division.',
        },
        fields: ['name', 'segment', 'accounts', 'entities', 'currencies', 'grouping', 'interval', 'periods'],
      },
    },
  },
  {
    node: true,
    nodule: 'orgs/org/fc4/forecasts/forecast',
    access: {
      admin: true,
    },

    forms: {
      delete: {
        fields: ['status'],
      },
      change: {
        add_fields: ['name'],
      },
      update: {
        fields: ['name', 'segment', 'accounts', 'entities', 'currencies'],
      },
    },
    models: {
      accounts: {
        return: async (nForecast) => {
          let sqlFilter = null;

          let mForecast = await nForecast.m('data');

          if (mForecast.segment == 'accounts') {
            if (Array.isArray(mForecast.accounts) && mForecast.accounts.length > 0) {
              sqlFilter = `
              AND a.id IN (
             ${mForecast.accounts.map((a) => nForecast.sql.escape(a)).join(',')}   
            )
              `;
            }
          }

          if (mForecast.segment == 'entities') {
            if (Array.isArray(mForecast.entities) && mForecast.entities.length > 0) {
              sqlFilter = `
              AND a.entity IN ( 
             ${mForecast.entities.map((a) => nForecast.sql.escape(a)).join(',')}   
            )
              `;
            }
          }

          if (mForecast.segment == 'currencies') {
            if (Array.isArray(mForecast.currencies) && mForecast.currencies.length > 0) {
              sqlFilter = `
              AND a.currency IN (
             ${mForecast.currencies.map((a) => nForecast.sql.escape(a)).join(',')}   
            )
              `;
            }
          }

          if (!sqlFilter) return [];

          let sqlString = `
          SELECT 
          a.id,
          a.name,
          a.currency,
          a.last4
          FROM org_bank_accounts AS a 
          JOIN org_banks AS b 
          ON b.status = 1 
          AND b.org = a.org 
          AND b.id = a.bank  
          WHERE a.status = 1 
          AND a.org = ${nForecast.sql.escape(nForecast.path.parent.ids.org)}
          ${sqlFilter}
          `;

          let accounts = await nForecast.sql.q(sqlString);
          return accounts;
        },
      },
      data: {
        subscribe: true,
        fields: [
          'id',
          'created',
          'updated',
          'name',
          'interval',
          'periods',
          'segment',
          'accounts',
          'entities',
          'currencies',
          'grouping',
        ],
      },
    },
  },
];

module.exports = forecasts;
