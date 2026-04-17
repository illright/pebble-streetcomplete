#pragma once

#include "../app_state.h"

void comm_init(AppState *app);
void comm_send_answer(const char *answer_value);
void comm_send_skip(uint8_t skip_type);
void comm_send_dismiss(void);
void comm_send_retry_fetch(void);
