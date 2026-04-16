/**
 * OAuth 2.0 authentication with PKCE (plain method).
 * Handles login flow via Pebble.openURL, token exchange, and token storage.
 * Supports build-time token injection for E2E testing.
 */

var constants = require('./constants');
var osmApi = require('./osm_api');

/* Build-time token injection for E2E tests. */
var overrides = {};
try { overrides = require('../../build/build_overrides.auto'); } catch (e) { overrides = {}; }
if (overrides.OSM_TOKEN && !localStorage.getItem('osmToken')) {
  localStorage.setItem('osmToken', overrides.OSM_TOKEN);
  console.log('[SC] Injected build-time OAuth token.');
}

/* PKCE state kept in memory for the duration of a login attempt. */
var _codeVerifier = null;

/** Generate a random string for PKCE code_verifier (plain method). */
function generateVerifier() {
  var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  var result = '';
  for (var i = 0; i < 64; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function isLoggedIn() {
  return !!localStorage.getItem('osmToken') || !!getBasicCredentials();
}

function getToken() {
  return localStorage.getItem('osmToken');
}

/** Return stored HTTP Basic credentials, or null if not configured. */
function getBasicCredentials() {
  var user = localStorage.getItem('osmUsername');
  var pass = localStorage.getItem('osmPassword');
  if (user && pass) {
    return { username: user, password: pass };
  }
  return null;
}

/** Persist HTTP Basic credentials from the Clay configuration page. */
function setBasicCredentials(username, password) {
  if (username && password) {
    localStorage.setItem('osmUsername', username);
    localStorage.setItem('osmPassword', password);
    console.log('[SC] Basic credentials saved.');
  } else {
    localStorage.removeItem('osmUsername');
    localStorage.removeItem('osmPassword');
    console.log('[SC] Basic credentials cleared.');
  }
}

function logout() {
  localStorage.removeItem('osmToken');
  localStorage.removeItem('osmUsername');
  localStorage.removeItem('osmPassword');
  console.log('[SC] Logged out.');
}

/**
 * Open the OAuth authorization page in the phone browser.
 * Uses PKCE with plain challenge method (no SubtleCrypto on PebbleKit JS).
 */
function startLogin() {
  _codeVerifier = generateVerifier();
  var base = constants.OSM_AUTH_BASE_URL.replace(/\/+$/, '');
  var url = base + '/oauth2/authorize'
    + '?response_type=code'
    + '&client_id=' + encodeURIComponent(constants.CLIENT_ID)
    + '&redirect_uri=' + encodeURIComponent('urn:ietf:wg:oauth:2.0:oob')
    + '&scope=' + encodeURIComponent('read_prefs write_api')
    + '&code_challenge=' + encodeURIComponent(_codeVerifier)
    + '&code_challenge_method=plain';
  console.log('[SC] Opening login page.');
  Pebble.openURL(url);
}

/**
 * Exchange an authorization code for an access token.
 * callback(err) — null on success.
 */
function exchangeCode(code, callback) {
  if (!_codeVerifier) {
    callback('no code verifier — call startLogin first');
    return;
  }

  var body = 'grant_type=authorization_code'
    + '&code=' + encodeURIComponent(code)
    + '&client_id=' + encodeURIComponent(constants.CLIENT_ID)
    + '&redirect_uri=' + encodeURIComponent('urn:ietf:wg:oauth:2.0:oob')
    + '&code_verifier=' + encodeURIComponent(_codeVerifier);

  osmApi.authRequest('POST', '/oauth2/token', body,
    'application/x-www-form-urlencoded',
    function(err, responseText, status) {
      _codeVerifier = null;
      if (err) { callback(err); return; }
      if (status !== 200) {
        console.log('[SC] Token exchange failed: ' + status + ' ' + responseText);
        callback('token exchange failed (' + status + ')');
        return;
      }
      try {
        var data = JSON.parse(responseText);
        localStorage.setItem('osmToken', data.access_token);
        console.log('[SC] Logged in successfully.');
        callback(null);
      } catch (e) {
        callback('invalid token response');
      }
    });
}

module.exports = {
  isLoggedIn: isLoggedIn,
  getToken: getToken,
  getBasicCredentials: getBasicCredentials,
  setBasicCredentials: setBasicCredentials,
  logout: logout,
  startLogin: startLogin,
  exchangeCode: exchangeCode,
};
