const fs = require('fs');
const path = require('path');
const vm = require('vm');
// DEPLOY_ENV identifies the target environment (DEV/QA/PROD) and is CI-agnostic.
// GITHUB_JOB is kept as a fallback for backward compatibility with older runs.
const { DEPLOY_ENV, GITHUB_JOB, FUNCTION_ID, PUBLIC_API_TOKEN } = process.env;
const deployEnv = DEPLOY_ENV || GITHUB_JOB || 'UNKNOWN';

/**
 * Implement Fetch w/ Retries
 */
const nodeFetch = require('node-fetch');
const fetch = require('fetch-retry')(nodeFetch);
const fetchRetryOptions = {
  retries: 12,
  retryDelay: attempt => Math.pow(2, attempt) * 1000, // 1000, 2000, 4000
  retryOn: (attempt, error, response) => {
    const { status, statusText } = response;
    // retry on any network error, or 4xx or 5xx status codes
    if (error !== null || status >= 400) {
      console.log(`Response ${status} ${statusText}. Retry, ${attempt + 1}/12`);
      return true;
    }
  }
};

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
    const response = await fetch(
      `https://api.segmentapis.com/functions/${FUNCTION_ID}`,
      {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ code }),
        ...fetchRetryOptions
      }
    );
    console.log(`Response: ${response.status} ${response.statusText}`);

    if (response.status === 200) {
      const result = await response.json();
      if (result.errors) {
        console.log(result);
        throw new Error(result.errors);
      }
      if (result.data.function.deployedAt) {
        const { deployedAt } = result.data.function;
        console.log(`Successfully Pushed Function Code: ${deployedAt}`);
      }
    } else {
      throw new Error(`Error: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    throw new Error(error);
  }
}
run();
