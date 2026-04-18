/**
 * Standalone mock OSM server emulating OAuth 2.0 token exchange and changeset upload APIs.
 * Designed for E2E testing and manual verification of the auth + upload flow.
 */

const http = require('node:http');
const { createState } = require('./state');

/**
 * Parse a URL-encoded form body (application/x-www-form-urlencoded) into key-value pairs.
 */
function parseFormBody(body) {
  const params = {};
  if (!body) { return params; }
  body.split('&').forEach(function(pair) {
    const parts = pair.split('=');
    params[decodeURIComponent(parts[0])] = decodeURIComponent(parts[1] || '');
  });
  return params;
}

/**
 * Read the full request body as a string.
 */
function readBody(req) {
  return new Promise(function(resolve, reject) {
    let data = '';
    req.on('data', function(chunk) { data += chunk; });
    req.on('end', function() { resolve(data); });
    req.on('error', reject);
  });
}

/**
 * Escape a string for safe inclusion in XML text content.
 */
function xmlEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Build an element XML string for a node or way from in-memory state.
 */
function elementToXml(el) {
  let xml = '';
  if (el.type === 'node') {
    xml += '<node id="' + el.id + '" visible="' + el.visible + '" version="' + el.version + '"'
         + ' changeset="1" user="TestUser" uid="1"'
         + ' lat="' + el.lat + '" lon="' + el.lon + '">';
  } else if (el.type === 'way') {
    xml += '<way id="' + el.id + '" visible="' + el.visible + '" version="' + el.version + '"'
         + ' changeset="1" user="TestUser" uid="1">';
  } else {
    xml += '<relation id="' + el.id + '" visible="' + el.visible + '" version="' + el.version + '"'
         + ' changeset="1" user="TestUser" uid="1">';
  }
  const tags = el.tags || {};
  for (const k of Object.keys(tags)) {
    xml += '<tag k="' + xmlEscape(k) + '" v="' + xmlEscape(tags[k]) + '"/>';
  }
  if (el.type === 'way' && el.nds) {
    for (const nd of el.nds) {
      xml += '<nd ref="' + nd + '"/>';
    }
  }
  if (el.type === 'node') { xml += '</node>'; }
  else if (el.type === 'way') { xml += '</way>'; }
  else { xml += '</relation>'; }
  return xml;
}

/**
 * Minimal XML parser for OsmChange documents. Extracts modify/create/delete operations.
 * Not a general-purpose parser — only handles the subset needed for the mock.
 */
function parseOsmChange(xml) {
  const operations = [];
  const actionRegex = /<(modify|create|delete)>([\s\S]*?)<\/\1>/g;
  let actionMatch;

  while ((actionMatch = actionRegex.exec(xml)) !== null) {
    const action = actionMatch[1];
    const block = actionMatch[2];
    const elementRegex = /<(node|way|relation)\s+([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;
    let elMatch;

    while ((elMatch = elementRegex.exec(block)) !== null) {
      const type = elMatch[1];
      const attrs = elMatch[2];
      const inner = elMatch[3] || '';

      const idMatch = attrs.match(/id="(-?\d+)"/);
      const versionMatch = attrs.match(/version="(\d+)"/);
      const changesetMatch = attrs.match(/changeset="(\d+)"/);
      const latMatch = attrs.match(/lat="([^"]+)"/);
      const lonMatch = attrs.match(/lon="([^"]+)"/);

      const tags = {};
      const tagRegex = /<tag\s+k="([^"]*?)"\s+v="([^"]*?)"\s*\/>/g;
      let tagMatch;
      while ((tagMatch = tagRegex.exec(inner)) !== null) {
        tags[tagMatch[1]] = tagMatch[2];
      }

      const nds = [];
      const ndRegex = /<nd\s+ref="(\d+)"\s*\/>/g;
      let ndMatch;
      while ((ndMatch = ndRegex.exec(inner)) !== null) {
        nds.push(parseInt(ndMatch[1], 10));
      }

      operations.push({
        action: action,
        type: type,
        id: idMatch ? parseInt(idMatch[1], 10) : -1,
        version: versionMatch ? parseInt(versionMatch[1], 10) : undefined,
        changeset: changesetMatch ? parseInt(changesetMatch[1], 10) : undefined,
        lat: latMatch ? parseFloat(latMatch[1]) : undefined,
        lon: lonMatch ? parseFloat(lonMatch[1]) : undefined,
        tags: tags,
        nds: nds.length > 0 ? nds : undefined,
      });
    }
  }
  return operations;
}

/**
 * Minimal parser for changeset creation XML. Extracts tags.
 */
function parseChangesetXml(xml) {
  const tags = {};
  const tagRegex = /<tag\s+k="([^"]*?)"\s+v="([^"]*?)"\s*\/>/g;
  let match;
  while ((match = tagRegex.exec(xml)) !== null) {
    tags[match[1]] = match[2];
  }
  return { tags: tags };
}

/**
 * Build OSM map XML response from all visible elements in state.
 */
function buildMapXml(state) {
  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<osm version="0.6" generator="MockOSM">\n';
  const elements = state._state.elements;
  for (const key of Object.keys(elements)) {
    const el = elements[key];
    if (el.visible) {
      xml += '  ' + elementToXml(el) + '\n';
    }
  }
  xml += '</osm>';
  return xml;
}

/**
 * Create and return a mock OSM server instance with programmatic control methods.
 */
function createMockOsmServer() {
  const state = createState();
  let server = null;
  let port = null;

  /**
   * Route and handle a single HTTP request against the mock OSM API.
   */
  async function handleRequest(req, res) {
    const body = await readBody(req);
    const url = new URL(req.url, 'http://localhost');
    const pathname = url.pathname;
    const method = req.method;

    state.recordCall(method, pathname + url.search, req.headers, body);

    // Check for injected errors
    const injectedError = state.consumeError(pathname);
    if (injectedError) {
      res.statusCode = injectedError.statusCode;
      res.end(injectedError.body || '');
      return;
    }

    // --- User Details ---
    if (method === 'GET' && pathname === '/api/0.6/user/details') {
      const user = state.validateToken(req.headers['authorization']);
      if (!user) {
        res.statusCode = 401;
        res.end('Unauthorized');
        return;
      }
      res.setHeader('Content-Type', 'application/xml');
      res.end('<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<osm version="0.6"><user id="' + user.uid + '" display_name="' + xmlEscape(user.displayName) + '"'
        + ' account_created="2020-01-01T00:00:00Z">'
        + '<contributor-terms agreed="true"/>'
        + '<changesets count="0"/><traces count="0"/>'
        + '</user></osm>');
      return;
    }

    // --- Permissions ---
    if (method === 'GET' && pathname === '/api/0.6/permissions') {
      const user = state.validateToken(req.headers['authorization']);
      if (!user) {
        res.statusCode = 401;
        res.end('Unauthorized');
        return;
      }
      res.setHeader('Content-Type', 'application/xml');
      res.end('<?xml version="1.0" encoding="UTF-8"?>\n'
        + '<osm version="0.6"><permissions>'
        + '<permission name="allow_read_prefs"/>'
        + '<permission name="allow_write_api"/>'
        + '</permissions></osm>');
      return;
    }

    // --- Element Read: GET /api/0.6/{node|way|relation}/:id ---
    const elementReadMatch = pathname.match(/^\/api\/0\.6\/(node|way|relation)\/(\d+)$/);
    if (method === 'GET' && elementReadMatch) {
      const el = state.getElement(elementReadMatch[1], parseInt(elementReadMatch[2], 10));
      if (!el || !el.visible) {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }
      res.setHeader('Content-Type', 'application/xml');
      res.end('<?xml version="1.0" encoding="UTF-8"?>\n<osm version="0.6">'
        + elementToXml(el) + '</osm>');
      return;
    }

    // --- Changeset Create: PUT /api/0.6/changeset/create ---
    if (method === 'PUT' && pathname === '/api/0.6/changeset/create') {
      const user = state.validateToken(req.headers['authorization']);
      if (!user) {
        res.statusCode = 401;
        res.end('Unauthorized');
        return;
      }
      const parsed = parseChangesetXml(body);
      const csId = state.createChangeset(user.uid, parsed.tags);
      res.setHeader('Content-Type', 'text/plain');
      res.end(String(csId));
      return;
    }

    // --- Changeset Upload: POST /api/0.6/changeset/:id/upload ---
    const uploadMatch = pathname.match(/^\/api\/0\.6\/changeset\/(\d+)\/upload$/);
    if (method === 'POST' && uploadMatch) {
      const user = state.validateToken(req.headers['authorization']);
      if (!user) {
        res.statusCode = 401;
        res.end('Unauthorized');
        return;
      }
      const csId = parseInt(uploadMatch[1], 10);
      const operations = parseOsmChange(body);
      if (operations.length === 0) {
        res.statusCode = 400;
        res.end('Empty or unparseable OsmChange document');
        return;
      }
      const result = state.applyDiff(csId, user.uid, operations);
      if (result.error) {
        res.statusCode = result.status || 409;
        res.end(result.error);
        return;
      }
      let diffXml = '<diffResult generator="MockOSM" version="0.6">\n';
      for (const r of result.results) {
        const tag = r.type;
        diffXml += '  <' + tag + ' old_id="' + r.old_id + '"';
        if (r.new_id !== undefined) { diffXml += ' new_id="' + r.new_id + '"'; }
        if (r.new_version !== undefined) { diffXml += ' new_version="' + r.new_version + '"'; }
        diffXml += '/>\n';
      }
      diffXml += '</diffResult>';
      res.setHeader('Content-Type', 'application/xml');
      res.end(diffXml);
      return;
    }

    // --- Changeset Close: PUT /api/0.6/changeset/:id/close ---
    const closeMatch = pathname.match(/^\/api\/0\.6\/changeset\/(\d+)\/close$/);
    if (method === 'PUT' && closeMatch) {
      const user = state.validateToken(req.headers['authorization']);
      if (!user) {
        res.statusCode = 401;
        res.end('Unauthorized');
        return;
      }
      const csId = parseInt(closeMatch[1], 10);
      const closeResult = state.closeChangeset(csId, user.uid);
      if (closeResult !== true) {
        res.statusCode = closeResult === 'not found' ? 404 : 409;
        res.end(closeResult);
        return;
      }
      res.statusCode = 200;
      res.end('');
      return;
    }

    // --- Map data: GET /api/0.6/map ---
    if (method === 'GET' && pathname === '/api/0.6/map') {
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.end(buildMapXml(state));
      return;
    }

    // --- Fallback ---
    res.statusCode = 404;
    res.end('Mock OSM: unhandled route ' + method + ' ' + pathname);
  }

  /**
   * Start the mock server on the given port (0 for random).
   * Returns a promise that resolves with the assigned port.
   */
  function start(listenPort) {
    return new Promise(function(resolve, reject) {
      server = http.createServer(function(req, res) {
        handleRequest(req, res).catch(function(err) {
          res.statusCode = 500;
          res.end('Internal mock error: ' + err.message);
        });
      });
      server.on('error', reject);
      server.listen(listenPort || 0, '127.0.0.1', function() {
        port = server.address().port;
        resolve(port);
      });
    });
  }

  /** Stop the mock server. */
  function stop() {
    return new Promise(function(resolve, reject) {
      if (!server) { resolve(); return; }
      server.close(function(err) {
        server = null;
        port = null;
        if (err) { reject(err); } else { resolve(); }
      });
    });
  }

  /** Get the base URL of the running mock server. */
  function baseUrl() {
    return 'http://127.0.0.1:' + port;
  }

  return {
    start: start,
    stop: stop,
    baseUrl: baseUrl,
    seed: state.seed,
    issueAuthCode: state.issueAuthCode,
    registerToken: state.registerToken,
    getRecordedCalls: state.getRecordedCalls,
    setErrorForNext: state.setErrorForNext,
    reset: state.reset,
    _state: state._state,
  };
}

module.exports = { createMockOsmServer: createMockOsmServer };
