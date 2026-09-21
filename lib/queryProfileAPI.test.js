const { queryProfileAPI } = require('./queryProfileAPI');

jest.spyOn(global.console, 'log').mockImplementation();
jest.spyOn(global.console, 'time').mockImplementation();
jest.spyOn(global.console, 'timeEnd').mockImplementation();

const SPACE_ID = 'spa_123';
const TOKEN = 'token_abc';

describe('queryProfileAPI', () => {
  it('should request the requested traits for the user', async () => {
    expect.assertions(3);
    fetch.mockResponseOnce(JSON.stringify({ traits: { plan: 'gold' } }));

    const result = await queryProfileAPI(
      'user-1',
      ['plan', 'ltv'],
      SPACE_ID,
      TOKEN
    );

    expect(result).toStrictEqual({ traits: { plan: 'gold' } });
    expect(fetch.mock.calls[0][0]).toBe(
      `https://profiles.segment.com/v1/spaces/${SPACE_ID}/collections/users/profiles/user_id:user-1/traits?limit=2&include=plan,ltv`
    );
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe(
      `Basic ${btoa(`${TOKEN}:`)}`
    );
  });

  it('should default traitsToReturn to an empty list', async () => {
    expect.assertions(1);
    fetch.mockResponseOnce(JSON.stringify({}));

    await queryProfileAPI('user-1', undefined, SPACE_ID, TOKEN);

    expect(fetch.mock.calls[0][0]).toContain('limit=0&include=');
  });

  it('should parse a 404 as an empty profile rather than failing', async () => {
    expect.assertions(1);
    fetch.mockResponseOnce(JSON.stringify({}), { status: 404 });

    await expect(
      queryProfileAPI('missing', ['plan'], SPACE_ID, TOKEN)
    ).resolves.toStrictEqual({});
  });

  it('should throw RetryError when the request cannot be made', async () => {
    expect.assertions(1);
    fetch.mockRejectOnce(new Error('socket hang up'));

    await expect(
      queryProfileAPI('user-1', ['plan'], SPACE_ID, TOKEN)
    ).rejects.toThrow(RetryError);
  });

  it.each([500, 503, 429, 401])(
    'should throw RetryError on a transient %i',
    async status => {
      expect.assertions(1);
      fetch.mockResponseOnce('', { status });

      await expect(
        queryProfileAPI('user-1', ['plan'], SPACE_ID, TOKEN)
      ).rejects.toThrow(RetryError);
    }
  );

  it('should resolve undefined on an unretryable client error', async () => {
    expect.assertions(1);
    fetch.mockResponseOnce('', { status: 400 });

    await expect(
      queryProfileAPI('user-1', ['plan'], SPACE_ID, TOKEN)
    ).resolves.toBeUndefined();
  });
});
