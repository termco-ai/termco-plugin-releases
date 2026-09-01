/**
 * Path- and command-safety guards for AI tool calls.
 *
 * Public surface preserved from the former single-file `lib/security.ts`; the
 * frozen deny-list literals now live in `./patterns` (see the security-contract
 * note there).
 */

export {
  checkReadable,
  checkReadableCanonical,
  checkWritable,
  checkWritableCanonical,
} from "./pathChecks";
export { checkShellCommand } from "./shellCheck";
;
