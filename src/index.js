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
  // eslint-disable-next-line no-empty
} catch (e) {}
