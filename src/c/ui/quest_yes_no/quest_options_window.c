#include "quest_options_window.h"
#include "../../communication/comm.h"
#include "../shared/map_window.h"
#include "../shared/thanks_window.h"
#include "../shared/breadcrumbs.h"

static AppState *s_app;
static Layer *s_breadcrumbs;

#ifdef PBL_MICROPHONE
static DictationSession *s_dictation_session;
static char s_dictation_buf[512];
#endif

/** Returns the real option index for the nth non-Yes/No option (0-based). */
static uint8_t nth_extra_option(const Quest *q, uint8_t n) {
  uint8_t count = 0;
  for (uint8_t i = 0; i < q->option_count; i++) {
    if (!quest_option_is_yes_no(q->option_labels[i])) {
      if (count == n) return i;
      count++;
    }
  }
  return q->option_count;
}

/** Returns the number of quest-specific extra options to show, which depends
 *  on the input type. Yes/No quests show non-Yes/No alternatives; other types
 *  show none since their choices are presented on a separate screen. */
static uint16_t extra_option_rows(void) {
  Quest *q = &s_app->active_quest;
  return (q->input_type == INPUT_TYPE_YES_NO) ? quest_extra_option_count(q) : 0;
}

/* Row 0 = "Show map", rows 1..N = quest-specific alternative answers,
 * last row = "Leave a comment" (only on platforms with microphone). */
static uint16_t menu_num_rows(MenuLayer *menu_layer, uint16_t section, void *ctx) {
  (void)menu_layer; (void)section; (void)ctx;
  uint16_t rows = 1 + extra_option_rows();
#ifdef PBL_MICROPHONE
  rows += 1;
#endif
  return rows;
}

static void menu_draw_row(GContext *ctx, const Layer *cell_layer, MenuIndex *index, void *cb_ctx) {
  (void)cb_ctx;
  if (index->row == 0) {
    menu_cell_basic_draw(ctx, cell_layer, "Show map", NULL, NULL);
    return;
  }
  uint16_t extras = extra_option_rows();
  if (index->row <= extras) {
    Quest *q = &s_app->active_quest;
    uint8_t opt_idx = nth_extra_option(q, index->row - 1);
    if (opt_idx < q->option_count) {
      menu_cell_basic_draw(ctx, cell_layer, q->option_labels[opt_idx], NULL, NULL);
    }
    return;
  }
#ifdef PBL_MICROPHONE
  menu_cell_basic_draw(ctx, cell_layer, "Leave a comment", NULL, NULL);
#endif
}

#ifdef PBL_MICROPHONE
/** Called when the dictation session finishes. On success, sends the
 *  transcribed text as an OSM note and shows the thanks screen. */
static void dictation_session_callback(DictationSession *session,
                                       DictationSessionStatus status,
                                       char *transcription, void *context) {
  (void)session; (void)context;
  if (status == DictationSessionStatusSuccess) {
    snprintf(s_dictation_buf, sizeof(s_dictation_buf), "%s", transcription);
    comm_send_comment(s_dictation_buf);
    thanks_window_push(s_app);
  }
  /* On failure the dictation UI has already shown an error; the user returns
   * to the options menu automatically. */
}
#endif

static void menu_select(MenuLayer *menu_layer, MenuIndex *index, void *ctx) {
  (void)menu_layer; (void)ctx;
  if (index->row == 0) {
    map_window_push(s_app);
    return;
  }
  uint16_t extras = extra_option_rows();
  if (index->row <= extras) {
    Quest *q = &s_app->active_quest;
    uint8_t opt_idx = nth_extra_option(q, index->row - 1);
    if (opt_idx < q->option_count) {
      comm_send_answer(q->option_values[opt_idx]);
      thanks_window_push(s_app);
    }
    return;
  }
#ifdef PBL_MICROPHONE
  if (s_dictation_session) {
    dictation_session_start(s_dictation_session);
  }
#endif
}

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

  s_breadcrumbs = breadcrumbs_layer_create(bounds, 1, 0);
  layer_add_child(root, s_breadcrumbs);

  s_app->options_menu_layer = menu_layer_create(breadcrumbs_menu_bounds(bounds));
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

#ifdef PBL_MICROPHONE
  s_dictation_session = dictation_session_create(sizeof(s_dictation_buf),
                                                 dictation_session_callback, NULL);
#endif
}

static void window_unload(Window *window) {
  (void)window;
#ifdef PBL_MICROPHONE
  if (s_dictation_session) {
    dictation_session_destroy(s_dictation_session);
    s_dictation_session = NULL;
  }
#endif
  layer_destroy(s_breadcrumbs);
  s_breadcrumbs = NULL;
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
