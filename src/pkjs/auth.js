/**
 * Stub authentication module.
 * TODO: implement OAuth flow with OSM.
 */

function isLoggedIn() {
  return !!localStorage.getItem('osmToken');
}

function startLogin() {
  var url = 'https://www.openstreetmap.org/oauth2/authorize';
  console.log('[SC] Opening login page.');
  Pebble.openURL(url);
}

function exchangeCode(code, callback) {
  console.log('[SC] TODO: exchange OAuth code for token.');
  callback('not implemented');
}

module.exports = {
  isLoggedIn: isLoggedIn,
  startLogin: startLogin,
  exchangeCode: exchangeCode,
};
