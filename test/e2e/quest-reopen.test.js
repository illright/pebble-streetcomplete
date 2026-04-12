const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { PebbleHarness } = require('./harness');

const harness = new PebbleHarness({
  cwd: path.resolve(__dirname, '..', '..'),
  platform: process.env.PEBBLE_PLATFORM || 'basalt',
  useVnc: true,
});

function makeOsmXmlWithCafeQuest() {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<osm version="0.6" generator="test-fixture">',
    // Street grid nodes
    '  <node id="3001" lat="52.3715" lon="4.8910"/>',
    '  <node id="3002" lat="52.3715" lon="4.8930"/>',
    '  <node id="3003" lat="52.3715" lon="4.8950"/>',
    '  <node id="3004" lat="52.3735" lon="4.8910"/>',
    '  <node id="3005" lat="52.3735" lon="4.8930"/>',
    '  <node id="3006" lat="52.3735" lon="4.8950"/>',
    '  <node id="3007" lat="52.3755" lon="4.8910"/>',
    '  <node id="3008" lat="52.3755" lon="4.8930"/>',
    '  <node id="3009" lat="52.3755" lon="4.8950"/>',
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
    '  <way id="5004">',
    '    <nd ref="3001"/><nd ref="3002"/><nd ref="3003"/>',
    '    <tag k="highway" v="secondary"/>',
    '  </way>',
    '  <way id="5005">',
    '    <nd ref="3004"/><nd ref="3005"/><nd ref="3006"/>',
    '    <tag k="highway" v="secondary"/>',
    '  </way>',
    '  <way id="5006">',
    '    <nd ref="3007"/><nd ref="3008"/><nd ref="3009"/>',
    '    <tag k="highway" v="secondary"/>',
    '  </way>',
    // Quest POI node
    '  <node id="2001" lat="52.373500" lon="4.892700">',
    '    <tag k="amenity" v="cafe"/>',
    '    <tag k="name" v="Mock Cafe"/>',
    '  </node>',
    '</osm>',
  ].join('\n');
}

async function installAndWaitForQuest(harness, { lat, lon }) {
  await harness.stopLogs();
  harness.clearCapturedLogs();
  harness.startLogs();
  await harness.delay(3000);
  await harness.install();
  await harness.setLocation(lat, lon);
  await harness.waitForLog('Sent quest to watch:', { timeoutMs: 15000 });
  await harness.setCompassHeading(0);
  harness.clearCapturedLogs();
  await harness.setLocation(lat, lon);
  await harness.waitForLog('Location update sent:', { timeoutMs: 10000 });
  await harness.delay(300);
}

test('quest reopen: back then reopen via action bar', { concurrency: 1 }, async (t) => {
  const osmXml = makeOsmXmlWithCafeQuest();

  try {
    await harness.cleanArtifacts();

    await harness.withMockedOsm(osmXml, async () => {
      await installAndWaitForQuest(harness, { lat: 52.375, lon: 4.895 });

      await t.test('incoming quest is shown', { concurrency: 1 }, async () => {
        const result = await harness.assertScreenshot('reopen-incoming-quest');
        assert.ok(result.match);
      });

      await t.test('waiting screen shows action bar after back', { concurrency: 1 }, async () => {
        await harness.click('back');
        await harness.delay(350);
        // Allow small diff for status bar clock changes
        const result = await harness.assertScreenshot('reopen-waiting-with-action-bar', { maxDiffPercentage: 0.1 });
        assert.ok(result.match);
      });

      await t.test('pressing select reopens the quest', { concurrency: 1 }, async () => {
        await harness.click('select');
        await harness.delay(350);
        const result = await harness.assertScreenshot('reopen-quest-restored');
        assert.ok(result.match);
      });

      await t.test('can back out and reopen again', { concurrency: 1 }, async () => {
        await harness.click('back');
        await harness.delay(350);
        const waiting = await harness.assertScreenshot('reopen-waiting-second-time', { maxDiffPercentage: 0.1 });
        assert.ok(waiting.match);

        await harness.click('select');
        await harness.delay(350);
        const reopened = await harness.assertScreenshot('reopen-quest-second-time');
        assert.ok(reopened.match);
      });
    }, { skipCleanupBuild: true });
  } finally {
    await harness.killEmulator();
  }
});
