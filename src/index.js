/**
 * Handle track event
 * @param  {SegmentTrackEvent} event
 * @param  {FunctionSettings} settings
 */
async function onTrack(event, settings) {
  console.log('setting keys', Object.keys(settings));
  console.log('event', event);
}

/**
 * Exports for Testing Only
 */
try {
  if (process?.env['NODE_DEV'] === 'TEST') {
    module.exports = {
      onTrack
    };
  }
  /* c8 ignore start */
} catch (e) {
  /* c8 ignore end */
}
