/**
 * Composer public surface.
 *
 * Re-exports the exact API of the former `composer.tsx` single file: the
 * attachment type + accepted-input constants, plus the provider component and
 * its `useComposer` hook. Keeps both the barrel and deep
 * `./` importers resolving unchanged.
 */

export {
  ACCEPTED_FILES,
  type FileAttachment,
  
} from "./attachments";
export { AiComposerProvider, useComposer } from "./provider";
