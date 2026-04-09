Production configuration lives here and is imported directly by PKJS code.

For test overrides (e.g. a mock OSM base URL), set environment variables
before running `pebble build`:

    PEBBLE_TEST_OSM_BASE_URL=http://127.0.0.1:18080 pebble build
    PEBBLE_TEST_ARRIVAL_THRESHOLD_M=999999 pebble build

The wscript reads these env vars and writes `build/build_overrides.auto.js`,
which PKJS picks up at runtime to override the production defaults.
