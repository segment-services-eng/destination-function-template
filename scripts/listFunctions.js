const fs = require('fs');
const path = require('path');

const FUNCTIONS_DIR = path.resolve(__dirname, '..', 'functions');
const ENTRY_FILE = 'handlers.js';
// A function name becomes a directory name, a CI step key and a token in a shell
// command, so restrict it to characters that are unambiguous in all three. This
// is the authority for the rule: discovery applies it, and newFunction.js reuses
// it to reject a bad name at the point it would be created.
const VALID_FUNCTION_NAME = /^[a-zA-Z][a-zA-Z0-9]*$/;

/**
 * Every deployable function in this repo, discovered from the filesystem.
 *
 * Discovery is a directory scan rather than a committed list so that adding a
 * function needs no edit to CI, coverage globs, or this script. A directory only
 * counts once it has a handlers.js, which keeps half-finished scaffolding out of
 * the deploy matrix.
 *
 * Names that do not match VALID_FUNCTION_NAME are excluded, so a name carrying
 * shell metacharacters can never reach the generated deploy command.
 *
 * @return {string[]} function names, sorted for stable CI matrix ordering
 */
function listFunctions() {
  if (!fs.existsSync(FUNCTIONS_DIR)) {
    return [];
  }

  return fs
    .readdirSync(FUNCTIONS_DIR, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => entry.name)
    .filter(name => fs.existsSync(path.join(FUNCTIONS_DIR, name, ENTRY_FILE)))
    .filter(name => {
      if (VALID_FUNCTION_NAME.test(name)) {
        return true;
      }
      // Silently skipping would look like the function simply is not deployed.
      console.warn(
        `Ignoring functions/${name}: name must match ${VALID_FUNCTION_NAME}`
      );
      return false;
    })
    .sort();
}

/**
 * Absolute path to a function's bundler entry point.
 *
 * @param  {string} name
 * @return {string}
 */
function functionEntryPoint(name) {
  return path.join(FUNCTIONS_DIR, name, ENTRY_FILE);
}

/**
 * A function's committed deploy configuration.
 *
 * Function IDs are identifiers, not credentials — they are useless without
 * PUBLIC_API_TOKEN — so they live in the repo. That keeps "add a function" free
 * of secret management in both CI systems, which matters most in GitHub Actions
 * where secrets cannot be enumerated at runtime.
 *
 * @param  {string} name
 * @return {{description?: string, functionIds: object}}
 */
function readFunctionConfig(name) {
  const configPath = path.join(FUNCTIONS_DIR, name, 'function.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf8'));
}

module.exports = {
  FUNCTIONS_DIR,
  VALID_FUNCTION_NAME,
  listFunctions,
  functionEntryPoint,
  readFunctionConfig
};

/* istanbul ignore next -- CLI entry point, exercised by CI not by unit tests */
if (require.main === module) {
  const names = listFunctions();
  // --json feeds the GitHub Actions `discover` job, whose output is consumed by
  // fromJSON() to build the per-function deploy matrix.
  console.log(
    process.argv.includes('--json') ? JSON.stringify(names) : names.join('\n')
  );
}
