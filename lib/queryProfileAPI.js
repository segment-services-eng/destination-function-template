/**
 * Fetch computed traits for a user from Segment's Profile API.
 *
 * Shared by every function in this repo that needs Engage traits. It is bundled
 * (inlined) into each function's single deployable file at deploy time by
 * scripts/bundle.js — see the repo README for why functions cannot `require` at
 * runtime.
 *
 * Only the Segment sandbox globals `fetch`, `btoa` and `RetryError` are used, so
 * nothing here needs to be resolved from npm.
 *
 * @param  {string} userId            the profile's user_id
 * @param  {string[]} traitsToReturn  trait names to include in the response
 * @param  {string} engageSpaceId     Engage space id
 * @param  {string} profileApiToken   Profile API access token
 * @return {Promise<{traits?: object}|undefined>} parsed body on 200/404,
 *   undefined for non-retryable client errors
 */
async function queryProfileAPI(
  userId,
  traitsToReturn = [],
  engageSpaceId,
  profileApiToken
) {
  const baseUrl = `https://profiles.segment.com/v1/spaces/${engageSpaceId}/collections/users/profiles`;
  const queryParams = `limit=${traitsToReturn.length}&include=${traitsToReturn.join(',')}`;
  const url = `${baseUrl}/user_id:${userId}/traits?${queryParams}`;

  let response;
  console.time('Profile API Response Time');
  try {
    response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Basic ${btoa(profileApiToken + ':')}`,
        'Content-Type': 'application/json'
      }
    });
  } catch (error) {
    console.timeEnd('Profile API Response Time');
    console.log(`Profile API Request Error ${error.message}`, error);
    // A connection-level failure is transient; let Segment redeliver.
    throw new RetryError(`Profile API Request Error ${error.message}`);
  }
  console.timeEnd('Profile API Response Time');

  switch (true) {
    // 404 means "no such profile", which callers handle as empty traits rather
    // than an error, so it is parsed the same way as a 200.
    case response.status === 200 || response.status === 404:
      return response.json();
    // 5xx (server), 429 (rate limit) and 401 (token propagation) are all
    // transient for this API.
    case response.status >= 500 ||
      response.status === 429 ||
      response.status === 401: {
      const failureMessage = `Profile API Failed with ${response.status}: ${response.statusText}`;
      console.log(failureMessage);
      throw new RetryError(failureMessage);
    }
    // Any other 4xx is a caller bug (bad space id, malformed trait name);
    // retrying cannot fix it, so report and let the caller decide.
    default:
      console.log(
        `Profile API returned unretryable ${response.status}: ${response.statusText}`
      );
      return undefined;
  }
}

module.exports = { queryProfileAPI };
