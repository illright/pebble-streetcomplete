#include "comm.h"
#include "protocol.h"
#include "../ui/quest_incoming/quest_incoming_window.h"
#include "../ui/quest_yes_no/quest_yes_no_window.h"
#include "../ui/quest_multi_choice/quest_multi_choice_window.h"
#include "../ui/quest_numeric/quest_numeric_window.h"
#include "../ui/shared/compass_window.h"
#include "../ui/shared/loading_window.h"

static AppState *s_app;
static bool s_map_data_receiving;

/** Sends the user's answer for the active quest to the phone over AppMessage. */
void comm_send_answer(const char *answer_value) {
  Quest *q = &s_app->active_quest;
  DictionaryIterator *iter;
  if (app_message_outbox_begin(&iter) != APP_MSG_OK) {
    return;
  }
  dict_write_uint8(iter, KEY_CMD, CMD_ANSWER);
  dict_write_cstring(iter, KEY_QUEST_TYPE_ID, q->quest_type_id);
  dict_write_cstring(iter, KEY_QUEST_ELEMENT_ID, q->element_id);
  dict_write_cstring(iter, KEY_QUEST_ELEMENT_TYPE, q->element_type);
  dict_write_cstring(iter, KEY_ANSWER_VALUE, answer_value);
  app_message_outbox_send();
}

/** Tells the phone to skip the active quest, including the reason (e.g. "can't say"). */
void comm_send_skip(uint8_t skip_type) {
  Quest *q = &s_app->active_quest;
  DictionaryIterator *iter;
  if (app_message_outbox_begin(&iter) != APP_MSG_OK) {
    return;
  }
  dict_write_uint8(iter, KEY_CMD, CMD_SKIP);
  dict_write_uint8(iter, KEY_SKIP_TYPE, skip_type);
  dict_write_cstring(iter, KEY_QUEST_TYPE_ID, q->quest_type_id);
  dict_write_cstring(iter, KEY_QUEST_ELEMENT_ID, q->element_id);
  dict_write_cstring(iter, KEY_QUEST_ELEMENT_TYPE, q->element_type);
  app_message_outbox_send();
}

/** Sends a retry-fetch command to JS, requesting a fresh OSM data download. */
void comm_send_retry_fetch(void) {
  DictionaryIterator *iter;
  if (app_message_outbox_begin(&iter) != APP_MSG_OK) {
    return;
  }
  dict_write_uint8(iter, KEY_CMD, CMD_RETRY_FETCH);
  app_message_outbox_send();
}

/** Tells the phone to dismiss the active quest so the next best quest can be sent. */
void comm_send_dismiss(void) {
  DictionaryIterator *iter;
  if (app_message_outbox_begin(&iter) != APP_MSG_OK) {
    return;
  }
  dict_write_uint8(iter, KEY_CMD, CMD_DISMISS);
  app_message_outbox_send();
}

/** Populates a Quest struct from the key-value pairs in an AppMessage dictionary.
 *  Parses coordinates, metadata strings, answer options, and input type. */
static void parse_quest_fields(DictionaryIterator *iter, Quest *q) {
  Tuple *t;

  t = dict_find(iter, KEY_QUEST_QUESTION);
  if (t) {
    strncpy(q->question, t->value->cstring, QUESTION_LEN - 1);
    q->question[QUESTION_LEN - 1] = '\0';
  }

  t = dict_find(iter, KEY_QUEST_DIST_M);
  if (t) { q->dist_m = t->value->int32; }

  t = dict_find(iter, KEY_QUEST_BEARING);
  if (t) { q->bearing_deg = (int16_t)t->value->int32; }

  t = dict_find(iter, KEY_QUEST_NODE_LAT_E6);
  if (t) { q->node_lat_e6 = t->value->int32; }

  t = dict_find(iter, KEY_QUEST_NODE_LON_E6);
  if (t) { q->node_lon_e6 = t->value->int32; }

  t = dict_find(iter, KEY_USER_LAT_E6);
  if (t) { q->user_lat_e6 = t->value->int32; }

  t = dict_find(iter, KEY_USER_LON_E6);
  if (t) { q->user_lon_e6 = t->value->int32; }

  t = dict_find(iter, KEY_QUEST_TYPE_ID);
  if (t) {
    strncpy(q->quest_type_id, t->value->cstring, QUEST_TYPE_LEN - 1);
    q->quest_type_id[QUEST_TYPE_LEN - 1] = '\0';
  }

  t = dict_find(iter, KEY_QUEST_ELEMENT_ID);
  if (t) {
    strncpy(q->element_id, t->value->cstring, ELEMENT_ID_LEN - 1);
    q->element_id[ELEMENT_ID_LEN - 1] = '\0';
  }

  t = dict_find(iter, KEY_QUEST_ELEMENT_TYPE);
  if (t) {
    strncpy(q->element_type, t->value->cstring, ELEMENT_TYPE_LEN - 1);
    q->element_type[ELEMENT_TYPE_LEN - 1] = '\0';
  }

  t = dict_find(iter, KEY_QUEST_NAME);
  if (t) {
    strncpy(q->name, t->value->cstring, QUEST_NAME_LEN - 1);
    q->name[QUEST_NAME_LEN - 1] = '\0';
  } else {
    q->name[0] = '\0';
  }

  /* Parse pipe-delimited answer options */
  t = dict_find(iter, KEY_QUEST_ANSWER_OPTIONS);
  q->option_count = 0;
  if (t && t->value->cstring[0]) {
    char buf[OPTIONS_STR_LEN];
    strncpy(buf, t->value->cstring, OPTIONS_STR_LEN - 1);
    buf[OPTIONS_STR_LEN - 1] = '\0';

    char *tok = buf;
    while (tok && *tok && q->option_count < MAX_OPTIONS) {
      char *pipe = strchr(tok, '|');
      if (pipe) { *pipe = '\0'; }
      char *eq = strchr(tok, '=');
      if (eq) {
        *eq = '\0';
        strncpy(q->option_labels[q->option_count], tok, OPTION_LABEL_LEN - 1);
        q->option_labels[q->option_count][OPTION_LABEL_LEN - 1] = '\0';
        strncpy(q->option_values[q->option_count], eq + 1, OPTION_VALUE_LEN - 1);
        q->option_values[q->option_count][OPTION_VALUE_LEN - 1] = '\0';
        q->option_count++;
      }
      tok = pipe ? pipe + 1 : NULL;
    }
  }

  /* Parse quest input type (defaults to yes/no if absent) */
  t = dict_find(iter, KEY_QUEST_INPUT_TYPE);
  q->input_type = t ? (uint8_t)t->value->int32 : INPUT_TYPE_YES_NO;
}

/** Resets app state and pushes the appropriate UI screen for a newly received quest.
 *  Skips the navigation screen if the user has already arrived. */
static void handle_new_quest(DictionaryIterator *iter) {
  Quest *q = &s_app->active_quest;
  memset(q, 0, sizeof(Quest));
  parse_quest_fields(iter, q);
  s_app->has_active_quest = true;
  s_app->arrived_at_quest = false;
  s_map_data_receiving = false;
  s_app->map_data_len = 0;

  Tuple *t_arrived = dict_find(iter, KEY_ARRIVED);
  if (t_arrived && t_arrived->value->int32) {
    s_app->arrived_at_quest = true;
  }

  /* Remove the loading screen before showing the quest. */
  loading_window_remove(s_app);

  /* Nudge the user so they know a quest has arrived. */
  static const uint32_t vibe_segments[] = { 50, 100, 50 };
  VibePattern pat = {
    .durations = vibe_segments,
    .num_segments = ARRAY_LENGTH(vibe_segments),
  };
  vibes_enqueue_custom_pattern(pat);

  /* Show the incoming quest window, or push the answer screen directly if already arrived */
  if (s_app->arrived_at_quest) {
    if (q->input_type == INPUT_TYPE_MULTI_CHOICE) {
      quest_multi_choice_window_push(s_app);
    } else if (q->input_type == INPUT_TYPE_NUMERIC) {
      quest_numeric_window_push(s_app);
    } else {
      quest_yes_no_window_push(s_app);
    }
  } else {
    quest_incoming_window_push(s_app);
  }
}

/** Appends a chunk of packed polyline data to the map data buffer. The first
 *  chunk resets the buffer so stale data from a previous quest is discarded. */
static void handle_map_data(DictionaryIterator *iter) {
  Tuple *t = dict_find(iter, KEY_MAP_DATA);
  if (!t || t->length == 0) { return; }

  if (!s_map_data_receiving) {
    /* First chunk for this quest — reset buffer. */
    s_app->map_data_len = 0;
    s_map_data_receiving = true;
  }

  uint16_t space = MAP_DATA_MAX_BYTES - s_app->map_data_len;
  uint16_t copy_len = t->length < space ? t->length : space;
  memcpy(s_app->map_data + s_app->map_data_len, t->value->data, copy_len);
  s_app->map_data_len += copy_len;

  APP_LOG(APP_LOG_LEVEL_DEBUG, "Map data chunk: %d bytes (total %d)",
          (int)t->length, (int)s_app->map_data_len);

  /* Refresh the map layer if it is on screen. */
  if (s_app->map_layer) {
    layer_mark_dirty(s_app->map_layer);
  }
}

/** Updates quest distance/bearing from a location message and transitions
 *  to the answer screen when the user arrives at the quest location. */
static void handle_location_update(DictionaryIterator *iter) {
  if (!s_app->has_active_quest) {
    return;
  }

  Quest *q = &s_app->active_quest;

  Tuple *t_dist = dict_find(iter, KEY_QUEST_DIST_M);
  if (t_dist) { q->dist_m = t_dist->value->int32; }

  Tuple *t_bearing = dict_find(iter, KEY_QUEST_BEARING);
  if (t_bearing) { q->bearing_deg = (int16_t)t_bearing->value->int32; }

  Tuple *t_user_lat = dict_find(iter, KEY_USER_LAT_E6);
  if (t_user_lat) { q->user_lat_e6 = t_user_lat->value->int32; }

  Tuple *t_user_lon = dict_find(iter, KEY_USER_LON_E6);
  if (t_user_lon) { q->user_lon_e6 = t_user_lon->value->int32; }

  Tuple *t_arrived = dict_find(iter, KEY_ARRIVED);
  if (t_arrived && t_arrived->value->int32 && !s_app->arrived_at_quest) {
    s_app->arrived_at_quest = true;
    if (q->input_type == INPUT_TYPE_MULTI_CHOICE) {
      quest_multi_choice_window_push(s_app);
    } else if (q->input_type == INPUT_TYPE_NUMERIC) {
      quest_numeric_window_push(s_app);
    } else {
      quest_yes_no_window_push(s_app);
    }
    return;
  }

  /* Refresh compass arrow layers if visible */
  if (s_app->incoming_arrow_layer) {
    layer_mark_dirty(s_app->incoming_arrow_layer);
  }
  if (s_app->map_layer) {
    layer_mark_dirty(s_app->map_layer);
  }
  if (s_app->incoming_dist_layer) {
    static char dist_buf[20];
    snprintf(dist_buf, sizeof(dist_buf), "%d m away", (int)q->dist_m);
    text_layer_set_text(s_app->incoming_dist_layer, dist_buf);
  }
  compass_window_mark_dirty(s_app);
}

/** AppMessage inbox callback — dispatches by command type, falling back to
 *  new-quest handling when a question key is present without a command. */
static void inbox_received(DictionaryIterator *iter, void *ctx) {
  (void)ctx;

  Tuple *t_cmd = dict_find(iter, KEY_CMD);
  if (t_cmd) {
    int cmd = t_cmd->value->int32;
    if (cmd == CMD_LOCATION_UPDATE) {
      handle_location_update(iter);
      return;
    }
    if (cmd == CMD_MAP_DATA) {
      handle_map_data(iter);
      return;
    }
    if (cmd == CMD_LOADING) {
      if (!s_app->has_active_quest) {
        loading_window_push(s_app);
      }
      return;
    }
  }

  /* No CMD key or unrecognized → treat as a new quest message */
  Tuple *t_question = dict_find(iter, KEY_QUEST_QUESTION);
  if (t_question) {
    handle_new_quest(iter);
  }
}

/** Logs when an incoming AppMessage is dropped. */
static void inbox_dropped(AppMessageResult reason, void *ctx) {
  (void)ctx;
  APP_LOG(APP_LOG_LEVEL_ERROR, "Inbox dropped: %d", (int)reason);
}

/** Logs when an outgoing AppMessage fails to send. */
static void outbox_failed(DictionaryIterator *iter, AppMessageResult reason, void *ctx) {
  (void)iter;
  (void)ctx;
  APP_LOG(APP_LOG_LEVEL_ERROR, "Outbox failed: %d", (int)reason);
}

/** Registers AppMessage handlers and opens the inbox/outbox at maximum size. */
void comm_init(AppState *app) {
  s_app = app;
  app_message_register_inbox_received(inbox_received);
  app_message_register_inbox_dropped(inbox_dropped);
  app_message_register_outbox_failed(outbox_failed);
  app_message_open(app_message_inbox_size_maximum(), app_message_outbox_size_maximum());
}
