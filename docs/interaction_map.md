These flows are prompted by user location rather than explicit actions:

    - `NewQuest` appears when there is a quest nearby and makes it active
    - `QuestOfSomeKind` appears when you arrive at the location of the currently active quest

```mermaid
flowchart TD
    NewQuest["New quest appears (quest name, distance to it, compass arrow, scrollable to reveal more information)"]
    NewQuestDetails["New quest appears (more information)"]
    NewQuestActions["Actions on a new quest: skip today, show map"]
    NewQuestSkipActions["Skip actions: only this quest, all of this type"]
    QuestLocation["Map showing the node that the quest is about, with zoom +/- action bar"]

    NewQuest -->|"Bottom (scroll)"| NewQuestDetails
    NewQuest -->|"Middle (open)"| NewQuestActions
    NewQuestActions -->|Back| NewQuest
    NewQuestActions -->|"Middle (open Skip today)"| NewQuestSkipActions
    NewQuestActions -->|"Bottom, then Middle (open Show map)"| QuestLocation

    QuestOfSomeKind{What kind of quest}
    QuestOfSomeKind -->|"yes/no"| YesNoQuest

    YesNoQuest["Yes/no quest with action bar: no, question, yes"]
    YesNoQuestOptions["Clarifying options for a yes/no quest: show map, [quest-specific alternative answers]"]
    Thanks["Thanks for answering! [exits the app after a short delay]"]

    YesNoQuest -->|"Middle (question icon)"| YesNoQuestOptions
    YesNoQuest -->|"Bottom (no, cross icon)"| Thanks
    YesNoQuest -->|"Top (yes, checkmark icon)"| Thanks
    YesNoQuest -->|"Back (exit application)"| ExitToPebble
```
