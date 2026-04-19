const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { PebbleHarness } = require('./harness');

const harness = new PebbleHarness({
  cwd: path.resolve(__dirname, '..', '..'),
  platform: process.env.PEBBLE_PLATFORM || 'basalt',
  useVnc: true,
});

function makeOsmXmlWithRailwayCrossingQuest() {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<osm version="0.6" generator="test-fixture">',
    // Street grid for map rendering
    '  <node id="3001" lat="52.3715" lon="4.8910"/>',
    '  <node id="3002" lat="52.3715" lon="4.8930"/>',
    '  <node id="3003" lat="52.3715" lon="4.8950"/>',
    '  <node id="3004" lat="52.3735" lon="4.8910"/>',
    '  <node id="3005" lat="52.3735" lon="4.8930"/>',
    '  <node id="3006" lat="52.3735" lon="4.8950"/>',
    '  <way id="5001">',
    '    <nd ref="3001"/><nd ref="3004"/>',
    '    <tag k="highway" v="residential"/>',
    '  </way>',
    '  <way id="5002">',
    '    <nd ref="3002"/><nd ref="3005"/>',
    '    <tag k="highway" v="residential"/>',
    '  </way>',
    '  <way id="5003">',
    '    <nd ref="3001"/><nd ref="3002"/><nd ref="3003"/>',
    '    <tag k="highway" v="secondary"/>',
    '  </way>',
    // Railway crossing node (triggers railway_crossing_barrier quest)
    '  <node id="2001" lat="52.373500" lon="4.892700">',
    '    <tag k="railway" v="level_crossing"/>',
    '  </node>',
    '</osm>',
  ].join('\n');
}

// Install the app fresh and wait until a quest is delivered to the watch.
async function installAndWaitForQuest(harness, { lat, lon }) {
  await harness.stopLogs();
  harness.clearCapturedLogs();
  harness.startLogs();
  await harness.waitForEmulatorReady();
  await harness.install();
  await harness.setLocation(lat, lon);
  await harness.waitForLog('Sent quest to watch:', { timeoutMs: 15000 });
  await harness.waitForLog('Sending map data:', { timeoutMs: 5000 });
  await harness.setCompassHeading(0);
  // Re-send GPS to stabilize the screen state.
  harness.clearCapturedLogs();
  await harness.setLocation(lat, lon);
  await harness.waitForLog('Location update sent:', { timeoutMs: 10000 });
  await harness.delay(300);
}

test('multi-choice quest: arrived flow (mocked OSM)', { concurrency: 1 }, async (t) => {
  const osmXml = makeOsmXmlWithRailwayCrossingQuest();

  try {

    await harness.withMockedOsm(osmXml, async () => {
      await harness.withArrivalThreshold(1500, async () => {
        await installAndWaitForQuest(harness, { lat: 52.373500, lon: 4.892700 });

        await t.test('multi-choice screen shows action bar with list and map icons', { concurrency: 1 }, async () => {
          const result = await harness.assertScreenshot('multi-choice-screen');
          assert.ok(result.match);
        });

        // NOTE: No post-click screenshot before the answer flow.
        // `pebble screenshot --vnc` taken after a button press disrupts the
        // QEMU→pypkjs channel, preventing subsequent buttons and AppMessages
        // from being delivered.
        await t.test('selecting an answer shows thanks screen', { concurrency: 1 }, async () => {
          harness.clearCapturedLogs();
          await harness.click('up');
          await harness.delay(350);
          await harness.click('select');
          await harness.waitForLog('Answer received:', { timeoutMs: 10000 });
          await harness.delay(500);
          const thanks = await harness.assertScreenshot('multi-choice-thanks');
          assert.ok(thanks.match);
        });
      }, { skipCleanupBuild: true });
    }, { skipCleanupBuild: true });
  } finally {
    await harness.killEmulator();
  }
});

test('multi-choice quest: visual verification (mocked OSM)', { concurrency: 1 }, async (t) => {
  const osmXml = makeOsmXmlWithRailwayCrossingQuest();

  try {

    await harness.withMockedOsm(osmXml, async () => {
      await harness.withArrivalThreshold(1500, async () => {
        await installAndWaitForQuest(harness, { lat: 52.373500, lon: 4.892700 });

        // Each post-click screenshot is the last action in its install cycle.
        // `pebble screenshot --vnc` disrupts the QEMU button/message channel
        // after a button press, so no reliable navigation can follow.
        await t.test('list button opens answer choices', { concurrency: 1 }, async () => {
          await harness.click('up');
          await harness.delay(350);
          const result = await harness.assertScreenshot('multi-choice-list');
          assert.ok(result.match);
        });
      }, { skipCleanupBuild: true });
    }, { skipCleanupBuild: true });
  } finally {
    await harness.killEmulator();
  }
});

test('multi-choice quest: map view (mocked OSM)', { concurrency: 1 }, async (t) => {
  const osmXml = makeOsmXmlWithRailwayCrossingQuest();

  try {

    await harness.withMockedOsm(osmXml, async () => {
      await harness.withArrivalThreshold(1500, async () => {
        await installAndWaitForQuest(harness, { lat: 52.373500, lon: 4.892700 });

        await t.test('map button opens map screen', { concurrency: 1 }, async () => {
          await harness.click('select');
          await harness.delay(350);
          const result = await harness.assertScreenshot('multi-choice-map');
          assert.ok(result.match);
        });
      }, { skipCleanupBuild: true });
    }, { skipCleanupBuild: true });
  } finally {
    await harness.killEmulator();
  }
});
