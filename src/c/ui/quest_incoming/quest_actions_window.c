#include "quest_actions_window.h"
#include "quest_skip_window.h"
#include "../shared/map_window.h"
#include "../shared/breadcrumbs.h"

static AppState *s_app;
static Layer *s_breadcrumbs;

static uint16_t menu_num_rows(MenuLayer *menu_layer, uint16_t section, void *ctx) {
  (void)menu_layer; (void)section; (void)ctx;
  return 2;
}

static void menu_draw_row(GContext *ctx, const Layer *cell_layer, MenuIndex *index, void *cb_ctx) {
  (void)cb_ctx;
  switch (index->row) {
    case 0: menu_cell_basic_draw(ctx, cell_layer, "Skip today", NULL, NULL); break;
    case 1: menu_cell_basic_draw(ctx, cell_layer, "Show map", NULL, NULL); break;
  }
}

static void menu_select(MenuLayer *menu_layer, MenuIndex *index, void *ctx) {
  (void)menu_layer; (void)ctx;
  switch (index->row) {
    case 0: quest_skip_window_push(s_app); break;
    case 1: map_window_push(s_app); break;
  }
}

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

  s_breadcrumbs = breadcrumbs_layer_create(bounds, 1, 0);
  layer_add_child(root, s_breadcrumbs);

  s_app->actions_menu_layer = menu_layer_create(breadcrumbs_menu_bounds(bounds));
  menu_layer_set_callbacks(s_app->actions_menu_layer, NULL, (MenuLayerCallbacks){
    .get_num_rows = menu_num_rows,
    .draw_row = menu_draw_row,
    .select_click = menu_select,
  });
  menu_layer_set_click_config_onto_window(s_app->actions_menu_layer, window);
#ifdef PBL_ROUND
  menu_layer_set_center_focused(s_app->actions_menu_layer, true);
#endif
  layer_add_child(root, menu_layer_get_layer(s_app->actions_menu_layer));
}

static void window_unload(Window *window) {
  (void)window;
  layer_destroy(s_breadcrumbs);
  s_breadcrumbs = NULL;
  menu_layer_destroy(s_app->actions_menu_layer);
  s_app->actions_menu_layer = NULL;
}

void quest_actions_window_push(AppState *app) {
  s_app = app;

  Window *window = window_create();
  window_set_window_handlers(window, (WindowHandlers){
    .load = window_load,
    .unload = window_unload,
  });
  window_stack_push(window, true);
}
