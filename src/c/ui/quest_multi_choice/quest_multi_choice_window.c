#include "quest_multi_choice_window.h"
#include "quest_multi_choice_list_window.h"
#include "../quest_yes_no/quest_options_window.h"
#include "../shared/map_window.h"
#include "../../communication/comm.h"

static AppState *s_app;

#ifdef PBL_ROUND
static GTextAttributes *s_text_attrs;
static Layer *s_content_layer;

/* Draws question + meta text vertically centered with circular text flow. */
static void content_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  Quest *q = &s_app->active_quest;
  int16_t inset = ACTION_BAR_WIDTH;
  int16_t content_w = bounds.size.w - 2 * inset;

  static char meta_buf[64];
  if (q->name[0]) {
    snprintf(meta_buf, sizeof(meta_buf), "%s", q->name);
  } else {
    meta_buf[0] = '\0';
  }

  GRect measure = GRect(0, 0, content_w, bounds.size.h);
  GSize q_size = graphics_text_layout_get_content_size_with_attributes(
    q->question, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD),
    measure, GTextOverflowModeWordWrap, GTextAlignmentCenter, s_text_attrs);
  GSize m_size = graphics_text_layout_get_content_size_with_attributes(
    meta_buf, fonts_get_system_font(FONT_KEY_GOTHIC_18),
    measure, GTextOverflowModeWordWrap, GTextAlignmentCenter, s_text_attrs);
  int16_t gap = 8;
  int16_t total_h = q_size.h + gap + m_size.h;
  int16_t y = (bounds.size.h - total_h) / 2;
  if (y < 12) { y = 12; }

  graphics_context_set_text_color(ctx, GColorBlack);
  graphics_draw_text(ctx, q->question,
    fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD),
    GRect(inset, y, content_w, bounds.size.h - y),
    GTextOverflowModeWordWrap, GTextAlignmentCenter, s_text_attrs);

  graphics_context_set_text_color(ctx, GColorDarkGray);
  graphics_draw_text(ctx, meta_buf,
    fonts_get_system_font(FONT_KEY_GOTHIC_18),
    GRect(inset, y + q_size.h + gap, content_w, bounds.size.h - y - q_size.h - gap),
    GTextOverflowModeWordWrap, GTextAlignmentCenter, s_text_attrs);
}
#endif

/** Opens the full list of answer choices for the user to pick one. */
static void list_click(ClickRecognizerRef recognizer, void *ctx) {
  (void)recognizer; (void)ctx;
  quest_multi_choice_list_window_push(s_app);
}

/** Opens the map screen directly (multi-choice always has map as the only
 *  extra option). */
static void options_click(ClickRecognizerRef recognizer, void *ctx) {
  (void)recognizer; (void)ctx;
  map_window_push(s_app);
}

static void click_config(void *ctx) {
  (void)ctx;
  window_single_click_subscribe(BUTTON_ID_UP, list_click);
  window_single_click_subscribe(BUTTON_ID_SELECT, options_click);
}

static void window_load(Window *window) {
  Quest *q = &s_app->active_quest;
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

  s_app->multi_choice_action_bar = action_bar_layer_create();
#ifdef PBL_COLOR
  action_bar_layer_set_background_color(s_app->multi_choice_action_bar, GColorIslamicGreen);
#endif
  action_bar_layer_set_icon_animated(s_app->multi_choice_action_bar, BUTTON_ID_UP,
                                     s_app->icon_list, true);
  action_bar_layer_set_icon_animated(s_app->multi_choice_action_bar, BUTTON_ID_SELECT,
                                     s_app->icon_map, true);
  action_bar_layer_set_click_config_provider(s_app->multi_choice_action_bar, click_config);
  action_bar_layer_add_to_window(s_app->multi_choice_action_bar, window);

#ifdef PBL_ROUND
  s_text_attrs = graphics_text_attributes_create();
  graphics_text_attributes_enable_screen_text_flow(s_text_attrs, 0);

  s_content_layer = layer_create(bounds);
  layer_set_update_proc(s_content_layer, content_update_proc);
  layer_add_child(root, s_content_layer);
#else
  int16_t content_w = bounds.size.w - ACTION_BAR_WIDTH - 8;
  int16_t pad = 4;

  s_app->multi_choice_question_layer = text_layer_create(GRect(pad, 4, content_w, bounds.size.h / 2));
  text_layer_set_text(s_app->multi_choice_question_layer, q->question);
  text_layer_set_font(s_app->multi_choice_question_layer, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  text_layer_set_overflow_mode(s_app->multi_choice_question_layer, GTextOverflowModeWordWrap);
  layer_add_child(root, text_layer_get_layer(s_app->multi_choice_question_layer));

  static char meta_buf[64];
  if (q->name[0]) {
    snprintf(meta_buf, sizeof(meta_buf), "%s", q->name);
  } else {
    meta_buf[0] = '\0';
  }

  GSize q_size = graphics_text_layout_get_content_size(
    q->question,
    fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD),
    GRect(0, 0, content_w, 2000),
    GTextOverflowModeWordWrap,
    GTextAlignmentLeft
  );
  int16_t meta_y = q_size.h + 12;

  s_app->multi_choice_meta_layer = text_layer_create(GRect(pad, meta_y, content_w, bounds.size.h - meta_y));
  text_layer_set_text(s_app->multi_choice_meta_layer, meta_buf);
  text_layer_set_font(s_app->multi_choice_meta_layer, fonts_get_system_font(FONT_KEY_GOTHIC_18));
  text_layer_set_text_color(s_app->multi_choice_meta_layer, GColorDarkGray);
  text_layer_set_overflow_mode(s_app->multi_choice_meta_layer, GTextOverflowModeWordWrap);
  layer_add_child(root, text_layer_get_layer(s_app->multi_choice_meta_layer));
#endif
}

static void window_unload(Window *window) {
  (void)window;
  action_bar_layer_destroy(s_app->multi_choice_action_bar);
  s_app->multi_choice_action_bar = NULL;
#ifdef PBL_ROUND
  layer_destroy(s_content_layer);
  s_content_layer = NULL;
  graphics_text_attributes_destroy(s_text_attrs);
  s_text_attrs = NULL;
#else
  text_layer_destroy(s_app->multi_choice_question_layer);
  s_app->multi_choice_question_layer = NULL;
  text_layer_destroy(s_app->multi_choice_meta_layer);
  s_app->multi_choice_meta_layer = NULL;
#endif
}

/** Pushes the multiple-choice quest screen with a list button and an options button. */
void quest_multi_choice_window_push(AppState *app) {
  s_app = app;

  Window *window = window_create();
  window_set_window_handlers(window, (WindowHandlers){
    .load = window_load,
    .unload = window_unload,
  });
  s_app->multi_choice_window = window;
  window_stack_push(window, true);
}
