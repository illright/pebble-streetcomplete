var QUEST_TYPES = [
  {
    id: 'bench_backrest',
    question: 'Does this bench have a backrest?',
    filter: [
      'nodes, ways with',
      '  amenity = bench',
      '  and (!area or area = no)',
      '  and !backrest',
      '  and !bench:type',
      '  and (!seasonal or seasonal = no)',
      '  and access !~ private|no'
    ].join('\n'),
    options: [
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' },
    ],
    applyAnswer: function(value) { return { backrest: value }; },
  },
  {
    id: 'bus_stop_shelter',
    question: 'Does this bus stop have a shelter?',
    filter: [
      'nodes, ways, relations with',
      '  (',
      '    public_transport = platform',
      '    or highway = bus_stop and public_transport != stop_position',
      '    or highway = hitchhiking',
      '  )',
      '  and physically_present != no',
      '  and access !~ no|private',
      '  and !covered',
      '  and location !~ underground|indoor',
      '  and indoor != yes',
      '  and tunnel != yes',
      '  and (!shelter or shelter older today -4 years)'
    ].join('\n'),
    options: [
      { label: 'Yes', value: 'yes' },
      { label: 'No', value: 'no' },
    ],
    applyAnswer: function(value) { return { shelter: value }; },
  },
  {
    id: 'railway_crossing_barrier',
    question: 'What barrier does this railway crossing have?',
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
    applyAnswer: function(value) { return { 'crossing:barrier': value }; },
  },
  {
    id: 'wheelchair_access',
    question: 'Is this place wheelchair-accessible?',
    filter: [
      'nodes, ways with',
      '  access !~ no|private',
      '  and !wheelchair',
      '  and (name or noname = yes)',
      '  and (shop and shop !~ no|vacant',
      '   or amenity ~ restaurant|cafe|fast_food|bar|pub|bank|pharmacy',
      '   or amenity ~ hospital|cinema|theatre|place_of_worship|police)',
    ].join('\n'),
    options: [
      { label: 'Yes', value: 'yes' },
      { label: 'Limited', value: 'limited' },
      { label: 'No', value: 'no' },
    ],
    applyAnswer: function(value) { return { wheelchair: value }; },
  },
];

module.exports = {
  QUEST_TYPES: QUEST_TYPES,
};
