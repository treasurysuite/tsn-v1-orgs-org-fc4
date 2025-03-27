let models = [
  {
    table: 'org_fc4_forecast_models',
    nodule: 'orgs/org/fc4/forecasts/forecast/models',
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
    nodule: 'orgs/org/fc4/forecasts/forecast/models/model',
    access: {
      admin: true,
    },

    forms: {
      delete: {
        fields: ['status'],
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
    },
  },
];

module.exports = models;
