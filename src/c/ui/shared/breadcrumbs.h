#pragma once

#include <pebble.h>

/** Width in pixels reserved for the breadcrumb dot column. */
#define BREADCRUMB_WIDTH 18

/** Creates a layer that draws breadcrumb navigation dots on the left edge
 *  of the screen.  The current level dot is white; other dots are gray.
 *  @param bounds      The full window bounds (dots are vertically centered).
 *  @param depth       Total number of menu levels.
 *  @param current     Current level (0-based).  */
Layer *breadcrumbs_layer_create(GRect bounds, uint8_t depth, uint8_t current);

/** Returns the MenuLayer-safe bounds after reserving space for breadcrumbs. */
GRect breadcrumbs_menu_bounds(GRect window_bounds);
