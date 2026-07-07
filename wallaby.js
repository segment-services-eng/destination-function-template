module.exports = function () {
  // Follow the Jest configuration as the single source of truth: Wallaby
  // auto-detects jest.config.js (setup.js, coverageProvider, collectCoverageFrom),
  // so the test globals and coverage settings never drift from the CI run.
  return {
    autoDetect: ['jest']
  };
};
