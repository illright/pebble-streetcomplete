#include "compass_window.h"

static AppState *s_app;

#ifdef PBL_ROUND
/* Small arrow for the ring compass on round displays. Points inward (toward
 * negative Y) and is positioned on the screen perimeter by the update proc. */
static const GPathInfo ARROW_PATH_INFO = {
  .num_points = 3,
  .points = (GPoint[]) {
    {0, -14}, {-8, 7}, {8, 7}
  }
};

/* Ring thickness used by graphics_fill_radial. Also serves as the text flow
 * inset so that content never overlaps the compass ring. */
#define RING_INSET 14

static GTextAttributes *s_text_attrs;
static Layer *s_content_layer;
#else
static const GPathInfo ARROW_PATH_INFO = {
  .num_points = 7,
  .points = (GPoint[]) {
    {0, -50}, {25, 15}, {12, 8}, {12, 50}, {-12, 50}, {-12, 8}, {-25, 15}
  }
};
#endif
static GPath *s_arrow_path;

#ifdef PBL_ROUND
/* Draws quest name + distance text centered on screen with circular text flow
 * so content stays inside the ring compass boundary. */
static void content_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  Quest *q = &s_app->active_quest;
  const char *name = q->name[0] ? q->name : q->question;

  graphics_context_set_text_color(ctx, GColorBlack);
  graphics_draw_text(ctx, name,
    fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD),
    GRect(0, bounds.size.h / 2 - 30, bounds.size.w, 28),
    GTextOverflowModeTrailingEllipsis, GTextAlignmentCenter, s_text_attrs);

  static char dist_buf[20];
  snprintf(dist_buf, sizeof(dist_buf), "%d m", (int)q->dist_m);
  graphics_draw_text(ctx, dist_buf,
    fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD),
    GRect(0, bounds.size.h / 2, bounds.size.w, 28),
    GTextOverflowModeWordWrap, GTextAlignmentCenter, s_text_attrs);
}
#endif

static void arrow_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  GPoint center = GPoint(bounds.size.w / 2, bounds.size.h / 2);

  if (!s_app->has_active_quest) {
    return;
  }

  int32_t angle_deg = s_app->active_quest.bearing_deg
                    - (TRIGANGLE_TO_DEG(TRIG_MAX_ANGLE - s_app->compass_heading));
  int32_t angle = DEG_TO_TRIGANGLE(angle_deg);

#ifdef PBL_ROUND
  /* Draw a highlighted arc segment behind the arrow on the ring. */
  int32_t arc_half = DEG_TO_TRIGANGLE(25);
  graphics_context_set_fill_color(ctx, GColorIslamicGreen);
  graphics_fill_radial(ctx, bounds, GOvalScaleModeFitCircle,
                       14, angle - arc_half, angle + arc_half);

  /* Position the small arrow on the ring, 7px inward from the edge. */
  GRect inset = grect_inset(bounds, GEdgeInsets(7));
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
  if (s_app->compass_arrow_layer) {
    layer_mark_dirty(s_app->compass_arrow_layer);
  }
}

static void window_load(Window *window) {
  Quest *q = &s_app->active_quest;
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

#ifdef PBL_ROUND
  s_text_attrs = graphics_text_attributes_create();
  graphics_text_attributes_enable_screen_text_flow(s_text_attrs, RING_INSET);

  /* Content layer draws name + distance with circular text flow. */
  s_content_layer = layer_create(bounds);
  layer_set_update_proc(s_content_layer, content_update_proc);
  layer_add_child(root, s_content_layer);

  /* Ring compass: full-screen layer so the arrow can orbit the edge. */
  s_app->compass_arrow_layer = layer_create(bounds);
#else
  static char dist_buf[20];
  snprintf(dist_buf, sizeof(dist_buf), "%d m", (int)q->dist_m);

  /* Quest name at top */
  s_app->compass_name_layer = text_layer_create(GRect(4, 2, bounds.size.w - 8, 24));
  text_layer_set_text(s_app->compass_name_layer, q->name[0] ? q->name : q->question);
  text_layer_set_font(s_app->compass_name_layer, fonts_get_system_font(FONT_KEY_GOTHIC_18_BOLD));
  text_layer_set_text_alignment(s_app->compass_name_layer, GTextAlignmentCenter);
  text_layer_set_overflow_mode(s_app->compass_name_layer, GTextOverflowModeTrailingEllipsis);
  layer_add_child(root, text_layer_get_layer(s_app->compass_name_layer));

  /* Large compass arrow in the center */
  int16_t arrow_y = 28;
  int16_t arrow_h = bounds.size.h - arrow_y - 30;
  s_app->compass_arrow_layer = layer_create(GRect(0, arrow_y, bounds.size.w, arrow_h));

  /* Distance text at bottom */
  s_app->compass_dist_layer = text_layer_create(GRect(0, bounds.size.h - 28, bounds.size.w, 26));
  text_layer_set_text(s_app->compass_dist_layer, dist_buf);
  text_layer_set_font(s_app->compass_dist_layer, fonts_get_system_font(FONT_KEY_GOTHIC_24_BOLD));
  text_layer_set_text_alignment(s_app->compass_dist_layer, GTextAlignmentCenter);
  layer_add_child(root, text_layer_get_layer(s_app->compass_dist_layer));
#endif

  layer_set_update_proc(s_app->compass_arrow_layer, arrow_update_proc);
  layer_add_child(root, s_app->compass_arrow_layer);

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
  text_layer_destroy(s_app->compass_name_layer);
  s_app->compass_name_layer = NULL;
  text_layer_destroy(s_app->compass_dist_layer);
  s_app->compass_dist_layer = NULL;
#endif
  layer_destroy(s_app->compass_arrow_layer);
  s_app->compass_arrow_layer = NULL;

  if (s_arrow_path) {
    gpath_destroy(s_arrow_path);
    s_arrow_path = NULL;
  }
}

void compass_window_push(AppState *app) {
  s_app = app;

  Window *window = window_create();
  window_set_window_handlers(window, (WindowHandlers){
    .load = window_load,
    .unload = window_unload,
  });
  s_app->compass_window = window;
  window_stack_push(window, true);
}

void compass_window_mark_dirty(AppState *app) {
  if (app->compass_arrow_layer) {
    layer_mark_dirty(app->compass_arrow_layer);
  }
#ifdef PBL_ROUND
  if (s_content_layer) {
    layer_mark_dirty(s_content_layer);
  }
#else
  if (app->compass_dist_layer) {
    static char dist_buf[20];
    snprintf(dist_buf, sizeof(dist_buf), "%d m", (int)app->active_quest.dist_m);
    text_layer_set_text(app->compass_dist_layer, dist_buf);
  }
#endif
}
