# UI Module

Each subfolder contains one or more **windows** — self-contained screens that manage their own layout, event handlers, and lifecycle. Every window exposes a `_push` function (and sometimes `_remove` or `_mark_dirty`).

## Window folders

### `quest_incoming/`

The pre-arrival flow, shown while the user is walking toward a quest.

- **quest_incoming_window** — Displays the question, distance, and a compass arrow. SELECT opens the actions menu.
  - **quest_actions_window** — Menu with "Skip today" and "Show map".
    - **quest_skip_window** — Menu to skip just this quest or all quests of this type.

### `quest_yes_no/`

Answer screen for simple yes/no quests.

- **quest_yes_no_window** — Shows the question with UP = Yes, DOWN = No. SELECT opens the map or extra options.
  - **quest_options_window** — Menu listing "Show map" and any alternative answers beyond Yes/No.

### `quest_multi_choice/`

Answer screen for quests with a list of predefined choices.

- **quest_multi_choice_window** — Shows the question with UP = open answer list, SELECT = show map.
  - **quest_multi_choice_list_window** — Scrollable menu of all answer options.

### `quest_numeric/`

Answer screen for quests expecting a number (e.g. building levels).

- **quest_numeric_window** — UP/DOWN adjust the value (with hold-to-accelerate), long-press SELECT submits.

### `shared/`

Reusable windows used across multiple flows.

- **compass_window** — Full-screen compass with a directional arrow, quest name, and distance.
- **loading_window** — "Loading OSM data..." screen with a retry button.
- **map_window** — Zoomable vector map rendered from packed binary data, showing roads, buildings, water, and markers.
- **thanks_window** — Brief "Thanks!" confirmation that auto-exits the app after 4 seconds.
