/**
 * Bearer token authentication.
 * The token is obtained from the authenticator website and pasted into Clay settings.
 * Supports build-time token injection for E2E testing.
 */

/* Build-time token injection for E2E tests. */
var overrides = {};
try { overrides = require('../../build/build_overrides.auto'); } catch (e) { overrides = {}; }
if (overrides.OSM_TOKEN && !localStorage.getItem('osmToken')) {
  localStorage.setItem('osmToken', overrides.OSM_TOKEN);
  console.log('[SC] Injected build-time OAuth token.');
}

function isLoggedIn() {
  return !!localStorage.getItem('osmToken');
}

function getToken() {
  return localStorage.getItem('osmToken');
}

/** Save a Bearer token received from the Clay settings page. */
function setToken(token) {
  if (token) {
    localStorage.setItem('osmToken', token);
    console.log('[SC] Token saved.');
  } else {
    localStorage.removeItem('osmToken');
    console.log('[SC] Token cleared.');
  }
}

function logout() {
  localStorage.removeItem('osmToken');
  console.log('[SC] Logged out.');
}

module.exports = {
  isLoggedIn: isLoggedIn,
  getToken: getToken,
  setToken: setToken,
  logout: logout,
};
