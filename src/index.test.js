process.env['NODE_DEV'] = 'TEST';
const { onTrack } = require('./index.js');

jest.spyOn(global.console, 'log').mockImplementation();
jest.spyOn(global.console, 'error').mockImplementation();

describe('onTrack', () => {
  it('should call console.log twice', async () => {
    expect.assertions(1);
    await onTrack({}, {});
    expect(console.log).toHaveBeenCalledTimes(2);
  });
});

describe('module exports guard', () => {
  it('should not export anything when NODE_DEV is not TEST', () => {
    expect.assertions(1);
    // This file sets NODE_DEV='TEST' at module scope (line 1). Set a non-TEST
    // value so the guard's false path runs, then restore to 'TEST' in a finally
    // so the env is reset even if the require throws (and never assigning
    // undefined, which would coerce to the string 'undefined').
    process.env['NODE_DEV'] = 'NOT_TEST';

    let reloaded;
    try {
      jest.isolateModules(() => {
        reloaded = require('./index.js');
      });
    } finally {
      process.env['NODE_DEV'] = 'TEST';
    }

    expect(reloaded).toStrictEqual({});
  });
});
