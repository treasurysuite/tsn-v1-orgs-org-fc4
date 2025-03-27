const flowdocManager = require('../../../../../lib/FlowdocManager.js');
const dayjs = require('dayjs');
const _ = require('lodash');

const avg = (arr) => arr.reduce((acc, v, i, a) => acc + v / a.length, 0);

const actualsDo = async (nDate) => {
  let mForecast = await nDate.parents('forecast').m('data');
  let mAccounts = await nDate.parents('forecast').m('accounts');

  console.log('mAccounts', mAccounts);

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
    end_date: curDateYmd,
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
        fields: ['id', 'created', 'updated', 'name'],
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
      update: {
        fields: ['name'],
      },
    },
    models: {
      data: {
        subscribe: true,
        fields: ['id', 'created', 'updated', 'name'],
      },
      actuals: {
        return: async (nDate) => {
          return await actualsDo(nDate);

          // let cacheName = `${nDate.path.full}_actuals_v8`;

          // let cached = await nDate.schema.ledis.oGet(cacheName);

          // if (cached) {
          //   let ttl = await nDate.schema.ledis.ttl(cacheName);
          //   if (ttl < 50) {
          //     setTimeout(async () => {
          //       let newdata = await actualsDo(nDate);
          //       nDate.schema.ledis.oSet(cacheName, newdata, 100);
          //     }, 0);
          //   }

          //   return cached;
          // } else {
          //   let newdata = await actualsDo(nDate);
          //   nDate.schema.ledis.oSet(cacheName, newdata, 100);

          //   return newdata;
          // }
        },
      },

      full: {
        return: async (nDate) => {
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

          let dates = mActuals.accounts.dates.map((date) => {
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

          let curDate = dayjs(nDate.path.id);

          let curDateYmd = curDate.format('YYYY-MM-DD');

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

          let genDates = ({
            eid,
            item = {},
            account,
            formatter,
            subs,
            gen,
            main,
            category,
            opening,
            accountInheretTrend,
          }) => {
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

            let newDates = dates.map((date, dateIndex) => {
              let newVal = 0;

              let newItem = { ...item };

              let fields = ['n', 't', 't_growth'];

              fields.forEach((field) => {
                if (fdData[`${eid}_d_${date.date}_${field}`]) {
                  newItem[field] = fdData[`${eid}_d_${date.date}_${field}`];
                }
              });

              if (fdData[`ac_${account}_m_d_${date.date}_t`]) {
                lastTrends.account = {
                  t: fdData[`ac_${account}_m_d_${date.date}_t`],
                  t_growth: fdData[`ac_${account}_m_d_${date.date}_t_growth`],
                };
              }

              if (fdData[`ac_${account}_if_d_${date.date}_t`]) {
                lastTrends.inflows = {
                  t: fdData[`ac_${account}_if_d_${date.date}_t`],
                  t_growth: fdData[`ac_${account}_if_d_${date.date}_t_growth`],
                };
              }
              if (fdData[`ac_${account}_of_d_${date.date}_t`]) {
                lastTrends.outflows = {
                  t: fdData[`ac_${account}_of_d_${date.date}_t`],
                  t_growth: fdData[`ac_${account}_of_d_${date.date}_t_growth`],
                };
              }

              // let lastClosing = null

              if (date.type == 'actual') {
                newItem.c = null;

                if (account) {
                  if (mActuals.accounts.kDates[date.date]?.accounts[account]?.agg) {
                    curBalance = mActuals.accounts.kDates[date.date].accounts[account].agg.clc;

                    if (gen == 'opening') {
                      newItem.c = mActuals.accounts.kDates[date.date].accounts[account].agg.opc;
                    }
                    if (gen == 'closing') {
                      newItem.c = mActuals.accounts.kDates[date.date].accounts[account].agg.clc;
                    }
                    if (gen == 'inflows') {
                      newItem.c = mActuals.accounts.kDates[date.date].accounts[account].agg.ifc;
                    }
                    if (gen == 'outflows') {
                      newItem.c = mActuals.accounts.kDates[date.date].accounts[account].agg.ofc;
                    }
                  }

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
                }
                actualVals.push(newItem.c);
              } else {
                if (prevTrend) {
                  newItem.it = prevTrend.t;
                  newItem.it_growth = prevTrend.t_growth;
                } else if (gen == 'inflow' && lastTrends.inflows) {
                  newItem.it = lastTrends.inflows.t;
                  newItem.it_growth = lastTrends.inflows.t_growth;
                } else if (gen == 'outflow' && lastTrends.outflows) {
                  newItem.it = lastTrends.outflows.t;
                  newItem.it_growth = lastTrends.outflows.t_growth;
                } else if (lastTrends.account) {
                  newItem.it = lastTrends.account.t;
                  newItem.it_growth = lastTrends.account.t_growth;
                }

                if (newItem.t) {
                  prevTrend = {
                    t: newItem.t,
                    t_growth: newItem.t_growth,
                  };
                }

                let tTrend = newItem.t || newItem.it;
                let tTrendGrowth = newItem.t_growth || newItem.it_growth;

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
                      if (tTrend == 'smoothing') {
                        let smoothVals = allVals.slice(-4);

                        console.log('smoothVals', smoothVals);

                        if (smoothVals.length > 0) {
                          newItem.c = avg(smoothVals);
                        }
                      }
                      if (tTrend == 'average') {
                        let avgVals = actualVals.slice();

                        console.log('avgVals', avgVals);

                        if (avgVals.length > 0) {
                          newItem.c = avg(avgVals);
                        }
                      }

                      // Linear Growth
                      if (tTrend == 'linear_growth') {
                        let lastAllVal = null;

                        if (allVals.length > 0) {
                          [(lastAllVal = allVals[allVals.length - 1])];
                        }

                        if (lastAllVal !== null) {
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

              return newItem;
            });

            return newDates;
          };

          if (mForecast.grouping == 'accounts_categories') {
            mAccounts.forEach((account) => {
              let eid = `ac_${account.id}_m`;

              let accountInheretTrend = null;

              if (fdData[`${eid}_d_${curDateYmd}_t`]) {
                accountInheretTrend = {
                  t: fdData[`${eid}_d_${curDateYmd}_t`],
                  t_growth: fdData[`${eid}_d_${curDateYmd}_t_growth`],
                };
              }

              mxAccount = {
                id: account.id,
                eid,
                name: account.name,
                type: 'main',
                dates: genDates({
                  account: account.id,
                  accountInheretTrend,
                  eid,
                  item: {},
                  formatter: ({ date, newItem }) => {
                    newItem.l = date.name;
                    return newItem;
                  },
                }),
                subs: [],
              };

              let inflowSubs = [];

              mBuckets.forEach((bucket) => {
                if (bucket.cod == 'credit') {
                  let eid = `ac_${account.id}_ct_${bucket.id}`;

                  inflowSubs.push({
                    id: bucket.id,
                    eid,
                    name: bucket.name,
                    type: 'flow',
                    dates: genDates({
                      account: account.id,
                      category: bucket.id,
                      gen: 'inflow',
                      gen_type: 'category',
                      gen_id: bucket.id,
                      eid,
                      accountInheretTrend,
                      fdData,
                      item: {
                        v: null,
                        c: null,
                        t: null,
                      },
                    }),
                  });
                }
              });

              eid = `ac_${account.id}_if`;

              mxAccount.subs.push({
                name: 'Inflows',
                type: 'flows',
                id: 'inflows',
                eid,
                dates: genDates({
                  account: account.id,
                  gen: 'inflows',
                  subs: inflowSubs,
                  accountInheretTrend,
                  eid,
                  item: {},
                }),
                subs: inflowSubs,
              });

              let outflowSubs = [];

              mBuckets.forEach((bucket) => {
                if (bucket.cod == 'debit') {
                  let eid = `ac_${account.id}_ct_${bucket.id}`;
                  outflowSubs.push({
                    id: bucket.id,
                    eid,
                    name: bucket.name,
                    type: 'flow',
                    dates: genDates({
                      account: account.id,
                      category: bucket.id,
                      gen: 'outflow',
                      gen_type: 'category',
                      gen_id: bucket.id,
                      eid,
                      accountInheretTrend,
                      item: {
                        v: null,
                        c: null,
                        t: null,
                      },
                    }),
                  });
                }
              });

              eid = `ac_${account.id}_of`;

              mxAccount.subs.push({
                name: 'Outflows',
                type: 'flows',
                id: 'outflows',
                eid,
                dates: genDates({
                  account: account.id,
                  gen: 'outflows',
                  subs: outflowSubs,
                  eid,
                  accountInheretTrend,
                  item: {
                    v: 0,
                  },
                }),
                subs: outflowSubs,
              });

              eid = `ac_${account.id}_c`;

              mxAccount.subs.push({
                name: 'Closing Balance',
                id: 'closing',
                eid,
                dates: genDates({
                  account: account.id,
                  gen: 'closing',
                  eid,
                  opening: 1000,
                  accountInheretTrend,
                  main: mxAccount.subs,
                  item: {},
                }),
                type: 'balance',
              });

              eid = `ac_${account.id}_o`;

              mxAccount.subs.unshift({
                name: 'Opening Balance',
                id: 'opening',
                eid,
                dates: genDates({
                  account: account.id,
                  gen: 'opening',
                  opening: 1000,
                  main: mxAccount.subs,
                  accountInheretTrend,
                  eid,
                  item: {},
                }),
                type: 'balance',
              });

              matrix.subs.push(mxAccount);
            });
          }

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
