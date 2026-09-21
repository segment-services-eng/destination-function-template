const fs = require('fs');
const path = require('path');
const {
  FUNCTIONS_DIR,
  VALID_FUNCTION_NAME,
  listFunctions
} = require('./listFunctions');

const TEMPLATE = 'template';

/**
 * Scaffold a new function by copying functions/template.
 *
 * Nothing else needs editing afterwards: the function list is discovered from
 * disk, so tests, coverage, the GitHub Actions matrix and the Buildkite steps all
 * pick it up automatically.
 *
 * @param  {string} name new function name
 * @return {string} the created directory
 */
function newFunction(name) {
  // path.join throws on a missing name, so this guard has to precede it rather
  // than join the switch below.
  if (!name) {
    throw new Error('Usage: npm run new:function -- <name>');
  }

  const target = path.join(FUNCTIONS_DIR, name);

  switch (true) {
    case !VALID_FUNCTION_NAME.test(name):
      throw new Error(
        `Invalid name '${name}'. Use letters and digits, starting with a letter (e.g. sendToWebhook).`
      );
    case listFunctions().includes(name):
      throw new Error(`functions/${name} already exists.`);
    default:
      break;
  }

  fs.cpSync(path.join(FUNCTIONS_DIR, TEMPLATE), target, { recursive: true });

  fs.writeFileSync(
    path.join(target, 'function.json'),
    `${JSON.stringify(
      {
        displayName: name,
        description: `TODO: describe ${name}`,
        resourceType: 'DESTINATION',
        // Declared here so `npm run provision` can create the function in Segment
        // with its settings already in place.
        settings: [
          {
            name: 'apiKey',
            label: 'API Key',
            description: 'TODO: describe this setting, or remove it',
            type: 'STRING',
            required: true,
            sensitive: true
          }
        ],
        functionIds: { dev: '', qa: '', prod: '' }
      },
      null,
      2
    )}\n`
  );

  fs.writeFileSync(
    path.join(target, 'README.md'),
    `# ${name}

TODO: describe what this function does.

## Settings

| Setting | Required | Purpose |
| --- | --- | --- |
| | | |

## Deploy targets

\`function.json\` holds this function's Segment function ID per environment. Fill
in all three before the first deploy.
`
  );

  return target;
}

module.exports = { newFunction };

/* istanbul ignore next -- CLI entry point */
if (require.main === module) {
  try {
    const name = process.argv[2];
    newFunction(name);
    console.log(`Created functions/${name}

Next:
  1. Add this function's Segment function IDs to functions/${name}/function.json
  2. Implement functions/${name}/handlers.js and its tests
  3. npm test`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
