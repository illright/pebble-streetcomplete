var filter = require('./filter');
var questTypes = require('./quest_types');
var constants = require('./constants');

/**
 * Projects matched OSM elements into compact quest records used by watch transport.
 */
function findQuests(elements) {
  var quests = [];

  for (var qi = 0; qi < questTypes.QUEST_TYPES.length; qi++) {
    var qt = questTypes.QUEST_TYPES[qi];
    if (qt.enabledByDefault === false) {
      continue;
    }
    for (var ei = 0; ei < elements.length; ei++) {
      var el = elements[ei];
      if (filter.matchesFilter(el, qt.filter)) {
        quests.push({
          questType: qt.id,
          question: qt.question,
          options: qt.options,
          inputType: qt.inputType === 'multi_choice'
            ? constants.INPUT_TYPE_MULTI_CHOICE
            : qt.inputType === 'numeric'
            ? constants.INPUT_TYPE_NUMERIC
            : constants.INPUT_TYPE_YES_NO,
          elementId: el.id,
          elementType: el.type,
          lat: el.lat || 0,
          lon: el.lon || 0,
          name: el.tags.name || el.tags.ref || null,
        });
      }
    }
  }

  return quests;
}

module.exports = {
  findQuests: findQuests,
};
