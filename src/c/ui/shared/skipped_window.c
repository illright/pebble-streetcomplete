#include "skipped_window.h"
#include "../../communication/comm.h"

static AppState *s_app;
static TextLayer *s_label;
static Window *s_window;

/** Removes just the "Skipped!" window from the stack, leaving any new quest
 *  windows that may have been pushed on top intact. */
static void timer_callback(void *data) {
  (void)data;
  if (s_window) {
    window_stack_remove(s_window, true);
  }
}

static void window_load(Window *window) {
  window_set_background_color(window, GColorSunsetOrange);
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

  s_label = text_layer_create(GRect(0, bounds.size.h / 2 - 20, bounds.size.w, 40));
  text_layer_set_text(s_label, "Skipped!");
  text_layer_set_text_alignment(s_label, GTextAlignmentCenter);
  text_layer_set_font(s_label, fonts_get_system_font(FONT_KEY_GOTHIC_28_BOLD));
  text_layer_set_background_color(s_label, GColorClear);
  text_layer_set_text_color(s_label, GColorWhite);
  layer_add_child(root, text_layer_get_layer(s_label));

  app_timer_register(2000, timer_callback, NULL);
}

static void window_unload(Window *window) {
  (void)window;
  text_layer_destroy(s_label);
  s_label = NULL;
  s_window = NULL;
}

void skipped_window_push(AppState *app) {
  s_app = app;

  /* If handle_new_quest already ran (race: new quest arrived before this
   * deferred callback), the old windows are already gone — don't clear the
   * quest state that the new quest just set. */
  bool new_quest_arrived = !s_app->skip_window && !s_app->actions_window;

  if (!new_quest_arrived) {
    s_app->has_active_quest = false;
    s_app->arrived_at_quest = false;
    comm_remove_quest_ui();
  }

  s_window = window_create();
  window_set_window_handlers(s_window, (WindowHandlers){
    .load = window_load,
    .unload = window_unload,
  });
  window_stack_push(s_window, true);
}
