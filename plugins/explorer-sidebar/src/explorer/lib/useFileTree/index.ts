/**
 * Public surface of the explorer file-tree hook.
 *
 * Preserves the former `lib/useFileTree.ts` module path (now a folder) so both
 * the barrel-less deep import `@/modules/explorer/lib/useFileTree` used by the
 * source-control panel and the module-internal `./lib/useFileTree` import keep
 * resolving to the identical export set.
 */

export { isUnder } from "./listingDiff";
export {  joinPath } from "./paths";
export type { DirEntry, PendingCreate } from "./types";
export { useFileTree } from "./useFileTree";
