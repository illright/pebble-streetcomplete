#include <pebble.h>

#include "app_state.h"
#include "communication/comm.h"
#include "ui/quest_incoming/quest_incoming_window.h"
#include "ui/quest_yes_no/quest_yes_no_window.h"
#include "ui/quest_multi_choice/quest_multi_choice_window.h"
#include "ui/quest_numeric/quest_numeric_window.h"

static AppState s_app;

/** Re-opens the last exited quest from the waiting screen action bar.
 *  If the user has already arrived at the quest location, pushes the answer
 *  screen directly instead of the incoming navigation screen. */
static void main_select_click(ClickRecognizerRef recognizer, void *ctx) {
  (void)recognizer;
  (void)ctx;
  if (s_app.arrived_at_quest) {
    Quest *q = &s_app.active_quest;
    if (q->input_type == INPUT_TYPE_MULTI_CHOICE) {
      quest_multi_choice_window_push(&s_app);
    } else if (q->input_type == INPUT_TYPE_NUMERIC) {
      quest_numeric_window_push(&s_app);
    } else {
      quest_yes_no_window_push(&s_app);
    }
  } else {
    quest_incoming_window_push(&s_app);
  }
}

static void main_click_config(void *ctx) {
  (void)ctx;
  window_single_click_subscribe(BUTTON_ID_SELECT, main_select_click);
}

/** Shows the action bar with a question mark when returning from an exited quest. */
static void main_window_appear(Window *window) {
  if (!s_app.has_active_quest || s_app.main_action_bar) {
    return;
  }

  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

  s_app.main_action_bar = action_bar_layer_create();
#ifdef PBL_COLOR
  action_bar_layer_set_background_color(s_app.main_action_bar, GColorIslamicGreen);
#endif
  action_bar_layer_set_click_config_provider(s_app.main_action_bar, main_click_config);
  action_bar_layer_set_icon(s_app.main_action_bar, BUTTON_ID_SELECT, s_app.icon_question);
  action_bar_layer_add_to_window(s_app.main_action_bar, window);

  /* Re-center the illustration + text block within the narrower content area
   * left after the action bar is added. */
  int16_t content_top = STATUS_BAR_LAYER_HEIGHT;
  int16_t content_w = bounds.size.w - ACTION_BAR_WIDTH;
  int16_t content_h = bounds.size.h - content_top;
  GSize img_size = gdraw_command_image_get_bounds_size(s_app.main_illustration);
  int16_t text_h = 60;
  int16_t gap = 8;
  int16_t total_h = img_size.h + gap + text_h;
  int16_t block_top = content_top + (content_h - total_h) / 2;
  layer_set_frame(s_app.main_illustration_layer,
                  GRect(0, block_top, content_w, img_size.h));
  layer_set_frame(text_layer_get_layer(s_app.main_status_layer),
                  GRect(8, block_top + img_size.h + gap, content_w - 16, text_h));
}

static void main_window_disappear(Window *window) {
  (void)window;
  if (s_app.main_action_bar) {
    action_bar_layer_destroy(s_app.main_action_bar);
    s_app.main_action_bar = NULL;
  }
}

/** Scales all points, radii, and stroke widths of a PDC image in-place by the
 *  ratio num/den. Also updates the bounding box size so callers see the correct
 *  new dimensions. Used to enlarge the illustration on high-resolution displays. */
static void prv_scale_illustration(GDrawCommandImage *image, int16_t num, int16_t den) {
  GDrawCommandList *list = gdraw_command_image_get_command_list(image);
  uint32_t n = gdraw_command_list_get_num_commands(list);
  for (uint32_t i = 0; i < n; i++) {
    GDrawCommand *cmd = gdraw_command_list_get_command(list, i);
    uint16_t num_pts = gdraw_command_get_num_points(cmd);
    for (uint16_t j = 0; j < num_pts; j++) {
      GPoint pt = gdraw_command_get_point(cmd, j);
      pt.x = (int16_t)((int32_t)pt.x * num / den);
      pt.y = (int16_t)((int32_t)pt.y * num / den);
      gdraw_command_set_point(cmd, j, pt);
    }
    if (gdraw_command_get_type(cmd) == GDrawCommandTypeCircle) {
      uint16_t r = gdraw_command_get_radius(cmd);
      gdraw_command_set_radius(cmd, (uint16_t)((uint32_t)r * num / den));
    }
    uint8_t sw = gdraw_command_get_stroke_width(cmd);
    if (sw > 0) {
      uint8_t scaled_sw = (uint8_t)((uint32_t)sw * num / den);
      gdraw_command_set_stroke_width(cmd, scaled_sw > 0 ? scaled_sw : 1);
    }
  }
  GSize size = gdraw_command_image_get_bounds_size(image);
  size.w = (int16_t)((int32_t)size.w * num / den);
  size.h = (int16_t)((int32_t)size.h * num / den);
  gdraw_command_image_set_bounds_size(image, size);
}

/** Draws the hiding map pin illustration centered in its layer. */
static void main_illustration_update(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  GSize img_size = gdraw_command_image_get_bounds_size(s_app.main_illustration);
  GPoint offset = GPoint(
    (bounds.size.w - img_size.w) / 2,
    (bounds.size.h - img_size.h) / 2
  );
  gdraw_command_image_draw(ctx, s_app.main_illustration, offset);
}

static void main_window_load(Window *window) {
  window_set_background_color(window, GColorMintGreen);

  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

  s_app.main_status_bar = status_bar_layer_create();
  status_bar_layer_set_colors(s_app.main_status_bar, GColorClear, GColorBlack);
  layer_add_child(root, status_bar_layer_get_layer(s_app.main_status_bar));

  int16_t content_top = STATUS_BAR_LAYER_HEIGHT;
  int16_t content_h = bounds.size.h - content_top;

  /* Compute total height of illustration + text to center them vertically. */
  GSize img_size = gdraw_command_image_get_bounds_size(s_app.main_illustration);
  int16_t text_h = 60;  /* two lines of GOTHIC_24_BOLD */
  int16_t gap = 8;
  int16_t total_h = img_size.h + gap + text_h;
  int16_t block_top = content_top + (content_h - total_h) / 2;

  /* Illustration */
  s_app.main_illustration_layer = layer_create(
    GRect(0, block_top, bounds.size.w, img_size.h)
  );
  layer_set_update_proc(s_app.main_illustration_layer, main_illustration_update);
  layer_add_child(root, s_app.main_illustration_layer);

  /* Text below the illustration */
  int16_t text_top = block_top + img_size.h + gap;
  s_app.main_status_layer = text_layer_create(
    GRect(8, text_top, bounds.size.w - 16, text_h)
  );
  text_layer_set_text(s_app.main_status_layer, "Go out and find\nsome quests!");
  text_layer_set_text_alignment(s_app.main_status_layer, GTextAlignmentCenter);
  text_layer_set_font(s_app.main_status_layer, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  text_layer_set_background_color(s_app.main_status_layer, GColorClear);
  layer_add_child(root, text_layer_get_layer(s_app.main_status_layer));
}

static void main_window_unload(Window *window) {
  (void)window;
  layer_destroy(s_app.main_illustration_layer);
  s_app.main_illustration_layer = NULL;
  text_layer_destroy(s_app.main_status_layer);
  s_app.main_status_layer = NULL;
  status_bar_layer_destroy(s_app.main_status_bar);
  s_app.main_status_bar = NULL;
}

static void init(void) {
  memset(&s_app, 0, sizeof(s_app));

  /* Load icon resources */
  s_app.icon_checkmark = gbitmap_create_with_resource(RESOURCE_ID_ICON_CHECKMARK);
  s_app.icon_cross = gbitmap_create_with_resource(RESOURCE_ID_ICON_CROSS);
  s_app.icon_ellipsis = gbitmap_create_with_resource(RESOURCE_ID_ICON_ELLIPSIS);
  s_app.icon_plus = gbitmap_create_with_resource(RESOURCE_ID_ICON_PLUS);
  s_app.icon_minus = gbitmap_create_with_resource(RESOURCE_ID_ICON_MINUS);
  s_app.icon_list = gbitmap_create_with_resource(RESOURCE_ID_ICON_LIST);
  s_app.icon_retry = gbitmap_create_with_resource(RESOURCE_ID_ICON_RETRY);
  s_app.icon_question = gbitmap_create_with_resource(RESOURCE_ID_ICON_QUESTION);
  s_app.icon_map = gbitmap_create_with_resource(RESOURCE_ID_ICON_MAP);
  s_app.main_illustration = gdraw_command_image_create_with_resource(RESOURCE_ID_IMAGE_HIDING_MAP_PIN);
  s_app.compass_arrow = gdraw_command_image_create_with_resource(RESOURCE_ID_IMAGE_COMPASS_ARROW);
#if defined(PBL_PLATFORM_EMERY) || defined(PBL_PLATFORM_GABBRO)
  prv_scale_illustration(s_app.main_illustration, 3, 2);
#endif

  comm_init(&s_app);

  /* Main waiting window */
  s_app.main_window = window_create();
  window_set_window_handlers(s_app.main_window, (WindowHandlers){
    .load = main_window_load,
    .unload = main_window_unload,
    .appear = main_window_appear,
    .disappear = main_window_disappear,
  });
  window_stack_push(s_app.main_window, true);
}

static void deinit(void) {
  window_destroy(s_app.main_window);

  gbitmap_destroy(s_app.icon_checkmark);
  gbitmap_destroy(s_app.icon_cross);
  gbitmap_destroy(s_app.icon_ellipsis);
  gbitmap_destroy(s_app.icon_plus);
  gbitmap_destroy(s_app.icon_minus);
  gbitmap_destroy(s_app.icon_list);
  gbitmap_destroy(s_app.icon_retry);
  gbitmap_destroy(s_app.icon_question);
  gbitmap_destroy(s_app.icon_map);
  gdraw_command_image_destroy(s_app.main_illustration);
  gdraw_command_image_destroy(s_app.compass_arrow);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
