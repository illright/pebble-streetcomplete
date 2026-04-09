#include "quest_skip_window.h"
#include "../../communication/comm.h"

static AppState *s_app;

static uint16_t menu_num_rows(MenuLayer *menu_layer, uint16_t section, void *ctx) {
  (void)menu_layer; (void)section; (void)ctx;
  return 2;
}

static void menu_draw_row(GContext *ctx, const Layer *cell_layer, MenuIndex *index, void *cb_ctx) {
  (void)cb_ctx;
  switch (index->row) {
    case 0: menu_cell_basic_draw(ctx, cell_layer, "Only this quest", NULL, NULL); break;
    case 1: menu_cell_basic_draw(ctx, cell_layer, "All of this type", NULL, NULL); break;
  }
}

static void menu_select(MenuLayer *menu_layer, MenuIndex *index, void *ctx) {
  (void)menu_layer; (void)ctx;

  comm_send_skip((uint8_t)index->row);

  /* After skipping, clear active quest and pop back to wait for next quest.
   * Pop all the way back to main_window (the waiting screen). */
  s_app->has_active_quest = false;
  s_app->arrived_at_quest = false;

  /* Pop skip → actions → incoming, back to main */
  window_stack_pop_all(true);
  window_stack_push(s_app->main_window, false);
}

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

  s_app->skip_menu_layer = menu_layer_create(bounds);
  menu_layer_set_callbacks(s_app->skip_menu_layer, NULL, (MenuLayerCallbacks){
    .get_num_rows = menu_num_rows,
    .draw_row = menu_draw_row,
    .select_click = menu_select,
  });
  menu_layer_set_click_config_onto_window(s_app->skip_menu_layer, window);
#ifdef PBL_ROUND
  menu_layer_set_center_focused(s_app->skip_menu_layer, true);
#endif
  layer_add_child(root, menu_layer_get_layer(s_app->skip_menu_layer));
}

static void window_unload(Window *window) {
  (void)window;
  menu_layer_destroy(s_app->skip_menu_layer);
  s_app->skip_menu_layer = NULL;
}

void quest_skip_window_push(AppState *app) {
  s_app = app;

  Window *window = window_create();
  window_set_window_handlers(window, (WindowHandlers){
    .load = window_load,
    .unload = window_unload,
  });
  window_stack_push(window, true);
}
