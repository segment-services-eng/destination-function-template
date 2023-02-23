/* eslint-disable no-unused-vars */
module.exports = function (wallaby) {
  return {
    files: ['**/src/*.js'],
    tests: ['**/src/*.test.js'],
    env: {
      type: 'node'
    },
    setup: function (wallaby) {
      const btoa = require('btoa');
      const _ = require('lodash');
      const moment = require('moment');
      const crypto = require('crypto');
      const fetch = require('jest-fetch-mock');
      fetch.enableMocks();
    },
    trace: true
  };
};
