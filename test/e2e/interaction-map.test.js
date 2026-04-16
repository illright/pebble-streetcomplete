const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { PebbleHarness } = require('./harness');

const harness = new PebbleHarness({
  cwd: path.resolve(__dirname, '..', '..'),
  platform: process.env.PEBBLE_PLATFORM || 'basalt',
  useVnc: true,
});

function makeOsmXmlWithWheelchairQuest() {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<osm version="0.6" generator="test-fixture">',
    // Street grid nodes (self-closing — used as way geometry only)
    // Row S (lat 52.3715)
    '  <node id="3001" lat="52.3715" lon="4.8910"/>',
    '  <node id="3002" lat="52.3715" lon="4.8930"/>',
    '  <node id="3003" lat="52.3715" lon="4.8950"/>',
    // Row M (lat 52.3735)
    '  <node id="3004" lat="52.3735" lon="4.8910"/>',
    '  <node id="3005" lat="52.3735" lon="4.8930"/>',
    '  <node id="3006" lat="52.3735" lon="4.8950"/>',
    // Row N (lat 52.3755)
    '  <node id="3007" lat="52.3755" lon="4.8910"/>',
    '  <node id="3008" lat="52.3755" lon="4.8930"/>',
    '  <node id="3009" lat="52.3755" lon="4.8950"/>',
    // Building corner nodes
    '  <node id="4001" lat="52.3738" lon="4.8915"/>',
    '  <node id="4002" lat="52.3742" lon="4.8915"/>',
    '  <node id="4003" lat="52.3742" lon="4.8922"/>',
    '  <node id="4004" lat="52.3738" lon="4.8922"/>',
    // Second building
    '  <node id="4005" lat="52.3730" lon="4.8935"/>',
    '  <node id="4006" lat="52.3733" lon="4.8935"/>',
    '  <node id="4007" lat="52.3733" lon="4.8940"/>',
    '  <node id="4008" lat="52.3730" lon="4.8940"/>',
    // Park area nodes
    '  <node id="4010" lat="52.3745" lon="4.8932"/>',
    '  <node id="4011" lat="52.3753" lon="4.8932"/>',
    '  <node id="4012" lat="52.3753" lon="4.8948"/>',
    '  <node id="4013" lat="52.3745" lon="4.8948"/>',
    // Canal nodes
    '  <node id="4020" lat="52.3720" lon="4.8905"/>',
    '  <node id="4021" lat="52.3725" lon="4.8920"/>',
    '  <node id="4022" lat="52.3728" lon="4.8940"/>',
    '  <node id="4023" lat="52.3730" lon="4.8955"/>',
    // Footpath nodes
    '  <node id="4030" lat="52.3740" lon="4.8930"/>',
    '  <node id="4031" lat="52.3748" lon="4.8938"/>',
    // Primary road (major) extra nodes
    '  <node id="4040" lat="52.3735" lon="4.8900"/>',
    '  <node id="4041" lat="52.3735" lon="4.8960"/>',
    // NS streets (residential)
    '  <way id="5001">',
    '    <nd ref="3001"/><nd ref="3004"/><nd ref="3007"/>',
    '    <tag k="highway" v="residential"/>',
    '  </way>',
    '  <way id="5002">',
    '    <nd ref="3002"/><nd ref="3005"/><nd ref="3008"/>',
    '    <tag k="highway" v="residential"/>',
    '  </way>',
    '  <way id="5003">',
    '    <nd ref="3003"/><nd ref="3006"/><nd ref="3009"/>',
    '    <tag k="highway" v="residential"/>',
    '  </way>',
    // EW streets (secondary)
    '  <way id="5004">',
    '    <nd ref="3001"/><nd ref="3002"/><nd ref="3003"/>',
    '    <tag k="highway" v="secondary"/>',
    '  </way>',
    '  <way id="5006">',
    '    <nd ref="3007"/><nd ref="3008"/><nd ref="3009"/>',
    '    <tag k="highway" v="secondary"/>',
    '  </way>',
    // Primary road (major, runs E-W through the middle)
    '  <way id="5005">',
    '    <nd ref="4040"/><nd ref="3004"/><nd ref="3005"/><nd ref="3006"/><nd ref="4041"/>',
    '    <tag k="highway" v="primary"/>',
    '  </way>',
    // Buildings
    '  <way id="6001">',
    '    <nd ref="4001"/><nd ref="4002"/><nd ref="4003"/><nd ref="4004"/><nd ref="4001"/>',
    '    <tag k="building" v="yes"/><tag k="building:levels" v="2"/>',
    '  </way>',
    '  <way id="6002">',
    '    <nd ref="4005"/><nd ref="4006"/><nd ref="4007"/><nd ref="4008"/><nd ref="4005"/>',
    '    <tag k="building" v="yes"/><tag k="building:levels" v="2"/>',
    '  </way>',
    // Park
    '  <way id="7001">',
    '    <nd ref="4010"/><nd ref="4011"/><nd ref="4012"/><nd ref="4013"/><nd ref="4010"/>',
    '    <tag k="leisure" v="park"/><tag k="name" v="Test Park"/>',
    '  </way>',
    // Canal (waterway)
    '  <way id="8001">',
    '    <nd ref="4020"/><nd ref="4021"/><nd ref="4022"/><nd ref="4023"/>',
    '    <tag k="waterway" v="canal"/><tag k="name" v="Test Canal"/>',
    '  </way>',
    // Footpath
    '  <way id="9001">',
    '    <nd ref="4030"/><nd ref="4031"/>',
    '    <tag k="highway" v="footway"/><tag k="surface" v="paving_stones"/><tag k="segregated" v="yes"/><tag k="lane_markings" v="yes"/><tag k="lanes" v="2"/>',
    '  </way>',
    // Quest POI nodes (with tags)
    '  <node id="2001" lat="52.374600" lon="4.894600">',
    '    <tag k="amenity" v="cafe"/>',
    '    <tag k="name" v="Mock Cafe"/>',
    '  </node>',
    '  <node id="2002" lat="52.374600" lon="4.894400">',
    '    <tag k="amenity" v="restaurant"/>',
    '    <tag k="name" v="Mock Bistro"/>',
    '  </node>',
    '</osm>',
  ].join('\n');
}

// Install the app fresh and wait until a quest is delivered to the watch.
// Order: start logs (which also boots the emulator), install app, set GPS
// to trigger quest fetching, wait for the quest delivery log.
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
  // Re-send the GPS position to ensure the screen shows our exact coordinates,
  // overriding any spurious emulator GPS callbacks.
  harness.clearCapturedLogs();
  await harness.setLocation(lat, lon);
  await harness.waitForLog('Location update sent:', { timeoutMs: 10000 });
  await harness.delay(300);
}

test('interaction map: non-arrived flows (mocked OSM)', { concurrency: 1 }, async (t) => {
  const osmXml = makeOsmXmlWithWheelchairQuest();

  try {
    await harness.cleanArtifacts();

    await harness.withMockedOsm(osmXml, async () => {
      await installAndWaitForQuest(harness, { lat: 52.375, lon: 4.895 });

      await t.test('incoming quest screen', { concurrency: 1 }, async () => {
        const result = await harness.assertScreenshot('incoming-quest');
        assert.ok(result.match);
      });

      await t.test('actions menu from incoming quest', { concurrency: 1 }, async () => {
        await harness.click('select');
        await harness.delay(350);
        const result = await harness.assertScreenshot('actions-menu');
        assert.ok(result.match);
      });

      await t.test('skip submenu from actions menu', { concurrency: 1 }, async () => {
        // First click opens "Skip today" which pushes the skip submenu
        await harness.click('select');
        await harness.delay(350);
        const result = await harness.assertScreenshot('skip-submenu');
        assert.ok(result.match);
      });

      await t.test('executing skip loads next quest', { concurrency: 1 }, async () => {
        // Click "Only this quest" to execute the skip
        harness.clearCapturedLogs();
        await harness.click('select');
        await harness.waitForLog('Skipping quest:', { timeoutMs: 10000 });
        await harness.waitForLog('Sent quest to watch:', { timeoutMs: 10000 });
        await harness.waitForLog('Sending map data:', { timeoutMs: 5000 });
        await harness.delay(300);
        const result = await harness.assertScreenshot('post-skip-quest');
        assert.ok(result.match);
      });

      await t.test('map screen from actions menu', { concurrency: 1 }, async () => {
        // From the new incoming quest, open actions menu, then select "Show map"
        await harness.click('select');
        await harness.delay(250);
        await harness.click('down');
        await harness.delay(150);
        await harness.click('select');
        await harness.delay(350);
        const result = await harness.assertScreenshot('map-screen');
        assert.ok(result.match);
      });

      await t.test('map zoom in/out', { concurrency: 1 }, async () => {
        // Zoom in (UP button)
        await harness.click('up');
        await harness.delay(250);
        const zoomIn = await harness.assertScreenshot('map-screen-zoomed-in');
        assert.ok(zoomIn.match);

        // Zoom out (DOWN button) twice to go past original
        await harness.click('down');
        await harness.delay(150);
        await harness.click('down');
        await harness.delay(250);
        const zoomOut = await harness.assertScreenshot('map-screen-zoomed-out');
        assert.ok(zoomOut.match);

        // Go back from the map screen
        await harness.click('back');
        await harness.delay(250);
      });
    }, { skipCleanupBuild: true });
  } finally {
    await harness.killEmulator();
  }
});

test('interaction map: arrived flows (mocked OSM)', { concurrency: 1 }, async (t) => {
  const osmXml = makeOsmXmlWithWheelchairQuest();

  try {
    await harness.withMockedOsm(osmXml, async () => {
      await harness.withArrivalThreshold(1500, async () => {
        await installAndWaitForQuest(harness, { lat: 52.374600, lon: 4.894600 });

        await t.test('yes/no screen with map button', { concurrency: 1 }, async () => {
          const yesNo = await harness.assertScreenshot('yesno-screen');
          assert.ok(yesNo.match);

          // SELECT goes directly to map (no options menu when only Yes/No options)
          await harness.click('select');
          await harness.delay(350);
          const map = await harness.assertScreenshot('map-screen-arrived');
          assert.ok(map.match);

          await harness.click('back');
          await harness.delay(350);
        });

        await t.test('answer flow shows thanks screen', { concurrency: 1 }, async () => {
          harness.clearCapturedLogs();
          await harness.click('up');
          // Screenshot quickly — the thanks screen auto-closes after 2 seconds.
          await harness.delay(500);

          const thanks = await harness.assertScreenshot('thanks-screen');
          assert.ok(thanks.match);

          await harness.waitForLog('Answer received:', { timeoutMs: 10000 });
        });
      }, { skipCleanupBuild: true });
    }, { skipCleanupBuild: true });
  } finally {
    await harness.killEmulator();
  }
});

test('loading screen with retry (mocked OSM)', { concurrency: 1 }, async (t) => {
  const osmXml = makeOsmXmlWithWheelchairQuest();

  try {
    await harness.cleanArtifacts();
    await harness.withMockedOsm(osmXml, async () => {
      // Add a delay to the mock server so the loading screen is visible
      harness.setMockOsmDelay(5000);

      await harness.stopLogs();
      harness.clearCapturedLogs();
      harness.startLogs();
      await harness.waitForEmulatorReady();
      await harness.install();
      await harness.setLocation(52.375, 4.895);
      // Wait for the loading signal to reach the watch
      await harness.waitForLog('Sent loading signal to watch.', { timeoutMs: 10000 });
      await harness.delay(500);

      await t.test('loading screen is shown while fetching', { concurrency: 1 }, async () => {
        // Allow small diff for status bar clock digits changing between runs
        const result = await harness.assertScreenshot('loading-screen', { maxDiffPercentage: 0.1 });
        assert.ok(result.match);
      });

      await t.test('quest arrives after loading completes', { concurrency: 1 }, async () => {
        // Remove the delay so future requests are fast
        harness.setMockOsmDelay(0);
        // Wait for the quest to arrive
        await harness.waitForLog('Sent quest to watch:', { timeoutMs: 15000 });
        await harness.delay(500);
        const result = await harness.assertScreenshot('post-loading-quest');
        assert.ok(result.match);
      });
    }, { skipCleanupBuild: true });
  } finally {
    await harness.killEmulator();
  }
});
