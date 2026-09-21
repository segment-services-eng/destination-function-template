const { onTrack } = require('./handlers');

jest.spyOn(global.console, 'log').mockImplementation();
jest.spyOn(global.console, 'time').mockImplementation();
jest.spyOn(global.console, 'timeEnd').mockImplementation();

const settings = {
  engageSpaceId: 'spa_123',
  profileApiToken: 'token_abc',
  traitsToReturn: ['plan']
};

describe('onTrack', () => {
  it('should enrich the event with traits from the Profile API', async () => {
    expect.assertions(2);
    fetch.mockResponseOnce(JSON.stringify({ traits: { plan: 'gold' } }));
    const event = { userId: 'user-1', event: 'Order Completed' };

    const result = await onTrack(event, settings);

    expect(result.traits).toStrictEqual({ plan: 'gold' });
    expect(result.event).toStrictEqual(event);
  });

  it('should tolerate a profile with no traits', async () => {
    expect.assertions(1);
    fetch.mockResponseOnce(JSON.stringify({}), { status: 404 });

    const result = await onTrack({ userId: 'missing' }, settings);

    expect(result.traits).toBeUndefined();
  });

  it.each([
    ['undefined', undefined],
    ['empty', []]
  ])(
    'should skip the Profile API when traitsToReturn is %s',
    async (_label, traitsToReturn) => {
      expect.assertions(2);
      const event = { userId: 'user-1' };

      const result = await onTrack(event, { ...settings, traitsToReturn });

      expect(fetch).not.toHaveBeenCalled();
      expect(result).toStrictEqual({ event });
    }
  );
});
