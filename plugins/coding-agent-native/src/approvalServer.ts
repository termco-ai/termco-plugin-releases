/**
 * Approval bridge for managed-agent runs. A backend hook posts tool requests
 * here; the driver surfaces them to the user and returns the decision payload.
 * Local runs use loopback and SSH runs use a reverse tunnel. Every failure path
 * denies the request.
 */

import { type IncomingMessage, createServer, type Server } from "node:http";
import type { ApprovalOutcome } from "./driver";

/** Extract the tool name + input from a PreToolUse hook payload. */
export function parseHookRequest(body: string): { name: string; input: unknown } | null {
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }
  const name = (o.tool_name ?? o.toolName) as string | undefined;
  if (typeof name !== "string" || !name) return null;
  return { name, input: o.tool_input ?? o.toolInput ?? {} };
}

/** Render an ApprovalOutcome as a PreToolUse hook decision. */
export function formatDecision(outcome: ApprovalOutcome): string {
  return JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: outcome.allow ? "allow" : "deny",
      ...(outcome.updatedInput ? { updatedInput: outcome.updatedInput } : {}),
      ...(outcome.message ? { permissionDecisionReason: outcome.message } : {}),
    },
  });
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(c as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

export type ApprovalServer = {
  /** `http://127.0.0.1:<port>` once listening, else "". */
  baseUrl(): string;
  close(): void;
};

/** Start the loopback approval server, routing each request to the driver. */
export function startApprovalServer(
  requestApproval: (runId: string, req: { name: string; input: unknown }) => Promise<ApprovalOutcome>,
): ApprovalServer {
  let port = 0;
  const server: Server = createServer((req, res) => {
    void (async () => {
      const deny = (message: string) => {
        res.writeHead(200, { "content-type": "application/json" });
        res.end(formatDecision({ allow: false, message }));
      };
      if (req.method !== "POST") return deny("method not allowed");
      const runId = new URL(req.url ?? "", "http://127.0.0.1").searchParams.get("run") ?? "";
      const parsed = parseHookRequest(await readBody(req).catch(() => ""));
      if (!runId || !parsed) return deny("bad approval request");
      const outcome = await requestApproval(runId, parsed).catch(
        (): ApprovalOutcome => ({ allow: false, message: "approval bridge error" }),
      );
      res.writeHead(200, { "content-type": "application/json" });
      res.end(formatDecision(outcome));
    })();
  });
  // Bind to an ephemeral loopback port; the port is ready on 'listening'.
  server.listen(0, "127.0.0.1", () => {
    const addr = server.address();
    if (addr && typeof addr === "object") port = addr.port;
  });
  return {
    baseUrl: () => (port ? `http://127.0.0.1:${port}` : ""),
    close: () => server.close(),
  };
}
// Owned by the coding-agent-native provider plugin.
