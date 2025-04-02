const dayjs = require('dayjs');
const _ = require('lodash');

let forecasts = [
  {
    nodule: 'orgs/org/fc4/forecasts/forecast/reports',
    access: {
      admin: true,
    },

    forms: {
      data: {
        action: async (nReports, form, values) => {
          let mForecast = await nReports.parents('forecast').m('data');
          let mAccounts = await nReports.parents('forecast').m('accounts');
          let actuals = {};

          let curDate = dayjs(nReports.path.id);

          let curDateYmd = curDate.format('YYYY-MM-DD');

          let period = 'weeks';

          if (mForecast.interval == 'month') {
            period = 'months';
          }
          if (mForecast.interval == 'day') {
            period = 'days';
          }
          if (mForecast.interval == 'quarter') {
            period = 'quarters';
          }

          let sqlString = `
          SELECT 
          model,
          date,
          account,
          type,
          type_id,
          \`values\` 
          FROM org_fc4_forecast_model_date_data
          WHERE org = ${nReports.sql.escape(nReports.path.parent.ids.org)}
          AND forecast = ${nReports.sql.escape(nReports.path.parent.ids.forecast)}
          AND status = 1
          ORDER BY date 
          `;

          console.log('report query', sqlString);

          let elements = await nReports.sql.q(sqlString);

          elements = elements.map((element) => {
            element.values = element.values.split(',');
            element.values = element.values.map((v) => {
              if (v == '') {
                return null;
              } else {
                return v * 1;
              }
            });
            return element;
          });

          console.log('elements', elements);

          let historical = [];

          if (elements.length > 0) {
            let accountsSettings = {
              period,
              start_date: dayjs(elements[0].date).subtract(mForecast.periods, period).format('YYYY-MM-DD'),
              end_date: dayjs().format('YYYY-MM-DD'),
              currency: 'USD',
              account_filter: mAccounts.map((a) => a.id),
              // entity_filter: [],
              // bank_filter: [],
              // currency_font: 'default',
              // decimal_places: '2',
              // week_name_format: 'friday',
              // accounts: [],
              // account_indicators: ['conversion_rates', 'currency_symbols'],
              // weekends: 'hide',
            };

            console.log('accountsSettings', accountsSettings);

            historical = await nReports.parents('org').nodules('./historical/cash').fa('accounts', accountsSettings);

            historical.dates.forEach((date) => {
              // inflows
              if (!actuals['flows__inflows']) {
                actuals['flows__inflows'] = {
                  dates: {},
                };
              }
              actuals['flows__inflows'].dates[date.date] = date.agg.ifc;
              // outflows
              if (!actuals['flows__outflows']) {
                actuals['flows__outflows'] = {
                  dates: {},
                };
              }
              actuals['flows__outflows'].dates[date.date] = date.agg.ofc;
              // opening
              if (!actuals['balance__opening']) {
                actuals['balance__opening'] = {
                  dates: {},
                };
              }
              actuals['balance__opening'].dates[date.date] = date.agg.opc;
              // closing
              if (!actuals['balance__closing']) {
                actuals['balance__closing'] = {
                  dates: {},
                };
              }
              actuals['balance__closing'].dates[date.date] = date.agg.clc;
            });

            console.log('historical', historical);
          }

          return { actuals, elements };
        },
      },
    },
    models: {},
  },
];

module.exports = forecasts;
