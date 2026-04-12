/* Shared AppMessage keys; must stay in lockstep with watch-side protocol.h. */
var KEY_CMD              = 0;
var KEY_QUEST_QUESTION   = 3;
var KEY_QUEST_DIST_M     = 4;
var KEY_QUEST_TYPE_ID    = 5;
var KEY_QUEST_ELEMENT_ID = 6;
var KEY_QUEST_ELEMENT_TYPE  = 7;
var KEY_QUEST_NAME       = 8;
var KEY_ANSWER_VALUE     = 9;
var KEY_QUEST_ANSWER_OPTIONS = 10;
var KEY_QUEST_BEARING    = 11;
var KEY_ARRIVED          = 12;
var KEY_SKIP_TYPE        = 13;
var KEY_QUEST_NODE_LAT_E6 = 14;
var KEY_QUEST_NODE_LON_E6 = 15;
var KEY_USER_LAT_E6      = 16;
var KEY_USER_LON_E6      = 17;
var KEY_MAP_DATA         = 18;
var KEY_QUEST_INPUT_TYPE = 19;

/* Command values carried in KEY_CMD. */
var CMD_ANSWER = 2;
var CMD_SKIP = 3;
var CMD_LOCATION_UPDATE = 4;
var CMD_MAP_DATA = 5;
var CMD_LOADING = 6;
var CMD_RETRY_FETCH = 7;

/* Runtime limits. */
var SEARCH_RADIUS = 0.003;

var INPUT_TYPE_YES_NO = 0;
var INPUT_TYPE_MULTI_CHOICE = 1;
var INPUT_TYPE_NUMERIC = 2;

/* Build-time configuration: production defaults, overridable via env vars during build. */
var config = require('../config/config.production');
var overrides = {};
try { overrides = require('../../build/build_overrides.auto'); } catch (e) { overrides = {}; }

/* Distance in meters at which a quest is considered "arrived". */
var ARRIVAL_THRESHOLD_M =
  typeof overrides.ARRIVAL_THRESHOLD_M === 'number' && overrides.ARRIVAL_THRESHOLD_M > 0
    ? overrides.ARRIVAL_THRESHOLD_M
    : 10;

/* Emulator-safe fallback coordinates (central Amsterdam). */
var FALLBACK_LAT = 52.373;
var FALLBACK_LON = 4.892;

var OSM_BASE_URL = overrides.OSM_BASE_URL || config.OSM_BASE_URL;

/* Maximum age of a cached GPS position in milliseconds. */
var GPS_MAX_AGE_MS =
  typeof overrides.GPS_MAX_AGE_MS === 'number' && overrides.GPS_MAX_AGE_MS >= 0
    ? overrides.GPS_MAX_AGE_MS
    : 10000;

module.exports = {
  KEY_CMD: KEY_CMD,
  KEY_QUEST_QUESTION: KEY_QUEST_QUESTION,
  KEY_QUEST_DIST_M: KEY_QUEST_DIST_M,
  KEY_QUEST_TYPE_ID: KEY_QUEST_TYPE_ID,
  KEY_QUEST_ELEMENT_ID: KEY_QUEST_ELEMENT_ID,
  KEY_QUEST_ELEMENT_TYPE: KEY_QUEST_ELEMENT_TYPE,
  KEY_QUEST_NAME: KEY_QUEST_NAME,
  KEY_ANSWER_VALUE: KEY_ANSWER_VALUE,
  KEY_QUEST_ANSWER_OPTIONS: KEY_QUEST_ANSWER_OPTIONS,
  KEY_QUEST_BEARING: KEY_QUEST_BEARING,
  KEY_ARRIVED: KEY_ARRIVED,
  KEY_SKIP_TYPE: KEY_SKIP_TYPE,
  KEY_QUEST_NODE_LAT_E6: KEY_QUEST_NODE_LAT_E6,
  KEY_QUEST_NODE_LON_E6: KEY_QUEST_NODE_LON_E6,
  KEY_USER_LAT_E6: KEY_USER_LAT_E6,
  KEY_USER_LON_E6: KEY_USER_LON_E6,
  KEY_MAP_DATA: KEY_MAP_DATA,
  KEY_QUEST_INPUT_TYPE: KEY_QUEST_INPUT_TYPE,
  CMD_ANSWER: CMD_ANSWER,
  CMD_SKIP: CMD_SKIP,
  CMD_LOCATION_UPDATE: CMD_LOCATION_UPDATE,
  CMD_MAP_DATA: CMD_MAP_DATA,
  CMD_LOADING: CMD_LOADING,
  CMD_RETRY_FETCH: CMD_RETRY_FETCH,
  SEARCH_RADIUS: SEARCH_RADIUS,
  ARRIVAL_THRESHOLD_M: ARRIVAL_THRESHOLD_M,
  GPS_MAX_AGE_MS: GPS_MAX_AGE_MS,
  FALLBACK_LAT: FALLBACK_LAT,
  FALLBACK_LON: FALLBACK_LON,
  OSM_BASE_URL: OSM_BASE_URL,
  INPUT_TYPE_YES_NO: INPUT_TYPE_YES_NO,
  INPUT_TYPE_MULTI_CHOICE: INPUT_TYPE_MULTI_CHOICE,
  INPUT_TYPE_NUMERIC: INPUT_TYPE_NUMERIC,
};
