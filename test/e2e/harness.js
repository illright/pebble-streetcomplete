const { spawn } = require('node:child_process');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs/promises');

class PebbleHarness {
  constructor(options = {}) {
    this.cwd = options.cwd || process.cwd();
    this.platform = options.platform || 'basalt';
    this.useVnc = options.useVnc !== false;
    this.baselineDir = path.join(this.cwd, 'test', 'baselines', this.platform);
    this.artifactsDir = path.join(this.cwd, 'test', 'artifacts');
    this.buildEnvOverrides = {};

    this._comparePromise = null;
    this._mockServer = null;
    this._mockPort = null;
    this._mockXml = '';
    this._isInstalled = false;
    this._installedEnv = null;
    this._logProcess = null;
    this._logBuffer = '';
    this._logWaiters = [];
  }

  async ensureDirs() {
    await fs.mkdir(this.baselineDir, { recursive: true });
    await fs.mkdir(this.artifactsDir, { recursive: true });
  }

  async run(cmd, args, opts = {}) {
    const timeoutMs = opts.timeoutMs || 120000;
    const allowFail = !!opts.allowFail;

    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, {
        cwd: this.cwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, ...(opts.env || {}) },
      });

      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
      }, timeoutMs);

      child.stdout.on('data', (d) => {
        stdout += d.toString();
      });
      child.stderr.on('data', (d) => {
        stderr += d.toString();
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });

      child.on('close', (code, signal) => {
        clearTimeout(timer);
        const result = { code, signal, stdout, stderr, command: `${cmd} ${args.join(' ')}` };
        if (!allowFail && code !== 0) {
          const e = new Error(`Command failed (${code}): ${result.command}\n${stdout}\n${stderr}`);
          e.result = result;
          reject(e);
          return;
        }
        resolve(result);
      });
    });
  }

  async delay(ms) {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  pebbleArgs(baseArgs) {
    const args = [...baseArgs];
    if (this.useVnc && !args.includes('--vnc')) {
      args.push('--vnc');
    }
    return args;
  }

  async clearCompanionStorage() {
    const sdkRoot = path.join(os.homedir(), 'Library', 'Application Support', 'Pebble SDK');
    let entries = [];

    try {
      entries = await fs.readdir(sdkRoot, { withFileTypes: true });
    } catch (err) {
      return;
    }

    await Promise.all(entries.map(async (entry) => {
      if (!entry.isDirectory() || !/^\d+\.\d+\.\d+$/.test(entry.name)) {
        return;
      }

      const localStorageDir = path.join(sdkRoot, entry.name, this.platform, 'localstorage');
      try {
        await fs.rm(localStorageDir, { recursive: true, force: true });
        await fs.mkdir(localStorageDir, { recursive: true });
      } catch (err) {
        // Ignore cleanup failures outside the active SDK/platform.
      }
    }));
  }

  /**
   * Wait for the Pebble SDK emulator state file to appear with a running QEMU PID
   * for the current platform. Returns once the emulator is confirmed ready.
   */
  async waitForEmulatorReady(timeoutMs = 20000) {
    const stateFile = path.join(os.tmpdir(), 'pb-emulator.json');
    const deadline = Date.now() + timeoutMs;

    while (Date.now() < deadline) {
      try {
        const raw = await fs.readFile(stateFile, 'utf8');
        const state = JSON.parse(raw);
        // The state file is keyed by platform → version → info
        const platformState = state[this.platform];
        if (platformState) {
          for (const ver of Object.keys(platformState)) {
            const info = platformState[ver];
            if (info && info.qemu && info.qemu.pid) {
              // Verify the PID is actually alive
              try {
                process.kill(info.qemu.pid, 0);
                return; // Emulator is ready
              } catch (e) {
                // PID not alive, keep waiting
              }
            }
          }
        }
      } catch (e) {
        // File doesn't exist yet or is malformed, keep waiting
      }
      await this.delay(500);
    }
    // Don't throw — let install() proceed and handle failure
  }

  startLogs() {
    if (this._logProcess) {
      return;
    }

    this._logStopping = false;
    this._logBuffer = '';
    this._startLogProcess();
  }

  // Spawn the pebble logs process. Automatically reconnects if the connection
  // is lost (e.g. during emulator wipe) while there are pending log waiters.
  _startLogProcess() {
    const child = spawn('pebble', this.pebbleArgs(['logs', '--emulator', this.platform]), {
      cwd: this.cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    });

    const onData = (chunk) => {
      this._logBuffer += chunk.toString();
      this._flushLogWaiters();
    };

    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.on('close', () => {
      this._logProcess = null;
      if (!this._logStopping) {
        // Auto-reconnect after a short delay. Waiters are left pending
        // so the next process can fulfil them.
        setTimeout(() => {
          if (!this._logStopping) {
            this._startLogProcess();
          }
        }, 500);
      } else {
        this._flushLogWaiters();
      }
    });
    child.on('error', (err) => {
      this._logBuffer += `\n[HARNESS] log process error: ${err.message}\n`;
      this._logProcess = null;
      if (!this._logStopping) {
        setTimeout(() => {
          if (!this._logStopping) {
            this._startLogProcess();
          }
        }, 1000);
      } else {
        this._flushLogWaiters();
      }
    });

    this._logProcess = child;
  }

  async stopLogs() {
    this._logStopping = true;

    if (!this._logProcess) {
      return;
    }

    const child = this._logProcess;
    this._logProcess = null;

    await new Promise((resolve) => {
      child.once('close', resolve);
      child.kill('SIGTERM');
      setTimeout(() => {
        child.kill('SIGKILL');
      }, 2000);
    });
  }

  clearCapturedLogs() {
    this._logBuffer = '';
  }

  _flushLogWaiters() {
    const remaining = [];

    for (const waiter of this._logWaiters) {
      if (this._logBuffer.includes(waiter.text)) {
        clearTimeout(waiter.timer);
        waiter.resolve();
      } else if (!this._logProcess && this._logStopping) {
        clearTimeout(waiter.timer);
        waiter.reject(new Error(`Log stream ended before finding: ${waiter.text}\n${this._logBuffer}`));
      } else {
        remaining.push(waiter);
      }
    }

    this._logWaiters = remaining;
  }

  async waitForLog(text, options = {}) {
    if (this._logBuffer.includes(text)) {
      return;
    }

    const timeoutMs = options.timeoutMs || 15000;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this._logWaiters = this._logWaiters.filter((waiter) => waiter.resolve !== resolve);
        reject(new Error(`Timed out waiting for log: ${text}\n${this._logBuffer}`));
      }, timeoutMs);

      this._logWaiters.push({ text, timer, resolve, reject });
      this._flushLogWaiters();
    });
  }

  async build() {
    // Clean first because waf doesn't track build_overrides.auto.js as a
    // dependency for the JS bundling step. Without this, changing env-based
    // overrides would silently produce a stale PBW.
    await this.run('pebble', ['clean'], { timeoutMs: 30000, allowFail: true });
    await this.run('pebble', ['build'], {
      timeoutMs: 180000,
      env: this.buildEnvOverrides,
    });
  }

  async install(options = {}) {
    const force = options.force || false;
    const currentEnv = JSON.stringify(this.buildEnvOverrides);
    const envChanged = currentEnv !== this._installedEnv;

    // Skip reinstall unless forced, env changed, or not yet installed.
    if (this._isInstalled && !force && !envChanged) {
      return;
    }

    await this.clearCompanionStorage();

    const args = this.pebbleArgs(['install', '--emulator', this.platform]);
    let lastError = null;

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        await this.run('pebble', args, { timeoutMs: 60000 });
        this._isInstalled = true;
        this._installedEnv = currentEnv;
        return;
      } catch (err) {
        lastError = err;
        if (attempt < 3) {
          await this.delay(1500);
        }
      }
    }

    throw lastError;
  }

  async click(button, options = {}) {
    const args = this.pebbleArgs(['emu-button', '--emulator', this.platform, 'click', button]);
    if (options.repeat) {
      args.push('--repeat', String(options.repeat));
    }
    if (options.durationMs) {
      args.push('--duration', String(options.durationMs));
    }
    await this.run('pebble', args, { timeoutMs: 15000 });
  }

  // Spoof GPS location on the emulator to simulate user movement. This allows testing
  // location-based flows without waiting for real GPS or using time delays.
  async setLocation(latitude, longitude) {
    const args = this.pebbleArgs(['emu-set-location', '--emulator', this.platform, '--latitude', String(latitude), '--longitude', String(longitude)]);
    await this.run('pebble', args, { timeoutMs: 15000 });
  }

  // Pin the emulator compass heading so that arrow direction is deterministic across runs.
  async setCompassHeading(degrees) {
    const args = this.pebbleArgs(['emu-compass', '--emulator', this.platform, '--heading', String(degrees), '--calibrated']);
    await this.run('pebble', args, { timeoutMs: 15000 });
  }

  async killEmulator() {
    // Stop logs FIRST to prevent auto-reconnect from starting a new emulator.
    await this.stopLogs();
    await this.run('pebble', ['kill'], { timeoutMs: 10000, allowFail: true });
    // Use SIGKILL (-9) to ensure all emulator-related processes die.
    // The Pebble SDK spawns qemu-pebble, pypkjs, and websockify.
    await this.run('pkill', ['-9', '-f', 'qemu-pebble'], { timeoutMs: 5000, allowFail: true });
    await this.run('pkill', ['-9', '-f', 'pypkjs'], { timeoutMs: 5000, allowFail: true });
    await this.run('pkill', ['-9', '-f', 'websockify'], { timeoutMs: 5000, allowFail: true });
    // Remove stale state so the next pebble install doesn't see ghost PIDs.
    const stateFile = path.join(os.tmpdir(), 'pb-emulator.json');
    await this.run('rm', ['-f', stateFile], { timeoutMs: 2000, allowFail: true });
    // Wait for the kernel to release the VNC port after SIGKILL.
    await this.delay(5000);
    this._isInstalled = false;
    this._installedEnv = null;
    this._logBuffer = '';
  }

  async screenshot(outputPath) {
    const args = this.pebbleArgs(['screenshot', '--emulator', this.platform, '--no-open', outputPath]);
    await this.run('pebble', args, { timeoutMs: 30000 });
  }

  async getCompare() {
    if (!this._comparePromise) {
      this._comparePromise = import('@blazediff/core-native').then((mod) => mod.compare);
    }
    return this._comparePromise;
  }

  async assertScreenshot(name, options = {}) {
    const retries = options.retries ?? 1;
    await this.ensureDirs();

    const baselinePath = path.join(this.baselineDir, `${name}.png`);
    const actualPath = path.join(this.artifactsDir, `${name}.actual.png`);
    const diffPath = path.join(this.artifactsDir, `${name}.diff.png`);

    const updateBaselines = process.env.UPDATE_BASELINES === '1';

    for (let attempt = 0; attempt <= retries; attempt++) {
      await this.screenshot(actualPath);

      const baselineExists = await fs
        .access(baselinePath)
        .then(() => true)
        .catch(() => false);

      if (!baselineExists || updateBaselines) {
        await fs.copyFile(actualPath, baselinePath);
        return {
          match: true,
          reason: baselineExists ? 'baseline-updated' : 'baseline-created',
          baselinePath,
          actualPath,
          diffPath,
        };
      }

      const compare = await this.getCompare();
      const result = await compare(baselinePath, actualPath, diffPath, {
        threshold: options.threshold ?? 0.1,
        antialiasing: options.antialiasing ?? true,
      });

      if (result.match) {
        return { ...result, baselinePath, actualPath, diffPath };
      }

      // Allow a small pixel-diff tolerance for screens with dynamic content
      // (e.g., status bar clock). If the diff is below the allowed percentage,
      // treat it as a match.
      const maxDiffPct = options.maxDiffPercentage ?? 0;
      if (result.reason === 'pixel-diff' && result.diffPercentage <= maxDiffPct) {
        return { ...result, match: true, baselinePath, actualPath, diffPath };
      }

      if (attempt < retries) {
        await this.delay(500 * (attempt + 1));
        continue;
      }

      const detail = result.reason === 'pixel-diff'
        ? `${result.diffCount} pixels differ (${result.diffPercentage.toFixed(2)}%)`
        : 'layout differs';
      const logTail = this._logBuffer.slice(-2000);
      throw new Error(
        `Screenshot mismatch for "${name}": ${detail}\n` +
          `baseline: ${baselinePath}\nactual: ${actualPath}\ndiff: ${diffPath}\n` +
          `--- recent logs ---\n${logTail}`
      );
    }
  }

  // Clean test artifacts directory to prevent stale diffs from confusing diagnosis.
  async cleanArtifacts() {
    await fs.rm(this.artifactsDir, { recursive: true, force: true });
    await fs.mkdir(this.artifactsDir, { recursive: true });
  }

  async withArrivalThreshold(tempThreshold, fn, options = {}) {
    const prev = { ...this.buildEnvOverrides };

    this.buildEnvOverrides = {
      ...this.buildEnvOverrides,
      PEBBLE_TEST_ARRIVAL_THRESHOLD_M: String(tempThreshold),
    };

    try {
      await this.build();
      await fn();
    } finally {
      this.buildEnvOverrides = prev;
      if (!options.skipCleanupBuild) {
        await this.build();
      }
    }
  }

  async startMockOsmServer(initialXml) {
    this._mockXml = initialXml;
    this._mockOsmDelayMs = 0;

    await new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        if (!req.url || !req.url.startsWith('/api/0.6/map')) {
          res.statusCode = 404;
          res.end('Not found');
          return;
        }
        const respond = () => {
          res.setHeader('Content-Type', 'application/xml; charset=utf-8');
          res.end(this._mockXml);
        };
        if (this._mockOsmDelayMs > 0) {
          setTimeout(respond, this._mockOsmDelayMs);
        } else {
          respond();
        }
      });

      server.on('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const addr = server.address();
        this._mockServer = server;
        this._mockPort = addr.port;
        resolve();
      });
    });
  }

  setMockOsmXml(xml) {
    this._mockXml = xml;
  }

  setMockOsmDelay(ms) {
    this._mockOsmDelayMs = ms;
  }

  async stopMockOsmServer() {
    if (!this._mockServer) {
      return;
    }
    const server = this._mockServer;
    this._mockServer = null;
    this._mockPort = null;

    await new Promise((resolve, reject) => {
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }

  async withMockedOsm(initialXml, fn, options = {}) {
    await this.startMockOsmServer(initialXml);
    const prev = { ...this.buildEnvOverrides };

    try {
      this.buildEnvOverrides = {
        ...this.buildEnvOverrides,
        PEBBLE_TEST_OSM_BASE_URL: `http://127.0.0.1:${this._mockPort}`,
        PEBBLE_TEST_GPS_MAX_AGE_MS: '0',
      };
      await this.build();
      await fn();
    } finally {
      this.buildEnvOverrides = prev;
      await this.stopMockOsmServer();
      if (!options.skipCleanupBuild) {
        await this.build();
      }
    }
  }

  /**
   * Start the full mock OSM server (OAuth + changeset + map endpoints) and configure build
   * to use it for both data API and auth. Seeds elements into the mock's in-memory state.
   * The callback receives the mock server instance for assertions (getRecordedCalls, etc.).
   *
   * options.token — pre-register this token in the mock and inject it via build overrides
   *                 so the app starts already authenticated (skipping browser-based OAuth).
   */
  async withMockedOsmFull(seedElements, fn, options = {}) {
    const { createMockOsmServer } = require('../mock-osm-server');
    const mock = createMockOsmServer();
    const mockPort = await mock.start(0);
    const mockUrl = `http://127.0.0.1:${mockPort}`;

    if (seedElements && seedElements.length > 0) {
      mock.seed(seedElements);
    }

    if (options.token) {
      mock.registerToken(options.token);
    }

    const prev = { ...this.buildEnvOverrides };

    try {
      this.buildEnvOverrides = {
        ...this.buildEnvOverrides,
        PEBBLE_TEST_OSM_BASE_URL: mockUrl,
        PEBBLE_TEST_OSM_AUTH_BASE_URL: mockUrl,
        PEBBLE_TEST_GPS_MAX_AGE_MS: '0',
        PEBBLE_TEST_CLIENT_ID: 'test-client-id',
      };
      if (options.token) {
        this.buildEnvOverrides.PEBBLE_TEST_OSM_TOKEN = options.token;
      }
      await this.build();
      await fn(mock);
    } finally {
      this.buildEnvOverrides = prev;
      await mock.stop();
      if (!options.skipCleanupBuild) {
        await this.build();
      }
    }
  }
}

module.exports = {
  PebbleHarness,
};
