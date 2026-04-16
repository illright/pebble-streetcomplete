#pragma once

#include "../../app_state.h"

/** Pushes a brief "Skipped!" confirmation screen, then pops back to the
 *  main waiting window after a short delay. */
void skipped_window_push(AppState *app);
