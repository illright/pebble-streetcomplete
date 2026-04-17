#pragma once

#include <pebble.h>

/* === Message keys (must match package.json messageKeys) === */

#define KEY_CMD                  0
#define KEY_QUEST_QUESTION       3
#define KEY_QUEST_DIST_M         4
#define KEY_QUEST_TYPE_ID        5
#define KEY_QUEST_ELEMENT_ID     6
#define KEY_QUEST_ELEMENT_TYPE   7
#define KEY_QUEST_NAME           8
#define KEY_ANSWER_VALUE         9
#define KEY_QUEST_ANSWER_OPTIONS 10
#define KEY_QUEST_BEARING        11
#define KEY_ARRIVED              12
#define KEY_SKIP_TYPE            13
#define KEY_QUEST_NODE_LAT_E6    14
#define KEY_QUEST_NODE_LON_E6    15
#define KEY_USER_LAT_E6          16
#define KEY_USER_LON_E6          17
#define KEY_MAP_DATA             18
#define KEY_QUEST_INPUT_TYPE     19

/* === Commands === */

#define CMD_ANSWER           2
#define CMD_SKIP             3
#define CMD_LOCATION_UPDATE  4
#define CMD_MAP_DATA         5
#define CMD_LOADING          6
#define CMD_RETRY_FETCH      7
#define CMD_DISMISS          8

/* === Quest input types === */

#define INPUT_TYPE_YES_NO        0
#define INPUT_TYPE_MULTI_CHOICE  1
#define INPUT_TYPE_NUMERIC       2

/* === Quest data limits === */

#define QUESTION_LEN     61
#define QUEST_TYPE_LEN   32
#define ELEMENT_TYPE_LEN 8
#define QUEST_NAME_LEN   32
#define ELEMENT_ID_LEN   16
#define MAX_OPTIONS      6
#define OPTION_LABEL_LEN 20
#define OPTION_VALUE_LEN 20
#define OPTIONS_STR_LEN  128

/* === Map data buffer === */

/* Each point is 4 bytes (int16 lat_offset + int16 lon_offset). Budget ~6KB
 * which allows ~1500 points — enough for a dense city block. */
#define MAP_DATA_MAX_BYTES  6144

/* Way separator sentinel: (0x7FFF, 0x7FFF) */
#define MAP_WAY_SENTINEL    0x7FFF

/* Way type header marker: first int16 of a 4-byte record. The second int16
 * holds the way type enum value for all subsequent coordinates until the
 * next sentinel or type header. */
#define MAP_WAY_TYPE_MARKER 0x7FFE

/* === Way type classification (matches JS classifyWay) === */

#define WAY_TYPE_ROAD       0
#define WAY_TYPE_MAJOR_ROAD 1
#define WAY_TYPE_PATH       2
#define WAY_TYPE_BUILDING   3
#define WAY_TYPE_WATER      4
#define WAY_TYPE_GREEN      5
#define WAY_TYPE_RAILWAY    6
#define WAY_TYPE_SERVICE    7

/* === Quest struct === */

typedef struct {
  char question[QUESTION_LEN];
  int32_t dist_m;
  int16_t bearing_deg;
  int32_t node_lat_e6;
  int32_t node_lon_e6;
  int32_t user_lat_e6;
  int32_t user_lon_e6;
  char quest_type_id[QUEST_TYPE_LEN];
  char element_id[ELEMENT_ID_LEN];
  char element_type[ELEMENT_TYPE_LEN];
  char name[QUEST_NAME_LEN];
  char option_labels[MAX_OPTIONS][OPTION_LABEL_LEN];
  char option_values[MAX_OPTIONS][OPTION_VALUE_LEN];
  uint8_t option_count;
  uint8_t input_type;
} Quest;

/** Returns true if the option label is exactly "Yes" or "No". */
static inline bool quest_option_is_yes_no(const char *label) {
  return strcmp(label, "Yes") == 0 || strcmp(label, "No") == 0;
}

/** Counts quest answer options whose labels are not "Yes" or "No". */
static inline uint8_t quest_extra_option_count(const Quest *q) {
  uint8_t count = 0;
  for (uint8_t i = 0; i < q->option_count; i++) {
    if (!quest_option_is_yes_no(q->option_labels[i])) {
      count++;
    }
  }
  return count;
}
