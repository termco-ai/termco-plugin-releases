/** Fixtures mirror captured on-disk history and rollout shapes. */
import { describe, expect, it } from "vitest";
import {
  buildListingCommand,
  buildTranscriptCommand,
  parseClaudeIndex,
  parseCodexHistory,
  parseCodexIndex,
  parseListing,
  rolloutFilenameTs,
  splitListing,
} from "./remoteSessions";

const CLAUDE_LINE = (sessionId: string, ts: number, display: string, project = "/srv/app") =>
  JSON.stringify({ display, pastedContents: {}, timestamp: ts, project, sessionId });

const CODEX_LINE = (session_id: string, ts: number, text: string) =>
  JSON.stringify({ session_id, ts, text });

/** A captured rollout `session_meta` header. */
const ROLLOUT_HEAD = (id: string, cwd: string) =>
  JSON.stringify({
    timestamp: "2026-08-12T22:16:21.885Z",
    type: "session_meta",
    payload: { session_id: id, id, cwd, originator: "codex_exec", cli_version: "0.147.0" },
  });

describe("buildListingCommand", () => {
  it("is one POSIX command with all three section markers and caps", () => {
    const cmd = buildListingCommand();
    expect(cmd).toContain("==TC-CLAUDE-HISTORY");
    expect(cmd).toContain("==TC-CODEX-HISTORY");
    expect(cmd).toContain("==TC-CODEX-ROLLOUTS");
    expect(cmd).toContain('tail -c 2097152 "$HOME/.claude/history.jsonl"');
    expect(cmd).toContain("head -n 60");
    expect(cmd).not.toContain("[["); // no bashisms
    expect(cmd.endsWith("true")).toBe(true); // exit 0 even with missing files
  });
});

describe("parseClaudeIndex", () => {
  it("dedupes by sessionId: first prompt = title, last timestamp = recency, count = prompts", () => {
    const out = parseClaudeIndex([
      CLAUDE_LINE("s1", 1000, "fix the login bug"),
      CLAUDE_LINE("s2", 1500, "explain the build", "/srv/other"),
      CLAUDE_LINE("s1", 2000, "now add tests"),
    ]);
    const s1 = out.find((s) => s.sessionId === "s1")!;
    expect(s1.name).toBe("fix the login bug");
    expect(s1.updatedAt).toBe(2000);
    expect(s1.messageCount).toBe(2);
    expect(s1.cwd).toBe("/srv/app");
    expect(s1.projectSlug).toBe("-srv-app");
    expect(s1.backend).toBe("claude");
    expect(out.find((s) => s.sessionId === "s2")?.projectName).toBe("other");
  });

  it("skips partial/garbage lines (byte-cap cut, login banners)", () => {
    const out = parseClaudeIndex([
      'p":{},"timestamp":123,"sessionId":"cut"}', // partial first line
      "Welcome to Ubuntu 24.04 LTS",
      CLAUDE_LINE("ok", 5, "hello"),
      "",
    ]);
    expect(out.map((s) => s.sessionId)).toEqual(["ok"]);
  });
});

describe("parseCodexHistory", () => {
  it("maps session_id → first text/last ts (SECONDS → ms)/count", () => {
    const map = parseCodexHistory([
      CODEX_LINE("c1", 100, "first prompt"),
      CODEX_LINE("c1", 200, "second"),
    ]);
    expect(map.get("c1")).toEqual({ name: "first prompt", updatedAt: 200_000, count: 2 });
  });
});

describe("rolloutFilenameTs", () => {
  it("parses the filename timestamp", () => {
    const ts = rolloutFilenameTs(
      "/root/.codex/sessions/2026/08/13/rollout-2026-08-13T00-16-21-019ff80c.jsonl",
    );
    expect(new Date(ts).getFullYear()).toBe(2026);
  });

  it("returns 0 for non-rollout paths", () => {
    expect(rolloutFilenameTs("/etc/passwd")).toBe(0);
  });
});

describe("parseCodexIndex", () => {
  const ID = "019ff80c-460d-7fb2-b596-f991dceb0233";
  const PATH = `/root/.codex/sessions/2026/08/13/rollout-2026-08-13T00-16-21-${ID}.jsonl`;

  it("joins rollout heads (id+cwd+path) with history (name/recency/count)", () => {
    const out = parseCodexIndex(
      [CODEX_LINE(ID, 1786444212, "build the parser")],
      [{ path: PATH, headLine: ROLLOUT_HEAD(ID, "/srv/codex-proj") }],
    );
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      sessionId: ID,
      backend: "codex",
      filePath: PATH,
      name: "build the parser",
      cwd: "/srv/codex-proj",
      projectName: "codex-proj",
      updatedAt: 1786444212000,
      messageCount: 1,
    });
  });

  it("falls back to the filename uuid + timestamp when the head line is unparsable", () => {
    const out = parseCodexIndex([], [{ path: PATH, headLine: "garbage not json" }]);
    expect(out).toHaveLength(1);
    expect(out[0].sessionId).toBe(ID);
    expect(out[0].updatedAt).toBeGreaterThan(0);
    expect(out[0].name).toBe("Codex session");
  });

  it("ignores ls noise that is not an absolute path", () => {
    expect(parseCodexIndex([], [{ path: "total 0", headLine: "" }])).toEqual([]);
  });
});

describe("splitListing + parseListing (full round-trip)", () => {
  const ID = "019ff80c-460d-7fb2-b596-f991dceb0233";
  const PATH = `/root/.codex/sessions/2026/08/13/rollout-2026-08-13T00-16-21-${ID}.jsonl`;
  const STDOUT = [
    "Welcome to Ubuntu (MOTD noise before any marker)",
    "==TC-CLAUDE-HISTORY",
    CLAUDE_LINE("s1", 3000, "claude task"),
    "",
    "==TC-CODEX-HISTORY",
    CODEX_LINE(ID, 5, "codex task"),
    "",
    "==TC-CODEX-ROLLOUTS",
    `==TC-FILE ${PATH}`,
    ROLLOUT_HEAD(ID, "/srv/proj"),
    "",
  ].join("\n");

  it("splits sections and ignores pre-marker noise", () => {
    const { claudeHistory, codexHistory, rolloutHeads } = splitListing(STDOUT);
    expect(claudeHistory.some((l) => l.includes("claude task"))).toBe(true);
    expect(codexHistory.some((l) => l.includes("codex task"))).toBe(true);
    expect(rolloutHeads).toEqual([
      { path: PATH, headLine: ROLLOUT_HEAD(ID, "/srv/proj") },
    ]);
  });

  it("parses the whole listing into summaries, newest first", () => {
    const out = parseListing(STDOUT);
    expect(out.map((s) => s.backend)).toEqual(["codex", "claude"]);
    expect(out[1].name).toBe("claude task");
  });
});

describe("buildTranscriptCommand", () => {
  it("claude: existence-checked tail under $HOME with validated slug/id", () => {
    const cmd = buildTranscriptCommand({
      backend: "claude",
      projectSlug: "-srv-app",
      sessionId: "abc-123",
    })!;
    expect(cmd).toContain('"$HOME"/.claude/projects/');
    expect(cmd).toContain("'-srv-app'");
    expect(cmd).toContain("'abc-123.jsonl'");
    expect(cmd).toContain("==TC-FOUND");
    expect(cmd).toContain("==TC-GONE");
  });

  it("rejects injection-shaped slugs/ids/paths", () => {
    expect(
      buildTranscriptCommand({ backend: "claude", projectSlug: "a; rm -rf /", sessionId: "x" }),
    ).toBeNull();
    expect(
      buildTranscriptCommand({ backend: "claude", projectSlug: "ok", sessionId: "$(reboot)" }),
    ).toBeNull();
    expect(buildTranscriptCommand({ backend: "codex", filePath: "relative/path" })).toBeNull();
    expect(buildTranscriptCommand({ backend: "codex", filePath: "/ok/but\nnewline" })).toBeNull();
  });

  it("codex: quotes the absolute rollout path", () => {
    const cmd = buildTranscriptCommand({ backend: "codex", filePath: "/root/.codex/x.jsonl" })!;
    expect(cmd).toContain("'/root/.codex/x.jsonl'");
  });
});
// Owned by the coding-agent-native provider plugin.
