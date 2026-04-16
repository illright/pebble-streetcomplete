/**
 * In-memory state for the mock OSM server.
 * Tracks elements (nodes/ways), changesets, OAuth auth codes, and tokens.
 */

function createState() {
  var state = {
    elements: {},      // "node/123" → { type, id, version, lat, lon, tags, nds }
    changesets: {},    // changesetId → { id, open, uid, tags, changes: [] }
    nextChangesetId: 1,
    nextElementId: 100000,
    authCodes: {},     // code → { clientId, createdAt }
    tokens: {},        // token → { uid, displayName, scopes }
    recordedCalls: [], // { method, path, headers, body }
    nextError: null,   // { pathPattern, statusCode, body }
    mockUser: { uid: 1, displayName: 'TestUser' },
  };

  /** Seed the state with OSM elements for testing. */
  function seed(elements) {
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      var key = el.type + '/' + el.id;
      state.elements[key] = {
        type: el.type,
        id: el.id,
        version: el.version || 1,
        lat: el.lat,
        lon: el.lon,
        tags: el.tags || {},
        nds: el.nds || [],
        visible: true,
      };
    }
  }

  /** Generate an OAuth authorization code for a given client. */
  function issueAuthCode(clientId) {
    var code = 'mock_auth_code_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    state.authCodes[code] = { clientId: clientId, createdAt: Date.now() };
    return code;
  }

  /** Validate an auth code and return a token, or null if invalid. */
  function exchangeAuthCode(code, clientId) {
    var entry = state.authCodes[code];
    if (!entry) { return null; }
    if (entry.clientId !== clientId) { return null; }
    delete state.authCodes[code];

    var token = 'mock_token_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
    state.tokens[token] = {
      uid: state.mockUser.uid,
      displayName: state.mockUser.displayName,
      scopes: 'read_prefs write_api',
    };
    return {
      access_token: token,
      token_type: 'Bearer',
      scope: 'read_prefs write_api',
      created_at: Math.floor(Date.now() / 1000),
    };
  }

  /** Pre-register a token directly (for tests that skip the auth flow). */
  function registerToken(token) {
    state.tokens[token] = {
      uid: state.mockUser.uid,
      displayName: state.mockUser.displayName,
      scopes: 'read_prefs write_api',
    };
  }

  /** Validate a Bearer token and return user info, or null if invalid. */
  function validateToken(authHeader) {
    if (!authHeader || !authHeader.startsWith('Bearer ')) { return null; }
    var token = authHeader.slice(7);
    return state.tokens[token] || null;
  }

  /** Look up an element by type and id. */
  function getElement(type, id) {
    return state.elements[type + '/' + id] || null;
  }

  /** Create a new changeset and return its id. */
  function createChangeset(uid, tags) {
    var id = state.nextChangesetId++;
    state.changesets[id] = {
      id: id,
      open: true,
      uid: uid,
      tags: tags || {},
      changes: [],
    };
    return id;
  }

  /** Close a changeset. Returns true on success, error string on failure. */
  function closeChangeset(id, uid) {
    var cs = state.changesets[id];
    if (!cs) { return 'not found'; }
    if (!cs.open) { return 'already closed'; }
    if (cs.uid !== uid) { return 'wrong user'; }
    cs.open = false;
    return true;
  }

  /**
   * Apply an OsmChange-style modification to the in-memory state.
   * operations: [{ action: 'modify', type, id, version, tags, lat, lon, nds }]
   * Returns diffResult entries or an error string.
   */
  function applyDiff(changesetId, uid, operations) {
    var cs = state.changesets[changesetId];
    if (!cs) { return { error: 'changeset not found', status: 404 }; }
    if (!cs.open) { return { error: 'changeset already closed', status: 409 }; }
    if (cs.uid !== uid) { return { error: 'wrong user', status: 409 }; }

    var results = [];
    for (var i = 0; i < operations.length; i++) {
      var op = operations[i];
      var key = op.type + '/' + op.id;

      if (op.action === 'modify') {
        var el = state.elements[key];
        if (!el) { return { error: key + ' not found', status: 404 }; }
        if (el.version !== op.version) {
          return { error: 'version mismatch for ' + key + ': expected ' + el.version + ', got ' + op.version, status: 409 };
        }
        el.version++;
        if (op.tags) { el.tags = op.tags; }
        if (op.lat !== undefined) { el.lat = op.lat; }
        if (op.lon !== undefined) { el.lon = op.lon; }
        if (op.nds) { el.nds = op.nds; }
        cs.changes.push({ action: 'modify', type: op.type, id: op.id });
        results.push({ type: op.type, old_id: op.id, new_id: op.id, new_version: el.version });
      } else if (op.action === 'create') {
        var newId = state.nextElementId++;
        state.elements[op.type + '/' + newId] = {
          type: op.type,
          id: newId,
          version: 1,
          lat: op.lat,
          lon: op.lon,
          tags: op.tags || {},
          nds: op.nds || [],
          visible: true,
        };
        cs.changes.push({ action: 'create', type: op.type, id: newId });
        results.push({ type: op.type, old_id: op.id, new_id: newId, new_version: 1 });
      } else if (op.action === 'delete') {
        var delEl = state.elements[key];
        if (!delEl) { return { error: key + ' not found', status: 404 }; }
        delEl.visible = false;
        delEl.version++;
        cs.changes.push({ action: 'delete', type: op.type, id: op.id });
        results.push({ type: op.type, old_id: op.id });
      }
    }

    return { results: results };
  }

  /** Record an incoming request for test assertions. */
  function recordCall(method, path, headers, body) {
    state.recordedCalls.push({ method: method, path: path, headers: headers, body: body });
  }

  /** Get recorded calls matching a path pattern (string or regex). */
  function getRecordedCalls(pathPattern) {
    if (!pathPattern) { return state.recordedCalls.slice(); }
    return state.recordedCalls.filter(function(c) {
      if (typeof pathPattern === 'string') { return c.path.indexOf(pathPattern) !== -1; }
      return pathPattern.test(c.path);
    });
  }

  /** Set an error to return on the next request matching a path pattern. */
  function setErrorForNext(pathPattern, statusCode, body) {
    state.nextError = { pathPattern: pathPattern, statusCode: statusCode, body: body };
  }

  /** Check if a pending error matches the given path. Consumes the error. */
  function consumeError(path) {
    if (!state.nextError) { return null; }
    var match = false;
    if (typeof state.nextError.pathPattern === 'string') {
      match = path.indexOf(state.nextError.pathPattern) !== -1;
    } else {
      match = state.nextError.pathPattern.test(path);
    }
    if (match) {
      var err = state.nextError;
      state.nextError = null;
      return err;
    }
    return null;
  }

  /** Reset all state to initial empty values. */
  function reset() {
    state.elements = {};
    state.changesets = {};
    state.nextChangesetId = 1;
    state.nextElementId = 100000;
    state.authCodes = {};
    state.tokens = {};
    state.recordedCalls = [];
    state.nextError = null;
  }

  return {
    seed: seed,
    issueAuthCode: issueAuthCode,
    exchangeAuthCode: exchangeAuthCode,
    registerToken: registerToken,
    validateToken: validateToken,
    getElement: getElement,
    createChangeset: createChangeset,
    closeChangeset: closeChangeset,
    applyDiff: applyDiff,
    recordCall: recordCall,
    getRecordedCalls: getRecordedCalls,
    setErrorForNext: setErrorForNext,
    consumeError: consumeError,
    reset: reset,
    _state: state,
  };
}

module.exports = { createState: createState };
