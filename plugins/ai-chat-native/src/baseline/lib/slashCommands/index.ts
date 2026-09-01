/**
 * Slash-commands public surface — re-exports the registry, marker helpers, and
 * dispatcher so existing `./` imports stay valid.
 */
export type { SlashCommandMeta,  } from "./registry";
export {
  SLASH_COMMANDS,
  TERMCO_CMD_RE,
  
} from "./registry";
export { tryRunSlashCommand } from "./runSlashCommand";
