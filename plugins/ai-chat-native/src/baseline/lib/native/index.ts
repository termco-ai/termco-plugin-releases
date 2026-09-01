/**
 * Native bridge public surface.
 *
 * Re-exports the full API of the former `native.ts` single file: every wire
 * result type plus the `native` command object. Keeps both the barrel and
 * deep `./` importers resolving unchanged.
 */

export { native } from "./native";
export * from "./types";
