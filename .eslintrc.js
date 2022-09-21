module.exports = {
  env: {
    browser: true,
    node: true,
    es2021: true
  },
  extends: ['eslint:recommended'],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module'
  },
  globals: {
    RetryError: 'readonly',
    _: 'readonly',
    jsonwebtoken: 'readonly',
    cache: 'readonly',
    rules: 'readonly',
    moment: 'readonly'
  },
  rules: {
    indent: ['error', 2, { SwitchCase: 1 }],
    'linebreak-style': ['error', 'unix'],
    quotes: ['error', 'single', { avoidEscape: true }],
    'no-unused-vars': [
      'error',
      {
        varsIgnorePattern: '^onTrack$',
        argsIgnorePattern: '^_+$'
      }
    ]
  },
  overrides: [
    // Override to apply test specific linting
    // https://github.com/jest-community/eslint-plugin-jest#running-rules-only-on-test-related-files
    {
      files: ['*.test.js'],
      plugins: ['jest'],
      extends: ['plugin:jest/all']
    }
  ]
};
