
#ifndef SWAP_HUB_CONFIG_H
#define SWAP_HUB_CONFIG_H

#include "secrets.h"

#define FIRMWARE_VERSION "1.0.0"

// Enable only after verifying the relay wiring and safe lock behavior.
#ifndef ENABLE_PHYSICAL_RELAY
#define ENABLE_PHYSICAL_RELAY 0
#endif

#endif
