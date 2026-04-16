#include "quest_multi_choice_list_window.h"
#include "../../communication/comm.h"
#include "../shared/thanks_window.h"
#include "../shared/breadcrumbs.h"

static AppState *s_app;
static Layer *s_breadcrumbs;

/** Returns the number of answer options available for this quest. */
static uint16_t menu_num_rows(MenuLayer *menu_layer, uint16_t section, void *ctx) {
  (void)menu_layer; (void)section; (void)ctx;
  return s_app->active_quest.option_count;
}

static void menu_draw_row(GContext *ctx, const Layer *cell_layer, MenuIndex *index, void *cb_ctx) {
  (void)cb_ctx;
  Quest *q = &s_app->active_quest;
  if (index->row < q->option_count) {
    menu_cell_basic_draw(ctx, cell_layer, q->option_labels[index->row], NULL, NULL);
  }
}

/** Sends the selected answer value and shows the thanks screen. */
static void menu_select(MenuLayer *menu_layer, MenuIndex *index, void *ctx) {
  (void)menu_layer; (void)ctx;
  Quest *q = &s_app->active_quest;
  if (index->row < q->option_count) {
    comm_send_answer(q->option_values[index->row]);
    thanks_window_push(s_app);
  }
}

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

  s_breadcrumbs = breadcrumbs_layer_create(bounds, 1, 0);
  layer_add_child(root, s_breadcrumbs);

  s_app->multi_choice_list_menu_layer = menu_layer_create(breadcrumbs_menu_bounds(bounds));
  menu_layer_set_callbacks(s_app->multi_choice_list_menu_layer, NULL, (MenuLayerCallbacks){
    .get_num_rows = menu_num_rows,
    .draw_row = menu_draw_row,
    .select_click = menu_select,
  });
  menu_layer_set_click_config_onto_window(s_app->multi_choice_list_menu_layer, window);
#ifdef PBL_ROUND
  menu_layer_set_center_focused(s_app->multi_choice_list_menu_layer, true);
#endif
  layer_add_child(root, menu_layer_get_layer(s_app->multi_choice_list_menu_layer));
}

static void window_unload(Window *window) {
  (void)window;
  layer_destroy(s_breadcrumbs);
  s_breadcrumbs = NULL;
  menu_layer_destroy(s_app->multi_choice_list_menu_layer);
  s_app->multi_choice_list_menu_layer = NULL;
}

/** Pushes a menu listing all answer choices for the active multiple-choice quest. */
void quest_multi_choice_list_window_push(AppState *app) {
  s_app = app;

  Window *window = window_create();
  window_set_window_handlers(window, (WindowHandlers){
    .load = window_load,
    .unload = window_unload,
  });
  s_app->multi_choice_list_window = window;
  window_stack_push(window, true);
}
