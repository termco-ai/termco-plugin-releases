/**
 * Owned by the ssh-native provider's deployed remote daemon.
 * Remote file-watching for the Termco Server. Uses node's built-in `fs.watch`
 * (inotify/FSEvents on the remote — no native addon), non-recursive, refcounted
 * per canonical dir, debounced, and emits `changed` events over an RPC channel.
 * The client re-broadcasts them as `fs:changed` so the explorer contract is
 * identical to local.
 */
import { type FSWatcher, realpathSync, statSync, watch as fsWatch } from "node:fs";
import { dirname, join } from "node:path";

type Emit = (channel: number, event: string, data: unknown) => void;

const watchers = new Map<string, { w: FSWatcher; refs: number }>();
let channel: number | null = null;
let emit: Emit = () => {};
let pending = new Set<string>();
let timer: ReturnType<typeof setTimeout> | null = null;

const DEBOUNCE_MS = 150;

function canon(p: string): string | null {
  try {
    const real = realpathSync(p);
    return statSync(real).isDirectory() ? real : dirname(real);
  } catch {
    return null;
  }
}

function schedule(): void {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    if (!pending.size || channel == null) return;
    const paths = [...pending];
    pending = new Set();
    emit(channel, "changed", { paths });
  }, DEBOUNCE_MS);
}

export function watchAdd(paths: string[], ch: number, emitFn: Emit): void {
  channel = ch;
  emit = emitFn;
  for (const p of paths) {
    const dir = canon(p);
    if (!dir) continue;
    const existing = watchers.get(dir);
    if (existing) {
      existing.refs++;
      continue;
    }
    try {
      const w = fsWatch(dir, { persistent: true }, (_ev, filename) => {
        pending.add(filename ? join(dir, filename.toString()) : dir);
        schedule();
      });
      watchers.set(dir, { w, refs: 1 });
    } catch {
      // dir vanished / unreadable — skip
    }
  }
}

export function watchRemove(paths: string[]): void {
  for (const p of paths) {
    const dir = canon(p);
    if (!dir) continue;
    const existing = watchers.get(dir);
    if (!existing) continue;
    if (--existing.refs <= 0) {
      existing.w.close();
      watchers.delete(dir);
    }
  }
}
