# Destination Function Template
> Base template to build your next destination function with 

1. Click `Use This Template` above (If Segment PS, add to `Segment Services Engineering` Organization

## Setup Steps 
1. `nvm use` (to get the right version of NodeJS)
    - As of 2023/02/22, Segment Source & Destination Functions require NodeJS 14.19.3
    - [If needed, install `nvm`](https://github.com/nvm-sh/nvm#install--update-script)
2. `npm install` (to install npm dependencies)


## To Test
`npm run test`
- GitHub Actions workflow also runs tests before deploying
- Tests are created in `src/index.test.js`

## To Deploy via GitHub Actions
1. Create GitHub Environments [here](https://github.com/segment-services-eng/destination-function-template/settings/environments) (DEV, QA, PROD, etc)
    - *`DEV` is enabled by default in the [buildDestinationFunction.yml](https://github.com/segment-services-eng/destination-function-template/blob/main/.github/workflows/buildDestinationFunction.yml) file*
2. Create Function in Segment Workspace
3. Create Public API Token to allow for deploying
3. Add the following Environment Secrets
    - `FUNCTION_ID`
    - `PUBLIC_API_TOKEN`

## Deploying to multiple environments
1. Once changes look good in the DEV environment, uncomment the QA section from the buildDestinationFunction.yml file.
2. Push changes to your branch
3. Add the label `!!_RELEASE_TO_QA` to the PR to deploy it to QA

## Tooling Included
1. [Jest for code testing](https://jestjs.io/docs/expect)
2. [Prettier for code formatting](https://prettier.io/)
3. [ESLint for code linting](https://eslint.org/)
4. [GitHub Actions script for function deploy](https://docs.github.com/en/actions)
5. [Husky for commit validation](https://github.com/typicode/husky)
