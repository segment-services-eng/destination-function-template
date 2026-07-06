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
    const originalNodeDev = process.env['NODE_DEV'];
    delete process.env['NODE_DEV'];
    let reloaded;
    jest.isolateModules(() => {
      reloaded = require('./index.js');
    });
    process.env['NODE_DEV'] = originalNodeDev;
    expect(reloaded).toStrictEqual({});
  });
});
