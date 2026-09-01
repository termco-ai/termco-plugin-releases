import type {
  AiLibraryMcpServer as McpServerConfig,
} from "@termco/ai-library-base";
import ui from "@termco/ui";
import { parseMcpConfig } from "../forms";
import { Cancel01Icon, NoteIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";

const {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Textarea,
  cn,
} = ui;

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold text-foreground/85">{children}</span>
  );
}

/** Split a command line into args on whitespace (respecting simple quotes). */
function splitArgs(s: string): string[] {
  const out = s.match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  return out.map((a) => a.replace(/^["']|["']$/g, ""));
}

/** Parse `KEY=value` lines into an env record (ignores blanks/comments). */
function parseEnv(s: string): Record<string, string> | undefined {
  const env: Record<string, string> = {};
  for (const line of s.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq <= 0) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return Object.keys(env).length ? env : undefined;
}

type Mode = "form" | "json";
type Kind = "stdio" | "http";

/**
 * Add MCP servers to the library — the Warp-style "add a server" flow. Fill in
 * one server by hand (local stdio, or a remote HTTP URL with auth headers), or
 * paste a `.mcp.json` block to add several at once. Servers added here are
 * global (offered in every chat) and connect on save. Rendering is gated on
 * `open`.
 */
export function McpServerEditorDialog({
  open,
  existingNames,
  onClose,
  onSave,
}: {
  open: boolean;
  existingNames: string[];
  onClose: () => void;
  onSave: (servers: McpServerConfig[]) => void;
}) {
  const [mode, setMode] = useState<Mode>("form");
  const [kind, setKind] = useState<Kind>("stdio");
  const [name, setName] = useState("");
  const [command, setCommand] = useState("");
  const [argsText, setArgsText] = useState("");
  const [envText, setEnvText] = useState("");
  const [url, setUrl] = useState("");
  const [headersText, setHeadersText] = useState("");
  const [transport, setTransport] = useState<"" | "http" | "sse">("");
  const [json, setJson] = useState("");

  // Reset the draft every time the dialog opens.
  useEffect(() => {
    if (open) {
      setMode("form");
      setKind("stdio");
      setName("");
      setCommand("");
      setArgsText("");
      setEnvText("");
      setUrl("");
      setHeadersText("");
      setTransport("");
      setJson("");
    }
  }, [open]);

  const taken = new Set(existingNames);
  const jsonParsed = mode === "json" ? parseMcpConfig(json) : null;

  const nameError = !name.trim()
    ? "Name is required."
    : taken.has(name.trim())
      ? "A server with that name already exists."
      : null;
  const formError =
    nameError ??
    (kind === "stdio" && !command.trim()
      ? "Command is required."
      : kind === "http" && !url.trim()
        ? "URL is required."
        : null);
  const jsonError =
    mode === "json" && json.trim() && jsonParsed?.servers.length === 0
      ? "No runnable servers found in that JSON."
      : null;

  const canSave =
    mode === "form"
      ? !formError
      : (jsonParsed?.servers.length ?? 0) > 0 && !jsonError;

  const save = () => {
    if (mode === "form") {
      const cfg: McpServerConfig =
        kind === "stdio"
          ? {
              name: name.trim(),
              command: command.trim(),
              args: splitArgs(argsText),
              env: parseEnv(envText),
            }
          : {
              name: name.trim(),
              url: url.trim(),
              headers: parseEnv(headersText),
              transport: transport || undefined,
            };
      onSave([cfg]);
    } else if (jsonParsed) {
      onSave(jsonParsed.servers);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="w-[560px] max-w-[calc(100vw-48px)] gap-0 overflow-hidden rounded-xl p-0 sm:max-w-[560px]"
      >
        <div className="flex items-center gap-2.5 border-b border-border/50 px-4 py-3.5">
          <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <HugeiconsIcon icon={NoteIcon} size={15} strokeWidth={1.6} />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-sm font-semibold text-foreground">
              Add MCP server
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Connects on save; offered to the agent in every chat.
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button
              type="button"
              title="Close (Esc)"
              className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
            </button>
          </DialogClose>
        </div>

        <div className="flex gap-1 border-b border-border/50 px-4 pt-3">
          {(["form", "json"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={cn(
                "rounded-t-lg px-3 py-1.5 text-xs font-medium transition-colors",
                mode === m
                  ? "bg-accent text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {m === "form" ? "One server" : "Paste JSON"}
            </button>
          ))}
        </div>

        <div className="flex max-h-[calc(100vh-16rem)] flex-col gap-3.5 overflow-y-auto p-4">
          {mode === "form" ? (
            <>
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Type</FieldLabel>
                <div className="flex gap-1.5">
                  {(
                    [
                      ["stdio", "Local (stdio)"],
                      ["http", "Remote (URL)"],
                    ] as const
                  ).map(([k, label]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setKind(k)}
                      className={cn(
                        "h-[28px] flex-1 rounded-lg border text-xs font-medium transition-colors",
                        kind === k
                          ? "border-primary/40 bg-primary/10 text-primary"
                          : "border-border/70 text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel>Name</FieldLabel>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. filesystem"
                  className="h-[30px] rounded-lg bg-background text-xs"
                />
              </div>
              {kind === "stdio" ? (
                <>
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel>Command</FieldLabel>
                    <Input
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      placeholder="e.g. npx"
                      className="h-[30px] rounded-lg bg-background font-mono text-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel>Arguments</FieldLabel>
                    <Input
                      value={argsText}
                      onChange={(e) => setArgsText(e.target.value)}
                      placeholder="-y @modelcontextprotocol/server-filesystem /path"
                      className="h-[30px] rounded-lg bg-background font-mono text-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel>Environment (KEY=value per line)</FieldLabel>
                    <Textarea
                      value={envText}
                      onChange={(e) => setEnvText(e.target.value)}
                      placeholder={"API_KEY=…\nREGION=eu"}
                      className="min-h-16 resize-y rounded-lg bg-background font-mono text-xs"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel>URL</FieldLabel>
                    <Input
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://mcp.example.com/mcp"
                      className="h-[30px] rounded-lg bg-background font-mono text-xs"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel>Transport</FieldLabel>
                    <select
                      value={transport}
                      onChange={(e) =>
                        setTransport(e.target.value as "" | "http" | "sse")
                      }
                      className="h-[30px] rounded-lg border border-border/70 bg-background px-2.5 text-xs text-foreground outline-none"
                    >
                      <option value="">Auto (Streamable HTTP, then SSE)</option>
                      <option value="http">Streamable HTTP</option>
                      <option value="sse">Legacy HTTP + SSE</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel>Headers (KEY=value per line)</FieldLabel>
                    <Textarea
                      value={headersText}
                      onChange={(e) => setHeadersText(e.target.value)}
                      placeholder={"Authorization=Bearer …"}
                      className="min-h-16 resize-y rounded-lg bg-background font-mono text-xs"
                    />
                  </div>
                </>
              )}
              {formError ? (
                <span className="text-xs text-destructive">{formError}</span>
              ) : null}
            </>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <FieldLabel>.mcp.json</FieldLabel>
                <Textarea
                  value={json}
                  onChange={(e) => setJson(e.target.value)}
                  placeholder={
                    '{\n  "mcpServers": {\n    "filesystem": { "command": "npx", "args": ["-y", "@mcp/fs"] }\n  }\n}'
                  }
                  className="min-h-40 resize-y rounded-lg bg-background font-mono text-xs leading-relaxed"
                />
              </div>
              {jsonParsed && jsonParsed.servers.length > 0 ? (
                <span className="text-xs text-muted-foreground">
                  Adds: {jsonParsed.servers.map((s) => s.name).join(", ")}
                </span>
              ) : null}
              {jsonParsed && jsonParsed.unsupported.length > 0 ? (
                <span className="text-xs text-muted-foreground/70">
                  Skipped (no command or url):{" "}
                  {jsonParsed.unsupported.map((s) => s.name).join(", ")}
                </span>
              ) : null}
              {jsonError ? (
                <span className="text-xs text-destructive">{jsonError}</span>
              ) : null}
            </>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-border/50 px-4 py-3">
          <span className="font-mono text-xs text-muted-foreground/70">
            termco-ai-mcp.json
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="h-[30px] rounded-lg border border-border/80 px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={save}
            className="h-[30px] rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity disabled:opacity-50"
          >
            Add & connect
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
