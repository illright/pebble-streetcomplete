#include "quest_skip_window.h"
#include "../../communication/comm.h"
#include "../shared/breadcrumbs.h"
#include "../shared/skipped_window.h"

static AppState *s_app;
static Layer *s_breadcrumbs;

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

/* Deferred from menu_select so that all window pops happen outside the
 * MenuLayer callback.  Destroying a MenuLayer while its click handler is
 * still on the call stack causes a use-after-free crash. */
static void skip_deferred(void *data) {
  (void)data;
  skipped_window_push(s_app);
}

static void menu_select(MenuLayer *menu_layer, MenuIndex *index, void *ctx) {
  (void)menu_layer; (void)ctx;

  comm_send_skip((uint8_t)index->row);
  app_timer_register(0, skip_deferred, NULL);
}

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

  s_breadcrumbs = breadcrumbs_layer_create(bounds, 2, 1);
  layer_add_child(root, s_breadcrumbs);

  s_app->skip_menu_layer = menu_layer_create(breadcrumbs_menu_bounds(bounds));
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
  layer_destroy(s_breadcrumbs);
  s_breadcrumbs = NULL;
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
