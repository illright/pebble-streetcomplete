var generated = require('./quest_types.generated');

var CUSTOM_QUEST_TYPES = [
  {
    id: 'railway_crossing_barrier',
    question: 'What barrier does this railway crossing have?',
    inputType: 'multi_choice',
    filter: [
      'nodes with',
      '  railway ~ level_crossing|crossing',
      '  and (!crossing:barrier and !crossing:chicane',
      '    or crossing:barrier older today -8 years)'
    ].join('\n'),
    options: [
      { label: 'Full barrier', value: 'full' },
      { label: 'Half barrier', value: 'half' },
      { label: 'Gates', value: 'gate' },
      { label: 'No barrier', value: 'no' },
    ],
  },
  {
    id: 'building_levels',
    question: 'How many levels does this building have?',
    inputType: 'numeric',
    filter: [
      'ways, relations with',
      '  building ~ yes|residential|apartments|house|detached|terrace|dormitory|semi|semidetached_house|farm|school|civic|college|university|public|hospital|kindergarten|transportation|train_station|hotel|commercial|office|retail|industrial|warehouse|cathedral|church|chapel|mosque|temple|synagogue|shrine|garage|garages|parking|fire_station|government|greenhouse',
      '  and !building:levels',
      '  and !man_made',
      '  and !ruins',
    ].join('\n'),
  },
];

/**
 * Merges generated and manual quest definitions while ensuring custom entries
 * override generated entries by id.
 */
function mergeQuestTypes(customList, generatedList) {
  var byId = {};

  for (var i = 0; i < generatedList.length; i++) {
    byId[generatedList[i].id] = generatedList[i];
  }

  for (var j = 0; j < customList.length; j++) {
    byId[customList[j].id] = customList[j];
  }

  var ids = Object.keys(byId).sort();
  var merged = [];
  for (var k = 0; k < ids.length; k++) {
    merged.push(byId[ids[k]]);
  }
  return merged;
}

var QUEST_TYPES = mergeQuestTypes(CUSTOM_QUEST_TYPES, generated.QUEST_TYPES);

module.exports = {
  QUEST_TYPES: QUEST_TYPES,
};
