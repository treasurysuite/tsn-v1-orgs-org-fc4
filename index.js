const flowdocManager = require('./lib/FlowdocManager.js');

const fc4Intervals = [
  {
    id: 'week',
    forecast_name: 'Weeks',
    sortorder: 1,
    name: 'Weekly',
  },
  {
    id: 'month',
    sortorder: 2,
    forecast_name: 'Months',
    name: 'Monthly',
  },
  // {
  //   id: 'quarter',
  //   sortorder: 3,
  //   forecast_name: 'Quarters',
  //   name: 'Quarterly',
  // },
  {
    id: 'day',
    sortorder: 4,
    forecast_name: 'Days',
    name: 'Daily',
  },
];

const fc4ModelDateStates = [
  {
    id: 'working',
    color: 'success',
    action: 'Working',
    name: 'Working',
  },

  {
    id: 'complete',
    color: 'warning',
    action: 'Complete',
    name: 'Complete',
  },

  {
    id: 'submitted',
    color: 'info',
    action: 'Submit',
    name: 'Submitted',
  },
];

module.exports = [
  {
    nodule: 'orgs/org/fc4',
    access: [
      {
        admin: true,
      },
      {
        user_access: {
          name: 'org',
        },
      },
    ],

    urls: {},
    forms: {
      test: {
        action: async (nFc4, form, values) => {
          let flowDoc = flowdocManager.getInstance({
            nodule: nFc4.path.full,
            item: nFc4.path.parent.ids.org,
          });
          await flowDoc.ini();

          await flowDoc.set('testing', values.updates.testing);

          return values;
        },
      },
    },
    models: {
      intervals: {
        return: fc4Intervals,
      },
      model_date_states: {
        return: fc4ModelDateStates,
      },
      config: {
        return: {
          intervals: fc4Intervals,
          model_date_states: fc4ModelDateStates,
        },
      },
      test: {
        return: async (nFc4) => {
          let flowDoc = flowdocManager.getInstance({
            nodule: nFc4.path.full,
            item: nFc4.path.parent.ids.org,
          });
          await flowDoc.ini();

          return await flowDoc.data();
        },
      },
    },
  },
  ...require('./src/forecasts.js'),
  ...require('./src/forecasts/forecast/reports.js'),
  ...require('./src/forecasts/forecast/models.js'),
  ...require('./src/forecasts/forecast/models/model/dates.js'),
];
