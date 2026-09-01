/** Watch backend session directories and debounce transcript refresh events. */

import { existsSync, watch, type FSWatcher } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type SessionWatcher = { close: () => void };

/** Start watching; `onChange` fires at most once per `debounceMs` window. */
export function startSessionWatcher(
  onChange: () => void,
  debounceMs = 800,
): SessionWatcher {
  const roots = [
    join(homedir(), ".claude", "projects"),
    join(homedir(), ".codex", "sessions"),
  ];

  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      onChange();
    }, debounceMs);
  };

  const watchers: FSWatcher[] = [];
  for (const root of roots) {
    if (!existsSync(root)) continue;
    try {
      watchers.push(
        watch(root, { recursive: true }, (_event, filename) => {
          const path = String(filename ?? "");
          if (path.endsWith(".tmp") || path.endsWith(".lock")) return;
          fire();
        }),
      );
    } catch {
      /* watching is best-effort — history still works via manual refresh */
    }
  }

  return {
    close: () => {
      if (timer) clearTimeout(timer);
      for (const watcher of watchers) watcher.close();
    },
  };
}
// Owned by the coding-agent-native provider plugin.
