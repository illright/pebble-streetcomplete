#include "quest_numeric_window.h"
#include "../quest_yes_no/quest_options_window.h"
#include "../../communication/comm.h"
#include "../shared/map_window.h"
#include "../shared/thanks_window.h"

static AppState *s_app;
static int32_t s_value;

#define REPEAT_INTERVAL_MS 200
#define ACCEL_THRESHOLD 5
#define ACCEL_STEP 5

#ifdef PBL_ROUND
static GTextAttributes *s_text_attrs;
static Layer *s_content_layer;

/* Draws question + meta text in the upper portion, leaving the lower portion
 * free for the number input box that extends into the bottom of the screen. */
static void content_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  Quest *q = &s_app->active_quest;
  int16_t inset = ACTION_BAR_WIDTH + 10;
  int16_t content_w = bounds.size.w - 2 * inset;

  static char meta_buf[64];
  if (q->name[0] && q->dist_m > 0) {
    snprintf(meta_buf, sizeof(meta_buf), "%s\n%d m away", q->name, (int)q->dist_m);
  } else if (q->name[0]) {
    snprintf(meta_buf, sizeof(meta_buf), "%s", q->name);
  } else if (q->dist_m > 0) {
    snprintf(meta_buf, sizeof(meta_buf), "%d m away", (int)q->dist_m);
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

  /* Reserve space for the number box at the bottom. The box is 56px tall. */
  int16_t box_h = 56;
  int16_t gap = 8;
  int16_t top_inset = 30;
  int16_t text_total = q_size.h + gap + m_size.h;
  int16_t available_top = bounds.size.h - box_h - 8;
  int16_t y = top_inset + (available_top - top_inset - text_total) / 2;
  if (y < top_inset) { y = top_inset; }

  graphics_context_set_text_color(ctx, GColorBlack);
  graphics_draw_text(ctx, q->question,
    fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD),
    GRect(inset, y, content_w, available_top - y),
    GTextOverflowModeWordWrap, GTextAlignmentCenter, s_text_attrs);

  graphics_context_set_text_color(ctx, GColorDarkGray);
  graphics_draw_text(ctx, meta_buf,
    fonts_get_system_font(FONT_KEY_GOTHIC_18),
    GRect(inset, y + q_size.h + gap, content_w, available_top - y - q_size.h - gap),
    GTextOverflowModeWordWrap, GTextAlignmentCenter, s_text_attrs);

  /* Draw the number input box extending into the bottom of the round screen.
   * The box is centered on the full screen width — the action bar tapers to
   * nearly nothing at the bottom so it won't overlap. */
  int16_t box_inset = 40;
  int16_t box_w = bounds.size.w - 2 * box_inset;
  int16_t box_x = box_inset;
  int16_t box_y = bounds.size.h - box_h;

  graphics_context_set_stroke_color(ctx, GColorDarkGray);
  graphics_context_set_stroke_width(ctx, 2);
  /* Draw left, top, and right borders individually so the bottom stays open. */
  graphics_draw_line(ctx, GPoint(box_x, box_y + 4), GPoint(box_x, box_y + box_h));
  graphics_draw_line(ctx, GPoint(box_x, box_y + 4), GPoint(box_x + 4, box_y));
  graphics_draw_line(ctx, GPoint(box_x + 4, box_y), GPoint(box_x + box_w - 4, box_y));
  graphics_draw_line(ctx, GPoint(box_x + box_w - 4, box_y), GPoint(box_x + box_w, box_y + 4));
  graphics_draw_line(ctx, GPoint(box_x + box_w, box_y + 4), GPoint(box_x + box_w, box_y + box_h));

  static char val_buf[12];
  snprintf(val_buf, sizeof(val_buf), "%d", (int)s_value);
  graphics_context_set_text_color(ctx, GColorBlack);
  graphics_draw_text(ctx, val_buf,
    fonts_get_system_font(FONT_KEY_LECO_32_BOLD_NUMBERS),
    GRect(box_x, box_y + 6, box_w, box_h - 6),
    GTextOverflowModeTrailingEllipsis, GTextAlignmentCenter, NULL);
}
#else
static Layer *s_number_layer;

/* Draws the rectangular number input box with the current value.
 * Uses a smaller font on small screens (basalt) to fit the shorter box. */
static void number_layer_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);

  graphics_context_set_stroke_color(ctx, GColorDarkGray);
  graphics_context_set_stroke_width(ctx, 2);
  graphics_draw_round_rect(ctx, bounds, 4);

  static char val_buf[12];
  snprintf(val_buf, sizeof(val_buf), "%d", (int)s_value);
  graphics_context_set_text_color(ctx, GColorBlack);

  bool small = (bounds.size.h <= 38);
  const char *font_key = small ? FONT_KEY_LECO_20_BOLD_NUMBERS
                               : FONT_KEY_LECO_32_BOLD_NUMBERS;
  int16_t text_y = small ? 4 : 6;
  graphics_draw_text(ctx, val_buf,
    fonts_get_system_font(font_key),
    GRect(0, text_y, bounds.size.w, bounds.size.h - text_y),
    GTextOverflowModeTrailingEllipsis, GTextAlignmentCenter, NULL);
}
#endif

static void update_display(void) {
#ifdef PBL_ROUND
  if (s_content_layer) { layer_mark_dirty(s_content_layer); }
#else
  if (s_number_layer) { layer_mark_dirty(s_number_layer); }
#endif
}

static uint32_t s_last_plus_ms;
static int s_plus_count;
static uint32_t s_last_minus_ms;
static int s_minus_count;

/** Returns the current time in milliseconds. */
static uint32_t now_ms(void) {
  time_t s;
  uint16_t ms;
  time_ms(&s, &ms);
  return (uint32_t)s * 1000 + ms;
}

/* Increments the value. Accelerates to steps of 5 when held down continuously. */
static void plus_click(ClickRecognizerRef recognizer, void *ctx) {
  (void)recognizer; (void)ctx;
  uint32_t now = now_ms();
  if (now - s_last_plus_ms > REPEAT_INTERVAL_MS * 2) {
    s_plus_count = 0;
  }
  s_plus_count++;
  s_last_plus_ms = now;
  int step = s_plus_count >= ACCEL_THRESHOLD ? ACCEL_STEP : 1;
  s_value += step;
  update_display();
}

/* Decrements the value (minimum 0). Accelerates to steps of 5 when held down. */
static void minus_click(ClickRecognizerRef recognizer, void *ctx) {
  (void)recognizer; (void)ctx;
  uint32_t now = now_ms();
  if (now - s_last_minus_ms > REPEAT_INTERVAL_MS * 2) {
    s_minus_count = 0;
  }
  s_minus_count++;
  s_last_minus_ms = now;
  int step = s_minus_count >= ACCEL_THRESHOLD ? ACCEL_STEP : 1;
  if (s_value >= step) {
    s_value -= step;
  } else {
    s_value = 0;
  }
  update_display();
}

/** Opens the map directly if that's the only extra option, otherwise opens
 *  the full options menu. */
static void options_click(ClickRecognizerRef recognizer, void *ctx) {
  (void)recognizer; (void)ctx;
  Quest *q = &s_app->active_quest;
  if (quest_extra_option_count(q) == 0) {
    map_window_push(s_app);
  } else {
    quest_options_window_push(s_app);
  }
}

/* Submits the current numeric value as the answer. */
static void submit_click(ClickRecognizerRef recognizer, void *ctx) {
  (void)recognizer; (void)ctx;
  static char answer_buf[12];
  snprintf(answer_buf, sizeof(answer_buf), "%d", (int)s_value);
  comm_send_answer(answer_buf);
  thanks_window_push(s_app);
}

static void click_config(void *ctx) {
  (void)ctx;
  window_single_repeating_click_subscribe(BUTTON_ID_UP, REPEAT_INTERVAL_MS, plus_click);
  window_single_click_subscribe(BUTTON_ID_SELECT, options_click);
  window_single_repeating_click_subscribe(BUTTON_ID_DOWN, REPEAT_INTERVAL_MS, minus_click);
  window_long_click_subscribe(BUTTON_ID_SELECT, 0, submit_click, NULL);
}

static void window_load(Window *window) {
  Quest *q = &s_app->active_quest;
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

  s_value = 0;

  /* Action bar on the right: plus / ellipsis / minus */
  s_app->numeric_action_bar = action_bar_layer_create();
#ifdef PBL_COLOR
  action_bar_layer_set_background_color(s_app->numeric_action_bar, GColorIslamicGreen);
#endif
  action_bar_layer_set_icon_animated(s_app->numeric_action_bar, BUTTON_ID_UP,
                                     s_app->icon_plus, true);
  action_bar_layer_set_icon_animated(s_app->numeric_action_bar, BUTTON_ID_SELECT,
                                     quest_extra_option_count(&s_app->active_quest) == 0 ? s_app->icon_map : s_app->icon_ellipsis, true);
  action_bar_layer_set_icon_animated(s_app->numeric_action_bar, BUTTON_ID_DOWN,
                                     s_app->icon_minus, true);
  action_bar_layer_set_click_config_provider(s_app->numeric_action_bar, click_config);
  action_bar_layer_add_to_window(s_app->numeric_action_bar, window);

#ifdef PBL_ROUND
  s_text_attrs = graphics_text_attributes_create();
  graphics_text_attributes_enable_screen_text_flow(s_text_attrs, 0);

  s_content_layer = layer_create(bounds);
  layer_set_update_proc(s_content_layer, content_update_proc);
  layer_add_child(root, s_content_layer);
#else
  int16_t content_w = bounds.size.w - ACTION_BAR_WIDTH;
  int16_t pad = 4;

  /* Number input box anchored at the bottom of the screen.
   * On small screens (basalt 144x168), remove side/bottom margins so the box
   * fits fully. On larger screens, keep some breathing room. */
  bool small_screen = (bounds.size.h <= 168);
  int16_t box_h = small_screen ? 36 : 50;
  int16_t box_margin = small_screen ? 0 : 4;
  int16_t box_side_pad = small_screen ? 0 : pad;
  int16_t box_y = bounds.size.h - box_h - box_margin;
  int16_t box_w = content_w - 2 * box_side_pad;

  s_number_layer = layer_create(GRect(box_side_pad, box_y, box_w, box_h));
  layer_set_update_proc(s_number_layer, number_layer_update_proc);
  layer_add_child(root, s_number_layer);

  /* Build the metadata string */
  static char meta_buf[64];
  if (q->name[0] && q->dist_m > 0) {
    snprintf(meta_buf, sizeof(meta_buf), "%s\n%d m away", q->name, (int)q->dist_m);
  } else if (q->name[0]) {
    snprintf(meta_buf, sizeof(meta_buf), "%s", q->name);
  } else if (q->dist_m > 0) {
    snprintf(meta_buf, sizeof(meta_buf), "%d m away", (int)q->dist_m);
  } else {
    meta_buf[0] = '\0';
  }

  /* Measure question text to allocate the right amount of vertical space.
   * Use text_w (content area minus left padding) so text doesn't overlap the
   * action bar. */
  int16_t text_w = content_w - pad;
  GSize q_size = graphics_text_layout_get_content_size(
    q->question,
    fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD),
    GRect(0, 0, text_w, 2000),
    GTextOverflowModeWordWrap,
    GTextAlignmentLeft
  );

  int16_t q_y = 4;
  int16_t q_h = q_size.h + 4;
  int16_t meta_y = q_y + q_h + 4;
  int16_t meta_h = box_y - 4 - meta_y;
  if (meta_h < 0) { meta_h = 0; }

  s_app->numeric_question_layer = text_layer_create(GRect(pad, q_y, text_w, q_h));
  text_layer_set_text(s_app->numeric_question_layer, q->question);
  text_layer_set_font(s_app->numeric_question_layer, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  text_layer_set_overflow_mode(s_app->numeric_question_layer, GTextOverflowModeWordWrap);
  layer_add_child(root, text_layer_get_layer(s_app->numeric_question_layer));

  s_app->numeric_meta_layer = text_layer_create(GRect(pad, meta_y, text_w, meta_h));
  text_layer_set_text(s_app->numeric_meta_layer, meta_buf);
  text_layer_set_font(s_app->numeric_meta_layer, fonts_get_system_font(FONT_KEY_GOTHIC_18));
  text_layer_set_text_color(s_app->numeric_meta_layer, GColorDarkGray);
  text_layer_set_overflow_mode(s_app->numeric_meta_layer, GTextOverflowModeWordWrap);
  layer_add_child(root, text_layer_get_layer(s_app->numeric_meta_layer));
#endif
}

static void window_unload(Window *window) {
  (void)window;
  action_bar_layer_destroy(s_app->numeric_action_bar);
  s_app->numeric_action_bar = NULL;
#ifdef PBL_ROUND
  layer_destroy(s_content_layer);
  s_content_layer = NULL;
  graphics_text_attributes_destroy(s_text_attrs);
  s_text_attrs = NULL;
#else
  text_layer_destroy(s_app->numeric_question_layer);
  s_app->numeric_question_layer = NULL;
  text_layer_destroy(s_app->numeric_meta_layer);
  s_app->numeric_meta_layer = NULL;
  layer_destroy(s_number_layer);
  s_number_layer = NULL;
#endif
}

/** Pushes the numeric input quest screen with +/ellipsis/- action bar. */
void quest_numeric_window_push(AppState *app) {
  s_app = app;

  Window *window = window_create();
  window_set_window_handlers(window, (WindowHandlers){
    .load = window_load,
    .unload = window_unload,
  });
  s_app->numeric_window = window;
  window_stack_push(window, true);
}
