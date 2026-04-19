#include "breadcrumbs.h"

typedef struct {
  uint8_t depth;
  uint8_t current;
} BreadcrumbData;

#define DOT_RADIUS 4
#define DOT_SPACING 14

/** Draws vertically-centered dots indicating the current menu depth. */
static void breadcrumbs_update(Layer *layer, GContext *ctx) {
  BreadcrumbData *data = (BreadcrumbData *)layer_get_data(layer);
  GRect bounds = layer_get_bounds(layer);

  /* Dark background strip */
  graphics_context_set_fill_color(ctx, GColorBlack);
  graphics_fill_rect(ctx, bounds, 0, GCornerNone);

#ifdef PBL_ROUND
  int16_t total_h = (int16_t)(data->depth - 1) * DOT_SPACING;
  int16_t top_y = (bounds.size.h - total_h) / 2;
#else
  int16_t top_y = DOT_RADIUS + 4;
#endif
  int16_t cx = bounds.size.w / 2;

  for (uint8_t i = 0; i < data->depth; i++) {
    int16_t cy = top_y + i * DOT_SPACING;
    if (i == data->current) {
      /* Active level: filled white circle */
      graphics_context_set_fill_color(ctx, GColorWhite);
      graphics_fill_circle(ctx, GPoint(cx, cy), DOT_RADIUS);
    } else {
      /* Inactive level: hollow white circle */
      graphics_context_set_stroke_color(ctx, GColorWhite);
      graphics_context_set_stroke_width(ctx, 1);
      graphics_draw_circle(ctx, GPoint(cx, cy), DOT_RADIUS - 1);
    }
  }
}

Layer *breadcrumbs_layer_create(GRect bounds, uint8_t depth, uint8_t current) {
  Layer *layer = layer_create_with_data(
    GRect(0, 0, BREADCRUMB_WIDTH, bounds.size.h),
    sizeof(BreadcrumbData)
  );
  BreadcrumbData *data = (BreadcrumbData *)layer_get_data(layer);
  data->depth = depth;
  data->current = current;
  layer_set_update_proc(layer, breadcrumbs_update);
  return layer;
}

GRect breadcrumbs_menu_bounds(GRect window_bounds) {
  return GRect(
    BREADCRUMB_WIDTH, 0,
    window_bounds.size.w - BREADCRUMB_WIDTH, window_bounds.size.h
  );
}
