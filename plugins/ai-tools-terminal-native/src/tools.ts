import type {
  AiToolContribution,
  AiToolDefinition,
  AiToolRuntime,
} from "@termco/ai-tools-base";
import type { ShellExecutionCapability } from "@termco/terminal-base";
import type { WorkspaceEnv } from "@termco/workspace-base";
import { checkShellCommand, isCatastrophicShellCommand } from "./security";
import { truncateTerminalOutput } from "./truncate";

const EMPTY = { type: "object", properties: {}, additionalProperties: false };

type ApprovalSafeToolDefinition = AiToolDefinition & {
  alwaysNeedsApproval?: (input: unknown) => boolean;
};

function values(input: unknown): Record<string, unknown> {
  return input && typeof input === "object" ? input as Record<string, unknown> : {};
}

function definition(
  description: string,
  inputSchema: Record<string, unknown>,
  execute: (input: Record<string, unknown>) => unknown | Promise<unknown>,
  needsApproval = false,
  alwaysNeedsApproval?: (input: unknown) => boolean,
): ApprovalSafeToolDefinition {
  return {
    description,
    inputSchema,
    execute: (input) => execute(values(input)),
    ...(needsApproval ? { needsApproval: true } : {}),
    ...(alwaysNeedsApproval ? { alwaysNeedsApproval } : {}),
  };
}

function environment(runtime: AiToolRuntime): WorkspaceEnv {
  return runtime.getWorkspaceEnv?.() ?? { kind: "local" };
}

function scopeKey(runtime: AiToolRuntime): string {
  const env = environment(runtime);
  if (!env || env.kind === "local") return "local";
  if (env.kind === "wsl") return `wsl:${env.distro}`;
  return `ssh:${env.connectionId}`;
}

type SessionRunResult = {
  stdout?: unknown;
  stderr?: unknown;
  exit_code?: unknown;
  timed_out?: unknown;
  truncated?: unknown;
  cwd_after?: unknown;
};

export class TerminalToolSet {
  readonly #sessions = new Map<string, Promise<number>>();

  constructor(private readonly shell: ShellExecutionCapability) {}

  async dispose(): Promise<void> {
    const sessions = [...this.#sessions.values()];
    this.#sessions.clear();
    await Promise.allSettled(
      sessions.map(async (session) => this.shell.sessionClose(await session)),
    );
  }

  contributions(): AiToolContribution[] {
    return [
      { id: "shell", group: "terminal", order: 40, build: (runtime) => this.shellTools(runtime) },
      { id: "terminal", group: "terminal", order: 100, build: (runtime) => this.terminalTools(runtime) },
      { id: "view", group: "terminal", order: 120, build: (runtime) => this.viewTools(runtime) },
    ];
  }

  private async session(runtime: AiToolRuntime, cwd: string | null): Promise<number> {
    const sessionId = runtime.getSessionId?.();
    if (!sessionId) throw new Error("no active chat session");
    const key = `${sessionId}:${scopeKey(runtime)}`;
    let opened = this.#sessions.get(key);
    if (!opened) {
      opened = this.shell.sessionOpen(cwd ?? undefined, environment(runtime));
      this.#sessions.set(key, opened);
      opened.catch(() => {
        if (this.#sessions.get(key) === opened) this.#sessions.delete(key);
      });
    }
    return opened;
  }

  shellTools(runtime: AiToolRuntime): Record<string, AiToolDefinition> {
    return {
      bash_run: definition(
        "Run a foreground command in this chat session's persistent private shell. Its directory persists across calls. Prefer dedicated file/search tools; never invoke interactive programs. Asks for approval unless Auto run is enabled; catastrophic commands always ask.",
        { type: "object", properties: { command: { type: "string" }, timeout_secs: { type: "integer", minimum: 1, maximum: 300 } }, required: ["command"], additionalProperties: false },
        async ({ command, timeout_secs }) => {
          const value = String(command ?? "");
          const safety = checkShellCommand(value);
          if (!safety.ok) return { error: safety.reason };
          const cwd = runtime.getCwd?.() ?? null;
          try {
            const id = await this.session(runtime, cwd);
            const result = await this.shell.sessionRun(
              id,
              value,
              cwd ?? undefined,
              typeof timeout_secs === "number" ? timeout_secs : undefined,
              environment(runtime),
            ) as SessionRunResult;
            if (typeof result.cwd_after === "string" && result.cwd_after !== cwd) runtime.setWorkspaceFolder?.(result.cwd_after);
            return {
              command: value,
              stdout: result.stdout,
              stderr: result.stderr,
              exit_code: result.exit_code,
              timed_out: result.timed_out,
              truncated: result.truncated,
              cwd_after: result.cwd_after,
            };
          } catch (error) { return { error: String(error) }; }
        },
        true,
        (input) => isCatastrophicShellCommand(
          String((input as { command?: unknown })?.command ?? ""),
        ),
      ),
      bash_background: definition(
        "Spawn a long-running process through the shared application shell provider. Returns a handle for bash_logs and bash_kill. Asks for approval unless Auto run is enabled; catastrophic commands always ask.",
        { type: "object", properties: { command: { type: "string" }, cwd: { anyOf: [{ type: "string" }, { type: "null" }] } }, required: ["command"], additionalProperties: false },
        async ({ command, cwd }) => {
          const value = String(command ?? "");
          const safety = checkShellCommand(value);
          if (!safety.ok) return { error: safety.reason };
          const target = typeof cwd === "string" ? cwd : runtime.getCwd?.() ?? undefined;
          try {
            const handle = await this.shell.backgroundSpawn(value, target ?? undefined, environment(runtime));
            return { handle, command: value, cwd: target ?? null, ok: true };
          } catch (error) { return { error: String(error) }; }
        },
        true,
        (input) => isCatastrophicShellCommand(
          String((input as { command?: unknown })?.command ?? ""),
        ),
      ),
      bash_logs: definition(
        "Read accumulated logs from a bash_background process, optionally from a previous byte offset.",
        { type: "object", properties: { handle: { type: "integer" }, since_offset: { type: "integer" } }, required: ["handle"], additionalProperties: false },
        async ({ handle, since_offset }) => {
          try { return await this.shell.backgroundLogs(Number(handle), typeof since_offset === "number" ? since_offset : undefined); }
          catch (error) { return { error: String(error) }; }
        },
      ),
      bash_list: definition(
        "List all background processes owned by the shared application shell provider. Call before starting a dev server to avoid duplicates.",
        EMPTY,
        () => ({ processes: this.shell.backgroundList() }),
      ),
      bash_kill: definition(
        "Terminate a shared background process by handle. The operation is idempotent.",
        { type: "object", properties: { handle: { type: "integer" } }, required: ["handle"], additionalProperties: false },
        async ({ handle }) => {
          try { await this.shell.backgroundKill(Number(handle)); return { handle, ok: true }; }
          catch (error) { return { error: String(error) }; }
        },
      ),
    };
  }

  terminalTools(runtime: AiToolRuntime): Record<string, AiToolDefinition> {
    return {
      terminal_run: definition(
        "Run a command in the USER'S VISIBLE active terminal and return its output and resulting directory. Use only when a terminal is already visible or the user explicitly asks to watch it. Asks unless Auto run is enabled; catastrophic commands always ask.",
        { type: "object", properties: { command: { type: "string", description: "One visible line without a trailing newline." } }, required: ["command"], additionalProperties: false },
        async ({ command }) => {
          const visible = runtime.getActiveViewKind?.();
          if (visible != null && visible !== "terminal") return { error: `The visible surface is a ${visible}, not a terminal — use bash_run for private work.` };
          const raw = String(command ?? "");
          const safety = checkShellCommand(raw);
          if (!safety.ok) return { error: safety.reason };
          const oneLine = raw.replace(/\r?\n/g, " ").trim();
          if (/[\x00-\x1f\x7f]/.test(oneLine)) return { error: "command must be a single line without control bytes" };
          if (runtime.runInTerminal) {
            const result = await runtime.runInTerminal(oneLine);
            return "error" in result ? result : { ran: oneLine, output: result.output, cwd: result.cwd };
          }
          if (!runtime.injectIntoActivePty?.(`${oneLine}\r`)) return { error: "no active terminal to run in" };
          return { ran: oneLine, note: "typed into the active terminal; call get_terminal_output to read the result" };
        },
        true,
        (input) => isCatastrophicShellCommand(
          String((input as { command?: unknown })?.command ?? ""),
        ),
      ),
      suggest_command: definition(
        "Propose one shell command as an insertable chat card. It never writes to or executes in a terminal automatically.",
        { type: "object", properties: { command: { type: "string" }, explanation: { type: "string" } }, required: ["command"], additionalProperties: false },
        ({ command, explanation }) => {
          const raw = String(command ?? "");
          const safety = checkShellCommand(raw);
          if (!safety.ok) return { error: safety.reason };
          if (/[\x00-\x1f\x7f]/.test(raw)) return { error: "command must be a single line without control bytes" };
          return { command: raw, ...(typeof explanation === "string" ? { explanation } : {}) };
        },
      ),
      get_terminal_output: definition(
        "Return the requested tail of the active terminal scrollback. Returns nothing in Privacy mode.",
        { type: "object", properties: { lines: { type: "integer", minimum: 1, maximum: 2000, default: 80 } }, additionalProperties: false },
        ({ lines }) => {
          if (runtime.isActiveTerminalPrivate?.()) return { error: "active terminal is in Privacy mode; its buffer is withheld." };
          const buffer = runtime.getTerminalContext?.();
          if (!buffer) return { output: "", note: "no active terminal" };
          const count = typeof lines === "number" ? lines : 80;
          const all = buffer.split("\n");
          const tail = all.length <= count ? buffer : all.slice(-count).join("\n");
          return { output: truncateTerminalOutput(tail), lines_returned: Math.min(all.length, count) };
        },
      ),
      open_preview: definition(
        "Open an in-app preview for a localhost development server. External sites are intentionally refused.",
        { type: "object", properties: { url: { type: "string", format: "uri" } }, required: ["url"], additionalProperties: false },
        ({ url }) => {
          const raw = String(url ?? "");
          let parsed: URL;
          try { parsed = new URL(raw); } catch { return { error: "invalid URL", url: raw }; }
          if (!['http:', 'https:'].includes(parsed.protocol)) return { error: "only http/https URLs are allowed", url: raw };
          const host = parsed.hostname;
          const local = host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host === "[::1]" || host === "::1" || host.endsWith(".localhost");
          if (!local) return { error: "open_preview is restricted to localhost URLs.", url: raw };
          if (!runtime.openPreview?.(raw)) return { error: "preview surface unavailable", url: raw };
          return { url: raw, ok: true };
        },
      ),
    };
  }

  viewTools(runtime: AiToolRuntime): Record<string, AiToolDefinition> {
    return {
      list_tabs: definition(
        "List every visible workspace tab with id, kind, title, and active state.",
        EMPTY,
        () => ({ tabs: runtime.listTabs?.() ?? [] }),
      ),
      focus_view: definition(
        "Bring an existing tab kind or id to the foreground. A terminal may be created when kind is terminal.",
        { type: "object", properties: { kind: { type: "string" }, id: { type: "integer" } }, additionalProperties: false },
        ({ kind, id }) => {
          const targetKind = typeof kind === "string" ? kind : undefined;
          const targetId = typeof id === "number" ? id : undefined;
          if (targetId == null && !targetKind) return { error: "pass a tab `id` or a `kind` to bring forward" };
          if (!runtime.focusView) return { error: "view switching isn't available in this chat session." };
          const result = runtime.focusView({ id: targetId, kind: targetKind });
          if (!result.ok) return { error: targetId != null ? `No tab with id ${targetId}.` : `No ${targetKind} tab is open.` };
          return { ok: true, active_view: runtime.getActiveViewKind?.() ?? null, created: result.created ?? false };
        },
      ),
    };
  }
}
