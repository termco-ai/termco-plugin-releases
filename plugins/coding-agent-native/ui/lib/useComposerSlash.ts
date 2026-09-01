/** Source-owned by the coding-agent-native plugin.
 * Composer slash-command autocomplete. When the draft is a bare `/token` at the
 * start of the message, this loads the run's custom commands (project + user
 * scope) and exposes the filtered matches, a keyboard-navigable selection, and
 * an `apply` that inserts `/name ` — the CLI expands it when the prompt runs.
 *
 * Kept as a hook so the composer stays declarative; `handleKeyDown` returns true
 * when it consumed the key (so the composer skips its own Enter-to-send).
 */

import { type KeyboardEvent, useEffect, useMemo, useState } from "react";
import { listSlashCommands } from "./client";
import type { SlashCommand } from "./protocol";

const MAX_MATCHES = 8;

export function useComposerSlash({
  cwd,
  enabled,
  draft,
  setDraft,
}: {
  cwd: string | null;
  enabled: boolean;
  draft: string;
  setDraft: (v: string) => void;
}) {
  const [commands, setCommands] = useState<SlashCommand[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!enabled || !cwd) return;
    let alive = true;
    listSlashCommands(cwd)
      .then((c) => alive && setCommands(c))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [enabled, cwd]);

  // The menu is active only when the WHOLE draft is a slash token (no space yet).
  const token = useMemo(() => {
    const m = draft.match(/^\/([\w:-]*)$/);
    return m ? m[1] : null;
  }, [draft]);

  const matches = useMemo(() => {
    if (token === null) return [];
    const q = token.toLowerCase();
    return commands
      .filter((c) => c.name.toLowerCase().includes(q))
      .sort((a, b) => {
        // Prefix matches rank above substring matches.
        const ap = a.name.toLowerCase().startsWith(q) ? 0 : 1;
        const bp = b.name.toLowerCase().startsWith(q) ? 0 : 1;
        return ap - bp || a.name.localeCompare(b.name);
      })
      .slice(0, MAX_MATCHES);
  }, [token, commands]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset selection when the query changes
  useEffect(() => {
    setIndex(0);
  }, [token]);

  const open = token !== null && matches.length > 0;

  const apply = (cmd: SlashCommand) => {
    setDraft(`/${cmd.name} `);
  };

  /** Returns true when it consumed the key. */
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): boolean => {
    if (!open) return false;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndex((i) => (i + 1) % matches.length);
      return true;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndex((i) => (i - 1 + matches.length) % matches.length);
      return true;
    }
    if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      apply(matches[Math.min(index, matches.length - 1)]);
      return true;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      // Clear the leading slash so the menu closes without losing focus.
      setDraft("");
      return true;
    }
    return false;
  };

  return { open, matches, index, setIndex, apply, handleKeyDown };
}
