var constants = require('./constants');

/**
 * Sends a single quest to the watch (new quest notification).
 * Calls onSuccess when the message is ACKed by the watch.
 */
function sendQuest(q, onSuccess) {
  var msg = {};
  msg[constants.KEY_QUEST_QUESTION] = q.question.slice(0, 60);
  msg[constants.KEY_QUEST_DIST_M] = q.distM;
  msg[constants.KEY_QUEST_BEARING] = q.bearingDeg;
  msg[constants.KEY_QUEST_TYPE_ID] = q.questType.slice(0, 31);
  msg[constants.KEY_QUEST_ELEMENT_ID] = String(q.elementId).slice(0, 15);
  msg[constants.KEY_QUEST_ELEMENT_TYPE] = q.elementType.slice(0, 7);
  msg[constants.KEY_QUEST_NAME] = (q.name || '').slice(0, 31);
  msg[constants.KEY_ARRIVED] = q.distM <= constants.ARRIVAL_THRESHOLD_M ? 1 : 0;
  msg[constants.KEY_QUEST_NODE_LAT_E6] = Math.round(q.lat * 1e6);
  msg[constants.KEY_QUEST_NODE_LON_E6] = Math.round(q.lon * 1e6);
  if (q.userLat !== undefined && q.userLon !== undefined) {
    msg[constants.KEY_USER_LAT_E6] = Math.round(q.userLat * 1e6);
    msg[constants.KEY_USER_LON_E6] = Math.round(q.userLon * 1e6);
  }

  var optStr = (q.options || []).map(function(o) {
    return o.label + '=' + o.value;
  }).join('|');
  msg[constants.KEY_QUEST_ANSWER_OPTIONS] = optStr.slice(0, 127);

  if (q.inputType !== undefined) {
    msg[constants.KEY_QUEST_INPUT_TYPE] = q.inputType;
  }

  Pebble.sendAppMessage(msg,
    function() {
      console.log('[SC] Sent quest to watch: ' + q.question);
      if (onSuccess) { onSuccess(); }
    },
    function(e) { console.log('[SC] NACK sending quest: ' + e.error.message); }
  );
}

/**
 * Sends a location update for the active quest (bearing + distance + user position).
 */
function sendLocationUpdate(distM, bearingDeg, userLat, userLon) {
  var msg = {};
  msg[constants.KEY_CMD] = constants.CMD_LOCATION_UPDATE;
  msg[constants.KEY_QUEST_DIST_M] = distM;
  msg[constants.KEY_QUEST_BEARING] = bearingDeg;
  msg[constants.KEY_ARRIVED] = distM <= constants.ARRIVAL_THRESHOLD_M ? 1 : 0;
  msg[constants.KEY_USER_LAT_E6] = Math.round(userLat * 1e6);
  msg[constants.KEY_USER_LON_E6] = Math.round(userLon * 1e6);

  Pebble.sendAppMessage(msg,
    function() { console.log('[SC] Location update sent: ' + distM + 'm'); },
    function(e) { console.log('[SC] NACK sending location update: ' + e.error.message); }
  );
}

/**
 * Sends explicit no-quests signal so the watch shows an appropriate empty state.
 */
function sendNoQuests() {
  var msg = {};
  msg[constants.KEY_QUEST_QUESTION] = 'No quests nearby';
  msg[constants.KEY_QUEST_DIST_M] = 0;
  msg[constants.KEY_QUEST_BEARING] = 0;
  msg[constants.KEY_ARRIVED] = 0;

  Pebble.sendAppMessage(msg,
    function() { console.log('[SC] Sent "no quests" to watch.'); },
    function() { console.log('[SC] NACK sending no-quests.'); }
  );
}

/**
 * Tells the watch that OSM data is currently being fetched.
 */
function sendLoading() {
  var msg = {};
  msg[constants.KEY_CMD] = constants.CMD_LOADING;

  Pebble.sendAppMessage(msg,
    function() { console.log('[SC] Sent loading signal to watch.'); },
    function() { console.log('[SC] NACK sending loading signal.'); }
  );
}

/* Way separator sentinel for the packed polyline format. */
var WAY_SENTINEL_LO = 0xFF;
var WAY_SENTINEL_HI = 0x7F;

/* Way type header marker (0x7FFE as little-endian). */
var WAY_TYPE_MARKER_LO = 0xFE;
var WAY_TYPE_MARKER_HI = 0x7F;

/* Way type enum — must match C WAY_TYPE_* in protocol.h. */
var WAY_TYPE_ROAD       = 0;
var WAY_TYPE_MAJOR_ROAD = 1;
var WAY_TYPE_PATH       = 2;
var WAY_TYPE_BUILDING   = 3;
var WAY_TYPE_WATER      = 4;
var WAY_TYPE_GREEN      = 5;
var WAY_TYPE_RAILWAY    = 6;
var WAY_TYPE_SERVICE    = 7;

/* Maximum bytes of map data per AppMessage chunk. Keep well under the ~8KB
 * inbox limit to leave room for the command key overhead. */
var MAP_CHUNK_MAX = 4096;

/**
 * Writes a signed int16 into a byte array at the given offset (little-endian).
 */
function writeInt16LE(arr, offset, val) {
  var v = val & 0xFFFF;
  arr[offset] = v & 0xFF;
  arr[offset + 1] = (v >> 8) & 0xFF;
}

/**
 * Classifies an OSM way by its tags into one of the WAY_TYPE_* categories.
 * The classification prioritises area features, then transport infrastructure.
 */
function classifyWay(tags) {
  if (tags.building) { return WAY_TYPE_BUILDING; }
  if (tags.waterway || tags.natural === 'water') { return WAY_TYPE_WATER; }
  if ((tags.landuse && /^(grass|forest|meadow|allotments|orchard|vineyard|recreation_ground|village_green|farmyard)$/.test(tags.landuse)) ||
      (tags.natural && /^(wood|scrub|grassland|heath)$/.test(tags.natural)) ||
      (tags.leisure && /^(park|garden|playground|nature_reserve|pitch|golf_course)$/.test(tags.leisure))) {
    return WAY_TYPE_GREEN;
  }
  if (tags.railway) { return WAY_TYPE_RAILWAY; }
  var hw = tags.highway;
  if (!hw) { return WAY_TYPE_ROAD; }
  if (/^(motorway|trunk|primary|motorway_link|trunk_link|primary_link)$/.test(hw)) { return WAY_TYPE_MAJOR_ROAD; }
  if (/^(footway|cycleway|path|steps|pedestrian|track|bridleway)$/.test(hw)) { return WAY_TYPE_PATH; }
  if (hw === 'service') { return WAY_TYPE_SERVICE; }
  return WAY_TYPE_ROAD;
}

/**
 * Packs way geometries into a compact byte buffer. Each way is preceded by a
 * 4-byte type header (0x7FFE, way_type) followed by (int16 lat, int16 lon)
 * coordinate pairs relative to centerLat/centerLon, terminated by a
 * (0x7FFF, 0x7FFF) sentinel.
 */
function packWayGeometries(wayGeometries, centerLat, centerLon) {
  var buf = [];
  var centerLatE6 = Math.round(centerLat * 1e6);
  var centerLonE6 = Math.round(centerLon * 1e6);

  for (var w = 0; w < wayGeometries.length; w++) {
    var wt = classifyWay(wayGeometries[w].tags || {});

    /* Write 4-byte type header: (0x7FFE, way_type). */
    var hdr = buf.length;
    buf.push(WAY_TYPE_MARKER_LO, WAY_TYPE_MARKER_HI, 0, 0);
    writeInt16LE(buf, hdr + 2, wt);

    var coords = wayGeometries[w].coords;
    for (var i = 0; i < coords.length; i++) {
      var dLat = Math.round(coords[i].lat * 1e6) - centerLatE6;
      var dLon = Math.round(coords[i].lon * 1e6) - centerLonE6;
      /* Clamp to int16 range (-32768..32767). */
      if (dLat < -32768) { dLat = -32768; } else if (dLat > 32767) { dLat = 32767; }
      if (dLon < -32768) { dLon = -32768; } else if (dLon > 32767) { dLon = 32767; }
      var off = buf.length;
      buf.push(0, 0, 0, 0);
      writeInt16LE(buf, off, dLat);
      writeInt16LE(buf, off + 2, dLon);
    }
    /* Append way sentinel */
    var off2 = buf.length;
    buf.push(0, 0, 0, 0);
    buf[off2]     = WAY_SENTINEL_LO;
    buf[off2 + 1] = WAY_SENTINEL_HI;
    buf[off2 + 2] = WAY_SENTINEL_LO;
    buf[off2 + 3] = WAY_SENTINEL_HI;
  }
  return buf;
}

/**
 * Sends way geometry data to the watch in one or more AppMessage chunks.
 * Each message carries CMD=CMD_MAP_DATA and a byte array of packed polyline data.
 */
function sendMapData(wayGeometries, centerLat, centerLon) {
  var packed = packWayGeometries(wayGeometries, centerLat, centerLon);
  if (packed.length === 0) {
    console.log('[SC] No way data to send.');
    return;
  }

  /* Split into chunks and send sequentially (waiting for each ACK). */
  var chunks = [];
  for (var i = 0; i < packed.length; i += MAP_CHUNK_MAX) {
    chunks.push(packed.slice(i, i + MAP_CHUNK_MAX));
  }
  console.log('[SC] Sending map data: ' + packed.length + ' bytes in ' + chunks.length + ' chunk(s).');

  function sendChunk(idx) {
    if (idx >= chunks.length) { return; }
    var msg = {};
    msg[constants.KEY_CMD] = constants.CMD_MAP_DATA;
    msg[constants.KEY_MAP_DATA] = chunks[idx];
    Pebble.sendAppMessage(msg,
      function() {
        console.log('[SC] Map chunk ' + (idx + 1) + '/' + chunks.length + ' sent.');
        sendChunk(idx + 1);
      },
      function(e) {
        console.log('[SC] NACK sending map chunk: ' + e.error.message);
      }
    );
  }
  sendChunk(0);
}

module.exports = {
  sendQuest: sendQuest,
  sendLocationUpdate: sendLocationUpdate,
  sendNoQuests: sendNoQuests,
  sendLoading: sendLoading,
  sendMapData: sendMapData,
};
