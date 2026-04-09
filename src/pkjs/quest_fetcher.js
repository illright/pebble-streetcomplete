var constants = require('./constants');
var osmParser = require('./osm_parser');
var questFinder = require('./quest_finder');

/**
 * Fetches nearby OSM data and returns raw quest candidates and map geometry via callback.
 * callback(err, result) where result has {quests, wayGeometries}
 */
function fetchQuests(lat, lon, callback) {
  var bbox = [
    (lon - constants.SEARCH_RADIUS).toFixed(6),
    (lat - constants.SEARCH_RADIUS).toFixed(6),
    (lon + constants.SEARCH_RADIUS).toFixed(6),
    (lat + constants.SEARCH_RADIUS).toFixed(6),
  ].join(',');

  var osmBase = constants.OSM_BASE_URL;
  var osmBaseNoSlash = osmBase.replace(/\/+$/, '');
  var url = osmBaseNoSlash + '/api/0.6/map?bbox=' + bbox;
  console.log('[SC] Fetching OSM data: ' + url);

  var xhr = new XMLHttpRequest();
  xhr.open('GET', url, true);
  xhr.onload = function() {
    if (xhr.status !== 200) {
      console.log('[SC] OSM API error ' + xhr.status);
      callback('OSM API error ' + xhr.status, null);
      return;
    }

    var parsed = osmParser.parseOsmXml(xhr.responseText);
    var quests = questFinder.findQuests(parsed.elements);
    console.log('[SC] Found ' + quests.length + ' candidate quests from ' + parsed.elements.length + ' elements, '
      + parsed.wayGeometries.length + ' ways for map.');
    callback(null, { quests: quests, wayGeometries: parsed.wayGeometries });
  };

  xhr.onerror = function() {
    console.log('[SC] XHR network error.');
    callback('network error', null);
  };

  xhr.send();
}

module.exports = {
  fetchQuests: fetchQuests,
};
