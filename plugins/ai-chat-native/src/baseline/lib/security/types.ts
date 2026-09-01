/** Result of a path/command safety check. */
export type SafetyResult = { ok: true } | { ok: false; reason: string };
