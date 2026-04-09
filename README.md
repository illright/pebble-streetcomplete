# Pebble-StreetComplete

This is an application for Pebble smartwatches that partially implements the functionality of the StreetComplete Android app. It allows users to view and edit OpenStreetMap data directly from their Pebble watch.

The edit process is designed to be as simple and quick as possible. When you physically approach a place where there's a StreetComplete quest nearby, the watch will vibrate to let you know and point you towards the exact location of the quest. Once you arrive, you can quickly answer the question.

## Source code

The `src` folder is the Pebble application, the `StreetComplete` folder is the source of the original StreetComplete Android app. The `STREET_COMPLETE_FINDINGS.md` file contains answers to the most important questions about how StreetComplete works and how it and this project come together.

## Install to an emulator

```
pebble build
pebble install --emulator emery
```

## Run tests

```bash
pnpm test:e2e:gabbro # Run the tests on the gabbro platform
pnpm test:e2e:update # Update screenshot baselines
```
