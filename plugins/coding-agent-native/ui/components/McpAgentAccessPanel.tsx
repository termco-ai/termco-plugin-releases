/** Source-owned by the coding-agent-native plugin.
 * "Connect an external agent": create/revoke the user tokens that let a local
 * coding agent or custom client drive the app over
 * the MCP control server. Managed runs get their own per-run tokens
 * automatically — this panel is only for OUTSIDE agents.
 */

import ui from "@termco/ui";
import { ArrowLeft01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";
import {
  createMcpUserToken,
  listMcpUserTokens,
  type McpUserTokenInfo,
  registerMcpAgent,
  revokeMcpUserToken,
} from "../lib/mcpServerClient";

const { Button } = ui;

function ago(ms: number | null): string {
  if (!ms) return "never";
  const s = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

export function McpAgentAccessPanel({ onBack }: { onBack: () => void }) {
  const [tokens, setTokens] = useState<McpUserTokenInfo[]>([]);
  const [label, setLabel] = useState("");
  const [autoApprove, setAutoApprove] = useState(false);
  const [created, setCreated] = useState<{
    token: string;
    snippet?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = () => {
    void listMcpUserTokens()
      .then(setTokens)
      .catch(() => {});
  };
  useEffect(refresh, []);

  const create = async () => {
    setBusy(true);
    try {
      const { token } = await createMcpUserToken({
        label: label.trim() || "External agent",
        autoApprove,
      });
      setCreated({ token });
      setLabel("");
      setAutoApprove(false);
      refresh();
    } finally {
      setBusy(false);
    }
  };

  const register = async (backend: "claude" | "codex" | "other") => {
    if (!created) return;
    const res = await registerMcpAgent(backend, created.token);
    if (res.snippet)
      setCreated((c) => (c ? { ...c, snippet: res.snippet } : c));
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/50 px-3 py-2.5">
        <Button
          size="icon"
          variant="ghost"
          className="size-7"
          onClick={onBack}
          aria-label="Back"
        >
          <HugeiconsIcon icon={ArrowLeft01Icon} size={16} strokeWidth={1.75} />
        </Button>
        <span className="text-sm font-semibold text-foreground">
          Connect an external agent
        </span>
      </div>

      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Give a local coding agent (opencode, a hand-run <code>claude</code>,
          your own agent) access to Termco&apos;s app-control tools. Each token
          can be revoked any time; the rig is chosen from the agent&apos;s
          working directory.
        </p>

        {/* Create */}
        <div className="space-y-2 rounded-xl border border-border/60 bg-card p-3">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. opencode on this Mac)"
            className="w-full rounded-lg border border-border/60 bg-background px-2 py-1.5 text-xs focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring/40"
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={autoApprove}
              onChange={(e) => setAutoApprove(e.target.checked)}
            />
            Auto-approve non-dangerous tool calls (skips the confirmation card)
          </label>
          <Button size="sm" onClick={() => void create()} disabled={busy}>
            Create token
          </Button>
        </div>

        {/* One-time token + register */}
        {created && (
          <div className="space-y-2 rounded-xl border border-primary/40 bg-card p-3">
            <div className="text-xs font-semibold text-foreground">
              Token (shown once — copy it now)
            </div>
            <code className="block break-all rounded bg-muted/50 p-2 font-mono text-xs text-foreground">
              {created.token}
            </code>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                onClick={() => void register("claude")}
              >
                Add to Claude Code
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void register("codex")}
              >
                Add to Codex
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void register("other")}
              >
                Copy config (other)
              </Button>
            </div>
            {created.snippet && (
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/40 p-2 text-xs text-muted-foreground">
                {created.snippet}
              </pre>
            )}
          </div>
        )}

        {/* Existing tokens */}
        <div className="space-y-1.5">
          <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground/70">
            Active tokens
          </div>
          {tokens.length === 0 ? (
            <div className="text-xs text-muted-foreground">
              No external agents connected.
            </div>
          ) : (
            tokens.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-2 rounded-lg border border-border/50 bg-card px-2.5 py-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium text-foreground">
                    {t.label}
                  </div>
                  <div className="text-xs text-muted-foreground/80">
                    {t.autoApprove ? "auto-approve · " : ""}
                    last used {ago(t.lastUsedAt)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void revokeMcpUserToken(t.id).then(refresh)}
                >
                  Revoke
                </Button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
