/**
 * Computes great-circle distance in meters.
 */
function distM(lat1, lon1, lat2, lon2) {
  var radius = 6371000;
  var dLat = (lat2 - lat1) * Math.PI / 180;
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
        + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
        * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return Math.round(radius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Computes initial bearing in degrees (0-359) from point 1 to point 2.
 */
function bearingDeg(lat1, lon1, lat2, lon2) {
  var dLon = (lon2 - lon1) * Math.PI / 180;
  var lat1r = lat1 * Math.PI / 180;
  var lat2r = lat2 * Math.PI / 180;
  var y = Math.sin(dLon) * Math.cos(lat2r);
  var x = Math.cos(lat1r) * Math.sin(lat2r)
        - Math.sin(lat1r) * Math.cos(lat2r) * Math.cos(dLon);
  var brng = Math.atan2(y, x) * 180 / Math.PI;
  return Math.round((brng + 360) % 360);
}

/**
 * Enriches quest candidates with distance, bearing, and sorts by proximity.
 */
function withDistanceAndBearing(quests, lat, lon) {
  return quests
    .filter(function(q) {
      return q.lat !== 0 || q.lon !== 0;
    })
    .map(function(q) {
      return {
        question: q.question,
        questType: q.questType,
        options: q.options,
        elementId: q.elementId,
        elementType: q.elementType,
        name: q.name,
        lat: q.lat,
        lon: q.lon,
        distM: distM(lat, lon, q.lat, q.lon),
        bearingDeg: bearingDeg(lat, lon, q.lat, q.lon),
      };
    })
    .sort(function(a, b) {
      return a.distM - b.distM;
    });
}

module.exports = {
  distM: distM,
  bearingDeg: bearingDeg,
  withDistanceAndBearing: withDistanceAndBearing,
};
