#include "map_window.h"

/* Decimeters-per-pixel at each zoom level. Index 0 is most zoomed in. */
static const int16_t ZOOM_SCALES[] = {2, 5, 10, 20, 40, 60, 100, 200};
#define ZOOM_LEVEL_COUNT ((int16_t)(sizeof(ZOOM_SCALES) / sizeof(ZOOM_SCALES[0])))
#define DEFAULT_ZOOM 3

/* Maximum number of vertices in a single building polygon for filled rendering. */
#define MAX_BUILDING_VERTS 32

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
                           int16_t dm_per_px) {
  /* delta in microdegrees → meters → pixels (zoom unit is decimeters/px) */
  int32_t dlat = lat_e6 - center_lat_e6;
  int32_t dlon = lon_e6 - center_lon_e6;
  int32_t dy_m = (int32_t)((int64_t)dlat * METERS_PER_DEG_LAT / 1000000);
  int32_t dx_m = (int32_t)((int64_t)dlon * METERS_PER_DEG_LON_AT_52 / 1000000);
  /* Screen Y is inverted: north (higher lat) should be up. */
  int16_t px_x = (int16_t)(dx_m * 10 / dm_per_px);
  int16_t px_y = (int16_t)(-dy_m * 10 / dm_per_px);
  return GPoint(px_x, px_y);
}

/* Reads a little-endian int16 from a byte buffer at the given offset. */
static int16_t read_i16(const uint8_t *buf, uint16_t offset) {
  return (int16_t)((uint16_t)buf[offset] | ((uint16_t)buf[offset + 1] << 8));
}

/* Returns true if the given way type should be drawn in the specified pass.
 * Pass 0 draws area features and road casings (background layer).
 * Pass 1 draws road fills and fine line features (foreground layer). */
static bool way_visible_in_pass(uint8_t type, int pass) {
  if (pass == 0) {
    return type == WAY_TYPE_GREEN || type == WAY_TYPE_WATER ||
           type == WAY_TYPE_BUILDING || type == WAY_TYPE_ROAD ||
           type == WAY_TYPE_MAJOR_ROAD;
  }
  /* pass 1 */
  return type == WAY_TYPE_ROAD || type == WAY_TYPE_MAJOR_ROAD ||
         type == WAY_TYPE_SERVICE || type == WAY_TYPE_PATH ||
         type == WAY_TYPE_RAILWAY;
}

/* Applies the stroke color and width for a way type in the given rendering
 * pass. Pass 0 draws casings (wider, darker); pass 1 draws fills (narrower). */
static void apply_way_style(GContext *ctx, uint8_t type, int pass) {
#ifdef PBL_COLOR
  if (pass == 0) {
    switch (type) {
      case WAY_TYPE_GREEN:      graphics_context_set_stroke_color(ctx, GColorMayGreen);
                                graphics_context_set_stroke_width(ctx, 1); break;
      case WAY_TYPE_WATER:      graphics_context_set_stroke_color(ctx, GColorPictonBlue);
                                graphics_context_set_stroke_width(ctx, 3); break;
      case WAY_TYPE_BUILDING:   graphics_context_set_stroke_color(ctx, GColorLightGray);
                                graphics_context_set_stroke_width(ctx, 1); break;
      case WAY_TYPE_ROAD:       graphics_context_set_stroke_color(ctx, GColorWindsorTan);
                                graphics_context_set_stroke_width(ctx, 3); break;
      case WAY_TYPE_MAJOR_ROAD: graphics_context_set_stroke_color(ctx, GColorBulgarianRose);
                                graphics_context_set_stroke_width(ctx, 3); break;
      default: break;
    }
  } else {
    switch (type) {
      case WAY_TYPE_ROAD:       graphics_context_set_stroke_color(ctx, GColorWhite);
                                graphics_context_set_stroke_width(ctx, 1); break;
      case WAY_TYPE_MAJOR_ROAD: graphics_context_set_stroke_color(ctx, GColorRajah);
                                graphics_context_set_stroke_width(ctx, 1); break;
      case WAY_TYPE_SERVICE:    graphics_context_set_stroke_color(ctx, GColorWhite);
                                graphics_context_set_stroke_width(ctx, 1); break;
      case WAY_TYPE_PATH:       graphics_context_set_stroke_color(ctx, GColorWindsorTan);
                                graphics_context_set_stroke_width(ctx, 1); break;
      case WAY_TYPE_RAILWAY:    graphics_context_set_stroke_color(ctx, GColorDarkGray);
                                graphics_context_set_stroke_width(ctx, 1); break;
      default: break;
    }
  }
#else
  /* B&W platforms: differentiate only by stroke width. */
  if (pass == 0) {
    graphics_context_set_stroke_color(ctx, GColorBlack);
    switch (type) {
      case WAY_TYPE_ROAD:
      case WAY_TYPE_MAJOR_ROAD: graphics_context_set_stroke_width(ctx, 3); break;
      default:                  graphics_context_set_stroke_width(ctx, 1); break;
    }
  } else {
    switch (type) {
      case WAY_TYPE_ROAD:
      case WAY_TYPE_MAJOR_ROAD: graphics_context_set_stroke_color(ctx, GColorWhite);
                                graphics_context_set_stroke_width(ctx, 1); break;
      default:                  graphics_context_set_stroke_color(ctx, GColorBlack);
                                graphics_context_set_stroke_width(ctx, 1); break;
    }
  }
#endif
}

/* Iterates the packed map data and fills building polygons with a solid color.
 * Each building way is collected into a GPoint array, then drawn as a filled
 * GPath so buildings appear as solid shapes rather than just outlines. */
static void draw_building_fills(GContext *ctx, const uint8_t *data, uint16_t len,
                                GPoint center, int32_t mid_lat_e6, int32_t mid_lon_e6,
                                int32_t node_lat_e6, int32_t node_lon_e6,
                                int16_t mpp) {
  uint8_t cur_type = WAY_TYPE_ROAD;
  GPoint verts[MAX_BUILDING_VERTS];
  int vert_count = 0;

#ifdef PBL_COLOR
  graphics_context_set_fill_color(ctx, GColorDarkGray);
#else
  graphics_context_set_fill_color(ctx, GColorWhite);
#endif

  for (uint16_t off = 0; off + 3 < len; off += 4) {
    int16_t a = read_i16(data, off);
    int16_t b = read_i16(data, off + 2);

    if (a == (int16_t)MAP_WAY_TYPE_MARKER) {
      /* Flush any pending building polygon before switching type. */
      if (cur_type == WAY_TYPE_BUILDING && vert_count >= 3) {
        GPathInfo info = { .num_points = vert_count, .points = verts };
        GPath *p = gpath_create(&info);
        gpath_draw_filled(ctx, p);
        gpath_destroy(p);
      }
      vert_count = 0;
      cur_type = (uint8_t)(b & 0xFF);
      continue;
    }

    if (a == (int16_t)MAP_WAY_SENTINEL && b == (int16_t)MAP_WAY_SENTINEL) {
      if (cur_type == WAY_TYPE_BUILDING && vert_count >= 3) {
        GPathInfo info = { .num_points = vert_count, .points = verts };
        GPath *p = gpath_create(&info);
        gpath_draw_filled(ctx, p);
        gpath_destroy(p);
      }
      vert_count = 0;
      continue;
    }

    if (cur_type != WAY_TYPE_BUILDING) { continue; }

    int32_t abs_lat_e6 = node_lat_e6 + (int32_t)a;
    int32_t abs_lon_e6 = node_lon_e6 + (int32_t)b;
    GPoint px = latlon_to_px(abs_lat_e6, abs_lon_e6,
                             mid_lat_e6, mid_lon_e6, mpp);
    GPoint screen = GPoint(center.x + px.x, center.y + px.y);
    if (vert_count < MAX_BUILDING_VERTS) {
      verts[vert_count++] = screen;
    }
  }

  /* Flush last building if data ends without a sentinel. */
  if (cur_type == WAY_TYPE_BUILDING && vert_count >= 3) {
    GPathInfo info = { .num_points = vert_count, .points = verts };
    GPath *p = gpath_create(&info);
    gpath_draw_filled(ctx, p);
    gpath_destroy(p);
  }
}

/* Iterates the packed map data buffer and draws way polylines for a single
 * rendering pass. Skips ways whose type does not belong in the pass. */
static void draw_ways_pass(GContext *ctx, const uint8_t *data, uint16_t len,
                           GPoint center, int32_t mid_lat_e6, int32_t mid_lon_e6,
                           int32_t node_lat_e6, int32_t node_lon_e6,
                           int16_t mpp, int pass) {
  uint8_t cur_type = WAY_TYPE_ROAD;
  bool skip = !way_visible_in_pass(cur_type, pass);
  bool has_prev = false;
  GPoint prev = GPointZero;

  for (uint16_t off = 0; off + 3 < len; off += 4) {
    int16_t a = read_i16(data, off);
    int16_t b = read_i16(data, off + 2);

    /* Way type header. */
    if (a == (int16_t)MAP_WAY_TYPE_MARKER) {
      cur_type = (uint8_t)(b & 0xFF);
      skip = !way_visible_in_pass(cur_type, pass);
      has_prev = false;
      if (!skip) {
        apply_way_style(ctx, cur_type, pass);
      }
      continue;
    }

    /* Way sentinel — end of current polyline. */
    if (a == (int16_t)MAP_WAY_SENTINEL && b == (int16_t)MAP_WAY_SENTINEL) {
      has_prev = false;
      continue;
    }

    if (skip) { continue; }

    int32_t abs_lat_e6 = node_lat_e6 + (int32_t)a;
    int32_t abs_lon_e6 = node_lon_e6 + (int32_t)b;
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

/* Draws the full map: background, way polylines (two-pass), scale bar,
 * user marker, and node marker. */
static void map_update_proc(Layer *layer, GContext *ctx) {
  GRect bounds = layer_get_bounds(layer);
  GPoint center = GPoint(bounds.size.w / 2, bounds.size.h / 2);

  Quest *q = &s_app->active_quest;
  int16_t mpp = ZOOM_SCALES[s_zoom_level];

  /* Center the map on the midpoint between user and node. */
  int32_t mid_lat_e6 = (q->user_lat_e6 + q->node_lat_e6) / 2;
  int32_t mid_lon_e6 = (q->user_lon_e6 + q->node_lon_e6) / 2;

  /* --- Background (warm sand, inspired by StreetComplete day theme) --- */
#ifdef PBL_COLOR
  graphics_context_set_fill_color(ctx, GColorPastelYellow);
#else
  graphics_context_set_fill_color(ctx, GColorWhite);
#endif
  graphics_fill_rect(ctx, bounds, 0, GCornerNone);

  /* --- Way rendering: building fills, then two-pass polylines --- */
  if (s_app->map_data_len >= 4) {
    /* Fill buildings as solid gray polygons before drawing outlines. */
    draw_building_fills(ctx, s_app->map_data, s_app->map_data_len,
                        center, mid_lat_e6, mid_lon_e6,
                        q->node_lat_e6, q->node_lon_e6, mpp);
    /* Pass 0: area features (green, water, buildings) and road casings. */
    draw_ways_pass(ctx, s_app->map_data, s_app->map_data_len,
                   center, mid_lat_e6, mid_lon_e6,
                   q->node_lat_e6, q->node_lon_e6, mpp, 0);
    /* Pass 1: road fills, paths, railways, service roads. */
    draw_ways_pass(ctx, s_app->map_data, s_app->map_data_len,
                   center, mid_lat_e6, mid_lon_e6,
                   q->node_lat_e6, q->node_lon_e6, mpp, 1);
  }

  /* --- Scale bar label at bottom-left --- */
  int32_t grid_m = mpp * 2;  /* mpp is dm/px, so *2 gives a ~20px reference bar in meters */
  if (grid_m < 5) { grid_m = 5; }
  if (grid_m >= 100) { grid_m = (grid_m / 100) * 100; }
  else if (grid_m >= 10) { grid_m = (grid_m / 10) * 10; }

  static char scale_buf[16];
  if (grid_m >= 1000) {
    snprintf(scale_buf, sizeof(scale_buf), "%d km", (int)(grid_m / 1000));
  } else {
    snprintf(scale_buf, sizeof(scale_buf), "%d m", (int)grid_m);
  }

  /* Draw scale bar line + label. On round screens, center horizontally and
   * move up from the very bottom to stay within the visible circle. */
  int16_t bar_px = (int16_t)(grid_m * 10 / mpp);
  if (bar_px > bounds.size.w / 2) { bar_px = bounds.size.w / 2; }
#ifdef PBL_ROUND
  int16_t bar_x = (bounds.size.w - bar_px) / 2;
  int16_t bar_y = bounds.size.h - 30;
#else
  int16_t bar_x = 4;
  int16_t bar_y = bounds.size.h - 10;
#endif
  graphics_context_set_stroke_color(ctx, GColorBlack);
  graphics_context_set_stroke_width(ctx, 1);
  graphics_draw_line(ctx, GPoint(bar_x, bar_y), GPoint(bar_x + bar_px, bar_y));
  graphics_draw_line(ctx, GPoint(bar_x, bar_y - 3), GPoint(bar_x, bar_y + 3));
  graphics_draw_line(ctx, GPoint(bar_x + bar_px, bar_y - 3), GPoint(bar_x + bar_px, bar_y + 3));

  /* Background behind scale text for readability. */
#ifdef PBL_ROUND
  int16_t text_w = 60;
  GRect text_rect = GRect(center.x - text_w / 2, bar_y - 18, text_w, 16);
#else
  GRect text_rect = GRect(4, bounds.size.h - 26, bounds.size.w / 2, 16);
#endif
  graphics_context_set_text_color(ctx, GColorBlack);
  graphics_draw_text(ctx, scale_buf,
    fonts_get_system_font(FONT_KEY_GOTHIC_14),
    text_rect,
    GTextOverflowModeTrailingEllipsis,
#ifdef PBL_ROUND
    GTextAlignmentCenter,
#else
    GTextAlignmentLeft,
#endif
    NULL);

  /* --- Draw user marker (directional arrow showing compass heading) --- */
  GPoint user_px = latlon_to_px(q->user_lat_e6, q->user_lon_e6,
                                mid_lat_e6, mid_lon_e6, mpp);
  GPoint user_screen = GPoint(center.x + user_px.x, center.y + user_px.y);

  /* Small arrow shape: tip at top, wide base at bottom. Drawn pointing up
   * (north) then rotated to match the current compass heading. */
  static GPoint arrow_points[] = {
    {0, -8}, {5, 6}, {0, 3}, {-5, 6}
  };
  static GPathInfo arrow_info = {
    .num_points = 4,
    .points = arrow_points,
  };
  GPath *user_arrow = gpath_create(&arrow_info);
  gpath_move_to(user_arrow, user_screen);
  gpath_rotate_to(user_arrow, TRIG_MAX_ANGLE - s_app->compass_heading);

#ifdef PBL_COLOR
  graphics_context_set_fill_color(ctx, GColorBlue);
#else
  graphics_context_set_fill_color(ctx, GColorBlack);
#endif
  gpath_draw_filled(ctx, user_arrow);
  graphics_context_set_stroke_color(ctx, GColorWhite);
  gpath_draw_outline(ctx, user_arrow);
  gpath_destroy(user_arrow);

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

/* Updates compass heading and redraws the map to reflect the new FOV direction. */
static void map_compass_handler(CompassHeadingData heading_data) {
  s_app->compass_heading = heading_data.magnetic_heading;
  if (s_map_layer) {
    layer_mark_dirty(s_map_layer);
  }
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

  compass_service_subscribe(map_compass_handler);
  compass_service_set_heading_filter(DEG_TO_TRIGANGLE(5));
}

static void window_unload(Window *window) {
  (void)window;
  compass_service_unsubscribe();

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
