/**
 * Changeset lifecycle for uploading quest answers to the OSM API.
 * Orchestrates: fetch element → create changeset → upload OsmChange → close changeset.
 * Tag mapping is a placeholder — sets survey:answer and survey:quest_type.
 */

var auth = require('./auth');
var osmApi = require('./osm_api');

/**
 * Fetch the current version of an OSM element so we can modify it.
 * callback(err, { type, id, version, tags, lat, lon, nodes, members })
 */
function fetchElement(elementType, elementId, callback) {
  var path = '/api/0.6/' + elementType + '/' + elementId;
  osmApi.apiRequest('GET', path, null, function(err, body, status) {
    if (err) { callback(err); return; }
    if (status !== 200) { callback('fetch element failed (' + status + ')'); return; }

    /* Parse minimal element data from the XML response. */
    var versionMatch = body.match(/version="(\d+)"/);
    var version = versionMatch ? parseInt(versionMatch[1], 10) : 1;

    var tags = {};
    var tagRe = /<tag k="([^"]*)" v="([^"]*)"\s*\/>/g;
    var m;
    while ((m = tagRe.exec(body)) !== null) {
      tags[m[1]] = m[2];
    }

    var elem = { type: elementType, id: elementId, version: version, tags: tags };

    if (elementType === 'node') {
      var latMatch = body.match(/lat="([^"]*)"/);
      var lonMatch = body.match(/lon="([^"]*)"/);
      if (latMatch) elem.lat = latMatch[1];
      if (lonMatch) elem.lon = lonMatch[1];
    }

    callback(null, elem);
  });
}

/** Create a new changeset and return its numeric ID. */
function createChangeset(callback) {
  var xml = '<osm><changeset>'
    + '<tag k="created_by" v="PebbleStreetComplete"/>'
    + '<tag k="comment" v="Survey answer from watch"/>'
    + '</changeset></osm>';

  osmApi.apiRequest('PUT', '/api/0.6/changeset/create', xml, function(err, body, status) {
    if (err) { callback(err); return; }
    if (status !== 200) { callback('create changeset failed (' + status + ')'); return; }
    var id = parseInt(body.trim(), 10);
    if (isNaN(id)) { callback('invalid changeset id'); return; }
    console.log('[SC] Created changeset ' + id);
    callback(null, id);
  });
}

/**
 * Build OsmChange XML for a single element modification.
 * Applies placeholder tag mapping (survey:answer, survey:quest_type).
 */
function buildOsmChange(element, changesetId, questType, answer) {
  var tags = {};
  var k;
  for (k in element.tags) {
    if (element.tags.hasOwnProperty(k)) {
      tags[k] = element.tags[k];
    }
  }

  /* Placeholder tag mapping — real mapping TBD per quest type. */
  tags['survey:answer'] = answer;
  tags['survey:quest_type'] = questType;

  var tagXml = '';
  for (k in tags) {
    if (tags.hasOwnProperty(k)) {
      tagXml += '<tag k="' + escapeXml(k) + '" v="' + escapeXml(tags[k]) + '"/>';
    }
  }

  var elemTag = element.type;
  var attrs = ' id="' + element.id + '"'
    + ' version="' + element.version + '"'
    + ' changeset="' + changesetId + '"';
  if (element.lat) attrs += ' lat="' + element.lat + '"';
  if (element.lon) attrs += ' lon="' + element.lon + '"';

  return '<osmChange version="0.6">'
    + '<modify>'
    + '<' + elemTag + attrs + '>' + tagXml + '</' + elemTag + '>'
    + '</modify>'
    + '</osmChange>';
}

/** Upload OsmChange diff to an open changeset. */
function uploadDiff(changesetId, osmChangeXml, callback) {
  var path = '/api/0.6/changeset/' + changesetId + '/upload';
  osmApi.apiRequest('POST', path, osmChangeXml, function(err, body, status) {
    if (err) { callback(err); return; }
    if (status !== 200) { callback('upload diff failed (' + status + ')'); return; }
    callback(null);
  });
}

/** Close a changeset. */
function closeChangeset(changesetId, callback) {
  var path = '/api/0.6/changeset/' + changesetId + '/close';
  osmApi.apiRequest('PUT', path, null, function(err, body, status) {
    if (err) { callback(err); return; }
    if (status !== 200) { callback('close changeset failed (' + status + ')'); return; }
    console.log('[SC] Closed changeset ' + changesetId);
    callback(null);
  });
}

/** Escape special XML characters. */
function escapeXml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Submit a quest answer to OSM.
 * Orchestrates the full flow: fetch element → create changeset → upload → close.
 */
function submitAnswer(questType, elementType, elementId, answer, callback) {
  if (!auth.isLoggedIn()) {
    console.log('[SC] Not logged in — answer saved locally only.');
    callback('not logged in');
    return;
  }

  console.log('[SC] Uploading answer: ' + questType + ' ' + elementType + '/' + elementId + ' -> ' + answer);

  fetchElement(elementType, elementId, function(err, element) {
    if (err) { callback('fetch failed: ' + err); return; }

    createChangeset(function(err, changesetId) {
      if (err) { callback('changeset create failed: ' + err); return; }

      var xml = buildOsmChange(element, changesetId, questType, answer);

      uploadDiff(changesetId, xml, function(err) {
        if (err) {
          /* Try to close the changeset even on upload failure. */
          closeChangeset(changesetId, function() {});
          callback('upload failed: ' + err);
          return;
        }

        closeChangeset(changesetId, function(err) {
          if (err) { callback('close failed: ' + err); return; }
          console.log('[SC] Answer uploaded successfully.');
          callback(null);
        });
      });
    });
  });
}

/**
 * Create an OSM note at the given location with the comment text.
 * Uses the notes/create endpoint which does not require a changeset.
 */
function submitNote(lat, lon, questType, elementType, elementId, commentText, callback) {
  if (!auth.isLoggedIn()) {
    console.log('[SC] Not logged in — note not submitted.');
    callback('not logged in');
    return;
  }

  var body = 'Quest: ' + questType + ' (' + elementType + '/' + elementId + ')\n' + commentText;
  var path = '/api/0.6/notes.json?lat=' + lat + '&lon=' + lon
    + '&text=' + encodeURIComponent(body);

  console.log('[SC] Creating OSM note at ' + lat + ',' + lon);

  osmApi.apiRequest('POST', path, null, function(err, responseBody, status) {
    if (err) { callback('note creation failed: ' + err); return; }
    if (status !== 200) { callback('note creation failed (' + status + ')'); return; }
    console.log('[SC] OSM note created successfully.');
    callback(null);
  });
}

module.exports = {
  submitAnswer: submitAnswer,
  submitNote: submitNote,
};
