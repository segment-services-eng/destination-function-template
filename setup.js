module.exports = async function () {
  globalThis.btoa = require('btoa');
  globalThis.fetch = require('jest-fetch-mock');
  fetch.enableMocks();
  globalThis._ = require('lodash');
  globalThis.moment = require('moment-timezone');
  globalThis.RetryError = class RetryError extends Error {
    constructor(message) {
      super(message);
      this.name = this.constructor.name;
    }
  };
};
