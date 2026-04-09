#include "quest_options_window.h"
#include "../../communication/comm.h"
#include "../shared/map_window.h"
#include "../shared/thanks_window.h"

static AppState *s_app;

/* Row 0 = "Show map", rows 1..N = quest-specific alternative answers */
static uint16_t menu_num_rows(MenuLayer *menu_layer, uint16_t section, void *ctx) {
  (void)menu_layer; (void)section; (void)ctx;
  Quest *q = &s_app->active_quest;
  return 1 + (q->option_count > 2 ? q->option_count - 2 : 0);
}

static void menu_draw_row(GContext *ctx, const Layer *cell_layer, MenuIndex *index, void *cb_ctx) {
  (void)cb_ctx;
  if (index->row == 0) {
    menu_cell_basic_draw(ctx, cell_layer, "Show map", NULL, NULL);
    return;
  }
  Quest *q = &s_app->active_quest;
  /* Options beyond the first two (Yes/No) are alternative answers */
  uint8_t opt_idx = 2 + (index->row - 1);
  if (opt_idx < q->option_count) {
    menu_cell_basic_draw(ctx, cell_layer, q->option_labels[opt_idx], NULL, NULL);
  }
}

static void menu_select(MenuLayer *menu_layer, MenuIndex *index, void *ctx) {
  (void)menu_layer; (void)ctx;
  if (index->row == 0) {
    map_window_push(s_app);
    return;
  }
  Quest *q = &s_app->active_quest;
  uint8_t opt_idx = 2 + (index->row - 1);
  if (opt_idx < q->option_count) {
    comm_send_answer(q->option_values[opt_idx]);
    thanks_window_push(s_app);
  }
}

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

  s_app->options_menu_layer = menu_layer_create(bounds);
  menu_layer_set_callbacks(s_app->options_menu_layer, NULL, (MenuLayerCallbacks){
    .get_num_rows = menu_num_rows,
    .draw_row = menu_draw_row,
    .select_click = menu_select,
  });
  menu_layer_set_click_config_onto_window(s_app->options_menu_layer, window);
#ifdef PBL_ROUND
  menu_layer_set_center_focused(s_app->options_menu_layer, true);
#endif
  layer_add_child(root, menu_layer_get_layer(s_app->options_menu_layer));
}

static void window_unload(Window *window) {
  (void)window;
  menu_layer_destroy(s_app->options_menu_layer);
  s_app->options_menu_layer = NULL;
}

void quest_options_window_push(AppState *app) {
  s_app = app;

  Window *window = window_create();
  window_set_window_handlers(window, (WindowHandlers){
    .load = window_load,
    .unload = window_unload,
  });
  window_stack_push(window, true);
}
