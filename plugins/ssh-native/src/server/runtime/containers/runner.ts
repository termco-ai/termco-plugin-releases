/**
 * Generic CLI runner for container-runtime binaries (docker / podman /
 * container). Adapted from ../git/runner.ts: spawns the binary directly with an
 * argument array (never a shell string, so container ids can't inject), bounds
 * stdout/stderr, and enforces a timeout with SIGKILL.
 */
import { spawn } from "node:child_process";

export const DEFAULT_TIMEOUT_SECS = 20;
export const MAX_TIMEOUT_SECS = 60;
export const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
/** Logs get a bigger budget so a large `--tail` isn't truncated. */
export const LOG_MAX_BYTES = 16 * 1024 * 1024;

export interface CliOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  timedOut: boolean;
  truncated: boolean;
  /** True when the binary itself could not be spawned (ENOENT etc.). */
  spawnError: boolean;
}

const HARDENED_ENV = {
  // Keep CLI output stable and machine-parseable regardless of user locale.
  LC_ALL: "C",
  // Never let a runtime prompt for credentials on our non-interactive stdio.
  DOCKER_CLI_HINTS: "false",
};

function boundedConcat(
  chunks: Buffer[],
  cap: number,
  keepTail = false,
): { text: string; truncated: boolean } {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  if (total <= cap) {
    return { text: Buffer.concat(chunks).toString("utf8"), truncated: false };
  }
  // Over the cap. Logs want the NEWEST bytes (keepTail); everything else keeps
  // the first `cap` bytes as before.
  if (keepTail) {
    const all = Buffer.concat(chunks);
    return { text: all.subarray(all.length - cap).toString("utf8"), truncated: true };
  }
  let total2 = 0;
  const kept: Buffer[] = [];
  for (const c of chunks) {
    if (total2 >= cap) break;
    const take = Math.min(cap - total2, c.length);
    kept.push(take < c.length ? c.subarray(0, take) : c);
    total2 += take;
  }
  return { text: Buffer.concat(kept).toString("utf8"), truncated: true };
}

/** Per-call output shaping: raise the byte cap and/or keep the tail (logs). */
export interface RunOpts {
  /** Max bytes retained per stream (default {@link MAX_OUTPUT_BYTES}). */
  maxBytes?: number;
  /** On overflow keep the LAST bytes instead of the first — correct for logs. */
  keepTail?: boolean;
}

/**
 * Run a container CLI. Resolves (never rejects) with a structured result;
 * callers inspect `spawnError` / `exitCode` to decide how to react so a missing
 * binary or a downed daemon degrades gracefully instead of throwing.
 */
export function runCli(
  bin: string,
  args: string[],
  timeoutSecs: number = DEFAULT_TIMEOUT_SECS,
  opts: RunOpts = {},
): Promise<CliOutput> {
  const cap = opts.maxBytes ?? MAX_OUTPUT_BYTES;
  const keepTail = opts.keepTail ?? false;
  const dur = Math.min(Math.max(timeoutSecs, 1), MAX_TIMEOUT_SECS) * 1000;
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, args, {
        env: { ...process.env, ...HARDENED_ENV },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      resolve({
        stdout: "",
        stderr: "",
        exitCode: null,
        timedOut: false,
        truncated: false,
        spawnError: true,
      });
      return;
    }

    const outChunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let settled = false;

    child.stdout.on("data", (c: Buffer) => outChunks.push(c));
    child.stderr.on("data", (c: Buffer) => errChunks.push(c));

    const settle = (
      exitCode: number | null,
      timedOut: boolean,
      spawnError: boolean,
    ) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const out = boundedConcat(outChunks, cap, keepTail);
      const err = boundedConcat(errChunks, cap, keepTail);
      resolve({
        stdout: out.text,
        stderr: err.text,
        exitCode,
        timedOut,
        truncated: out.truncated,
        spawnError,
      });
    };

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      settle(null, true, false);
    }, dur);

    // ENOENT (binary not installed) surfaces here rather than the try/catch.
    child.on("error", () => settle(null, false, true));
    child.on("close", (code) => settle(code, false, false));
  });
}

/** Ran successfully with a zero exit code. */
export function ok(out: CliOutput): boolean {
  return !out.spawnError && !out.timedOut && out.exitCode === 0;
}

export interface LogMatch {
  /** 1-based position in the full log stream (approximate across std out/err). */
  line: number;
  text: string;
  /** Up to `context` lines immediately before the match (only when context > 0). */
  before?: string[];
  /** Up to `context` lines immediately after the match (only when context > 0). */
  after?: string[];
}

export interface LogSearchResult {
  matches: LogMatch[];
  /** Lines scanned before stopping. */
  scanned: number;
  /** Matches found (may exceed `matches.length` when capped). */
  matched: number;
  /** True when the scan stopped early (match cap or timeout). */
  truncated: boolean;
  spawnError: boolean;
  timedOut: boolean;
}

export interface LogSearchOpts {
  query: string;
  /** Case-insensitive match (default true). */
  ignoreCase?: boolean;
  /** Treat `query` as a JS regular expression instead of a substring. */
  regex?: boolean;
  /** Include up to N lines of context before and after each match (default 0). */
  context?: number;
  maxMatches?: number;
  timeoutSecs?: number;
  maxLineLength?: number;
}

export const DEFAULT_MAX_MATCHES = 2000;
const MAX_LINE_LEN = 2000;
const MAX_CONTEXT = 20;

/**
 * Stream a CLI's stdout+stderr line by line and collect the lines matching
 * `query`, WITHOUT buffering the whole output — so a container's entire log can
 * be searched (even the parts never fetched into the viewer) with bounded
 * memory. Stops early at `maxMatches` (kills the child) or the timeout. Never
 * rejects; inspect `spawnError`/`timedOut`.
 */
export function searchCli(
  bin: string,
  args: string[],
  opts: LogSearchOpts,
): Promise<LogSearchResult> {
  const ignoreCase = opts.ignoreCase !== false;
  const needle = ignoreCase ? opts.query.toLowerCase() : opts.query;
  const context = Math.max(0, Math.min(opts.context ?? 0, MAX_CONTEXT));
  // Compile the regex up front; an invalid pattern falls back to a substring
  // match so a bad query still returns *something* rather than crashing.
  let re: RegExp | null = null;
  if (opts.regex) {
    try {
      re = new RegExp(opts.query, ignoreCase ? "i" : "");
    } catch {
      re = null;
    }
  }
  const isMatch = (line: string): boolean => {
    if (re) return re.test(line);
    return (ignoreCase ? line.toLowerCase() : line).includes(needle);
  };
  const maxMatches = opts.maxMatches ?? DEFAULT_MAX_MATCHES;
  const maxLineLen = opts.maxLineLength ?? MAX_LINE_LEN;
  const dur =
    Math.min(Math.max(opts.timeoutSecs ?? DEFAULT_TIMEOUT_SECS, 1), MAX_TIMEOUT_SECS) *
    1000;

  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(bin, args, {
        env: { ...process.env, ...HARDENED_ENV },
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch {
      resolve({
        matches: [],
        scanned: 0,
        matched: 0,
        truncated: false,
        spawnError: true,
        timedOut: false,
      });
      return;
    }

    const matches: LogMatch[] = [];
    let scanned = 0;
    let matched = 0;
    let buffer = "";
    let capped = false;
    let timedOut = false;
    let settled = false;
    // Rolling window of the last `context` line texts, and matches still
    // collecting their trailing context.
    const recent: string[] = [];
    const pendingAfter: { m: LogMatch; need: number }[] = [];

    const consider = (raw: string) => {
      if (capped) return;
      const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
      scanned += 1;
      const text =
        line.length > maxLineLen ? `${line.slice(0, maxLineLen)}…` : line;

      // Feed this line as trailing context to any earlier matches still waiting.
      if (pendingAfter.length > 0) {
        for (let i = pendingAfter.length - 1; i >= 0; i--) {
          pendingAfter[i].m.after?.push(text);
          if (--pendingAfter[i].need <= 0) pendingAfter.splice(i, 1);
        }
      }

      if (isMatch(line)) {
        matched += 1;
        if (matches.length < maxMatches) {
          const m: LogMatch = { line: scanned, text };
          if (context > 0) {
            m.before = recent.slice();
            m.after = [];
            pendingAfter.push({ m, need: context });
          }
          matches.push(m);
        }
        if (matches.length >= maxMatches) {
          capped = true;
          child.kill("SIGKILL");
        }
      }

      if (context > 0) {
        recent.push(text);
        if (recent.length > context) recent.shift();
      }
    };

    const onData = (c: Buffer) => {
      if (capped) return;
      buffer += c.toString("utf8");
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        consider(buffer.slice(0, nl));
        buffer = buffer.slice(nl + 1);
        if (capped) return;
        nl = buffer.indexOf("\n");
      }
    };

    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    const settle = (spawnError: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (!capped && buffer.length > 0) consider(buffer);
      resolve({
        matches,
        scanned,
        matched,
        truncated: capped || timedOut,
        spawnError,
        timedOut,
      });
    };

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
      settle(false);
    }, dur);

    child.on("error", () => settle(true));
    child.on("close", () => settle(false));
  });
}
