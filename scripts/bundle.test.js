const vm = require('vm');
const { SEGMENT_HANDLERS, bundleFunction } = require('./bundle');
const { listFunctions, functionEntryPoint } = require('./listFunctions');

// This suite runs against every function in the repo, so adding a function adds
// its bundle to the safety net automatically. It is the cross-function test: it
// proves shared lib/ code is inlined correctly and that what gets deployed is
// something Segment's sandbox can actually run.
const functionNames = listFunctions();
const HANDLER_NAMES = Object.keys(SEGMENT_HANDLERS);

// The same globals setup.js gives the unit tests, which is what Segment's runtime
// provides. Built per evaluation so bundles cannot observe each other.
function sandboxGlobals() {
  return {
    console: {
      log: () => {},
      time: () => {},
      timeEnd: () => {},
      error: () => {}
    },
    fetch: () => Promise.resolve({ status: 200, json: () => ({}) }),
    btoa: require('btoa'),
    _: require('lodash'),
    moment: require('moment-timezone'),
    RetryError: class RetryError extends Error {}
  };
}

const SMOKE_EVENT = { userId: 'user-1', event: 'Smoke Test', properties: {} };

// onBatch receives an array of events; every other handler receives one event.
// Handing onBatch a bare object would fail any handler that maps over its input.
function fixtureFor(handlerName) {
  return SEGMENT_HANDLERS[handlerName] === 'events'
    ? [SMOKE_EVENT]
    : SMOKE_EVENT;
}

// Bundling is the expensive part, so each function is bundled once and shared by
// its assertions.
const bundles = new Map();
function getBundle(name) {
  if (!bundles.has(name)) {
    bundles.set(name, bundleFunction(name));
  }
  return bundles.get(name);
}

describe('function bundles', () => {
  it('should discover at least one function to deploy', () => {
    expect.assertions(1);
    expect(functionNames.length).toBeGreaterThan(0);
  });

  describe.each(functionNames)('%s', name => {
    it('should be valid standalone script syntax', async () => {
      expect.assertions(1);
      const bundled = await getBundle(name);
      // vm.Script rejects import/export, so this is the same gate the deploy
      // script applies before uploading.
      expect(() => new vm.Script(bundled)).not.toThrow();
    });

    it('should not depend on a module system at runtime', async () => {
      expect.assertions(3);
      const bundled = await getBundle(name);
      expect(bundled).not.toMatch(/\brequire\s*\(/);
      expect(bundled).not.toMatch(/^\s*import[\s{]/m);
      expect(bundled).not.toMatch(/^\s*export[\s{]/m);
    });

    it('should expose every exported handler as a top-level function', async () => {
      expect.assertions(2);
      const bundled = await getBundle(name);
      const context = vm.createContext(sandboxGlobals());
      new vm.Script(bundled).runInContext(context);

      const topLevel = HANDLER_NAMES.filter(
        handlerName => typeof context[handlerName] === 'function'
      );
      // Compare against the source module: a handler the author exported but the
      // bundler failed to surface would be a function that silently never fires.
      const exported = HANDLER_NAMES.filter(
        handlerName =>
          typeof require(functionEntryPoint(name))[handlerName] === 'function'
      );

      expect(exported.length).toBeGreaterThan(0);
      expect(topLevel).toStrictEqual(exported);
    });

    it('should run its handlers against a minimal event', async () => {
      expect.assertions(1);
      const bundled = await getBundle(name);
      const context = vm.createContext(sandboxGlobals());
      new vm.Script(bundled).runInContext(context);

      const invocations = HANDLER_NAMES.filter(
        handlerName => typeof context[handlerName] === 'function'
      ).map(handlerName => context[handlerName](fixtureFor(handlerName), {}));

      // Settings are empty, so handlers must degrade rather than throw — a
      // handler that assumes configuration is present is a deploy-time bug.
      await expect(Promise.all(invocations)).resolves.toBeDefined();
    });
  });
});
