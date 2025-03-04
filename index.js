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

    forms: {},
    urls: {},
    models: {
      test: {
        return: ['xyz'],
      },
    },
  },
];
