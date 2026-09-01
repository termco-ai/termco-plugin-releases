/**
 * Termco Server — the remote backend (our analog of VS Code Server, minus the
 * extension host). Speaks the newline-JSON protocol on stdin/stdout and runs
 * fs/git operations natively on the remote, so an SSH space behaves like a local
 * one.
 *
 * It composes the source-owning provider implementations needed by the daemon
 * invoked with an undefined workspace — paths pass through unchanged — so remote
 * results are byte-for-byte the same shape as local. Only the syscall points run
 * here on the remote.
 *
 * IMPORTANT: stdout carries protocol frames only; diagnostics go to stderr.
 */
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import {
  fsCanonicalize,
  fsReadFile,
  fsStat,
  writeFilePreservingPerms,
} from "./runtime/files/file";
import {
  fsCopy,
  fsCreateDir,
  fsCreateFile,
  fsDelete,
  fsRename,
} from "./runtime/files/mutate";
import { configureWorkspace as configureFileWorkspace } from "./runtime/files/runtime";
import {
  fsReadDir,
  listSubdirs,
} from "./runtime/files/tree";
import {
  listAll,
  resolveAdapter,
  resolveId,
} from "./runtime/containers/ops";
import { HistoryState } from "./runtime/history/state";
import {
  bgKill,
  bgList,
  bgLogs,
  bgSpawn,
} from "./runtime/shell/background";
import { runCommand } from "./runtime/shell/oneshot";
import { configureWorkspace as configureShellWorkspace } from "./runtime/shell/runtime";
import {
  sessionClose,
  sessionOpen,
  sessionRun,
} from "./runtime/shell/session";
import {
  b64,
  encodeMessage,
  LineDecoder,
  type RpcMessage,
} from "../protocol";
import { joinDetectedPorts } from "../dockerPorts";
import { listeningPorts } from "./net";
import * as lsp from "./lsp";
import * as search from "./search";
import { createStateHub } from "./stateHub";
import * as watch from "./watch";

const VERSION = "0.1.0";

// The daemon already runs inside the authorized remote account. Its local
// path resolver is therefore the identity function; authorization happened
// when the SSH provider established this server process.
const remoteWorkspace = {
  resolvePath: (path: string) => path,
  toCanonicalDisplay: (path: string) => path,
  authorizeRoot: (path: string) => path,
};
configureFileWorkspace(remoteWorkspace as never);
configureShellWorkspace(remoteWorkspace as never);

function send(m: RpcMessage): void {
  process.stdout.write(encodeMessage(m));
}

/** Push a streaming event on a client-allocated channel (watch, later pty/bg). */
const emit = (channel: number, event: string, data: unknown): void =>
  send({ t: "evt", channel, event, data });

// git output can be binary (`-z` NUL status, binary diffs) → base64 preserves bytes.
function gitRun(cwd: string, args: string[]): Promise<{ stdoutB64: string; stderrB64: string; code: number | null; truncated: boolean }> {
  return new Promise((resolve) => {
    const child = spawn("git", args, {
      cwd: cwd && cwd.length > 0 ? cwd : undefined,
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", GIT_OPTIONAL_LOCKS: "0", LC_ALL: "C" },
    });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    let total = 0;
    let truncated = false;
    const cap = 16 * 1024 * 1024;
    child.stdout.on("data", (c: Buffer) => {
      if (total < cap) {
        out.push(c);
        total += c.length;
      } else {
        // Say so. Dropping output silently turns a partial diff into one that
        // looks complete, which is worse than a big diff.
        truncated = true;
      }
    });
    child.stderr.on("data", (c: Buffer) => err.push(c));
    child.on("error", (e) =>
      resolve({ stdoutB64: "", stderrB64: b64.encode(Buffer.from(String(e))), code: null, truncated: false }),
    );
    child.on("close", (code) =>
      resolve({
        stdoutB64: b64.encode(Buffer.concat(out)),
        stderrB64: b64.encode(Buffer.concat(err)),
        code,
        truncated,
      }),
    );
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type P = any;

const methods: Record<string, (p: P) => unknown | Promise<unknown>> = {
  "sys.ping": () => ({ version: VERSION }),
  "sys.home": () => process.env.HOME || homedir(),

  "fs.readFile": (p) => fsReadFile(p.path),
  "fs.writeFile": (p) => {
    writeFilePreservingPerms(p.path, b64.decode(p.contentB64));
    return null;
  },
  "fs.canonicalize": (p) => fsCanonicalize(p.path),
  "fs.stat": (p) => fsStat(p.path),
  "fs.readDir": (p) => fsReadDir(p.path, !!p.showHidden, p.gitDecorations, undefined),
  "fs.listSubdirs": (p) => listSubdirs(p.path, !!p.showHidden, undefined),
  "fs.createFile": (p) => {
    fsCreateFile(p.path);
    return null;
  },
  "fs.createDir": (p) => {
    fsCreateDir(p.path);
    return null;
  },
  "fs.rename": (p) => {
    fsRename(p.from, p.to);
    return null;
  },
  "fs.delete": (p) => {
    fsDelete(p.path);
    return null;
  },
  "fs.copy": (p) => {
    fsCopy(p.sources, p.destDir);
    return null;
  },

  "git.run": (p) => gitRun(p.cwd, p.args),

  // Remote search via the host's own ripgrep (grep/find fallback).
  "fs.grep": (p) => search.grep(p.pattern, p.root, p.glob, p.caseInsensitive, p.maxResults),
  "fs.glob": (p) => search.glob(p.pattern, p.root, p.maxResults),
  "fs.search": (p) => search.search(p.root, p.query, p.limit, p.showHidden),
  "fs.listFiles": (p) => search.listFiles(p.root, p.limit, p.maxDepth, p.showHidden),

  "fs.watchAdd": (p) => {
    watch.watchAdd(p.paths, p.channel, emit);
    return null;
  },
  "fs.watchRemove": (p) => {
    watch.watchRemove(p.paths);
    return null;
  },

  // Shell exec runs natively on the remote (reuses the client's shell modules).
  "shell.run": (p) => runCommand(p.command, p.cwd, p.timeoutSecs, undefined),
  "shell.sessionOpen": (p) => sessionOpen(p.cwd, undefined),
  "shell.sessionRun": (p) => sessionRun(p.id, p.command, p.cwd, p.timeoutSecs, undefined),
  "shell.sessionClose": (p) => {
    sessionClose(p.id);
    return null;
  },
  "shell.bgSpawn": (p) => bgSpawn(p.command, p.cwd, undefined),
  "shell.bgLogs": (p) => bgLogs(p.handle, p.sinceOffset),
  "shell.bgKill": (p) => {
    bgKill(p.handle);
    return null;
  },
  "shell.bgList": () => bgList(),

  // Shell history — reads the REMOTE user's histories/PATH (server's local).
  "history.suggest": (p) => history.suggest(p.line),
  "history.commands": (p) => history.commands(p.prefix, p.limit),
  "history.list": (p) => history.list(p.query, p.limit),
  "history.record": (p) => {
    history.record(p.command);
    return null;
  },

  // Container runtimes on the remote (docker/podman/apple). Reuses the client's
  // adapters, which shell out to the runtime CLIs — here, the remote's.
  "containers.list": () => listAll(),
  "containers.action": async (p) => {
    await resolveAdapter(p.runtime).action(resolveId(p.id), p.action);
    return null;
  },
  "containers.logs": (p) => resolveAdapter(p.runtime).logs(resolveId(p.id), p.tail ?? 500),
  "containers.logsSearch": (p) =>
    resolveAdapter(p.runtime).logsSearch(resolveId(p.id), String(p.query), {
      maxMatches: typeof p.maxMatches === "number" ? p.maxMatches : undefined,
    }),
  "containers.inspect": (p) => resolveAdapter(p.runtime).inspect(resolveId(p.id)),
  "containers.stats": (p) => resolveAdapter(p.runtime).stats(resolveId(p.id)),
  "containers.imageInspect": (p) =>
    resolveAdapter(p.runtime).imageInspect(String(p.image)),

  // Language servers: dumb stdio proxy + install/detect (see server/src/lsp.ts).
  "lsp.spawn": (p) => lsp.lspSpawn(p, emit),
  "lsp.write": (p) => lsp.lspWrite(p),
  "lsp.kill": (p) => lsp.lspKill(p),
  "lsp.which": (p) => lsp.lspWhich(p),
  "lsp.findRoot": (p) => lsp.lspFindRoot(p),
  "lsp.install": (p) => lsp.lspInstall(p, emit),
  "fmt.exists": (p) => lsp.fmtExists(p),
  "fmt.run": (p) => lsp.fmtRun(p),

  // TCP ports LISTENing on this host — feeds the client's Ports panel.
  "net.listeningPorts": () => listeningPorts(),

  // Push-based host state (containers + ports): the hub collects on its own
  // schedule, remembers the last snapshot across restarts, and emits full
  // per-domain snapshots on the subscribed channel when they change.
  "state.subscribe": async (p) => {
    await stateHub.subscribe(p.channel);
    return null;
  },
  "state.unsubscribe": (p) => {
    stateHub.unsubscribe(p.channel);
    return null;
  },
};

// Ports labeled with the container publishing them — same shape the one-shot
// `ssh_ports_scan` returns, so the client renders hub pushes identically.
async function collectDetectedPorts(): Promise<unknown> {
  const [ports, containers] = await Promise.all([
    listeningPorts(),
    listAll().then((r) => r.containers).catch(() => []),
  ]);
  return joinDetectedPorts(ports, containers);
}

const stateHub = createStateHub({
  domains: [
    { name: "ports", intervalMs: 3_000, collect: collectDetectedPorts },
    { name: "containers", intervalMs: 10_000, collect: () => listAll() },
  ],
  emit,
  cacheFile: `${homedir()}/.termco-server/state-cache.json`,
});

const history = new HistoryState();

const decoder = new LineDecoder();

async function handle(msg: RpcMessage): Promise<void> {
  if (msg.t !== "req") return;
  const handler = methods[msg.method];
  if (!handler) {
    send({ t: "res", id: msg.id, ok: false, error: `unknown method: ${msg.method}` });
    return;
  }
  try {
    send({ t: "res", id: msg.id, ok: true, result: await handler(msg.params ?? {}) });
  } catch (e) {
    send({ t: "res", id: msg.id, ok: false, error: e instanceof Error ? e.message : String(e) });
  }
}

process.stdin.on("data", (chunk: Buffer) => {
  for (const msg of decoder.push(chunk)) void handle(msg);
});
process.stdin.on("end", () => {
  lsp.lspKillAll();
  process.exit(0);
});
process.stdin.on("error", () => {
  lsp.lspKillAll();
  process.exit(1);
});
