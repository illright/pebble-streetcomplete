/**
 * Extracts XML attributes into a key/value map to reuse across node and way parsing.
 */
function parseAttrs(str, attrRe) {
  var result = {};
  var m;
  attrRe.lastIndex = 0;
  while ((m = attrRe.exec(str)) !== null) {
    result[m[1]] = m[2];
  }
  return result;
}

/**
 * Extracts OSM <tag> pairs from an element body into a flat tag object.
 */
function parseTags(str, tagRe) {
  var result = {};
  var m;
  tagRe.lastIndex = 0;
  while ((m = tagRe.exec(str)) !== null) {
    result[m[1]] = m[2];
  }
  return result;
}

/**
 * Parses <nd ref="..."> elements inside a way body into an array of node IDs.
 */
function parseNdRefs(str) {
  var refs = [];
  var ndRe = /<nd\s+ref="(\d+)"/g;
  var m;
  while ((m = ndRe.exec(str)) !== null) {
    refs.push(+m[1]);
  }
  return refs;
}

/**
 * Computes the centroid of a way from its member node coordinates.
 */
function wayCentroid(ndRefs, nodeCoords) {
  var sumLat = 0;
  var sumLon = 0;
  var count = 0;

  for (var i = 0; i < ndRefs.length; i++) {
    var c = nodeCoords[ndRefs[i]];
    if (c) {
      sumLat += c.lat;
      sumLon += c.lon;
      count++;
    }
  }

  if (count === 0) {
    return { lat: 0, lon: 0 };
  }
  return { lat: sumLat / count, lon: sumLon / count };
}

/**
 * Converts OSM API XML into the minimal element representation needed for quest filtering.
 * Builds a coordinate lookup from ALL nodes so way centroids can be computed.
 * Also returns raw way geometries for map rendering.
 */
function parseOsmXml(xml) {
  var elements = [];
  var nodeCoords = {};
  var wayGeometries = [];
  var attrRe = /(\w[\w:]+)="([^"]*)"/g;
  var tagRe = /<tag\s+k="([^"]+)"\s+v="([^"]*)"/g;

  // First pass: collect all nodes (self-closing and full) for coordinate lookup.
  var selfClosingNodeRe = /<node\b([^>]*)\/>/g;
  var m;
  while ((m = selfClosingNodeRe.exec(xml)) !== null) {
    var attrs = parseAttrs(m[1], attrRe);
    nodeCoords[+attrs.id] = { lat: +attrs.lat, lon: +attrs.lon };
  }

  var fullNodeRe = /<node\b([^>]*)>([\s\S]*?)<\/node>/g;
  while ((m = fullNodeRe.exec(xml)) !== null) {
    var attrs2 = parseAttrs(m[1], attrRe);
    var lat = +attrs2.lat;
    var lon = +attrs2.lon;
    nodeCoords[+attrs2.id] = { lat: lat, lon: lon };

    var tags = parseTags(m[2], tagRe);
    if (Object.keys(tags).length === 0) {
      continue;
    }
    elements.push({
      type: 'node',
      id: +attrs2.id,
      lat: lat,
      lon: lon,
      tags: tags,
    });
  }

  // Second pass: parse ways with nd refs and compute centroids.
  var wayRe = /<way\b([^>]*)>([\s\S]*?)<\/way>/g;
  while ((m = wayRe.exec(xml)) !== null) {
    var attrs3 = parseAttrs(m[1], attrRe);
    var body = m[2];
    var tags2 = parseTags(body, tagRe);
    var ndRefs = parseNdRefs(body);

    /* Build the coordinate sequence for map rendering. */
    var coords = [];
    for (var i = 0; i < ndRefs.length; i++) {
      var c = nodeCoords[ndRefs[i]];
      if (c) {
        coords.push({ lat: c.lat, lon: c.lon });
      }
    }
    if (coords.length >= 2) {
      wayGeometries.push({ tags: tags2, coords: coords });
    }

    if (Object.keys(tags2).length === 0) {
      continue;
    }
    var center = wayCentroid(ndRefs, nodeCoords);
    elements.push({
      type: 'way',
      id: +attrs3.id,
      lat: center.lat,
      lon: center.lon,
      tags: tags2,
    });
  }

  return { elements: elements, wayGeometries: wayGeometries };
}

module.exports = {
  parseOsmXml: parseOsmXml,
};
