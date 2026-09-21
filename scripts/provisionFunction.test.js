const fs = require('fs');

// Mocked rather than exercised against a real directory: writing a function into
// functions/ would be visible to scripts/bundle.test.js, which enumerates the
// directory at module load, so the two suites could race.
jest.mock('./bundle', () => ({ bundleFunction: jest.fn() }));
jest.mock('./listFunctions', () => ({
  FUNCTIONS_DIR: '/tmp/provision-test/functions',
  listFunctions: jest.fn(() => ['probe']),
  readFunctionConfig: jest.fn()
}));

const { bundleFunction } = require('./bundle');
const { readFunctionConfig } = require('./listFunctions');
const {
  parseArgs,
  validateSpec,
  buildFunctionPayload,
  provision
} = require('./provisionFunction');

jest.spyOn(global.console, 'log').mockImplementation();

const TOKEN = 'token_abc';
const PROBE = 'probe';
const BUNDLED_CODE = 'async function onTrack(event, settings) {}';

const SPEC = {
  displayName: 'Provision Probe',
  description: 'Scratch function used by these tests',
  resourceType: 'DESTINATION',
  settings: [
    {
      name: 'apiKey',
      label: 'API Key',
      description: 'token',
      type: 'STRING',
      required: true,
      sensitive: true
    }
  ],
  functionIds: { dev: '', qa: '', prod: '' }
};

/**
 * Point the mocked collaborators at one spec and capture what would be written
 * back to function.json.
 */
function givenSpec(spec) {
  readFunctionConfig.mockReturnValue(spec);
  bundleFunction.mockResolvedValue(BUNDLED_CODE);
  const written = {};
  jest
    .spyOn(fs, 'readFileSync')
    .mockReturnValue(`${JSON.stringify(spec, null, 2)}\n`);
  jest.spyOn(fs, 'writeFileSync').mockImplementation((file, contents) => {
    written.file = file;
    written.spec = JSON.parse(contents);
  });
  return written;
}

describe('parseArgs', () => {
  it('should default to a DEV dry run', () => {
    expect.assertions(1);
    expect(parseArgs(['myFunction'])).toStrictEqual({
      name: 'myFunction',
      env: 'DEV',
      apply: false,
      connect: false,
      sourceId: undefined
    });
  });

  it('should read the env, apply and connect flags', () => {
    expect.assertions(1);
    expect(
      parseArgs([
        'myFunction',
        '--env=qa',
        '--apply',
        '--connect',
        '--source-id=src_1'
      ])
    ).toStrictEqual({
      name: 'myFunction',
      env: 'QA',
      apply: true,
      connect: true,
      sourceId: 'src_1'
    });
  });
});

describe('validateSpec', () => {
  it('should accept a complete spec', () => {
    expect.assertions(1);
    expect(() => validateSpec(PROBE, SPEC)).not.toThrow();
  });

  it('should require a displayName', () => {
    expect.assertions(1);
    expect(() => validateSpec(PROBE, { ...SPEC, displayName: '' })).toThrow(
      /displayName is required/
    );
  });

  it('should reject an unknown resourceType', () => {
    expect.assertions(1);
    expect(() =>
      validateSpec(PROBE, { ...SPEC, resourceType: 'WEBHOOK' })
    ).toThrow(/resourceType must be one of/);
  });

  it('should reject an unknown setting type and name the index', () => {
    expect.assertions(1);
    expect(() =>
      validateSpec(PROBE, {
        ...SPEC,
        settings: [{ name: 'a', type: 'NUMBER' }]
      })
    ).toThrow(/settings\[0\]\.type must be one of/);
  });

  it('should require a name on each setting', () => {
    expect.assertions(1);
    expect(() =>
      validateSpec(PROBE, { ...SPEC, settings: [{ type: 'STRING' }] })
    ).toThrow(/settings\[0\]\.name is required/);
  });

  it('should tolerate a spec with no settings', () => {
    expect.assertions(1);
    expect(() =>
      validateSpec(PROBE, { ...SPEC, settings: undefined })
    ).not.toThrow();
  });
});

describe('buildFunctionPayload', () => {
  it('should fill in the optional setting fields the API expects', () => {
    expect.assertions(1);

    const payload = buildFunctionPayload({
      ...SPEC,
      settings: [{ name: 'apiKey', type: 'STRING' }]
    });

    expect(payload.settings[0]).toStrictEqual({
      name: 'apiKey',
      label: 'apiKey',
      description: '',
      type: 'STRING',
      required: false,
      sensitive: false
    });
  });

  it('should omit code and logoUrl when they are absent', () => {
    expect.assertions(2);

    const payload = buildFunctionPayload(SPEC);

    expect(payload).not.toHaveProperty('code');
    expect(payload).not.toHaveProperty('logoUrl');
  });

  it('should include code and logoUrl when provided', () => {
    expect.assertions(2);

    const payload = buildFunctionPayload(
      { ...SPEC, logoUrl: 'https://example.com/logo.png' },
      'CODE'
    );

    expect(payload.code).toBe('CODE');
    expect(payload.logoUrl).toBe('https://example.com/logo.png');
  });
});

describe('provision', () => {
  it('should send nothing on a dry run', async () => {
    expect.assertions(3);
    givenSpec(SPEC);

    const summary = await provision({
      name: PROBE,
      env: 'DEV',
      apply: false,
      connect: false,
      token: TOKEN
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(summary.actions[0].method).toBe('POST');
    expect(summary.actions[0].route).toBe('/functions');
  });

  it('should report the code size rather than the code on a dry run', async () => {
    expect.assertions(1);
    givenSpec(SPEC);

    const summary = await provision({
      name: PROBE,
      env: 'DEV',
      apply: false,
      connect: false,
      token: TOKEN
    });

    expect(summary.actions[0].payload.code).toBe(
      `<${BUNDLED_CODE.length} bytes of bundled code>`
    );
  });

  it('should create the function and record its id when applied', async () => {
    expect.assertions(5);
    const written = givenSpec(SPEC);
    fetch.mockResponseOnce(
      JSON.stringify({
        data: { function: { id: 'dfnc_123', catalogId: 'cat_123' } }
      })
    );

    const summary = await provision({
      name: PROBE,
      env: 'QA',
      apply: true,
      connect: false,
      token: TOKEN
    });

    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe('https://api.segmentapis.com/functions');
    expect(JSON.parse(request.body).code).toBe(BUNDLED_CODE);
    expect(request.headers.Authorization).toBe(`Bearer ${TOKEN}`);
    expect(summary.functionId).toBe('dfnc_123');
    expect(written.spec.functionIds.qa).toBe('dfnc_123');
  });

  it('should patch metadata without code when an id already exists', async () => {
    expect.assertions(4);
    givenSpec({ ...SPEC, functionIds: { dev: 'dfnc_existing' } });
    fetch.mockResponseOnce(JSON.stringify({ data: { function: {} } }));

    await provision({
      name: PROBE,
      env: 'DEV',
      apply: true,
      connect: false,
      token: TOKEN
    });

    const [url, request] = fetch.mock.calls[0];
    expect(url).toBe('https://api.segmentapis.com/functions/dfnc_existing');
    expect(request.method).toBe('PATCH');
    const body = JSON.parse(request.body);
    expect(body).not.toHaveProperty('code');
    expect(body.settings[0].name).toBe('apiKey');
  });

  it('should surface the API response body when a request fails', async () => {
    expect.assertions(1);
    givenSpec(SPEC);
    fetch.mockResponseOnce('{"errors":[{"message":"displayName taken"}]}', {
      status: 400
    });

    await expect(
      provision({
        name: PROBE,
        env: 'DEV',
        apply: true,
        connect: false,
        token: TOKEN
      })
    ).rejects.toThrow(/displayName taken/);
  });

  it('should require a source id to connect', async () => {
    expect.assertions(1);
    givenSpec(SPEC);

    await expect(
      provision({
        name: PROBE,
        env: 'DEV',
        apply: false,
        connect: true,
        token: TOKEN
      })
    ).rejects.toThrow(/--connect requires --source-id/);
  });

  it('should plan a disabled destination with no settings when connecting', async () => {
    expect.assertions(4);
    givenSpec(SPEC);

    const summary = await provision({
      name: PROBE,
      env: 'DEV',
      apply: false,
      connect: true,
      sourceId: 'src_1',
      token: TOKEN
    });

    expect(fetch).not.toHaveBeenCalled();
    expect(summary.actions[1].route).toBe('/destinations');
    expect(summary.actions[1].payload.enabled).toBe(false);
    expect(summary.actions[1].payload.settings).toStrictEqual({});
  });

  it('should connect using the catalogId returned by the create call', async () => {
    expect.assertions(3);
    givenSpec(SPEC);
    fetch.mockResponseOnce(
      JSON.stringify({
        data: { function: { id: 'dfnc_123', catalogId: 'cat_123' } }
      })
    );
    fetch.mockResponseOnce(
      JSON.stringify({ data: { destination: { id: 'dest_1' } } })
    );

    const summary = await provision({
      name: PROBE,
      env: 'DEV',
      apply: true,
      connect: true,
      sourceId: 'src_1',
      token: TOKEN
    });

    const body = JSON.parse(fetch.mock.calls[1][1].body);
    expect(body.metadataId).toBe('cat_123');
    expect(body.sourceId).toBe('src_1');
    expect(summary.actions[1].destinationId).toBe('dest_1');
  });

  it('should look up the catalogId when the function already existed', async () => {
    expect.assertions(2);
    givenSpec({ ...SPEC, functionIds: { dev: 'dfnc_existing' } });
    fetch.mockResponseOnce(JSON.stringify({ data: { function: {} } }));
    fetch.mockResponseOnce(
      JSON.stringify({
        data: { function: { id: 'dfnc_existing', catalogId: 'cat_existing' } }
      })
    );
    fetch.mockResponseOnce(
      JSON.stringify({ data: { destination: { id: 'dest_2' } } })
    );

    await provision({
      name: PROBE,
      env: 'DEV',
      apply: true,
      connect: true,
      sourceId: 'src_1',
      token: TOKEN
    });

    expect(fetch.mock.calls[1][0]).toBe(
      'https://api.segmentapis.com/functions/dfnc_existing'
    );
    expect(JSON.parse(fetch.mock.calls[2][1].body).metadataId).toBe(
      'cat_existing'
    );
  });
});
