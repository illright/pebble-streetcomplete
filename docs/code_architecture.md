# Code architecture

This project intends to follow the Modular architecture described in the [Pebble documentation](https://developer.repebble.com/guides/best-practices/modular-app-architecture/).

## C side

On the topmost layer, the C code is organized by technical purpose into two folders: `ui` and `communication`. The `ui` folder contains UI modules, the `communication` folder contains the description of the protocol and convenience functions.

Both `ui` and `communication` should be packaged as _modules_ in the terminology of the Modular architecture document linked above.

### UI

The UI of the app is grouped into windows, and these windows themselves are broadly grouped into the following modules:

- `quest_incoming` — appears when a quest is nearby, directing the person to it
- `quest_yes_no` — appears at quest location when the quest is a yes/no question

Each module is a folder, each window is also a folder.
