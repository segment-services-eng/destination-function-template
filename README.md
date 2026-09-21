![Segment_Functions](https://github.com/segment-services-eng/destination-function-template/assets/7215306/4db77bc8-7466-40a0-95ae-5ad7a63cda9d)

# Destination Function Template

> Base template to deploy your next destination function with — one function or a
> whole set of them, sharing code.

1. Click `Use This Template` above (If Segment PS, add to `Segment Services Engineering` Organization)

## Setup Steps

1. `nvm use` (to get the right version of NodeJS)
   - [If needed, install `nvm`](https://github.com/nvm-sh/nvm#install--update-script)
2. `npm install` (to install npm dependencies)

## Repo layout

```
functions/
  template/
    handlers.js       # the function: exports onTrack, onIdentify, …
    handlers.test.js
    function.json     # per-environment Segment function IDs
    README.md         # what it does and which settings it needs
lib/                  # shared helpers, required by any function
scripts/              # discovery, bundling, deploy
```

Every directory under `functions/` containing a `handlers.js` is a deployable
function. The list is discovered from disk (`npm run functions`), so **adding a
function requires no change to CI, coverage config, or any list** — one function
and ten functions work the same way.

### Adding a function

```sh
npm run new:function -- sendToWebhook
```

Then fill in `functions/sendToWebhook/function.json` with the Segment function IDs
for each environment, and implement `handlers.js` plus its tests.

### Sharing code

Put helpers in `lib/` and `require` them from any function:

```js
const { queryProfileAPI } = require('../../lib/queryProfileAPI');
```

Segment runs a destination function as a **single standalone script with no module
system**, so shared code cannot be required at runtime. At deploy time
[`scripts/bundle.js`](scripts/bundle.js) uses esbuild to inline the require graph
into one file and then re-declares each handler at the top level, which is the
shape the runtime looks for:

```js
var __handlers = (() => {
  /* lib/ + handlers.js inlined here */
})();

async function onTrack(event, settings) {
  return __handlers.onTrack(event, settings);
}
```

Only the lib modules a function actually reaches are included. Sandbox globals
(`fetch`, `btoa`, `_`, `moment`, `RetryError`) are left alone as free identifiers,
and an import that cannot be resolved from the repo — an npm package, say — fails
the build rather than shipping something the sandbox cannot run.

To see exactly what would be uploaded:

```sh
npm run bundle -- template
```

## To Test

```sh
npm run test
```

- Handler and `lib/` tests sit next to their source as `*.test.js`, and must keep
  100% coverage.
- [`scripts/bundle.test.js`](scripts/bundle.test.js) runs across **every** function:
  it bundles each one, checks it is valid standalone script syntax with no module
  system left in it, evaluates it with the sandbox globals, and invokes its
  handlers. Adding a function adds it to that safety net automatically.
- CI runs the same `npm test` before any deploy.

## Deploying

A deploy pushes **one function** to **one environment**:

```sh
node scripts/deployDestinationFunction.js template
```

- `DEPLOY_ENV` (`DEV` | `QA` | `PROD`) selects the environment and the function ID.
- `PUBLIC_API_TOKEN` is the only secret required.
- The function ID comes from `functions/<name>/function.json`. A function ID is an
  identifier rather than a credential — it does nothing without the API token — so
  it is committed, which keeps adding a function free of secret management. Set
  `FUNCTION_ID` in the environment to override for a one-off manual deploy.

### Via GitHub Actions (primary)

[`.github/workflows/deployDestinationFunction.yml`](.github/workflows/deployDestinationFunction.yml)
runs tests once, discovers the functions, then fans out one deploy per function per
environment:

| Environment | Runs when                                   |
| ----------- | ------------------------------------------- |
| `DEV`       | any branch other than `main`                |
| `QA`        | the PR carries the `!!_RELEASE_TO_QA` label |
| `PROD`      | a push to `main`                            |

Setup:

1. Create the Function in your Segment workspace for each environment and paste the
   IDs into each `function.json`.
2. Create a Segment Public API token.
3. Create GitHub Environments `DEV`, `QA` and `PROD`, each with a
   `PUBLIC_API_TOKEN` secret.

Legs are serialised (`max-parallel: 1`) because the Public API token rate-limits
under burst, and `fail-fast: false` keeps one broken function from cancelling its
siblings.

### Via Buildkite (Twilio-internal)

[`.buildkite/pipeline.yml`](.buildkite/pipeline.yml) is a bootstrap that runs
[`.buildkite/generatePipeline.js`](.buildkite/generatePipeline.js) and uploads the
generated steps — the same function × environment matrix, with the same gates.

1. Create a Buildkite pipeline pointed at this repo (GitHub webhook + a queue with
   connected agents). On the `twilio-primary-default` cluster, use a live
   general-purpose queue such as `general-001` — the `default` queue is paused and
   has no agents, so jobs sent there hang in "queuing".
2. Store the Public API token in **AWS Secrets Manager** as
   `segment/destination-function-template/public-api-token` (region `us-west-2`)
   with shape `{ "PUBLIC_API_TOKEN": "..." }`. The pipeline reads it at deploy time
   by assuming IAM role `twilio-internal_destination-function-template` via the
   Buildkite OIDC provider — no static keys and no Buildkite-stored secrets. See
   [`.buildkite/fetch-secrets.sh`](.buildkite/fetch-secrets.sh) and the internal
   "Assuming IAM Roles" guide.

## Tooling Included

1. [Jest for code testing](https://jestjs.io/docs/expect)
2. [esbuild for bundling shared code into each function](https://esbuild.github.io/)
3. [Prettier for code formatting](https://prettier.io/)
4. [ESLint for code linting](https://eslint.org/)
5. [GitHub Actions](https://docs.github.com/actions) and a
   [Buildkite pipeline](https://buildkite.com/docs/pipelines) for function deploys
6. [Husky for commit validation](https://github.com/typicode/husky)
