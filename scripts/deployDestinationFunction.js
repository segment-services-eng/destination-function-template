const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { fetchWithRetry } = require('./lib/fetchWithRetry');
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

async function run() {
  const functionCode = fs.readFileSync(
    path.resolve('./src', 'index.js'),
    'utf8'
  );
  const code = `/**
 * Output from ${deployEnv} Buildkite deploy
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
  try {
    const headers = {
      Authorization: `Bearer ${PUBLIC_API_TOKEN}`,
      'Content-Type': 'application/json'
    };
    const response = await fetchWithRetry(
      `https://api.segmentapis.com/functions/${FUNCTION_ID}`,
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

    if (response.status === 200) {
      const result = await response.json();
      if (result.errors) {
        console.log(result);
        process.exit(1);
      }
      if (result.data.function.deployedAt) {
        const { deployedAt } = result.data.function;
        console.log(`Successfully Pushed Function Code: ${deployedAt}`);
      }
    } else {
      console.log(`Error: ${response.status} ${response.statusText}`);
      process.exit(1);
    }
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
}
run();
