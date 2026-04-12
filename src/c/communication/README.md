# Communication Module

Handles all Bluetooth messaging between the Pebble watch and the phone via the AppMessage API.

## Concerns

- **Initialization** — Registers inbox/outbox callbacks and opens the AppMessage channel at maximum buffer size.
- **Outbound messages** — Sends answers to quests, skips, and retry-fetch commands to the phone.
- **Inbound dispatch** — Routes received messages by command type (`CMD_LOCATION_UPDATE`, `CMD_MAP_DATA`, `CMD_LOADING`) or falls back to new-quest handling when a question key is present.
- **Quest parsing** — Deserializes a dictionary into a `Quest` struct.
- **Location updates** — Applies distance/bearing (angle between) changes to the active quest and triggers the arrival transition when the user reaches the quest location.
- **Map data streaming** — Accumulates chunked polyline data into a buffer.
- **UI transitions** — Pushes the appropriate screen (navigation, yes/no, multi-choice, numeric) based on quest state and input type.
