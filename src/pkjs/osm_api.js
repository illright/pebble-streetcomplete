/**
 * Shared HTTP helper for authenticated OSM API requests.
 * Adds Bearer auth header and handles common error patterns like 401 (token revoked).
 */

var constants = require('./constants');

/* auth is required lazily to break the circular dependency:
   osm_api → auth → osm_api */
var _auth = null;
function getAuth() {
  if (!_auth) { _auth = require('./auth'); }
  return _auth;
}

/**
 * Make an HTTP request to the OSM data API with Bearer auth.
 * callback(err, responseText, statusCode)
 */
function apiRequest(method, path, body, callback) {
  var base = constants.OSM_BASE_URL.replace(/\/+$/, '');
  var url = base + path;
  var token = getAuth().getToken();

  var xhr = new XMLHttpRequest();
  xhr.open(method, url, true);

  if (token) {
    xhr.setRequestHeader('Authorization', 'Bearer ' + token);
  }

  if (body && method !== 'GET') {
    xhr.setRequestHeader('Content-Type', 'application/xml');
  }

  xhr.onload = function() {
    if (xhr.status === 401) {
      getAuth().logout();
      callback('unauthorized', null, 401);
      return;
    }
    callback(null, xhr.responseText, xhr.status);
  };

  xhr.onerror = function() {
    callback('network error', null, 0);
  };

  xhr.send(body || null);
}

module.exports = {
  apiRequest: apiRequest,
};
