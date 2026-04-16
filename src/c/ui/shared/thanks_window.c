#include "thanks_window.h"

static AppState *s_app;

static void timer_callback(void *data) {
  (void)data;
  /* Exit the app entirely */
  window_stack_pop_all(false);
}

static void window_load(Window *window) {
  window_set_background_color(window, GColorMintGreen);
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

  s_app->thanks_layer = text_layer_create(GRect(0, bounds.size.h / 2 - 20, bounds.size.w, 40));
  text_layer_set_text(s_app->thanks_layer, "Thanks!");
  text_layer_set_text_alignment(s_app->thanks_layer, GTextAlignmentCenter);
  text_layer_set_font(s_app->thanks_layer, fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD));
  text_layer_set_background_color(s_app->thanks_layer, GColorClear);
  layer_add_child(root, text_layer_get_layer(s_app->thanks_layer));

  app_timer_register(4000, timer_callback, NULL);
}

static void window_unload(Window *window) {
  (void)window;
  text_layer_destroy(s_app->thanks_layer);
  s_app->thanks_layer = NULL;
}

void thanks_window_push(AppState *app) {
  s_app = app;

  Window *window = window_create();
  window_set_window_handlers(window, (WindowHandlers){
    .load = window_load,
    .unload = window_unload,
  });
  s_app->thanks_window = window;
  window_stack_push(window, true);
}
