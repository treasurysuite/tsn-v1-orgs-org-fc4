const flowdocManager = require('../../../../../lib/FlowdocManager.js');
const dayjs = require('dayjs');
const _ = require('lodash');
const Arima = require('arima');
const tf = require('@tensorflow/tfjs-node');

const avg = (arr) => arr.reduce((acc, v, i, a) => acc + v / a.length, 0);

const actualsDo = async (nDate) => {
  let mForecast = await nDate.parents('forecast').m('data');
  let mAccounts = await nDate.parents('forecast').m('accounts');

  let curDate = dayjs(nDate.path.id);

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

  let accountsSettings = {
    period,
    start_date: curDate.subtract(mForecast.periods, period).format('YYYY-MM-DD'),
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

  let data = await nDate.parents('org').nodules('./historical/cash').fa('accounts', accountsSettings);
  let flow = await nDate
    .parents('org')
    .nodules('./historical/cash')
    .fa('flow', {
      ...accountsSettings,
      ...{
        type: 'category',
      },
    });

  data.kDates = _.keyBy(data.dates, 'date');

  let flowData = {
    dates: {},
  };

  if (flow.result) {
    flow.result.forEach((flowItem) => {
      if (flowItem.type == 'category') {
        if (!flowData.dates[flowItem.date]) {
          flowData.dates[flowItem.date] = {
            accounts: {},
          };
        }
        if (!flowData.dates[flowItem.date].accounts[flowItem.account]) {
          flowData.dates[flowItem.date].accounts[flowItem.account] = {
            categories: {},
          };
        }
        if (!flowData.dates[flowItem.date].accounts[flowItem.account].categories[flowItem.filter_bucket]) {
          flowData.dates[flowItem.date].accounts[flowItem.account].categories[flowItem.filter_bucket] = {
            amount: flowItem.amount,
            amount_converted: flowItem.amount_converted,
          };
        }
      }
    });
  }

  return {
    accounts: data,
    flow: flowData,
  };
};

let models = [
  {
    table: 'org_fc4_forecast_model_dates',
    nodule: 'orgs/org/fc4/forecasts/forecast/models/model/dates',
    auto_insert: true,
    access: {
      admin: true,
    },
    fields: [
      {
        name: 'org',
        required: true,
        key: true,
        label: 'Org',
      },
      {
        name: 'forecast',
        required: true,
        key: true,
        label: 'Forecast',
      },
      {
        name: 'model',
        required: true,
        key: true,
        label: 'Model',
      },
      {
        name: 'id',
        required: true,
        key: true,
        node_key: true,
        label: 'Date',
      },
      {
        name: 'state',
        required: true,
        field_type: 'dropdown',
        options: {
          model: 'orgs/org:$/fc4/model_date_states',
        },
        label: 'State',
      },
      'created',
      'updated',
      'status',
      {
        name: 'name',
        label: 'Name',
      },
    ],
    models: {
      list: {
        subscribe: true,
        return: async (nModels) => {
          let mList = await nModels.m('list_all');

          if (mList.length == 0) {
            let response = await nModels.fa('create', {
              name: 'Baseline',
            });

            mList = await nModels.m('list_all');
          }

          return mList;
        },
      },
      list_all: {
        fields: ['id', 'created', 'updated', 'name', 'state'],
      },
    },
    forms: {
      create: {
        fields: ['name'],
      },
    },
  },
  {
    node: true,
    nodule: 'orgs/org/fc4/forecasts/forecast/models/model/dates/date',
    access: {
      admin: true,
    },

    forms: {
      delete: {
        fields: ['status'],
      },
      change: {
        add_fields: ['state'],
      },
      fd_import: {
        action: async (nDate, form, values) => {
          let previousForecasts = await nDate.parents('dates').m('list');

          previousForecasts = previousForecasts.sort((a, b) => {
            return a.id - b.id;
          });

          previousForecasts = previousForecasts.filter((fc) => {
            return fc.id < nDate.path.id;
          });

          if (previousForecasts.length > 0) {
            console.log('previousForecasts', previousForecasts);
            let lastImport = previousForecasts.pop();

            let nImportFrom = nDate.parents('dates').nodules(`./date:${lastImport.id}`);

            console.log('nImportFrom', nImportFrom.path.full);

            let flowDoc = flowdocManager.getInstance({
              nodule: nImportFrom.path.full,
              item: 'main',
            });
            await flowDoc.ini();

            let importData = await flowDoc.data();

            console.log('importData', importData);

            if (importData && _.isObject(importData)) {
              await nDate.fa('fd_update', {
                updates: importData,
              });
            }

            return true;
          }
        },
      },
      fd_update: {
        action: async (nDate, form, values) => {
          if (values.updates) {
            let flowDoc = flowdocManager.getInstance({
              nodule: nDate.path.full,
              item: 'main',
            });
            await flowDoc.ini();

            await flowDoc.update(values.updates);
          }

          return true;
        },
      },
      save_data: {
        action: async (nDate, form, vals) => {
          let queries = [];

          vals.elements.forEach((element) => {
            let values = element.values.join(',');

            sqlString = `
            INSERT INTO 
            org_fc4_forecast_model_date_data
            SET 
            org = ${nDate.sql.escape(nDate.path.parent.ids.org)},
            forecast = ${nDate.sql.escape(nDate.path.parent.ids.forecast)},
            model = ${nDate.sql.escape(nDate.path.parent.ids.model)},
            date = ${nDate.sql.escape(nDate.path.id)},
            account = ${nDate.sql.escape(element.account)},
            type = ${nDate.sql.escape(element.type)},
            type_id = ${nDate.sql.escape(element.type_id)},
            \`values\` = ${nDate.sql.escape(values)},
            created = Now(),
            updated = Now()
            ON DUPLICATE KEY 
            UPDATE 
            \`values\` = ${nDate.sql.escape(values)},
            updated = Now()
            `;

            queries.push(sqlString);
          });

          let chunkSize = 1;

          let chunks = _.chunk(queries, chunkSize);

          for (const chunkIndex in chunks) {
            if (Object.prototype.hasOwnProperty.call(chunks, chunkIndex)) {
              const chunkItem = chunks[chunkIndex];
              await nDate.sql.q(chunkItem.join('; '));
            }
          }
        },
      },
      update: {
        fields: ['name', 'state'],
      },
    },
    models: {
      data: {
        subscribe: true,
        fields: ['id', 'created', 'updated', 'name', 'state'],
      },
      actuals: {
        return: async (nDate) => {
          // return await actualsDo(nDate);

          let cacheName = `${nDate.path.full}_actuals_v12`;

          let cached = await nDate.schema.ledis.oGet(cacheName);

          if (cached) {
            let ttl = await nDate.schema.ledis.ttl(cacheName);
            if (ttl < 50) {
              setTimeout(async () => {
                let newdata = await actualsDo(nDate);
                nDate.schema.ledis.oSet(cacheName, newdata, 100);
              }, 0);
            }

            return cached;
          } else {
            let newdata = await actualsDo(nDate);
            nDate.schema.ledis.oSet(cacheName, newdata, 100);

            return newdata;
          }
        },
      },

      full: {
        return: async (nDate) => {
          let randoms = [
            0.127349, 0.910325, 0.487192, 0.032918, 0.273819, 0.601784, 0.387498, 0.732591, 0.982384, 0.623015,
            0.812095, 0.713594, 0.298136, 0.453219, 0.635948, 0.510239, 0.059173, 0.176249, 0.975301, 0.147826,
            0.039248,
          ];

          let getRandom = () => {
            let random = randoms.shift();
            randoms.push(random);
            return random;
          };

          let mForecast = await nDate.parents('forecast').m('data');

          let mAccounts = await nDate.parents('forecast').m('accounts');
          let mBuckets = await nDate.parents('org').nodules('./cat/buckets').m('list');

          mBuckets.push({
            id: -2,
            cod: 'credit',
            name: 'Other Inflows',
          });

          mBuckets.push({
            id: -1,
            cod: 'debit',
            name: 'Other Outflows',
          });

          let mActuals = await nDate.m('actuals');

          let flowDoc = flowdocManager.getInstance({
            nodule: nDate.path.full,
            item: 'main',
          });
          await flowDoc.ini();

          let fdData = await flowDoc.data();

          if (Object.keys(fdData).length == 0) {
            console.log('TRYING IMPORT');

            await nDate.fa('fd_import', {});

            await nDate.fa('fd_update', {
              updates: {
                x_imported: 1,
              },
            });

            let fdData = await flowDoc.data();
          }

          let curDate = dayjs(nDate.path.id);
          let nowDate = dayjs();

          let curDateYmd = curDate.format('YYYY-MM-DD');
          let nowDateYmd = nowDate.format('YYYY-MM-DD');

          let dates = mActuals.accounts.dates
            .filter((date) => {
              return date.date < curDateYmd;
            })
            .map((date) => {
              let dateName;

              let useDate = dayjs(date.date);

              if (mForecast.interval == 'month') {
                dateName = useDate.format('MMMM');
              } else {
                dateName = useDate.format('MMM DD');
              }

              return {
                date: useDate.format('YYYY-MM-DD'),
                name: dateName,
                type: 'actual',
              };
            });

          for (let index = 0; index < mForecast.periods; index++) {
            let dateName;

            if (mForecast.interval == 'month') {
              dateName = curDate.format('MMMM');
            } else {
              dateName = curDate.format('MMM DD');
            }

            dates.push({
              date: curDate.format('YYYY-MM-DD'),
              name: dateName,
              type: 'forecast',
            });

            curDate = curDate.add(1, mForecast.interval);
          }

          let matrix = {
            subs: [],
          };

          let genDates = async ({ eid, account, formatter, subs, gen, main, category }) => {
            let lastVal = null;

            let curBalance = 0;
            let allVals = [];
            let actualVals = [];

            let prevTrend = null;

            let lastTrends = {
              account: null,
              inflows: null,
              outflows: null,
            };

            let forecastIndex = 0;

            // let newDates = dates.map((date, dateIndex) => {

            let newDates = [];

            for (let dateIndex = 0; dateIndex < dates.length; dateIndex++) {
              const date = dates[dateIndex];

              let newVal = 0;

              let newItem = {};

              let fields = ['n', 't', 't_growth', 't_strength'];

              fields.forEach((field) => {
                if (fdData[`${eid}_d_${date.date}_${field}`]) {
                  newItem[field] = fdData[`${eid}_d_${date.date}_${field}`];
                }
              });

              if (fdData[`ac_${account}_m_d_${date.date}_t`]) {
                lastTrends.account = {
                  t: fdData[`ac_${account}_m_d_${date.date}_t`],
                  t_growth: fdData[`ac_${account}_m_d_${date.date}_t_growth`],
                  t_strength: fdData[`ac_${account}_m_d_${date.date}_t_strength`],
                };
              }

              if (fdData[`ac_${account}_if_d_${date.date}_t`]) {
                lastTrends.inflows = {
                  t: fdData[`ac_${account}_if_d_${date.date}_t`],
                  t_growth: fdData[`ac_${account}_if_d_${date.date}_t_growth`],
                  t_strength: fdData[`ac_${account}_if_d_${date.date}_t_strength`],
                };
              }
              if (fdData[`ac_${account}_of_d_${date.date}_t`]) {
                lastTrends.outflows = {
                  t: fdData[`ac_${account}_of_d_${date.date}_t`],
                  t_growth: fdData[`ac_${account}_of_d_${date.date}_t_growth`],
                  t_strength: fdData[`ac_${account}_of_d_${date.date}_t_strength`],
                };
              }

              // let lastClosing = null

              if (date.type == 'actual') {
                newItem.c = null;
                newItem.ha = 1;

                if (account) {
                  if (mActuals.accounts.kDates[date.date]?.accounts[account]?.agg) {
                    curBalance = mActuals.accounts.kDates[date.date].accounts[account].agg.clc;

                    if (gen == 'opening') {
                      newItem.a = mActuals.accounts.kDates[date.date].accounts[account].agg.opc;
                      newItem.c = mActuals.accounts.kDates[date.date].accounts[account].agg.opc;
                    }
                    if (gen == 'closing') {
                      newItem.a = mActuals.accounts.kDates[date.date].accounts[account].agg.clc;
                      newItem.c = mActuals.accounts.kDates[date.date].accounts[account].agg.clc;
                    }
                    if (gen == 'inflows') {
                      newItem.a = mActuals.accounts.kDates[date.date].accounts[account].agg.ifc;
                      newItem.c = mActuals.accounts.kDates[date.date].accounts[account].agg.ifc;
                    }
                    if (gen == 'outflows') {
                      newItem.a = mActuals.accounts.kDates[date.date].accounts[account].agg.ofc;
                      newItem.c = mActuals.accounts.kDates[date.date].accounts[account].agg.ofc;
                    }
                  }

                  if (gen == 'inflow') {
                    if (mActuals.flow.dates[date.date]?.accounts[account]?.categories[category]) {
                      newItem.a =
                        mActuals.flow.dates[date.date].accounts[account].categories[category].amount_converted;
                      newItem.c =
                        mActuals.flow.dates[date.date].accounts[account].categories[category].amount_converted;
                    }
                  }
                  if (gen == 'outflow') {
                    if (mActuals.flow.dates[date.date]?.accounts[account]?.categories[category]) {
                      newItem.a =
                        mActuals.flow.dates[date.date].accounts[account].categories[category].amount_converted;
                      newItem.c =
                        mActuals.flow.dates[date.date].accounts[account].categories[category].amount_converted;
                    }
                  }
                }
                actualVals.push(newItem.c);
              } else {
                forecastIndex++;
                if (account) {
                  if (mActuals.accounts.kDates[date.date]?.accounts[account]?.agg) {
                    newItem.ha = 1;
                    // curBalance = mActuals.accounts.kDates[date.date].accounts[account].agg.clc;

                    if (gen == 'opening') {
                      newItem.a = mActuals.accounts.kDates[date.date].accounts[account].agg.opc;
                    }
                    if (gen == 'closing') {
                      newItem.a = mActuals.accounts.kDates[date.date].accounts[account].agg.clc;
                    }
                    if (gen == 'inflows') {
                      newItem.a = mActuals.accounts.kDates[date.date].accounts[account].agg.ifc;
                    }
                    if (gen == 'outflows') {
                      newItem.a = mActuals.accounts.kDates[date.date].accounts[account].agg.ofc;
                    }
                  }

                  if (gen == 'inflow') {
                    if (mActuals.flow.dates[date.date]?.accounts[account]?.categories) {
                      newItem.ha = 1;
                    }
                    if (mActuals.flow.dates[date.date]?.accounts[account]?.categories[category]) {
                      newItem.a =
                        mActuals.flow.dates[date.date].accounts[account].categories[category].amount_converted;
                    }
                  }
                  if (gen == 'outflow') {
                    if (mActuals.flow.dates[date.date]?.accounts[account]?.categories) {
                      newItem.ha = 1;
                    }
                    if (mActuals.flow.dates[date.date]?.accounts[account]?.categories[category]) {
                      newItem.a =
                        mActuals.flow.dates[date.date].accounts[account].categories[category].amount_converted;
                    }
                  }
                }

                if (prevTrend) {
                  newItem.it = prevTrend.t;
                  newItem.it_growth = prevTrend.t_growth;
                  newItem.it_strength = prevTrend.t_strength;
                } else if (gen == 'inflow' && lastTrends.inflows) {
                  newItem.it = lastTrends.inflows.t;
                  newItem.it_growth = lastTrends.inflows.t_growth;
                  newItem.it_strength = lastTrends.inflows.t_strength;
                } else if (gen == 'outflow' && lastTrends.outflows) {
                  newItem.it = lastTrends.outflows.t;
                  newItem.it_growth = lastTrends.outflows.t_growth;
                  newItem.it_strength = lastTrends.outflows.t_strength;
                } else if (lastTrends.account) {
                  newItem.it = lastTrends.account.t;
                  newItem.it_growth = lastTrends.account.t_growth;
                  newItem.it_strength = lastTrends.account.t_strength;
                }

                if (newItem.t) {
                  prevTrend = {
                    t: newItem.t,
                    t_growth: newItem.t_growth,
                    t_strength: newItem.t_strength,
                  };
                }

                let tTrend = newItem.t || newItem.it;
                let tTrendGrowth = newItem.t_growth || newItem.it_growth;
                let tTrendStrength = newItem.t_strength || newItem.it_strength;

                if (gen == 'opening') {
                  newItem.c = curBalance;

                  if (main) {
                    main.forEach((sub) => {
                      if (sub.id == 'inflows') {
                        curBalance += sub.dates[dateIndex].c * 1;
                      }
                      if (sub.id == 'outflows') {
                        curBalance -= sub.dates[dateIndex].c * 1;
                      }
                    });
                  }
                } else if (gen == 'closing') {
                  if (main) {
                    main.forEach((sub) => {
                      if (sub.id == 'inflows') {
                        curBalance += sub.dates[dateIndex].c * 1;
                      }
                      if (sub.id == 'outflows') {
                        curBalance -= sub.dates[dateIndex].c * 1;
                      }
                    });
                  }
                  newItem.c = curBalance;
                } else if (subs) {
                  newItem.c = 0;

                  subs.forEach((sub) => {
                    newItem.c += sub.dates[dateIndex].c * 1;
                  });
                } else {
                  if (eid) {
                    let dataKey = `${eid}_d_${date.date}`;
                    newItem.v = fdData[dataKey] || null;
                    newItem.c = newItem.v;

                    const applyGrowth = (amount) => {
                      let newAmount = amount;

                      if (tTrendGrowth) {
                        let gr = parseFloat(tTrendGrowth);

                        if (gr != 0) {
                          let growthRate = 1;

                          if (gr > 0) {
                            growthRate += gr / 100;
                          } else if (gr < 0) {
                            growthRate += gr / 100;
                          }

                          newAmount = Math.floor(newAmount * growthRate);
                          if (newAmount < 1) {
                            newAmount = 0;
                          }
                        }
                      }

                      return newAmount;
                    };

                    if (newItem.v) {
                    } else {
                      // Simple Growth
                      if (tTrend == 'simple_growth') {
                        let lastAllVal = null;

                        if (allVals.length > 0) {
                          [(lastAllVal = allVals[allVals.length - 1])];
                        }

                        if (lastAllVal !== null) {
                          let growthRate = 1;

                          let gr = parseFloat(tTrendGrowth);

                          if (gr > 0) {
                            growthRate += gr / 100;
                          } else if (gr < 0) {
                            growthRate += gr / 100;
                          }

                          newItem.c = Math.floor(lastAllVal * growthRate);
                          if (newItem.c < 1) {
                            newItem.c = 0;
                          }
                        }
                      }
                      if (tTrend == 'simulate') {
                        if (
                          mActuals.flow.dates[date.date] &&
                          dayjs(date.date).add(6, 'day').format('YYYY-MM-DD') < nowDateYmd
                        ) {
                          if (gen == 'inflow') {
                            if (mActuals.flow.dates[date.date]?.accounts[account]?.categories[category]) {
                              newItem.c =
                                mActuals.flow.dates[date.date].accounts[account].categories[category].amount_converted;
                            }
                          }
                          if (gen == 'outflow') {
                            if (mActuals.flow.dates[date.date]?.accounts[account]?.categories[category]) {
                              newItem.c =
                                mActuals.flow.dates[date.date].accounts[account].categories[category].amount_converted;
                            }
                          }

                          let maxAccuracyPeriods = 4;
                          let maxStrength = 100;
                          let strengthIncrease = 1 / maxAccuracyPeriods;

                          let useStrength = 50;

                          if (tTrendStrength) {
                            useStrength = tTrendStrength;
                          }

                          useStrength = useStrength * (strengthIncrease * forecastIndex);

                          if (useStrength > maxStrength) useStrength = maxStrength;

                          let mostOff = useStrength / 50;
                          let mostTotal = mostOff * 2;

                          let offAmount = newItem.c * mostTotal * getRandom();

                          let newStart = newItem.c - mostOff * newItem.c;

                          let newVal = newStart + offAmount;

                          newItem.c = newVal;
                        } else {
                          let sliceSize = 4;

                          if (tTrendStrength) {
                            sliceSize = Math.floor((mForecast.periods * tTrendStrength) / -100);
                          }

                          // Get Average
                          let smoothVals = allVals.slice(sliceSize);

                          if (smoothVals.length > 0) {
                            newItem.c = avg(smoothVals);
                          }

                          newItem.c = applyGrowth(newItem.c);

                          // let useStrength = 50;

                          // if (tTrendStrength) {
                          //   useStrength = tTrendStrength;
                          // }

                          // let mostOff = useStrength / 50;
                          // let mostTotal = mostOff * 2;

                          // let offAmount = newItem.c * mostTotal * getRandom();

                          // let newStart = newItem.c - mostOff * newItem.c;

                          // let newVal = newStart + offAmount;

                          // newItem.c = newVal;
                        }

                        // if (mActuals.accounts?.kDates[date.date]?.accounts[account]?.agg.clc) {

                        //   newItem.c = mActuals.accounts.kDates[date.date].accounts[account].agg.ifc;
                        // } else {
                        //   newItem.c = 1234;
                        // }

                        // Apply Growth
                      }
                      if (tTrend == 'smoothing') {
                        let sliceSize = 4;

                        if (tTrendStrength) {
                          sliceSize = Math.floor((mForecast.periods * tTrendStrength) / -100);
                        }

                        // Get Average
                        let smoothVals = allVals.slice(sliceSize);

                        if (smoothVals.length > 0) {
                          newItem.c = avg(smoothVals);
                        }

                        // Apply Growth
                        newItem.c = applyGrowth(newItem.c);
                      }
                      // AVERAGE
                      if (tTrend == 'average') {
                        let sliceSize = actualVals.length;

                        if (tTrendStrength) {
                          sliceSize = Math.floor((mForecast.periods * tTrendStrength) / -100);
                        }

                        let avgVals = actualVals.slice(sliceSize);

                        if (avgVals.length > 0) {
                          newItem.c = avg(avgVals);
                        }
                        // Apply Growth
                        newItem.c = applyGrowth(newItem.c);
                      }
                      if (tTrend == 'x_flowsense') {
                        let data = allVals.slice();

                        // Normalize data
                        const max = Math.max(...data);
                        const min = Math.min(...data);
                        const normalizedData = data.map((x) => (x - min) / (max - min));

                        // Window size for biweekly or 4-week trends
                        const WINDOW_SIZE = 8;

                        const xsData = [];
                        const ysData = [];

                        for (let i = 0; i < normalizedData.length - WINDOW_SIZE; i++) {
                          const inputWindow = normalizedData.slice(i, i + WINDOW_SIZE);
                          const outputValue = normalizedData[i + WINDOW_SIZE];
                          xsData.push(inputWindow);
                          ysData.push(outputValue);
                        }

                        const xs = tf.tensor2d(xsData); // shape: [num_samples, WINDOW_SIZE]
                        const ys = tf.tensor2d(ysData, [ysData.length, 1]);

                        // Build the model
                        const model = tf.sequential();
                        // model.add(tf.layers.dense({ units: 16, inputShape: [WINDOW_SIZE], activation: 'relu' }));
                        // // model.add(tf.layers.dense({ units: 1 }));
                        // model.add(tf.layers.dense({ units: 1, activation: 'relu' }));

                        model.add(tf.layers.dense({ units: 32, inputShape: [WINDOW_SIZE], activation: 'relu' }));
                        model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
                        model.add(tf.layers.dense({ units: 1, activation: 'relu' }));

                        model.compile({ loss: 'meanSquaredError', optimizer: 'adam' });

                        async function trainModel() {
                          await model.fit(xs, ys, { epochs: 40 });

                          // Get the last WINDOW_SIZE values to predict the next one
                          const lastWindow = normalizedData.slice(-WINDOW_SIZE);
                          const inputTensor = tf.tensor2d([lastWindow], [1, WINDOW_SIZE]);

                          const normalizedPrediction = model.predict(inputTensor).dataSync()[0];
                          const denormalizedPrediction = normalizedPrediction * (max - min) + min;

                          return denormalizedPrediction;
                        }

                        let results = await trainModel();

                        if (!results) results = 0;

                        newItem.c = results.toFixed(0) * 1;

                        // let model = new Arima({
                        //   p: 1, // AR order (non-seasonal)
                        //   d: 1, // Differencing order (non-seasonal)
                        //   q: 1, // MA order (non-seasonal)
                        //   P: 1, // Seasonal AR order
                        //   D: 1, // Seasonal differencing order
                        //   Q: 1, // Seasonal MA order
                        //   s: 4, // Seasonal period (every 4 weeks)
                        // });

                        // // Train the model

                        // model.train(allVals);

                        // // Forecast the next 4 weeks (or more)
                        // let forecast = model.predict(4);

                        // newItem.c = forecast[0][0].toFixed(0) * 1;

                        // Apply Growth
                        // newItem.c = applyGrowth(newItem.c);
                      }

                      // Linear Growth
                      if (tTrend == 'linear_growth') {
                        let lastAllVal = null;

                        if (allVals.length > 0) {
                          [(lastAllVal = allVals[allVals.length - 1])];
                        }

                        if (lastAllVal !== null) {
                          if (!tTrendGrowth) tTrendGrowth = 0;
                          let gr = parseFloat(tTrendGrowth);

                          newItem.c = Math.floor(lastAllVal * 1 + gr);
                        }
                      }
                    }

                    lastVal = newItem.c;
                  }
                }

                if (formatter) {
                  newItem = formatter({ date, newItem });
                }
              }

              newVal = newItem.c || 0;

              allVals.push(newVal);

              newDates.push(newItem);
              // return newItem;
            }
            // });

            return newDates;
          };

          // if (mForecast.grouping == 'categories_accounts') {
          if (mForecast.grouping == 'accounts_categories') {
            for (let accountIndex = 0; accountIndex < mAccounts.length; accountIndex++) {
              const account = mAccounts[accountIndex];

              // mAccounts.forEach(asyn(account) => {
              let eid = `ac_${account.id}_m`;

              mxAccount = {
                id: account.id,
                eid,
                name: account.name,
                type: 'main',
                dates: await genDates({
                  account: account.id,
                  eid,

                  formatter: ({ date, newItem }) => {
                    newItem.l = date.name;
                    return newItem;
                  },
                }),
                subs: [],
              };

              let inflowSubs = [];

              // mBuckets.forEach((bucket) => {

              for (let bucketIndex = 0; bucketIndex < mBuckets.length; bucketIndex++) {
                const bucket = mBuckets[bucketIndex];

                if (bucket.cod == 'credit') {
                  let eid = `ac_${account.id}_ct_${bucket.id}`;

                  inflowSubs.push({
                    id: bucket.id,
                    eid,
                    name: bucket.name,
                    type: 'flow',
                    dates: await genDates({
                      account: account.id,
                      category: bucket.id,
                      gen: 'inflow',
                      gen_type: 'category',
                      gen_id: bucket.id,
                      eid,
                      fdData,
                    }),
                  });
                }
              }
              // });

              eid = `ac_${account.id}_if`;

              mxAccount.subs.push({
                name: 'Inflows',
                type: 'flows',
                id: 'inflows',
                eid,
                dates: await genDates({
                  account: account.id,
                  gen: 'inflows',
                  subs: inflowSubs,
                  eid,
                }),
                subs: inflowSubs,
              });

              let outflowSubs = [];

              // mBuckets.forEach((bucket) => {
              for (let bucketIndex = 0; bucketIndex < mBuckets.length; bucketIndex++) {
                const bucket = mBuckets[bucketIndex];

                if (bucket.cod == 'debit') {
                  let eid = `ac_${account.id}_ct_${bucket.id}`;
                  outflowSubs.push({
                    id: bucket.id,
                    eid,
                    name: bucket.name,
                    type: 'flow',
                    dates: await genDates({
                      account: account.id,
                      category: bucket.id,
                      gen: 'outflow',
                      gen_type: 'category',
                      gen_id: bucket.id,
                      eid,
                    }),
                  });
                }
              }
              // });

              eid = `ac_${account.id}_of`;

              mxAccount.subs.push({
                name: 'Outflows',
                type: 'flows',
                id: 'outflows',
                eid,
                dates: await genDates({
                  account: account.id,
                  gen: 'outflows',
                  subs: outflowSubs,
                  eid,
                }),
                subs: outflowSubs,
              });

              eid = `ac_${account.id}_c`;

              mxAccount.subs.push({
                name: 'Closing Balance',
                id: 'closing',
                eid,
                dates: await genDates({
                  account: account.id,
                  gen: 'closing',
                  eid,

                  main: mxAccount.subs,
                }),
                type: 'balance',
              });

              eid = `ac_${account.id}_o`;

              mxAccount.subs.unshift({
                name: 'Opening Balance',
                id: 'opening',
                eid,
                dates: await genDates({
                  account: account.id,
                  gen: 'opening',

                  main: mxAccount.subs,
                  eid,
                }),
                type: 'balance',
              });

              matrix.subs.push(mxAccount);
            }
          }

          let saveElements = [];

          let aggElements = {};

          matrix.subs.forEach((main) => {
            main.subs.forEach((sub) => {
              let aggKey = `${sub.type}__${sub.id}`;

              if (!aggElements[aggKey]) {
                aggElements[aggKey] = {
                  type: sub.type,
                  type_id: sub.id,
                  account: 0,
                  values: sub.dates.map((d) => {
                    if (!d.ha && d.c && (d.c >= 0 || d.c === 0)) {
                      return d.c.toFixed(0);
                    } else {
                      return null;
                    }
                  }),
                };
              } else {
                sub.dates.forEach((d, dIndex) => {
                  let dateItem = dates[dIndex];

                  if (dateItem.type == 'forecast' && d.c && (d.c >= 0 || d.c === 0)) {
                    let addValue = d.c.toFixed(0) * 1;

                    let curValue = 0;

                    if (aggElements[aggKey].values[dIndex] !== null) {
                      curValue = aggElements[aggKey].values[dIndex] * 1;
                    }

                    aggElements[aggKey].values[dIndex] = curValue + addValue;
                  } else {
                  }
                });
              }

              saveElements.push({
                account: main.id,
                type: sub.type,
                type_id: sub.id,
                values: sub.dates.map((d, dIndex) => {
                  let dateItem = dates[dIndex];

                  if (dateItem.type == 'forecast' && d.c && (d.c >= 0 || d.c === 0)) {
                    return d.c.toFixed(0);
                  } else {
                    return null;
                  }
                }),
              });
            });
          });

          nDate.fa('save_data', { elements: [...saveElements, ...Object.values(aggElements)] });

          return {
            data: await nDate.m('data'),
            dates,
            matrix,
            accounts: mAccounts,
          };
        },
      },
    },
  },
];

module.exports = models;
