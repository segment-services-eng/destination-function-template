const fs = require('fs');
const path = require('path');
const { fetchWithRetry } = require('./lib/fetchWithRetry');
const { bundleFunction } = require('./bundle');
const {
  FUNCTIONS_DIR,
  listFunctions,
  readFunctionConfig
} = require('./listFunctions');

const API_BASE = 'https://api.segmentapis.com';
const ALLOWED_ENVS = ['DEV', 'QA', 'PROD'];
// From the Public API's function schema. A value outside this set is rejected by
// the API, so catching it locally saves a round trip and names the offending
// setting.
const SETTING_TYPES = ['STRING', 'BOOLEAN', 'ARRAY', 'MAP', 'TEXT_MAP'];
const RESOURCE_TYPES = [
  'DESTINATION',
  'INSERT_DESTINATION',
  'SOURCE',
  'INSERT_SOURCE',
  'INSERT_TRANSFORMATION'
];

/**
 * Parse the CLI arguments.
 *
 * Mutating a live Segment workspace is opt-in: without `--apply` the command
 * reports the requests it would send and sends nothing.
 *
 * @param  {string[]} argv process.argv.slice(2)
 * @return {{name: string, env: string, apply: boolean, connect: boolean, sourceId: string|undefined}}
 */
function parseArgs(argv) {
  const positional = argv.filter(arg => !arg.startsWith('--'));
  const flag = name => argv.includes(`--${name}`);
  const value = name => {
    const prefix = `--${name}=`;
    const match = argv.find(arg => arg.startsWith(prefix));
    return match?.slice(prefix.length);
  };

  return {
    name: positional[0],
    env: (value('env') || 'DEV').toUpperCase(),
    apply: flag('apply'),
    connect: flag('connect'),
    sourceId: value('source-id')
  };
}

/**
 * Reject a spec the API would reject, naming what is wrong.
 *
 * @param  {string} name function name
 * @param  {object} spec parsed function.json
 */
function validateSpec(name, spec) {
  const problems = [];

  if (!spec.displayName) {
    problems.push('displayName is required');
  }
  if (!RESOURCE_TYPES.includes(spec.resourceType)) {
    problems.push(
      `resourceType must be one of ${RESOURCE_TYPES.join(', ')} (got ${spec.resourceType})`
    );
  }

  (spec.settings ?? []).forEach((setting, index) => {
    const where = `settings[${index}]`;
    if (!setting.name) {
      problems.push(`${where}.name is required`);
    }
    if (!SETTING_TYPES.includes(setting.type)) {
      problems.push(
        `${where}.type must be one of ${SETTING_TYPES.join(', ')} (got ${setting.type})`
      );
    }
  });

  if (problems.length > 0) {
    throw new Error(
      `functions/${name}/function.json is not valid:\n  - ${problems.join('\n  - ')}`
    );
  }
}

/**
 * The function payload the Public API expects.
 *
 * Settings are normalized rather than passed through so that a partial entry in
 * function.json still produces the complete shape the API documents.
 *
 * @param  {object} spec parsed function.json
 * @param  {string} [code] omitted when patching, since the deploy script owns code
 * @return {object}
 */
function buildFunctionPayload(spec, code) {
  const payload = {
    displayName: spec.displayName,
    description: spec.description ?? '',
    resourceType: spec.resourceType,
    settings: (spec.settings ?? []).map(setting => ({
      name: setting.name,
      label: setting.label ?? setting.name,
      description: setting.description ?? '',
      type: setting.type,
      required: setting.required ?? false,
      sensitive: setting.sensitive ?? false
    }))
  };

  if (spec.logoUrl) {
    payload.logoUrl = spec.logoUrl;
  }
  if (code) {
    payload.code = code;
  }

  return payload;
}

/**
 * Call the Public API, failing with the response body so an error names the
 * field the API objected to.
 *
 * @param  {string} token
 * @param  {string} method
 * @param  {string} route  e.g. /functions
 * @param  {object} [body]
 * @return {Promise<object>} parsed `data` from the response
 */
async function callApi(token, method, route, body) {
  const response = await fetchWithRetry(
    `${API_BASE}${route}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    },
    // Creating a function uploads the bundled code, so allow the same generous
    // timeout the deploy script uses.
    { timeoutMs: 120000 }
  );

  const text = await response.text();

  if (response.status >= 400) {
    throw new Error(
      `${method} ${route} failed with ${response.status}: ${text.slice(0, 500)}`
    );
  }

  return JSON.parse(text).data;
}

/**
 * Record a newly created function's id for an environment.
 *
 * Written back to function.json so the id is committed alongside the code it
 * belongs to, which is what lets a deploy find it later without any secret.
 *
 * @param  {string} name
 * @param  {string} env  DEV/QA/PROD
 * @param  {string} functionId
 */
function recordFunctionId(name, env, functionId) {
  const configPath = path.join(FUNCTIONS_DIR, name, 'function.json');
  const spec = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  spec.functionIds = { ...spec.functionIds, [env.toLowerCase()]: functionId };
  // Two-space indent plus trailing newline matches Prettier, so writing this
  // back never shows up as a formatting change.
  fs.writeFileSync(configPath, `${JSON.stringify(spec, null, 2)}\n`);
}

/**
 * Create or update one function in Segment, and optionally connect it to a
 * source as a destination.
 *
 * Idempotent by design: a function.json already carrying an id for this
 * environment is updated in place rather than duplicated.
 *
 * @param  {object} options parsed CLI arguments
 * @param  {string} options.token Public API token
 * @return {Promise<object>} a summary of what was done
 */
async function provision({ name, env, apply, connect, sourceId, token }) {
  const spec = readFunctionConfig(name);
  validateSpec(name, spec);

  const existingId = spec.functionIds?.[env.toLowerCase()];
  const code = await bundleFunction(name);
  const summary = { name, env, apply, actions: [] };

  if (existingId) {
    // Code is deliberately not sent here: scripts/deployDestinationFunction.js
    // owns code, this owns the function's name, description and settings. Keeping
    // them separate means provisioning cannot quietly deploy.
    const payload = buildFunctionPayload(spec);
    summary.actions.push({
      description: `update function ${existingId} metadata and settings`,
      method: 'PATCH',
      route: `/functions/${existingId}`,
      payload
    });
    if (apply) {
      await callApi(token, 'PATCH', `/functions/${existingId}`, payload);
    }
    summary.functionId = existingId;
  } else {
    const payload = buildFunctionPayload(spec, code);
    summary.actions.push({
      description: 'create function',
      method: 'POST',
      route: '/functions',
      // Code is large and unreadable in a dry run; report its size instead.
      payload: { ...payload, code: `<${code.length} bytes of bundled code>` }
    });
    if (apply) {
      const data = await callApi(token, 'POST', '/functions', payload);
      summary.functionId = data.function.id;
      summary.catalogId = data.function.catalogId;
      recordFunctionId(name, env, summary.functionId);
      summary.recordedIn = `functions/${name}/function.json`;
    }
  }

  if (connect) {
    summary.actions.push(
      await planConnect({ spec, summary, sourceId, token, apply })
    );
  }

  return summary;
}

/**
 * Plan (and optionally perform) attaching the function to a source.
 *
 * The Public API documents `POST /destinations` taking a `metadataId`, and a
 * function's `catalogId` is the only identifier it exposes that can serve as one.
 * That link is inferred rather than documented, which is why connecting is behind
 * an explicit flag: if the inference is wrong this fails loudly at an opt-in step
 * instead of during routine setup.
 *
 * @param  {object} options
 * @return {Promise<object>} the planned action
 */
async function planConnect({ spec, summary, sourceId, token, apply }) {
  if (!sourceId) {
    throw new Error('--connect requires --source-id=<sourceId>');
  }

  const catalogId =
    summary.catalogId ??
    (apply || summary.functionId
      ? await resolveCatalogId(token, summary.functionId, apply)
      : undefined);

  const payload = {
    sourceId,
    metadataId: catalogId ?? '<catalogId of the created function>',
    name: spec.displayName,
    // Created disabled with no settings: a destination that started sending
    // before its settings were filled in would deliver broken payloads.
    enabled: false,
    settings: {}
  };

  const action = {
    description: `connect function to source ${sourceId} as a destination (disabled)`,
    method: 'POST',
    route: '/destinations',
    payload
  };

  if (apply) {
    const data = await callApi(token, 'POST', '/destinations', payload);
    action.destinationId = data.destination.id;
  }

  return action;
}

/**
 * Look up the catalogId of an already-created function.
 *
 * @param  {string} token
 * @param  {string} functionId
 * @param  {boolean} apply
 * @return {Promise<string|undefined>}
 */
async function resolveCatalogId(token, functionId, apply) {
  if (!apply || !functionId) {
    return undefined;
  }

  const data = await callApi(token, 'GET', `/functions/${functionId}`);
  return data.function.catalogId;
}

module.exports = {
  SETTING_TYPES,
  RESOURCE_TYPES,
  parseArgs,
  validateSpec,
  buildFunctionPayload,
  provision
};

/* istanbul ignore next -- CLI entry point */
if (require.main === module) {
  const options = parseArgs(process.argv.slice(2));
  const available = listFunctions();

  const main = async () => {
    switch (true) {
      case !available.includes(options.name):
        throw new Error(
          `Usage: npm run provision -- <function> [--env=DEV] [--apply] [--connect --source-id=<id>]\nAvailable: ${available.join(', ')}`
        );
      case !ALLOWED_ENVS.includes(options.env):
        throw new Error(
          `--env must be one of ${ALLOWED_ENVS.join(', ')} (got ${options.env})`
        );
      case options.apply && !process.env.PUBLIC_API_TOKEN:
        throw new Error('--apply requires PUBLIC_API_TOKEN to be set');
      default:
        break;
    }

    const summary = await provision({
      ...options,
      token: process.env.PUBLIC_API_TOKEN
    });

    console.log(
      options.apply
        ? `Applied to ${summary.env}:`
        : `Dry run for ${summary.env} — nothing was sent. Re-run with --apply to perform these:`
    );
    summary.actions.forEach(action => {
      console.log(
        `\n${action.method} ${action.route}  (${action.description})`
      );
      console.log(JSON.stringify(action.payload, null, 2));
    });
    if (summary.recordedIn) {
      console.log(
        `\nRecorded function id ${summary.functionId} in ${summary.recordedIn}`
      );
    }
  };

  main().catch(error => {
    console.error(error.message);
    process.exit(1);
  });
}
