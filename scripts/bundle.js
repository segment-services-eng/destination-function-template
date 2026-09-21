const vm = require('vm');
const esbuild = require('esbuild');
const { functionEntryPoint } = require('./listFunctions');

/**
 * Handler names Segment's destination-function runtime invokes. A bundle must
 * expose at least one of these as a top-level function or the deployed function
 * would silently receive no events.
 *
 * The value is the parameter name used in the generated wrapper, which shows up
 * in the deployed code a human reads in the Segment UI.
 */
const SEGMENT_HANDLERS = {
  onTrack: 'event',
  onIdentify: 'event',
  onGroup: 'event',
  onPage: 'event',
  onScreen: 'event',
  onAlias: 'event',
  onDelete: 'event',
  onBatch: 'events'
};

/**
 * Sandbox globals Segment's runtime provides. Stubbed only so a bundle can be
 * evaluated here to discover which handlers it exports; the real values come
 * from the runtime (and from setup.js under test).
 */
function sandboxStubs() {
  return {
    console,
    fetch: () => {},
    btoa: () => '',
    _: {},
    moment: () => {},
    RetryError: class RetryError extends Error {}
  };
}

/**
 * Bundle one function into a single file Segment's sandbox can run.
 *
 * Segment functions are evaluated as one standalone script with no module
 * system, so shared `lib/` code has to be inlined rather than required at
 * runtime. esbuild does the inlining, following the require graph so a bundle
 * carries only the lib modules that function reaches. A generated wrapper then
 * re-declares each handler at the top level, which is the shape the runtime
 * looks for and the shape a human hand-writes in the Segment UI.
 *
 * An import that cannot be resolved from the repo — an npm package, say — fails
 * the build here, which is correct: the sandbox has no node_modules.
 *
 * @param  {string} name function directory name under functions/
 * @return {Promise<string>} sandbox-ready JavaScript
 */
async function bundleFunction(name) {
  const result = await esbuild.build({
    entryPoints: [functionEntryPoint(name)],
    bundle: true,
    write: false,
    format: 'iife',
    globalName: '__handlers',
    platform: 'neutral',
    target: 'node22',
    legalComments: 'none',
    charset: 'utf8'
  });

  const bundled = result.outputFiles[0].text.trimEnd();
  const handlerNames = discoverHandlers(bundled, name);

  const wrappers = handlerNames.map(handlerName => {
    const argName = SEGMENT_HANDLERS[handlerName];
    return `async function ${handlerName}(${argName}, settings) {
  return __handlers.${handlerName}(${argName}, settings);
}`;
  });

  return [bundled, ...wrappers].join('\n\n');
}

/**
 * Which Segment handlers a bundle actually exports.
 *
 * Read by evaluating the bundle rather than by parsing it, so the answer comes
 * from the same code that will run in production — re-exports and conditional
 * exports are reflected accurately.
 *
 * @param  {string} bundled esbuild output assigning the IIFE to __handlers
 * @param  {string} name    function name, for error messages
 * @return {string[]}
 */
function discoverHandlers(bundled, name) {
  const context = vm.createContext(sandboxStubs());
  const exported = new vm.Script(`${bundled}\n;__handlers;`).runInContext(
    context
  );

  const handlerNames = Object.keys(SEGMENT_HANDLERS).filter(
    handlerName => typeof exported?.[handlerName] === 'function'
  );

  if (handlerNames.length === 0) {
    throw new Error(
      `functions/${name}/handlers.js exports no Segment handler. Export at least one of: ${Object.keys(
        SEGMENT_HANDLERS
      ).join(', ')}`
    );
  }

  return handlerNames;
}

module.exports = { SEGMENT_HANDLERS, bundleFunction };
