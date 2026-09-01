/**
 * Rich body for `ls`: real filesystem entries, clickable (folder chips
 * drill the Explorer, file chips open an editor tab).
 *
 * Two presentations, chosen by the flags the user typed:
 * - short format → wrapping chips (with size/date tooltips),
 * - long format (`-l`) → one detail row per entry keeping the printed
 *   permissions/owner/size/date VERBATIM from the command's own output
 *   (so `-h` sizes, locale dates and `-t`/`-S`/`-r` ordering survive).
 * `-a`/`-A` includes dotfiles. If the long output can't be parsed the
 * widget yields back to the block's real terminal rows.
 */
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "../../../../ui";
import type { DirEntry } from "../../../../nativeTypes";
import type { WorkspaceEnv } from "../../../../runtime";
import {
  File01Icon,
  Folder01Icon,
  Link04Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { terminalRuntime } from "../../../../runtime";
import { useEffect, useState } from "react";
import { openFileFromBlock, openFolderFromBlock } from "../../lib/blockEvents";
import {
  isLongFormat,
  type LsLongRow,
  parseLsLong,
  wantsHidden,
} from "../../lib/lsLong";
import { fmtBytes, fmtMtime } from "../../lib/overlayFormat";

const MAX_CHIPS = 120;
const MAX_ROWS = 500;

/**
 * The directory an `ls` invocation lists, relative to cwd. Null when the
 * command shape is unsupported (multiple targets, globs) — caller falls
 * back to plain rows.
 */
export function lsTarget(command: string): string | null {
  const args = command.trim().split(/\s+/).slice(1);
  const targets = args.filter((a) => !a.startsWith("-"));
  if (targets.length === 0) return ".";
  if (targets.length > 1) return null;
  const t = targets[0];
  if (/[*?[\]{}~$]/.test(t)) return null;
  return t;
}

export function joinPath(cwd: string, rel: string): string {
  if (rel.startsWith("/")) return rel;
  // Stripping the trailing slash off "/" (or an all-slashes cwd) leaves "",
  // which must round-trip back to the root — never an empty path (that would
  // scandir "" and error). `${base}/${rel}` already yields "/rel" when base
  // is "", so only the `.` case needs the explicit root fallback.
  const base = cwd.replace(/\/+$/, "");
  if (rel === ".") return base || "/";
  return `${base}/${rel.replace(/^\.\//, "")}`;
}

/** Full listing (dotfiles included) — the widget filters per ls flags. */
function readDirAll(path: string, env: WorkspaceEnv): Promise<DirEntry[]> {
  return terminalRuntime().files.readDir(path, true, undefined, env);
}

function iconFor(kind: DirEntry["kind"] | undefined) {
  if (kind === "dir") return Folder01Icon;
  if (kind === "symlink") return Link04Icon;
  return File01Icon;
}

function open(
  path: string,
  kind: DirEntry["kind"] | undefined,
  env: WorkspaceEnv,
): void {
  if (kind === "dir") openFolderFromBlock(path, env);
  else openFileFromBlock(path);
}

export function FilesWidget({
  cwd,
  env,
  command,
  readOutput,
  onEmpty,
}: {
  cwd: string;
  env: WorkspaceEnv;
  command: string;
  readOutput: () => string;
  onEmpty: () => void;
}) {
  const [entries, setEntries] = useState<DirEntry[] | null>(null);
  const target = lsTarget(command) ?? ".";
  const dir = joinPath(cwd || "/", target);
  const long = isLongFormat(command);
  const all = wantsHidden(command);

  useEffect(() => {
    let alive = true;
    readDirAll(dir, env)
      .then((list) => {
        if (!alive) return;
        const scoped = all ? list : list.filter((e) => !e.name.startsWith("."));
        if (scoped.length === 0) {
          onEmpty();
          return;
        }
        setEntries(scoped);
      })
      .catch(() => {
        if (alive) onEmpty();
      });
    return () => {
      alive = false;
    };
  }, [dir, env, all, onEmpty]);

  if (!entries) return null;
  return long ? (
    <LongRows
      dir={dir}
      env={env}
      entries={entries}
      readOutput={readOutput}
      onEmpty={onEmpty}
    />
  ) : (
    <Chips dir={dir} env={env} entries={entries} />
  );
}

function Chips({
  dir,
  env,
  entries,
}: {
  dir: string;
  env: WorkspaceEnv;
  entries: DirEntry[];
}) {
  const sorted = [...entries].sort((a, b) => {
    const ad = a.kind === "dir" ? 0 : 1;
    const bd = b.kind === "dir" ? 0 : 1;
    return ad - bd || a.name.localeCompare(b.name);
  });
  const shown = sorted.slice(0, MAX_CHIPS);
  const more = sorted.length - shown.length;

  return (
    <div className="tb-files">
      {shown.map((e) => {
        const detail = [
          e.kind === "dir" ? "folder" : e.kind,
          e.kind !== "dir" ? fmtBytes(e.size) : null,
          fmtMtime(e.mtime),
        ]
          .filter(Boolean)
          .join(" · ");
        return (
          <Tooltip key={e.name} delayDuration={500}>
            <TooltipTrigger asChild>
              <button
                type="button"
                className="tb-chip"
                onClick={() => open(joinPath(dir, e.name), e.kind, env)}
              >
                <HugeiconsIcon
                  icon={iconFor(e.kind)}
                  size={13}
                  strokeWidth={1.75}
                  className={e.kind === "dir" ? "tb-chip-dir" : undefined}
                />
                <span className="tb-chip-name">{e.name}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs">
              {detail}
            </TooltipContent>
          </Tooltip>
        );
      })}
      {more > 0 && <span className="tb-chip">+{more} more</span>}
    </div>
  );
}

function LongRows({
  dir,
  env,
  entries,
  readOutput,
  onEmpty,
}: {
  dir: string;
  env: WorkspaceEnv;
  entries: DirEntry[];
  readOutput: () => string;
  onEmpty: () => void;
}) {
  const [rows, setRows] = useState<LsLongRow[] | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: content is immutable once the block finished — parse once on mount
  useEffect(() => {
    const parsed = parseLsLong(
      readOutput(),
      entries.map((e) => e.name),
    );
    if (!parsed) onEmpty();
    else setRows(parsed.slice(0, MAX_ROWS));
  }, []);

  if (!rows) return null;
  const kinds = new Map(entries.map((e) => [e.name, e.kind]));

  return (
    <div className="tb-ls">
      {rows.map((r, i) => {
        const kind = kinds.get(r.name);
        return (
          <button
            type="button"
            // biome-ignore lint/suspicious/noArrayIndexKey: rows are static once parsed; names can repeat via unverified guesses
            key={`${r.name}:${i}`}
            className={
              r.name.startsWith(".") ? "tb-ls-row tb-ls-dot" : "tb-ls-row"
            }
            disabled={!r.verified}
            title={`${r.perms} ${r.meta}`}
            onClick={() => open(joinPath(dir, r.name), kind, env)}
          >
            <HugeiconsIcon
              icon={iconFor(kind)}
              size={13}
              strokeWidth={1.75}
              className={kind === "dir" ? "tb-chip-dir" : "tb-ls-fileicon"}
            />
            <span className="tb-ls-name">
              {r.name}
              {r.linkTarget && (
                <span className="tb-ls-link"> → {r.linkTarget}</span>
              )}
            </span>
            {r.parts ? (
              <>
                <span className="tb-ls-size">{r.parts.size}</span>
                <span className="tb-ls-date">{r.parts.date}</span>
                <span className="tb-ls-owner">{r.parts.owner}</span>
                <span className="tb-ls-perms">{r.perms}</span>
              </>
            ) : (
              <span className="tb-ls-rest">
                {r.perms} {r.meta}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
