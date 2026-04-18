var constants = require('./constants');
var geo = require('./geo');
var auth = require('./auth');
var uploader = require('./uploader');
var questFetcher = require('./quest_fetcher');
var transport = require('./transport');
var Clay = require('@rebble/clay');
var clayConfig = require('./config.json');
var clay = new Clay(clayConfig, null, { autoHandleEvents: false });

/* State */
var cachedQuests = null;   /* Raw quest candidates (with lat/lon) */
var cachedWayGeometries = null; /* Way polylines for map rendering */
var activeQuest = null;    /* Currently sent to watch */
var skippedQuests = {};    /* elementId → true */
var skippedTypes = {};     /* questType → true */
var lastFetchLat = null;
var lastFetchLon = null;

function loadSkipLists() {
  try {
    var sq = localStorage.getItem('skippedQuests');
    if (sq) { skippedQuests = JSON.parse(sq); }
    var st = localStorage.getItem('skippedTypes');
    if (st) { skippedTypes = JSON.parse(st); }
  } catch (e) { /* ignore parse errors */ }
}

function saveSkipLists() {
  localStorage.setItem('skippedQuests', JSON.stringify(skippedQuests));
  localStorage.setItem('skippedTypes', JSON.stringify(skippedTypes));
}

function isQuestSkipped(q) {
  return !!skippedQuests[String(q.elementId)] || !!skippedTypes[q.questType];
}

/**
 * From cached quests, find the nearest unskipped quest at the given location.
 */
function findBestQuest(lat, lon) {
  if (!cachedQuests || cachedQuests.length === 0) {
    return null;
  }

  var enriched = geo.withDistanceAndBearing(cachedQuests, lat, lon);
  for (var i = 0; i < enriched.length; i++) {
    if (!isQuestSkipped(enriched[i])) {
      return enriched[i];
    }
  }
  return null;
}

function isSameQuest(a, b) {
  if (!a || !b) { return false; }
  return String(a.elementId) === String(b.elementId) && a.questType === b.questType;
}

/**
 * Called on each GPS position update. Decides whether to send a new quest or a location update.
 */
function onPositionUpdate(lat, lon) {
  /* Re-fetch OSM data if we've moved significantly from last fetch */
  var needFetch = !lastFetchLat
    || geo.distM(lat, lon, lastFetchLat, lastFetchLon) > 200;

  if (needFetch) {
    lastFetchLat = lat;
    lastFetchLon = lon;
    if (!activeQuest) {
      transport.sendLoading();
    }
    questFetcher.fetchQuests(lat, lon, function(err, result) {
      if (err || !result) {
        if (!activeQuest) {
          transport.sendNoQuests();
        }
        return;
      }
      cachedQuests = result.quests;
      cachedWayGeometries = result.wayGeometries;
      evaluateAndSend(lat, lon);
    });
  } else {
    evaluateAndSend(lat, lon);
  }
}

function evaluateAndSend(lat, lon) {
  /* If a quest is already active, keep tracking it — don't switch to a
   * different quest mid-interaction.  A new quest will be picked up after
   * the current one is answered, skipped, or dismissed. */
  if (activeQuest) {
    var dist = geo.distM(lat, lon, activeQuest.lat, activeQuest.lon);
    var bearing = geo.bearingDeg(lat, lon, activeQuest.lat, activeQuest.lon);
    transport.sendLocationUpdate(dist, bearing, lat, lon);
    return;
  }

  var best = findBestQuest(lat, lon);
  if (!best) {
    return;
  }

  /* No active quest — send the new best quest */
  activeQuest = best;
  activeQuest.userLat = lat;
  activeQuest.userLon = lon;
  transport.sendQuest(best, function() {
    /* After the quest message is ACKed, send map way data. */
    if (cachedWayGeometries) {
      transport.sendMapData(cachedWayGeometries, best.lat, best.lon);
    }
  });
}

function handleAnswer(payload) {
  var questType = payload[constants.KEY_QUEST_TYPE_ID];
  var elementId = payload[constants.KEY_QUEST_ELEMENT_ID];
  var elementType = payload[constants.KEY_QUEST_ELEMENT_TYPE];
  var answer = payload[constants.KEY_ANSWER_VALUE];

  console.log('[SC] Answer received: ' + questType + ' ' + elementType + '/' + elementId + ' -> ' + answer);

  /* Clear active quest after answering; don't immediately re-evaluate
   * since the thanks screen exits the app. */
  activeQuest = null;

  if (!auth.isLoggedIn()) {
    console.log('[SC] Not logged in — answer saved locally only.');
    return;
  }

  uploader.submitAnswer(questType, elementType, elementId, answer, function(err) {
    if (err) {
      console.log('[SC] Upload failed: ' + err);
    } else {
      console.log('[SC] Upload successful: ' + elementType + '/' + elementId);
    }
  });
}

function handleSkip(payload) {
  var skipType = payload[constants.KEY_SKIP_TYPE];
  var questType = payload[constants.KEY_QUEST_TYPE_ID];
  var elementId = payload[constants.KEY_QUEST_ELEMENT_ID];

  if (skipType === 0) {
    console.log('[SC] Skipping quest: ' + elementId);
    skippedQuests[String(elementId)] = true;
  } else {
    console.log('[SC] Skipping quest type: ' + questType);
    skippedTypes[questType] = true;
  }
  saveSkipLists();

  /* Clear active quest and immediately re-evaluate with cached position */
  activeQuest = null;
  if (lastFetchLat !== null) {
    evaluateAndSend(lastFetchLat, lastFetchLon);
  }
}

function handleRetryFetch() {
  console.log('[SC] Retry fetch requested by watch.');
  /* Force a re-fetch by clearing the last fetch position */
  lastFetchLat = null;
  lastFetchLon = null;
  cachedQuests = null;
  activeQuest = null;
}

function handleAppMessage(e) {
  var payload = e.payload;
  var cmd = payload[constants.KEY_CMD];

  if (cmd === constants.CMD_ANSWER) {
    handleAnswer(payload);
    return;
  }

  if (cmd === constants.CMD_SKIP) {
    handleSkip(payload);
    return;
  }

  if (cmd === constants.CMD_RETRY_FETCH) {
    handleRetryFetch();
    return;
  }

  if (cmd === constants.CMD_DISMISS) {
    activeQuest = null;
    if (lastFetchLat !== null) {
      evaluateAndSend(lastFetchLat, lastFetchLon);
    }
    return;
  }
}

function startGpsMonitoring() {
  console.log('[SC] Starting GPS monitoring.');

  var options = {
    enableHighAccuracy: true,
    maximumAge: constants.GPS_MAX_AGE_MS,
    timeout: 15000,
  };

  navigator.geolocation.watchPosition(
    function(pos) {
      onPositionUpdate(pos.coords.latitude, pos.coords.longitude);
    },
    function(err) {
      console.log('[SC] Geolocation error: ' + err.message + ', using fallback.');
      onPositionUpdate(constants.FALLBACK_LAT, constants.FALLBACK_LON);
    },
    options
  );
}

function init() {
  Pebble.addEventListener('ready', function() {
    console.log('[SC] PebbleKit JS ready.');
    loadSkipLists();
    startGpsMonitoring();
  });

  Pebble.addEventListener('appmessage', handleAppMessage);

  Pebble.addEventListener('showConfiguration', function() {
    Pebble.openURL(clay.generateUrl());
  });

  Pebble.addEventListener('webviewclosed', function(e) {
    if (!e || !e.response) { return; }
    var settings = clay.getSettings(e.response, false);
    var token = settings.OsmToken ? settings.OsmToken.value : '';
    auth.setToken(token);
  });
}

init();
