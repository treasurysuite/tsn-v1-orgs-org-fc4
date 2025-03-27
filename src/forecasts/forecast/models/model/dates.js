const flowdocManager = require('../../../../../lib/FlowdocManager.js');
const dayjs = require('dayjs');

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
      full: {
        return: async (nDate) => {
          let mForecast = await nDate.parents('forecast').m('data');

          let mAccounts = await nDate.parents('forecast').m('accounts');
          let mBuckets = await nDate.parents('org').nodules('./cat/buckets').m('list');

          let flowDoc = flowdocManager.getInstance({
            nodule: nDate.path.full,
            item: 'main',
          });
          await flowDoc.ini();

          let fdData = await flowDoc.data();

          let dates = [];

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
            });

            curDate = curDate.add(1, mForecast.interval);
          }

          let matrix = {
            subs: [],
          };

          let genDates = ({ eid, item = {}, formatter, subs, gen, main, opening, accountInheretTrend }) => {
            let lastVal = null;

            let curBalance = opening || 0;

            let prevTrend = null;

            let newDates = dates.map((date, dateIndex) => {
              let newItem = { ...item };

              let fields = ['n', 't'];

              if (prevTrend) {
                newItem.it = prevTrend;
              } else if (accountInheretTrend) {
                newItem.it = accountInheretTrend;
              }

              fields.forEach((field) => {
                if (fdData[`${eid}_d_${date.date}_${field}`]) {
                  newItem[field] = fdData[`${eid}_d_${date.date}_${field}`];
                }
              });

              if (newItem.t) {
                prevTrend = newItem.t;
              }

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
                    if (lastVal !== null) {
                      newItem.c = Math.floor(lastVal * 1.15);
                    }
                  }

                  lastVal = newItem.c;
                }
              }

              if (formatter) {
                newItem = formatter({ date, newItem });
              }
              return newItem;
            });
            return newDates;
          };

          if (mForecast.grouping == 'accounts_categories') {
            mAccounts.forEach((account) => {
              let eid = `ac_${account.id}_m`;

              let accountInheretTrend = null;

              if (fdData[`${eid}_d_${curDateYmd}_t`]) {
                accountInheretTrend = fdData[`${eid}_d_${curDateYmd}_t`];
              }

              console.log('accountInheretTrend', accountInheretTrend);

              mxAccount = {
                id: account.id,
                eid,
                name: account.name,
                type: 'main',
                dates: genDates({
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
