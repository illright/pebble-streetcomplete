#pragma once

#include <pebble.h>

#include "communication/protocol.h"

typedef struct {
  /* Active quest data (single quest at a time) */
  Quest active_quest;
  bool has_active_quest;
  bool arrived_at_quest;

  /* Compass state */
  int32_t compass_heading;

  /* Icon resources */
  GBitmap *icon_checkmark;
  GBitmap *icon_cross;
  GBitmap *icon_ellipsis;
  GBitmap *icon_plus;
  GBitmap *icon_minus;
  GBitmap *icon_list;
  GBitmap *icon_question;
  GBitmap *icon_map;

  GDrawCommandImage *main_illustration;
  GDrawCommandImage *compass_arrow;

  /* Window handles */
  Window *main_window;
  StatusBarLayer *main_status_bar;
  TextLayer *main_status_layer;
  Layer *main_illustration_layer;
  ActionBarLayer *main_action_bar;

  Window *incoming_window;
  TextLayer *incoming_question_layer;
  TextLayer *incoming_dist_layer;
  Layer *incoming_arrow_layer;
  ScrollLayer *incoming_scroll_layer;
  TextLayer *incoming_name_layer;

  Window *actions_window;
  MenuLayer *actions_menu_layer;

  Window *skip_window;
  MenuLayer *skip_menu_layer;

  Window *yesno_window;
  ActionBarLayer *yesno_action_bar;
  TextLayer *yesno_question_layer;
  TextLayer *yesno_meta_layer;

  Window *options_window;
  MenuLayer *options_menu_layer;

  Window *multi_choice_window;
  ActionBarLayer *multi_choice_action_bar;
  TextLayer *multi_choice_question_layer;
  TextLayer *multi_choice_meta_layer;

  Window *multi_choice_list_window;
  MenuLayer *multi_choice_list_menu_layer;

  Window *numeric_window;
  ActionBarLayer *numeric_action_bar;
  TextLayer *numeric_question_layer;
  TextLayer *numeric_meta_layer;

  Window *compass_window;
  Layer *compass_arrow_layer;
  TextLayer *compass_dist_layer;
  TextLayer *compass_name_layer;

  Window *loading_window;
  StatusBarLayer *loading_status_bar;
  TextLayer *loading_text_layer;
  ActionBarLayer *loading_action_bar;
  GBitmap *icon_retry;

  Window *thanks_window;
  TextLayer *thanks_layer;

  Window *map_window;
  Layer *map_layer;

  /* Packed polyline data received from the phone. */
  uint8_t map_data[MAP_DATA_MAX_BYTES];
  uint16_t map_data_len;
} AppState;
