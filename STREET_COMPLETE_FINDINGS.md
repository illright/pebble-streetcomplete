# StreetComplete Source Code Findings

## Where do quests come from?

Quests are **determined entirely on-device** — StreetComplete does not use a quest server. The flow is:

1. **Download raw OSM map data** — When the user moves around, the app automatically downloads raw OSM data (nodes, ways, relations) for the bounding box around the user's location via the standard OpenStreetMap API (`MapDataApiClient`). It also downloads OSM notes (user-reported map issues).

2. **Determine applicable elements locally** — Each quest type implements a method called `getApplicableElements(mapData)` that filters the downloaded map data to find elements relevant to that quest. The simpler quest types (most of them) extend `OsmFilterQuestType`, which matches elements using an Overpass-wizard-style element filter expression, e.g.:
   ```
   nodes, ways with highway = crossing and !crossing
   ```

3. **Store quests in a local SQLite database** — Matched elements produce `OsmQuest` objects that are persisted locally. The `OsmQuestController` listens for map data updates and re-evaluates quests whenever new data arrives.

4. **Upload user answers back to OSM** — When a quest is answered, the edit is stored locally and then uploaded to the OSM API via changesets. Both OSM notes and element edits follow this local-first, upload-later pattern.

In short: StreetComplete is essentially a smart OSM editor that parses open map data locally to determine what information is missing, shows those gaps as "quests", and uploads the answers back to OSM.

---

## Quest Input Types

There are **~12 distinct input paradigms** used across the ~170 quest types:

| Type | Description | Example quests |
|---|---|---|
| **Yes / No** | Two tappable buttons (sometimes 3 for "yes / no / only") | Is there a bench at this bus stop? Is there a fee? |
| **Single-select image grid** (`AItemSelectQuestForm`) | Grid of labeled icons/images; tap one to select | Barrier type, camera type, bollard type, surface type, tracktype, roof shape |
| **Multi-select image grid** (`AItemsSelectQuestForm`) | Same grid but multiple items can be selected | Sport types on a pitch |
| **Radio group** (`ARadioGroupQuestForm`) | Vertical list of radio buttons with text labels | Entrance type, oneway direction |
| **Checkbox group** (`ACheckboxGroupQuestForm`) | Vertical list of checkboxes with text labels | Board type, internet access, recycling materials |
| **Free text input** | Plain text field for reference numbers or names | Postbox ref, access point ref, road name, bus stop name |
| **Name with suggestions** (`ANameWithSuggestionsForm` / `AAddLocalizedNameForm`) | Searchable text field with autocomplete from existing OSM names | Road name, bus stop name |
| **Feature/preset search** (`ShopTypeForm` / `FeatureSelect`) | Searchable dropdown backed by the NSI/iD feature dictionary | Shop type, place name |
| **Counter input** (`AAddCountInput`) | Numeric stepper (+ / − buttons) with an icon | Bike parking capacity, charging station capacity, step count |
| **Physical measurement input** (`AbstractArMeasureQuestForm` + unit selectors) | Numeric input with unit selection (m / ft-in); integrates with the companion AR app *StreetMeasure* for contactless measurement | Max height, max weight, max speed, kerb height, road width |
| **Opening hours table** | Structured weekly schedule editor (days × time ranges) | Opening hours, postbox collection times |
| **Visual road diagram** | Interactive cross-section diagram of a road | Cycleway type (left/right side), number of lanes, sidewalk |

---

## App Architecture

The codebase is a **Kotlin Multiplatform** project (Android-primary, with iOS stubs). The most important packages are under `app/src/`:

```
commonMain/kotlin/de/westnordost/streetcomplete/
├── data/
│   ├── download/          # Download scheduling and orchestration
│   │   └── strategy/      # AutoDownloadStrategy: decides when/what to download
│   ├── osm/
│   │   ├── mapdata/       # OSM data model + MapDataApiClient + MapDataDownloader
│   │   ├── osmquests/     # OsmQuestController (core quest lifecycle), OsmQuestDao
│   │   └── edits/         # Edit model + MapDataWithEditsSource (local edits overlay)
│   ├── osmnotes/          # OSM notes model, download, and quest type
│   ├── quest/             # QuestType interface, QuestTypeRegistry, VisibleQuestsSource
│   ├── upload/            # Upload orchestration (ElementEditsUploader, NoteEditsUploader)
│   └── visiblequests/     # Quest type order and enablement preferences
├── quests/                # All quest type definitions + their forms (UI)
│   ├── surface/           # e.g. AddRoadSurface.kt (quest type) + AddRoadSurfaceForm.kt
│   └── ...                # ~170 quest subdirectories
├── overlays/              # Overlay definitions (map coloring modes)
└── screens/
    └── main/              # Main screen: map, controls, quest bottom sheet

androidMain/kotlin/.../quests/
├── AbstractQuestForm.kt   # Base Fragment for all quest answer bottom sheets
├── AbstractOsmQuestForm.kt
├── AItemSelectQuestForm.kt     # Abstract base for single-image-grid quests
├── AItemsSelectQuestForm.kt    # Abstract base for multi-image-grid quests
├── ARadioGroupQuestForm.kt
├── ACheckboxGroupQuestForm.kt
├── AAddCountInput.kt
├── AbstractArMeasureQuestForm.kt
├── YesNoQuestForm.kt
└── QuestsModule.kt        # Koin DI: registers all ~170 quest types with their ordinals
```

### Key data flows

**Download → Quest Generation:**
```
GPS location change
  → AutoDownloadStrategy.getDownloadBoundingBox()
  → Downloader.download(bbox)
      ├── MapDataDownloader → MapDataApiClient (OSM API) → MapDataController.putAllForBBox()
      └── NotesDownloader → OSM API → NotesController
           ↓
  MapDataController fires onReplacedForBBox
  → OsmQuestController calls questType.getApplicableElements() for each type
  → matching elements become OsmQuest objects stored in OsmQuestDao (SQLite)
  → listeners notified → quests appear as map pins
```

**Answer → Upload:**
```
User opens quest → AbstractOsmQuestForm displayed
  → user inputs answer → questType.applyAnswerTo(answer, tags) modifies OSM tags
  → edit stored in ElementEditsDao (locally, offline-capable)
  → Uploader.upload() sends changesets to OSM API when online
```

---

## Approach for the Pebble Implementation

### Background: PebbleKit JS

The Pebble SDK ships with **PebbleKit JS** — a JavaScript runtime that runs *inside the Pebble phone app* (the Rebble Android/iOS app). Every Pebble watchapp can bundle a `pkjs/index.js` file that runs on the phone and communicates with the C code on the watch via `AppMessage` (key/value dictionaries passed over Bluetooth).

PebbleKit JS exposes the following phone-side APIs:

| API | Available? |
|---|---|
| `XMLHttpRequest` (HTTP) | ✅ Yes |
| `WebSocket` | ✅ Yes |
| `navigator.geolocation` | ✅ Yes |
| `localStorage` | ✅ Yes |
| `Pebble.sendAppMessage()` / `Pebble.addEventListener('appmessage', ...)` | ✅ Yes |

This means the JS side can: fetch the user's current location, make arbitrary HTTP requests to the OSM API, store data between sessions, and push results to the watch.

### Verdict: Option 2 (duplicate the logic in PebbleKit JS)

**Option 1 (patch StreetComplete)** is ruled out for the following practical reasons:

1. **Device/emulator coupling** — PebbleKit Android requires the Pebble watch (or emulator) to be paired to the Android app. Running a patched StreetComplete in an Android emulator, paired to the Pebble emulator, on a developer machine is possible but complex, and would be the *only* reason to spin up a full Android emulator.
2. **Upstream patch size** — Integrating PebbleKit Android into StreetComplete would require adding a new SDK dependency, new communication infrastructure, and new quest serialization — far too large a diff to be easily reviewed or accepted by maintainers.
3. **No standalone app** — The resulting Pebble app would only work if StreetComplete is installed, making distribution and testing much harder.

**Option 2 (PebbleKit JS logic)** is the right choice because:

1. **Self-contained** — The entire phone-side logic lives in `src/pkjs/index.js`, already part of this project. No dependency on StreetComplete being installed.
2. **All necessary APIs are available** — PebbleKit JS provides XHR (to call the OSM API), Geolocation (GPS), and LocalStorage (caching), which is everything needed to replicate the quest-generation pipeline:
   - `navigator.geolocation` → current position
   - `XMLHttpRequest` → `https://api.openstreetmap.org/api/0.6/map?bbox=...` → raw OSM data
   - JS logic evaluating element filter expressions → quest list
   - `Pebble.sendAppMessage()` → push nearest quest(s) to the watch
3. **Simple development setup** — Only the Pebble emulator (via `pebble install --emulator`) and the Pebble/Rebble phone app are needed. No Android emulator required.
4. **Full control** — Quest selection logic can be tailored for the watch UX (e.g. only the simplest quest types, limited to what the Pebble UI can display) without being constrained by StreetComplete's architecture.

The main downside is that the element filter expressions and OSM tag application rules from StreetComplete's Kotlin code must be reimplemented in JavaScript. However, the filter expressions themselves are simple readable strings (e.g. `nodes with amenity = bench and !backrest`) that can be evaluated with a small parser, and only a small subset of quest types needs to be supported initially.

### Architecture for the PebbleKit JS side

```
src/pkjs/index.js
  ├── on 'ready': read last known position from localStorage
  ├── on 'appmessage' from watch (location request):
  │     ├── navigator.geolocation.getCurrentPosition()
  │     ├── XHR → OSM API /api/0.6/map?bbox=...
  │     ├── parse XML/JSON response into elements
  │     ├── apply element filter expressions for supported quest types
  │     ├── find nearest matching element
  │     └── Pebble.sendAppMessage({ questType, lat, lon, elementName, ... })
  └── on 'appmessage' from watch (answer submitted):
        ├── build OSM changeset via XHR (requires OAuth token)
        └── PUT /api/0.6/changeset/.../upload
```

### Most important files for core logic

| File | Purpose |
|---|---|
| [data/osm/osmquests/OsmQuestController.kt](StreetComplete/app/src/commonMain/kotlin/de/westnordost/streetcomplete/data/osm/osmquests/OsmQuestController.kt) | Quest lifecycle: creation, deletion, hidden state |
| [data/osm/osmquests/OsmElementQuestType.kt](StreetComplete/app/src/commonMain/kotlin/de/westnordost/streetcomplete/data/osm/osmquests/OsmElementQuestType.kt) | Interface every quest type implements |
| [data/osm/osmquests/OsmFilterQuestType.kt](StreetComplete/app/src/commonMain/kotlin/de/westnordost/streetcomplete/data/osm/osmquests/OsmFilterQuestType.kt) | Simpler abstract base using element filter expression |
| [data/osm/mapdata/MapDataDownloader.kt](StreetComplete/app/src/commonMain/kotlin/de/westnordost/streetcomplete/data/osm/mapdata/MapDataDownloader.kt) | Downloads raw OSM data for a bounding box |
| [data/download/Downloader.kt](StreetComplete/app/src/commonMain/kotlin/de/westnordost/streetcomplete/data/download/Downloader.kt) | Orchestrates map data + notes + tiles download |
| [data/upload/Uploader.kt](StreetComplete/app/src/commonMain/kotlin/de/westnordost/streetcomplete/data/upload/Uploader.kt) | Orchestrates upload of note and element edits |
| [quests/QuestsModule.kt](StreetComplete/app/src/androidMain/kotlin/de/westnordost/streetcomplete/quests/QuestsModule.kt) | Registry of all ~170 quest types with their ordinals and sort order |
| [data/quest/QuestTypeRegistry.kt](StreetComplete/app/src/commonMain/kotlin/de/westnordost/streetcomplete/data/quest/QuestTypeRegistry.kt) | Registry abstraction for quest types |
