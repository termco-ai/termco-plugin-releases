import type { ReplayScenarioSource } from "./replay";

/**
 * Recorded scenarios are intentionally opt-in. Deterministic test profiles copy
 * this provider and populate this current-format source rather than reading a
 * production session or silently falling through to a network provider.
 */
export const replayScenarios: readonly ReplayScenarioSource[] = [];

