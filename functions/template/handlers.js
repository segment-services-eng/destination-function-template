const { queryProfileAPI } = require('../../lib/queryProfileAPI');

/**
 * Handle track event
 *
 * Copy this directory (`npm run new:function -- yourFunction`) as the starting
 * point for a real function. Shared helpers live in `lib/` and are inlined into
 * the deployed file by the bundler, so `require` them freely here.
 *
 * @param  {SegmentTrackEvent} event
 * @param  {FunctionSettings} settings
 */
async function onTrack(event, settings) {
  const { engageSpaceId, profileApiToken, traitsToReturn } = settings;

  if (!traitsToReturn?.length) {
    console.log('No traitsToReturn configured; forwarding event unenriched', {
      event
    });
    return { event };
  }

  const profile = await queryProfileAPI(
    event.userId,
    traitsToReturn,
    engageSpaceId,
    profileApiToken
  );

  return { event, traits: profile?.traits };
}

module.exports = { onTrack };
