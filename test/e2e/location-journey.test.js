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
    '  <node id="1001" lat="52.373500" lon="4.892700">',
    '    <tag k="amenity" v="cafe"/>',
    '    <tag k="name" v="Test Cafe"/>',
    '  </node>',
    '</osm>',
  ].join('\n');
}

// Calculate great-circle distance in meters between two coordinates. Used to compute how
// far away the emulator location is from the quest based on latitude and longitude.
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
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
  await harness.setCompassHeading(0);
  // Re-send the GPS position to ensure the screen shows our exact coordinates,
  // overriding any spurious emulator GPS callbacks.
  harness.clearCapturedLogs();
  await harness.setLocation(lat, lon);
  await harness.waitForLog('Location update sent:', { timeoutMs: 10000 });
  await harness.delay(300);
}

// Set emulator location and wait for the location update to propagate through the
// JS→AppMessage→C pipeline, confirmed by the log output from transport.js.
async function setLocationAndWait(harness, lat, lon) {
  harness.clearCapturedLogs();
  await harness.setLocation(lat, lon);
  await harness.waitForLog('Location update sent:', { timeoutMs: 10000 });
  await harness.delay(300);
}

test('location journey: approaching quest from distance', { concurrency: 1 }, async (t) => {
  const osmXml = makeOsmXmlWithWheelchairQuest();
  const questLat = 52.373500;
  const questLon = 4.892700;

  // Define waypoints showing progression toward the quest
  const waypoints = [
    { lat: 52.36, lon: 4.88, name: 'far-away-3km' },
    { lat: 52.368, lon: 4.885, name: 'approaching-1km' },
    { lat: 52.3715, lon: 4.890, name: 'close-300m' },
    { lat: 52.3732, lon: 4.8920, name: 'very-close-50m' },
    { lat: questLat, lon: questLon, name: 'arrived' },
  ];

  try {
    await harness.withMockedOsm(osmXml, async () => {
      await harness.withArrivalThreshold(40, async () => {
        await installAndWaitForQuest(harness, { lat: waypoints[0].lat, lon: waypoints[0].lon });

        // Start by positioning user far away and capture initial state
        await setLocationAndWait(harness, waypoints[0].lat, waypoints[0].lon);

        await t.test('quest visible from 3km away', { concurrency: 1 }, async () => {
          const distKm = haversineDistance(waypoints[0].lat, waypoints[0].lon, questLat, questLon);
          console.log(`  User at ${waypoints[0].name}: ${(distKm / 1000).toFixed(2)} km away`);

          const result = await harness.assertScreenshot('location-journey-3km-away');
          assert.ok(result.match);
        });

        // Move closer to 1km away
        await setLocationAndWait(harness, waypoints[1].lat, waypoints[1].lon);

        await t.test('distance decreases to 1km', { concurrency: 1 }, async () => {
          const distKm = haversineDistance(waypoints[1].lat, waypoints[1].lon, questLat, questLon);
          console.log(`  User at ${waypoints[1].name}: ${(distKm / 1000).toFixed(2)} km away`);

          const result = await harness.assertScreenshot('location-journey-1km-away');
          assert.ok(result.match);
        });

        // Move closer to 300m away
        await setLocationAndWait(harness, waypoints[2].lat, waypoints[2].lon);

        await t.test('distance decreases to 300m', { concurrency: 1 }, async () => {
          const distKm = haversineDistance(waypoints[2].lat, waypoints[2].lon, questLat, questLon);
          console.log(`  User at ${waypoints[2].name}: ${(distKm).toFixed(0)} m away`);

          const result = await harness.assertScreenshot('location-journey-300m-away');
          assert.ok(result.match);
        });

        // Move very close to 50m away
        await setLocationAndWait(harness, waypoints[3].lat, waypoints[3].lon);

        await t.test('distance decreases to 50m', { concurrency: 1 }, async () => {
          const distM = haversineDistance(waypoints[3].lat, waypoints[3].lon, questLat, questLon);
          console.log(`  User at ${waypoints[3].name}: ${(distM).toFixed(0)} m away`);

          const result = await harness.assertScreenshot('location-journey-50m-away');
          assert.ok(result.match);
        });

        // Arrive at the quest location
        await setLocationAndWait(harness, waypoints[4].lat, waypoints[4].lon);

        await t.test('arrival transitions to yes/no screen', { concurrency: 1 }, async () => {
          const distM = haversineDistance(waypoints[4].lat, waypoints[4].lon, questLat, questLon);
          console.log(`  User at ${waypoints[4].name}: ${(distM).toFixed(0)} m away (ARRIVED)`);

          const result = await harness.assertScreenshot('location-journey-arrived');
          assert.ok(result.match);
        });
      }, { skipCleanupBuild: true });
    }, { skipCleanupBuild: true });
  } finally {
    // Clean up: kill the emulator after all tests complete
    await harness.killEmulator();
  }
});
