const { listFunctions } = require('../scripts/listFunctions');

// Environment gates, identical in meaning to the GitHub Actions workflow:
//   * DEV  — feature-branch builds (not main).
//   * QA   — the PR carries the !!_RELEASE_TO_QA label.
//   * PROD — the main branch.
// `filter` is the Buildkite attribute that expresses each gate; a step whose
// gate excludes it publishes no commit status, so an un-run QA correctly leaves
// merge blocked until the label is applied.
const ENVIRONMENTS = [
  { name: 'DEV', filter: { branches: '!main' } },
  {
    name: 'QA',
    filter: { if: 'build.pull_request.labels includes "!!_RELEASE_TO_QA"' }
  },
  { name: 'PROD', filter: { if: 'build.branch == "main"' } }
];

const ROLE_ARN =
  'arn:aws:iam::058449100246:role/twilio-internal_destination-function-template';
// Docker Hub is not reachable from the agents; registry.twilio.com is.
const NODE_IMAGE = 'registry.twilio.com/library/base-node/22:22';

/**
 * The command for one function's deploy in one environment.
 *
 * `set -euo pipefail` plus the chained `&&` make any failure — a failed secret
 * fetch, a test failure, a deploy error — fail the step before it can report a
 * green status. HUSKY=0 skips the git-hook install inside the container.
 *
 * @param  {string} name function to deploy
 * @return {string}
 */
function deployCommand(name) {
  return `set -euo pipefail
source .buildkite/fetch-secrets.sh
docker run --rm \\
  -v "$$PWD":/workdir -w /workdir \\
  -e DEPLOY_ENV \\
  -e HUSKY=0 \\
  -e PUBLIC_API_TOKEN \\
  ${NODE_IMAGE} \\
  sh -c 'npm ci --no-audit --no-fund --loglevel=error && npm test && node ./scripts/deployDestinationFunction.js ${name}'
`;
}

/**
 * One deploy step per function per environment.
 *
 * The function list comes from the filesystem, so adding a function needs no
 * change here. Steps share a concurrency group because the Segment Public API
 * token is shared and rate-limits under burst — a repo with many functions would
 * otherwise 429 itself.
 *
 * @return {object} a Buildkite pipeline ready for `pipeline upload`
 */
function generatePipeline() {
  const functionNames = listFunctions();

  if (functionNames.length === 0) {
    throw new Error(
      'No functions found under functions/. Each function needs a handlers.js.'
    );
  }

  const steps = ENVIRONMENTS.flatMap(({ name: envName, filter }) =>
    functionNames.map(functionName => ({
      label: `:rocket: ${envName} ${functionName}`,
      key: `${envName}_${functionName}`,
      ...filter,
      env: { DEPLOY_ENV: envName },
      concurrency: 1,
      concurrency_group: 'segment-public-api',
      plugins: [
        { 'aws-assume-role-with-web-identity#v1.6.0': { 'role-arn': ROLE_ARN } }
      ],
      command: deployCommand(functionName)
    }))
  );

  return { agents: { queue: 'general-001' }, steps };
}

module.exports = { ENVIRONMENTS, generatePipeline };

/* istanbul ignore next -- CLI entry point, exercised by CI not by unit tests */
if (require.main === module) {
  // JSON is valid YAML, so `buildkite-agent pipeline upload` accepts this
  // directly and no YAML serializer dependency is needed.
  console.log(JSON.stringify(generatePipeline(), null, 2));
}
