#include "map_window.h"

/* Meters-per-pixel at each zoom level. Index 0 is most zoomed in. */
static const int16_t ZOOM_SCALES[] = {1, 2, 5, 10, 20, 50};
#define ZOOM_LEVEL_COUNT ((int16_t)(sizeof(ZOOM_SCALES) / sizeof(ZOOM_SCALES[0])))
#define DEFAULT_ZOOM 3

/* Approximate meters per degree at mid-latitudes. */
#define METERS_PER_DEG_LAT 110574
#define METERS_PER_DEG_LON_AT_52 68700

static AppState *s_app;
static Layer *s_map_layer;
static ActionBarLayer *s_action_bar;
static int16_t s_zoom_level;
static Window *s_window;

/* Convert microdegree lat/lon offset into pixel offset relative to map center. */
static GPoint latlon_to_px(int32_t lat_e6, int32_t lon_e6,
                           int32_t center_lat_e6, int32_t center_lon_e6,
                           int16_t meters_per_px) {
  /* delta in microdegrees → meters → pixels */
  int32_t dlat = lat_e6 - center_lat_e6;
  int32_t dlon = lon_e6 - center_lon_e6;
  int32_t dy_m = (int32_t)((int64_t)dlat * METERS_PER_DEG_LAT / 1000000);
  int32_t dx_m = (int32_t)((int64_t)dlon * METERS_PER_DEG_LON_AT_52 / 1000000);
  /* Screen Y is inverted: north (higher lat) should be up. */
  int16_t px_x = (int16_t)(dx_m / meters_per_px);
  int16_t px_y = (int16_t)(-dy_m / meters_per_px);
  return GPoint(px_x, px_y);
}

/* Reads a little-endian int16 from a byte buffer at the given offset. */
static int16_t read_i16(const uint8_t *buf, uint16_t offset) {
  return (int16_t)((uint16_t)buf[offset] | ((uint16_t)buf[offset + 1] << 8));
}

/* Draws the map layer: way polylines, reference grid, user marker, node marker. */
static void map_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  GPoint center = GPoint(bounds.size.w / 2, bounds.size.h / 2);

  Quest *q = &s_app->active_quest;
  int16_t mpp = ZOOM_SCALES[s_zoom_level];

  /* Center the map on the midpoint between user and node. */
  int32_t mid_lat_e6 = (q->user_lat_e6 + q->node_lat_e6) / 2;
  int32_t mid_lon_e6 = (q->user_lon_e6 + q->node_lon_e6) / 2;

  /* --- Background --- */
  graphics_context_set_fill_color(ctx, GColorWhite);
  graphics_fill_rect(ctx, bounds, 0, GCornerNone);

  /* --- Draw way polylines from buffered map data --- */
  if (s_app->map_data_len >= 4) {
#ifdef PBL_COLOR
    graphics_context_set_stroke_color(ctx, GColorDarkGray);
#else
    graphics_context_set_stroke_color(ctx, GColorBlack);
#endif
    graphics_context_set_stroke_width(ctx, 1);

    uint16_t num_bytes = s_app->map_data_len;
    const uint8_t *data = s_app->map_data;
    bool has_prev = false;
    GPoint prev = GPointZero;

    for (uint16_t off = 0; off + 3 < num_bytes; off += 4) {
      int16_t dlat = read_i16(data, off);
      int16_t dlon = read_i16(data, off + 2);

      /* Check for way sentinel. */
      if (dlat == MAP_WAY_SENTINEL && dlon == MAP_WAY_SENTINEL) {
        has_prev = false;
        continue;
      }

      /* Convert microdegree offset → meters → pixels. The offsets are relative
       * to the quest node, but we center the screen on the midpoint. */
      int32_t abs_lat_e6 = q->node_lat_e6 + (int32_t)dlat;
      int32_t abs_lon_e6 = q->node_lon_e6 + (int32_t)dlon;
      GPoint px = latlon_to_px(abs_lat_e6, abs_lon_e6,
                               mid_lat_e6, mid_lon_e6, mpp);
      GPoint screen = GPoint(center.x + px.x, center.y + px.y);

      if (has_prev) {
        graphics_draw_line(ctx, prev, screen);
      }
      prev = screen;
      has_prev = true;
    }
  }

  /* --- Scale bar label at bottom-left --- */
  int32_t grid_m = mpp * 20;
  if (grid_m < 10) { grid_m = 10; }
  if (grid_m >= 100) { grid_m = (grid_m / 100) * 100; }
  else if (grid_m >= 10) { grid_m = (grid_m / 10) * 10; }

  static char scale_buf[16];
  if (grid_m >= 1000) {
    snprintf(scale_buf, sizeof(scale_buf), "%d km", (int)(grid_m / 1000));
  } else {
    snprintf(scale_buf, sizeof(scale_buf), "%d m", (int)grid_m);
  }

  /* Draw scale bar line + label. */
  int16_t bar_px = (int16_t)(grid_m / mpp);
  if (bar_px > bounds.size.w / 2) { bar_px = bounds.size.w / 2; }
  int16_t bar_y = bounds.size.h - 10;
  graphics_context_set_stroke_color(ctx, GColorBlack);
  graphics_context_set_stroke_width(ctx, 1);
  graphics_draw_line(ctx, GPoint(4, bar_y), GPoint(4 + bar_px, bar_y));
  graphics_draw_line(ctx, GPoint(4, bar_y - 3), GPoint(4, bar_y + 3));
  graphics_draw_line(ctx, GPoint(4 + bar_px, bar_y - 3), GPoint(4 + bar_px, bar_y + 3));

  /* White background behind scale text for readability. */
  GRect text_rect = GRect(4, bounds.size.h - 26, bounds.size.w / 2, 16);
  graphics_context_set_fill_color(ctx, GColorWhite);
  graphics_fill_rect(ctx, text_rect, 0, GCornerNone);
  graphics_context_set_text_color(ctx, GColorBlack);
  graphics_draw_text(ctx, scale_buf,
    fonts_get_system_font(FONT_KEY_GOTHIC_14),
    text_rect,
    GTextOverflowModeTrailingEllipsis, GTextAlignmentLeft, NULL);

  /* --- Draw user marker (filled circle) --- */
  GPoint user_px = latlon_to_px(q->user_lat_e6, q->user_lon_e6,
                                mid_lat_e6, mid_lon_e6, mpp);
  GPoint user_screen = GPoint(center.x + user_px.x, center.y + user_px.y);

#ifdef PBL_COLOR
  graphics_context_set_fill_color(ctx, GColorBlue);
#else
  graphics_context_set_fill_color(ctx, GColorBlack);
#endif
  graphics_fill_circle(ctx, user_screen, 5);
  graphics_context_set_stroke_color(ctx, GColorWhite);
  graphics_draw_circle(ctx, user_screen, 5);

  /* --- Draw node marker (filled diamond) --- */
  GPoint node_px = latlon_to_px(q->node_lat_e6, q->node_lon_e6,
                                mid_lat_e6, mid_lon_e6, mpp);
  GPoint node_screen = GPoint(center.x + node_px.x, center.y + node_px.y);

  static GPoint diamond_points[] = {
    {0, -7}, {7, 0}, {0, 7}, {-7, 0}
  };
  static GPathInfo diamond_info = {
    .num_points = 4,
    .points = diamond_points,
  };
  GPath *diamond = gpath_create(&diamond_info);
  gpath_move_to(diamond, node_screen);

#ifdef PBL_COLOR
  graphics_context_set_fill_color(ctx, GColorRed);
#else
  graphics_context_set_fill_color(ctx, GColorBlack);
#endif
  gpath_draw_filled(ctx, diamond);
  graphics_context_set_stroke_color(ctx, GColorWhite);
  gpath_draw_outline(ctx, diamond);
  gpath_destroy(diamond);
}

static void zoom_in_click(ClickRecognizerRef recognizer, void *ctx) {
  (void)recognizer; (void)ctx;
  if (s_zoom_level > 0) {
    s_zoom_level--;
    layer_mark_dirty(s_map_layer);
  }
}

static void zoom_out_click(ClickRecognizerRef recognizer, void *ctx) {
  (void)recognizer; (void)ctx;
  if (s_zoom_level < ZOOM_LEVEL_COUNT - 1) {
    s_zoom_level++;
    layer_mark_dirty(s_map_layer);
  }
}

static void click_config(void *ctx) {
  (void)ctx;
  window_single_click_subscribe(BUTTON_ID_UP, zoom_in_click);
  window_single_click_subscribe(BUTTON_ID_DOWN, zoom_out_click);
}

static void window_load(Window *window) {
  Layer *root = window_get_root_layer(window);
  GRect bounds = layer_get_bounds(root);

  s_zoom_level = DEFAULT_ZOOM;

  /* Action bar on the right with zoom + / - icons. */
  s_action_bar = action_bar_layer_create();
#ifdef PBL_COLOR
  action_bar_layer_set_background_color(s_action_bar, GColorIslamicGreen);
#endif
  action_bar_layer_set_icon_animated(s_action_bar, BUTTON_ID_UP,
                                     s_app->icon_plus, true);
  action_bar_layer_set_icon_animated(s_action_bar, BUTTON_ID_DOWN,
                                     s_app->icon_minus, true);
  action_bar_layer_set_click_config_provider(s_action_bar, click_config);
  action_bar_layer_add_to_window(s_action_bar, window);

  /* Map drawing layer (left of action bar). */
  int16_t map_w = bounds.size.w - ACTION_BAR_WIDTH;
#ifdef PBL_ROUND
  map_w = bounds.size.w;
#endif
  s_map_layer = layer_create(GRect(0, 0, map_w, bounds.size.h));
  layer_set_update_proc(s_map_layer, map_update_proc);
  layer_add_child(root, s_map_layer);

  s_app->map_layer = s_map_layer;
}

static void window_unload(Window *window) {
  (void)window;
  layer_destroy(s_map_layer);
  s_map_layer = NULL;
  s_app->map_layer = NULL;

  action_bar_layer_destroy(s_action_bar);
  s_action_bar = NULL;
}

/** Opens the map window showing both user and quest node locations. */
void map_window_push(AppState *app) {
  s_app = app;

  s_window = window_create();
  window_set_window_handlers(s_window, (WindowHandlers){
    .load = window_load,
    .unload = window_unload,
  });
  s_app->map_window = s_window;
  window_stack_push(s_window, true);
}
