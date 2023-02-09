export const QUERIES = [
  {
    input: {},
    output: {
      query: {
        bool: {
          must_not: [
            {
              term: {
                deleted: 'true',
              },
            },
          ],
        },
      },
    },
  },
  {
    input: {
      query: {},
    },
    output: {
      query: {
        bool: {
          must_not: [
            {
              term: {
                deleted: 'true',
              },
            },
          ],
        },
      },
    },
  },
  {
    input: {
      query: {
        bool: {},
      },
    },
    output: {
      query: {
        bool: {
          must_not: [
            {
              term: {
                deleted: 'true',
              },
            },
          ],
        },
      },
    },
  },
  {
    input: {
      query: {
        bool: {
          must_not: [],
        },
      },
    },
    output: {
      query: {
        bool: {
          must_not: [
            {
              term: {
                deleted: 'true',
              },
            },
          ],
        },
      },
    },
  },

  {
    input: {
      query: {
        bool: {
          must: [
            {
              match_all: {},
            },
          ],
        },
      },
      size: 9,
    },
    output: {
      query: {
        bool: {
          must: [
            {
              match_all: {},
            },
          ],
          must_not: [
            {
              term: {
                deleted: 'true',
              },
            },
          ],
        },
      },
      size: 9,
    },
  },
  {
    input: {
      query: {
        bool: {
          must: [
            {
              match_all: {},
            },
          ],
          must_not: [
            {
              foo: 'bar',
            },
          ],
        },
      },
      size: 9,
    },
    output: {
      query: {
        bool: {
          must: [
            {
              match_all: {},
            },
          ],
          must_not: [
            {
              foo: 'bar',
            },
            {
              term: {
                deleted: 'true',
              },
            },
          ],
        },
      },
      size: 9,
    },
  },
];
