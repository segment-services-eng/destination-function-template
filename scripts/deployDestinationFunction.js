const vm = require('vm');
const { fetchWithRetry } = require('./lib/fetchWithRetry');
const { bundleFunction } = require('./bundle');
const { listFunctions, readFunctionConfig } = require('./listFunctions');
// DEPLOY_ENV identifies the target environment (DEV/QA/PROD) and is CI-agnostic.
// GITHUB_JOB is kept as a fallback for backward compatibility with older runs.
const { DEPLOY_ENV, GITHUB_JOB, FUNCTION_ID, PUBLIC_API_TOKEN } = process.env;
// `deployEnv` is interpolated into the generated function's comment header, so
// restrict it to a known allowlist. This prevents a crafted value (e.g. one
// containing `*/`) from breaking out of the comment and injecting code.
const ALLOWED_ENVS = ['DEV', 'QA', 'PROD'];
const rawDeployEnv = DEPLOY_ENV || GITHUB_JOB || 'UNKNOWN';
const deployEnv = ALLOWED_ENVS.includes(rawDeployEnv)
  ? rawDeployEnv
  : 'UNKNOWN';

/**
 * Which function this invocation deploys. One process deploys exactly one
 * function so that a failure is attributable to it and a CI matrix can report a
 * status per function.
 *
 * @return {string}
 */
function resolveFunctionName() {
  const requested = process.argv[2];
  const available = listFunctions();

  switch (true) {
    case !requested:
      throw new Error(
        `Usage: node scripts/deployDestinationFunction.js <function>\nAvailable: ${available.join(', ')}`
      );
    case !available.includes(requested):
      throw new Error(
        `Unknown function '${requested}'. Available: ${available.join(', ')}`
      );
    default:
      return requested;
  }
}

/**
 * The Segment function ID to deploy to.
 *
 * Read from the function's committed function.json, since a function ID is an
 * identifier rather than a credential. FUNCTION_ID in the environment overrides
 * it for one-off manual deploys.
 *
 * @param  {string} name
 * @return {string}
 */
function resolveFunctionId(name) {
  if (FUNCTION_ID) {
    console.log('Using FUNCTION_ID from the environment');
    return FUNCTION_ID;
  }

  const { functionIds } = readFunctionConfig(name);
  const functionId = functionIds?.[deployEnv.toLowerCase()];

  if (!functionId) {
    throw new Error(
      `functions/${name}/function.json has no functionIds.${deployEnv.toLowerCase()}. Add the Segment function ID for ${deployEnv}, or set FUNCTION_ID to override.`
    );
  }

  return functionId;
}

async function run() {
  const name = resolveFunctionName();
  const functionId = resolveFunctionId(name);

  // An unset token cannot become set mid-run — it is read from the environment
  // once, at module load — so no number of attempts can make this request
  // succeed. Report it as the configuration error it is.
  //
  // This says nothing about 403s from a real token: those stay retryable in
  // fetchWithRetry, because a token can legitimately be rejected while a
  // permission change propagates.
  if (!PUBLIC_API_TOKEN) {
    throw new Error(
      'PUBLIC_API_TOKEN is not set. In GitHub Actions it comes from the environment secret; in Buildkite from .buildkite/fetch-secrets.sh.'
    );
  }

  // Shared lib/ code is inlined here; the sandbox has no module system at
  // runtime. See scripts/bundle.js.
  const functionCode = await bundleFunction(name);

  // The leading line must stay `Output from <ENV> Buildkite deploy` so the
  // downstream bundling lambda replaces this header in place instead of stacking
  // a second one on top of it.
  const code = `/**
 * Output from ${deployEnv} Buildkite deploy
 * - Function: ${name}
 * - Last Deployed: ${new Date().toISOString()}
 */

${functionCode}
  `;
  /**
   * Ensure `code` is valid JavaScript
   */
  try {
    new vm.Script(code);
  } catch (error) {
    throw new Error('JavaScript Is Not Valid, Exiting', error);
  }
  /**
   * Push to Function Instance
   */
  const headers = {
    Authorization: `Bearer ${PUBLIC_API_TOKEN}`,
    'Content-Type': 'application/json'
  };
  console.log(`Deploying ${name} to ${deployEnv} (${functionId})`);
  const response = await fetchWithRetry(
    `https://api.segmentapis.com/functions/${functionId}`,
    {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ code })
    },
    // The deployed code payload can be large; allow well beyond the default
    // timeout so the upload isn't aborted mid-flight and retried (which can
    // orphan a partially-created version).
    { timeoutMs: 120000 }
  );
  console.log(`Response: ${response.status} ${response.statusText}`);

  if (response.status !== 200) {
    throw new Error(`Error: ${response.status} ${response.statusText}`);
  }

  const result = await response.json();
  if (result.errors) {
    throw new Error(`Segment API returned errors: ${JSON.stringify(result)}`);
  }
  if (result.data.function.deployedAt) {
    const { deployedAt } = result.data.function;
    console.log(`Successfully Pushed Function Code: ${deployedAt}`);
  }
}

run().catch(error => {
  console.error(error.message);
  process.exit(1);
});
