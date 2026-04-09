#include "quest_incoming_window.h"
#include "quest_actions_window.h"

static AppState *s_app;

#ifdef PBL_ROUND
/* Small arrow for the ring compass on round displays. Points inward (toward
 * negative Y) and is positioned on the screen perimeter by the update proc. */
static const GPathInfo ARROW_PATH_INFO = {
  .num_points = 3,
  .points = (GPoint[]) {
    {0, -12}, {-7, 6}, {7, 6}
  }
};

/* Ring thickness used by graphics_fill_radial. Also serves as the text flow
 * inset so that content never overlaps the compass ring. */
#define RING_INSET 12

static GTextAttributes *s_text_attrs;
static Layer *s_content_layer;
#else
/* Arrow shape pointing up, centered at origin */
static const GPathInfo ARROW_PATH_INFO = {
  .num_points = 7,
  .points = (GPoint[]) {
    {0, -30}, {15, 10}, {7, 5}, {7, 30}, {-7, 30}, {-7, 5}, {-15, 10}
  }
};
#endif
static GPath *s_arrow_path;

#ifdef PBL_ROUND
/* Draws question + distance text vertically centered with circular screen text
 * flow so content stays inside the ring compass boundary. Uses GTextAttributes
 * directly (not TextLayer paging) to avoid animation conflicts on teardown. */
static void content_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  Quest *q = &s_app->active_quest;

  /* Measure question text height to compute vertical centering. */
  GRect measure = GRect(0, 0, bounds.size.w, bounds.size.h);
  GSize q_size = graphics_text_layout_get_content_size_with_attributes(
    q->question, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD),
    measure, GTextOverflowModeWordWrap, GTextAlignmentCenter, s_text_attrs);
  int16_t dist_h = 22;
  int16_t gap = 4;
  int16_t total_h = q_size.h + gap + dist_h;
  int16_t y = (bounds.size.h - total_h) / 2;
  if (y < RING_INSET) { y = RING_INSET; }

  graphics_context_set_text_color(ctx, GColorBlack);
  graphics_draw_text(ctx, q->question,
    fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD),
    GRect(0, y, bounds.size.w, bounds.size.h - y),
    GTextOverflowModeWordWrap, GTextAlignmentCenter, s_text_attrs);

  static char dist_buf[20];
  snprintf(dist_buf, sizeof(dist_buf), "%d m away", (int)q->dist_m);
  graphics_context_set_text_color(ctx, GColorDarkGray);
  graphics_draw_text(ctx, dist_buf,
    fonts_get_system_font(FONT_KEY_GOTHIC_18),
    GRect(0, y + q_size.h + gap, bounds.size.w, dist_h),
    GTextOverflowModeWordWrap, GTextAlignmentCenter, s_text_attrs);
}
#endif

static void arrow_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  GPoint center = GPoint(bounds.size.w / 2, bounds.size.h / 2);

  if (!s_app->has_active_quest) {
    return;
  }

  /* Compute rotation: bearing from user to quest, minus compass heading.
   * Both in degrees; convert to Pebble trig angle (0..TRIG_MAX_ANGLE). */
  int32_t angle_deg = s_app->active_quest.bearing_deg
                    - (TRIGANGLE_TO_DEG(TRIG_MAX_ANGLE - s_app->compass_heading));
  int32_t angle = DEG_TO_TRIGANGLE(angle_deg);

#ifdef PBL_ROUND
  /* Draw a highlighted arc segment behind the arrow on the ring. */
  int32_t arc_half = DEG_TO_TRIGANGLE(20);
  graphics_context_set_fill_color(ctx, GColorIslamicGreen);
  graphics_fill_radial(ctx, bounds, GOvalScaleModeFitCircle,
                       12, angle - arc_half, angle + arc_half);

  /* Position the small arrow on the ring, 6px inward from the edge. */
  GRect inset = grect_inset(bounds, GEdgeInsets(6));
  GPoint arrow_pos = gpoint_from_polar(inset, GOvalScaleModeFitCircle, angle);
  gpath_move_to(s_arrow_path, arrow_pos);
  gpath_rotate_to(s_arrow_path, angle);

  graphics_context_set_fill_color(ctx, GColorWhite);
  gpath_draw_filled(ctx, s_arrow_path);
#else
  gpath_move_to(s_arrow_path, center);
  gpath_rotate_to(s_arrow_path, angle);

#ifdef PBL_COLOR
  graphics_context_set_fill_color(ctx, GColorIslamicGreen);
#else
  graphics_context_set_fill_color(ctx, GColorBlack);
#endif
  gpath_draw_filled(ctx, s_arrow_path);
  graphics_context_set_stroke_color(ctx, GColorBlack);
  gpath_draw_outline(ctx, s_arrow_path);
#endif
}

static void compass_handler(CompassHeadingData heading_data) {
  s_app->compass_heading = heading_data.magnetic_heading;
  if (s_app->incoming_arrow_layer) {
    layer_mark_dirty(s_app->incoming_arrow_layer);
  }
}

static void select_click(ClickRecognizerRef recognizer, void *ctx) {
  (void)recognizer;
  (void)ctx;
  quest_actions_window_push(s_app);
}

static void click_config(void *ctx) {
  (void)ctx;
  window_single_click_subscribe(BUTTON_ID_SELECT, select_click);
}

static void window_load(Window *window) {
  s_app->incoming_window = window;
  Quest *q = &s_app->active_quest;
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

#ifdef PBL_ROUND
  s_text_attrs = graphics_text_attributes_create();
  graphics_text_attributes_enable_screen_text_flow(s_text_attrs, RING_INSET);

  /* Content layer draws question + distance text with circular text flow. */
  s_content_layer = layer_create(bounds);
  layer_set_update_proc(s_content_layer, content_update_proc);
  layer_add_child(root, s_content_layer);

  /* Ring compass: full-screen layer so the arrow can orbit the edge. */
  s_app->incoming_arrow_layer = layer_create(bounds);
#else
  static char dist_buf[20];
  snprintf(dist_buf, sizeof(dist_buf), "%d m away", (int)q->dist_m);

  int16_t pad = 8;
  int16_t content_w = bounds.size.w - 2 * pad;
  int16_t y = 4;

  /* Question text */
  GSize q_size = graphics_text_layout_get_content_size(
    q->question,
    fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD),
    GRect(0, 0, content_w, 2000),
    GTextOverflowModeWordWrap,
    GTextAlignmentLeft
  );

  s_app->incoming_question_layer = text_layer_create(GRect(pad, y, content_w, q_size.h + 8));
  text_layer_set_text(s_app->incoming_question_layer, q->question);
  text_layer_set_font(s_app->incoming_question_layer, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  text_layer_set_overflow_mode(s_app->incoming_question_layer, GTextOverflowModeWordWrap);
  layer_add_child(root, text_layer_get_layer(s_app->incoming_question_layer));
  y += q_size.h + 4;

  /* Distance text */
  s_app->incoming_dist_layer = text_layer_create(GRect(pad, y, content_w, 24));
  text_layer_set_text(s_app->incoming_dist_layer, dist_buf);
  text_layer_set_font(s_app->incoming_dist_layer, fonts_get_system_font(FONT_KEY_GOTHIC_18));
  text_layer_set_text_color(s_app->incoming_dist_layer, GColorDarkGray);
  layer_add_child(root, text_layer_get_layer(s_app->incoming_dist_layer));
  y += 28;

  /* Compass arrow in the remaining space below text. */
  int16_t arrow_h = bounds.size.h - y - 10;
  if (arrow_h < 40) { arrow_h = 40; }
  s_app->incoming_arrow_layer = layer_create(GRect(0, y, bounds.size.w, arrow_h));
#endif
  layer_set_update_proc(s_app->incoming_arrow_layer, arrow_update_proc);
  layer_add_child(root, s_app->incoming_arrow_layer);

  s_arrow_path = gpath_create(&ARROW_PATH_INFO);

  compass_service_subscribe(compass_handler);
  compass_service_set_heading_filter(DEG_TO_TRIGANGLE(5));
}

static void window_unload(Window *window) {
  (void)window;
  compass_service_unsubscribe();

#ifdef PBL_ROUND
  layer_destroy(s_content_layer);
  s_content_layer = NULL;
  graphics_text_attributes_destroy(s_text_attrs);
  s_text_attrs = NULL;
#else
  text_layer_destroy(s_app->incoming_question_layer);
  s_app->incoming_question_layer = NULL;
  text_layer_destroy(s_app->incoming_dist_layer);
  s_app->incoming_dist_layer = NULL;
#endif
  layer_destroy(s_app->incoming_arrow_layer);
  s_app->incoming_arrow_layer = NULL;

  if (s_arrow_path) {
    gpath_destroy(s_arrow_path);
    s_arrow_path = NULL;
  }
}

void quest_incoming_window_push(AppState *app) {
  s_app = app;

  Window *window = window_create();
  window_set_window_handlers(window, (WindowHandlers){
    .load = window_load,
    .unload = window_unload,
  });
  window_set_click_config_provider(window, click_config);
  window_stack_push(window, true);
}
