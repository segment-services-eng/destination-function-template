# destination-function-template
Base template to build your next destination function with 

1. Click `Use This Template` above (If Segment PS, add to `Segment Services Engineering` Organization

## Setup Steps 
1. `nvm use` (to get the right version of node)
  - As of 2023/02/22, Segment Source & Destination Functions require NodeJS 14.19.3
  - [If needed, install `nvm`](https://github.com/nvm-sh/nvm#install--update-script)
2. `npm install` (to install npm dependencies)


## To Test
- `npm run test`

## Included
1. [Jest for code testing](https://jestjs.io/docs/expect)
2. [Prettier for code formatting](https://prettier.io/)
3. [ESLint for code linting](https://eslint.org/)
4. [GitHub Actions script for function deploy](https://docs.github.com/en/actions)
5. [Husky for commit validation](https://github.com/typicode/husky)
