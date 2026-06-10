![Segment_Functions](https://github.com/segment-services-eng/destination-function-template/assets/7215306/4db77bc8-7466-40a0-95ae-5ad7a63cda9d)

# Destination Function Template

> Base template to deploy your next destination function with

1. Click `Use This Template` above (If Segment PS, add to `Segment Services Engineering` Organization

## Setup Steps

1. `nvm use` (to get the right version of NodeJS)
   - [If needed, install `nvm`](https://github.com/nvm-sh/nvm#install--update-script)
2. `npm install` (to install npm dependencies)

## To Test

`npm run test`

- The Buildkite pipeline also runs tests before deploying
- Tests are created in `src/index.test.js`

## To Deploy via Buildkite

The pipeline is defined in [`.buildkite/pipeline.yml`](.buildkite/pipeline.yml). It
installs dependencies, runs tests, then deploys the function to the target
environment via `scripts/deployDestinationFunction.js`.

1. Create a Buildkite pipeline pointed at this repo (GitHub webhook + an agent on
   the `default` queue).
2. Create the Function in your Segment Workspace.
3. Create a Public API Token to allow for deploying.
4. Add the following secrets under **Pipelines → Clusters → _your cluster_ →
   Secrets**. The pipeline reads them at runtime via `buildkite-agent secret get`,
   so they never appear in the UI or build logs:
   - `FUNCTION_ID`
     - Be sure to include `dfn_`
   - `PUBLIC_API_TOKEN`
   - _If your agents are self-hosted and inject these via Vault or an environment
     hook instead, remove the `buildkite-agent secret get` exports from
     `.buildkite/pipeline.yml`._

## Deploying to multiple environments

The pipeline deploys feature branches to `DEV` automatically. To promote to QA/PROD:

1. Uncomment the QA/PROD `block` and deploy steps in `.buildkite/pipeline.yml`.
2. Push your changes.
3. On a `main` build, unblock the `Release to QA` (then `Release to PROD`) step in
   the Buildkite UI to promote the deploy. The target environment is selected via
   the `DEPLOY_ENV` variable on each step.

## Tooling Included

1. [Jest for code testing](https://jestjs.io/docs/expect)
2. [Prettier for code formatting](https://prettier.io/)
3. [ESLint for code linting](https://eslint.org/)
4. [Buildkite pipeline for function deploy](https://buildkite.com/docs/pipelines)
5. [Husky for commit validation](https://github.com/typicode/husky)
