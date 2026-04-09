#include <pebble.h>

#include "app_state.h"
#include "communication/comm.h"

static AppState s_app;

static void main_window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

  s_app.main_status_bar = status_bar_layer_create();
  layer_add_child(root, status_bar_layer_get_layer(s_app.main_status_bar));

  int16_t content_top = STATUS_BAR_LAYER_HEIGHT;
  int16_t content_h = bounds.size.h - content_top;
  s_app.main_status_layer = text_layer_create(
    GRect(8, content_top + content_h / 2 - 30, bounds.size.w - 16, 60)
  );
  text_layer_set_text(s_app.main_status_layer, "Waiting for\nquest...");
  text_layer_set_text_alignment(s_app.main_status_layer, GTextAlignmentCenter);
  text_layer_set_font(s_app.main_status_layer, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  layer_add_child(root, text_layer_get_layer(s_app.main_status_layer));
}

static void main_window_unload(Window *window) {
  (void)window;
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
  s_app.icon_retry = gbitmap_create_with_resource(RESOURCE_ID_ICON_RETRY);

  comm_init(&s_app);

  /* Main waiting window */
  s_app.main_window = window_create();
  window_set_window_handlers(s_app.main_window, (WindowHandlers){
    .load = main_window_load,
    .unload = main_window_unload,
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
  gbitmap_destroy(s_app.icon_retry);
}

int main(void) {
  init();
  app_event_loop();
  deinit();
}
