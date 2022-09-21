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
