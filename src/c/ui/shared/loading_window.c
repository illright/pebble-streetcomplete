#include "loading_window.h"
#include "../../communication/comm.h"

static AppState *s_app;

static void select_click_handler(ClickRecognizerRef recognizer, void *ctx) {
  (void)recognizer;
  (void)ctx;
  comm_send_retry_fetch();
}

static void click_config_provider(void *ctx) {
  (void)ctx;
  window_single_click_subscribe(BUTTON_ID_SELECT, select_click_handler);
}

static void window_load(Window *window) {
  window_set_background_color(window, GColorMintGreen);
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

  /* Status bar at the top */
  s_app->loading_status_bar = status_bar_layer_create();
  status_bar_layer_set_colors(s_app->loading_status_bar, GColorClear, GColorBlack);
  layer_add_child(root, status_bar_layer_get_layer(s_app->loading_status_bar));

  /* Action bar on the right with retry icon on SELECT */
  s_app->loading_action_bar = action_bar_layer_create();
#ifdef PBL_COLOR
  action_bar_layer_set_background_color(s_app->loading_action_bar, GColorIslamicGreen);
#endif
  action_bar_layer_set_click_config_provider(s_app->loading_action_bar,
                                             click_config_provider);
  action_bar_layer_set_icon(s_app->loading_action_bar, BUTTON_ID_SELECT,
                            s_app->icon_retry);
  action_bar_layer_add_to_window(s_app->loading_action_bar, window);

  /* Centered loading text in the remaining area */
  int16_t content_top = STATUS_BAR_LAYER_HEIGHT;
  int16_t content_w = bounds.size.w - ACTION_BAR_WIDTH;
  int16_t content_h = bounds.size.h - content_top;
  s_app->loading_text_layer = text_layer_create(
    GRect(8, content_top + content_h / 2 - 30, content_w - 16, 60)
  );
  text_layer_set_text(s_app->loading_text_layer, "Loading OSM\ndata...");
  text_layer_set_text_alignment(s_app->loading_text_layer, GTextAlignmentCenter);
  text_layer_set_font(s_app->loading_text_layer,
                      fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  text_layer_set_background_color(s_app->loading_text_layer, GColorClear);
  layer_add_child(root, text_layer_get_layer(s_app->loading_text_layer));
}

static void window_unload(Window *window) {
  (void)window;
  text_layer_destroy(s_app->loading_text_layer);
  s_app->loading_text_layer = NULL;
  action_bar_layer_destroy(s_app->loading_action_bar);
  s_app->loading_action_bar = NULL;
  status_bar_layer_destroy(s_app->loading_status_bar);
  s_app->loading_status_bar = NULL;
}

/** Pushes the "Loading OSM data" screen with a retry action bar. */
void loading_window_push(AppState *app) {
  s_app = app;

  Window *window = window_create();
  window_set_window_handlers(window, (WindowHandlers){
    .load = window_load,
    .unload = window_unload,
  });
  s_app->loading_window = window;
  window_stack_push(window, true);
}

/** Removes the loading window from the stack if it is present. */
void loading_window_remove(AppState *app) {
  if (app->loading_window) {
    window_stack_remove(app->loading_window, false);
    window_destroy(app->loading_window);
    app->loading_window = NULL;
  }
}
