import type {
  AiToolContribution,
  AiToolDefinition,
} from "@termco/ai-tools-base";
import type { DesktopIntegrationCapability } from "@termco/desktop-base";
import type { ShellHistoryCapability } from "@termco/terminal-base";
import type { WorkspaceEnv } from "@termco/workspace-base";

export interface SystemToolContext {
  getCwd(): string | null;
  getWorkspaceEnv?(): WorkspaceEnv;
}

function resolvePath(path: string, cwd: string | null): string {
  if (path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path)) return path;
  if (!cwd) {
    throw new Error(
      `cannot resolve relative path "${path}": no active terminal cwd. Pass an absolute path.`,
    );
  }
  const separator = cwd.includes("\\") && !cwd.includes("/") ? "\\" : "/";
  return cwd.endsWith(separator) ? `${cwd}${path}` : `${cwd}${separator}${path}`;
}

function values(input: unknown): Record<string, unknown> {
  return input && typeof input === "object"
    ? (input as Record<string, unknown>)
    : {};
}

export function buildSystemTools(
  desktop: DesktopIntegrationCapability,
  history: ShellHistoryCapability,
  context: SystemToolContext,
): Record<string, AiToolDefinition> {
  return {
    notify_user: {
      description:
        "Send an OS notification to the user. Use after a long task finishes or something needs attention.",
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "Notification body text." },
          title: { type: "string", description: "Optional notification title." },
        },
        required: ["message"],
        additionalProperties: false,
      },
      async execute(input) {
        const { message, title } = values(input);
        try {
          await Promise.resolve(
            desktop.notify(
              typeof title === "string" ? title : "Termco AI",
              String(message ?? ""),
            ),
          );
          return { ok: true };
        } catch (error) {
          return { error: String(error) };
        }
      },
    },
    read_clipboard: {
      description:
        "Read the user's current clipboard text when they refer to something they copied.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      async execute() {
        try {
          const text = await Promise.resolve(desktop.readClipboardText());
          return { text };
        } catch (error) {
          return { error: String(error) };
        }
      },
    },
    write_clipboard: {
      description: "Set the user's clipboard to the given text.",
      inputSchema: {
        type: "object",
        properties: { text: { type: "string", description: "Clipboard text." } },
        required: ["text"],
        additionalProperties: false,
      },
      async execute(input) {
        try {
          await Promise.resolve(
            desktop.writeClipboardText(String(values(input).text ?? "")),
          );
          return { ok: true };
        } catch (error) {
          return { error: String(error) };
        }
      },
    },
    command_history: {
      description:
        "List recent shell commands, most recent first, optionally filtered by a substring.",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string", description: "Substring filter." },
          limit: {
            type: "integer",
            minimum: 1,
            maximum: 1000,
            description: "Maximum entries to return.",
          },
        },
        additionalProperties: false,
      },
      async execute(input) {
        const { query, limit } = values(input);
        try {
          const entries = await history.list(
            typeof query === "string" ? query : "",
            typeof limit === "number" ? limit : undefined,
            context.getWorkspaceEnv?.() ?? { kind: "local" },
          );
          return { entries };
        } catch (error) {
          return { error: String(error) };
        }
      },
    },
    reveal_in_os: {
      description:
        "Reveal a file or directory in the OS file manager, selecting it.",
      inputSchema: {
        type: "object",
        properties: {
          path: {
            type: "string",
            description: "Absolute path, or relative to the active terminal cwd.",
          },
        },
        required: ["path"],
        additionalProperties: false,
      },
      async execute(input) {
        const rawPath = String(values(input).path ?? "");
        let path: string;
        try {
          path = resolvePath(rawPath, context.getCwd());
        } catch (error) {
          return { error: String(error), path: rawPath };
        }
        try {
          await Promise.resolve(desktop.revealItem(path));
          return { ok: true, path };
        } catch (error) {
          return {
            error: `${String(error)} — check the path exists before revealing it.`,
            path,
          };
        }
      },
    },
  };
}

export function createSystemToolContribution(
  desktop: DesktopIntegrationCapability,
  history: ShellHistoryCapability,
): AiToolContribution {
  return {
    id: "system",
    group: "system",
    order: 80,
    build: (context) =>
      buildSystemTools(desktop, history, context as SystemToolContext),
  };
}
