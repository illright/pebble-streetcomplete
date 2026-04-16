const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const { PebbleHarness } = require('./harness');

const harness = new PebbleHarness({
  cwd: path.resolve(__dirname, '..', '..'),
  platform: process.env.PEBBLE_PLATFORM || 'basalt',
  useVnc: true,
});

const TEST_TOKEN = 'e2e-test-token-upload';

/**
 * Build seed elements for a railway crossing quest, matching the pattern used
 * in multi-choice.test.js. The crossing node triggers the railway_crossing_barrier quest.
 */
function makeSeedElements() {
  return [
    { type: 'node', id: 3001, lat: 52.3715, lon: 4.8910, tags: {} },
    { type: 'node', id: 3002, lat: 52.3715, lon: 4.8930, tags: {} },
    { type: 'node', id: 3003, lat: 52.3715, lon: 4.8950, tags: {} },
    { type: 'node', id: 3004, lat: 52.3735, lon: 4.8910, tags: {} },
    { type: 'node', id: 3005, lat: 52.3735, lon: 4.8930, tags: {} },
    { type: 'node', id: 3006, lat: 52.3735, lon: 4.8950, tags: {} },
    // Tag ways with surface+lanes to avoid triggering surface/lane quests
    { type: 'way', id: 5001, tags: { highway: 'residential', surface: 'asphalt', lanes: '2' }, nds: [3001, 3004] },
    { type: 'way', id: 5002, tags: { highway: 'residential', surface: 'asphalt', lanes: '2' }, nds: [3002, 3005] },
    { type: 'way', id: 5003, tags: { highway: 'secondary', surface: 'asphalt', lanes: '2' }, nds: [3001, 3002, 3003] },
    // Railway crossing node (triggers railway_crossing_barrier quest — a multi-choice quest)
    { type: 'node', id: 2001, lat: 52.373500, lon: 4.892700, tags: { railway: 'level_crossing' } },
  ];
}

/**
 * Install the app then wait for a quest to be delivered to the watch.
 * Stabilises the screen state before returning.
 */
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

test('upload: answering a quest with auth token triggers changeset upload', { concurrency: 1 }, async (t) => {
  const seedElements = makeSeedElements();

  try {
    await harness.cleanArtifacts();
    await harness.withMockedOsmFull(seedElements, async (mock) => {
      await harness.withArrivalThreshold(1500, async () => {
        await installAndWaitForQuest(harness, { lat: 52.373500, lon: 4.892700 });

        await t.test('opens answer list and submits an answer', { concurrency: 1 }, async () => {
          // Open the multi-choice answer list
          await harness.click('up');
          await harness.delay(350);

          // Select the first answer
          harness.clearCapturedLogs();
          await harness.click('select');
          await harness.delay(500);

          // Wait for the answer to be received by PKJS
          await harness.waitForLog('Answer received:', { timeoutMs: 10000 });

          // Wait for the upload to complete (or fail)
          await harness.waitForLog('Answer uploaded successfully', { timeoutMs: 15000 });
        });

        await t.test('mock server received changeset create, upload, and close', { concurrency: 1 }, async () => {
          const calls = mock.getRecordedCalls();
          const methods = calls.map((c) => c.method + ' ' + c.path.split('?')[0]);

          const hasElementFetch = methods.some((m) => m.match(/^GET \/api\/0\.6\/node\/\d+$/));
          assert.ok(hasElementFetch, 'Expected a GET /api/0.6/node/:id call');

          const hasCreateChangeset = methods.includes('PUT /api/0.6/changeset/create');
          assert.ok(hasCreateChangeset, 'Expected PUT /api/0.6/changeset/create');

          const hasUpload = methods.some((m) => m.match(/^POST \/api\/0\.6\/changeset\/\d+\/upload$/));
          assert.ok(hasUpload, 'Expected POST /api/0.6/changeset/:id/upload');

          const hasClose = methods.some((m) => m.match(/^PUT \/api\/0\.6\/changeset\/\d+\/close$/));
          assert.ok(hasClose, 'Expected PUT /api/0.6/changeset/:id/close');
        });

        await t.test('uploaded diff contains the answered element with expected tags', { concurrency: 1 }, async () => {
          const calls = mock.getRecordedCalls();
          const uploadCall = calls.find((c) => c.method === 'POST' && c.path.match(/\/changeset\/\d+\/upload/));
          assert.ok(uploadCall, 'Upload call should exist');

          // The body is an OsmChange XML; verify it references the target element
          assert.ok(uploadCall.body.includes('<modify>'), 'OsmChange should contain <modify>');
          assert.ok(uploadCall.body.includes('id="2001"'), 'OsmChange should reference element 2001');
          assert.ok(uploadCall.body.includes('survey:quest_type'), 'OsmChange should include quest type tag');
        });
      }, { skipCleanupBuild: true });
    }, { skipCleanupBuild: true, token: TEST_TOKEN });
  } finally {
    await harness.killEmulator();
  }
});

test('upload: answering without auth token does not trigger upload', { concurrency: 1 }, async (t) => {
  const seedElements = makeSeedElements();

  try {
    await harness.cleanArtifacts();
    // No token option — app starts without auth
    await harness.withMockedOsmFull(seedElements, async (mock) => {
      await harness.withArrivalThreshold(1500, async () => {
        await installAndWaitForQuest(harness, { lat: 52.373500, lon: 4.892700 });

        await t.test('answer is saved locally but not uploaded', { concurrency: 1 }, async () => {
          await harness.click('up');
          await harness.delay(350);

          harness.clearCapturedLogs();
          await harness.click('select');
          await harness.delay(500);

          await harness.waitForLog('Answer received:', { timeoutMs: 10000 });
          await harness.waitForLog('Not logged in', { timeoutMs: 5000 });

          // No changeset calls should have been made
          const calls = mock.getRecordedCalls();
          const changesetCalls = calls.filter((c) => c.path.includes('/changeset/'));
          assert.equal(changesetCalls.length, 0, 'Should not have made any changeset API calls');
        });
      }, { skipCleanupBuild: true });
    }, { skipCleanupBuild: true });
  } finally {
    await harness.killEmulator();
  }
});
