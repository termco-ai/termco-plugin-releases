import { createKernelEvents } from "@termco/kernel";
import type { ApplicationEventsCapability } from "@termco/events-base";

export function createApplicationEvents(): ApplicationEventsCapability {
  return createKernelEvents();
}
