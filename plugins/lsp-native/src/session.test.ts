import { PassThrough } from "node:stream";
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
  type MessageConnection,
} from "vscode-jsonrpc/node";
import { beforeEach, describe, expect, it } from "vitest";
import { applyContentChange, LspSession, offsetAt } from "./session";
import type { LspTransport } from "./transport";
import type { LspServerConfig } from "./types";
import { contentChecksum } from "./types";

describe("offsetAt", () => {
  it("maps line/character to UTF-16 offsets", () => {
    const text = "abc\ndef\nghi";
    expect(offsetAt(text, 0, 0)).toBe(0);
    expect(offsetAt(text, 1, 1)).toBe(5);
    expect(offsetAt(text, 2, 3)).toBe(11);
  });

  it("clamps past-EOL and past-EOF positions", () => {
    const text = "ab\ncd";
    expect(offsetAt(text, 0, 99)).toBe(2);
    expect(offsetAt(text, 9, 0)).toBe(5);
  });

  it("counts astral characters as two units (UTF-16 semantics)", () => {
    const text = "a\u{1f600}b\nx";
    expect(offsetAt(text, 0, 3)).toBe(3);
    expect(offsetAt(text, 1, 0)).toBe(5);
  });
});

describe("applyContentChange", () => {
  it("replaces a range", () => {
    const next = applyContentChange("hello world", {
      range: {
        start: { line: 0, character: 6 },
        end: { line: 0, character: 11 },
      },
      text: "there",
    });
    expect(next).toBe("hello there");
  });

  it("full-document change without range", () => {
    expect(applyContentChange("old", { text: "new" })).toBe("new");
  });

  it("multi-line replacement", () => {
    const next = applyContentChange("aa\nbb\ncc", {
      range: {
        start: { line: 0, character: 1 },
        end: { line: 2, character: 1 },
      },
      text: "X",
    });
    expect(next).toBe("aXc");
  });
});

/** Notifications are fire-and-forget — give the PassThrough pipe a tick. */
const settle = () => new Promise((r) => setTimeout(r, 20));

// ── in-memory server harness ───────────────────────────────────────────────

type Harness = {
  session: LspSession;
  server: MessageConnection;
  serverSeen: Record<string, unknown[]>;
  diagnostics: Array<{ path: string; version?: number; count: number }>;
  transportKilled: () => boolean;
};

const CONFIG: LspServerConfig = {
  id: "fake",
  name: "Fake",
  languages: ["ts"],
  command: "fake",
  args: [],
  rootMarkers: [".git"],
  enabled: true,
  settings: { fake: { flag: true, nested: { level: 2 } } },
};

function makeHarness(): Harness {
  const toServer = new PassThrough();
  const toClient = new PassThrough();
  let killed = false;
  const transport: LspTransport = {
    reader: toClient,
    writer: toServer,
    kill: () => {
      killed = true;
    },
    onExit: () => {},
    stderrTail: () => "",
  };
  const server = createMessageConnection(
    new StreamMessageReader(toServer),
    new StreamMessageWriter(toClient),
  );
  const serverSeen: Record<string, unknown[]> = {};
  const record = (method: string) => (params: unknown) => {
    (serverSeen[method] = serverSeen[method] ?? []).push(params);
  };
  server.onRequest("initialize", (params: unknown) => {
    record("initialize")(params);
    return {
      capabilities: {
        textDocumentSync: 2,
        hoverProvider: true,
        completionProvider: { resolveProvider: true },
      },
    };
  });
  server.onNotification("initialized", record("initialized"));
  server.onNotification("textDocument/didOpen", record("didOpen"));
  server.onNotification("textDocument/didChange", record("didChange"));
  server.onNotification("textDocument/didClose", record("didClose"));
  server.onNotification(
    "workspace/didChangeConfiguration",
    record("didChangeConfiguration"),
  );
  server.onRequest("textDocument/hover", (params: unknown) => {
    record("hover")(params);
    return { contents: { kind: "markdown", value: "docs" } };
  });
  server.onRequest("shutdown", record("shutdown"));
  server.onNotification("exit", record("exit"));
  server.listen();

  const diagnostics: Harness["diagnostics"] = [];
  const session = new LspSession(transport, CONFIG, "/proj", (path, version, d) =>
    diagnostics.push({ path, version, count: d.length }),
  );
  return {
    session,
    server,
    serverSeen,
    diagnostics,
    transportKilled: () => killed,
  };
}

describe("LspSession", () => {
  let h: Harness;
  beforeEach(() => {
    h = makeHarness();
  });

  it("performs the initialize handshake with utf-16 and root", async () => {
    await h.session.initialize();
    const init = h.serverSeen.initialize?.[0] as {
      rootUri: string;
      capabilities: { general: { positionEncodings: string[] } };
      initializationOptions?: unknown;
    };
    expect(init.rootUri).toBe("file:///proj");
    expect(init.capabilities.general.positionEncodings).toEqual(["utf-16"]);
    await settle();
    expect(h.serverSeen.initialized).toHaveLength(1);
    // settings pushed after initialized
    expect(h.serverSeen.didChangeConfiguration?.[0]).toEqual({
      settings: CONFIG.settings,
    });
  });

  it("answers workspace/configuration section lookups from config.settings", async () => {
    await h.session.initialize();
    const result = await h.server.sendRequest("workspace/configuration", {
      items: [{ section: "fake.nested" }, { section: "missing.section" }, {}],
    });
    expect(result).toEqual([{ level: 2 }, null, CONFIG.settings]);
  });

  it("opens docs, applies incremental changes, and detects drift", async () => {
    await h.session.initialize();
    h.session.openDoc("/proj/a.ts", "typescript", "hello world", 1);
    expect(h.session.docText("/proj/a.ts")).toBe("hello world");

    const good = h.session.changeDoc(
      "/proj/a.ts",
      2,
      [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 5 },
          },
          text: "goodbye",
        },
      ],
      contentChecksum("goodbye world"),
    );
    expect(good).toEqual({});
    expect(h.session.docText("/proj/a.ts")).toBe("goodbye world");

    const drifted = h.session.changeDoc(
      "/proj/a.ts",
      3,
      [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, text: "x" }],
      contentChecksum("something entirely different"),
    );
    expect(drifted).toEqual({ resync: true });

    h.session.resyncDoc("/proj/a.ts", 4, "fresh text");
    expect(h.session.docText("/proj/a.ts")).toBe("fresh text");
  });

  it("refcounts docs across windows and closes on last ref", async () => {
    await h.session.initialize();
    h.session.openDoc("/proj/a.ts", "typescript", "t", 1);
    h.session.openDoc("/proj/a.ts", "typescript", "t", 2);
    await settle();
    expect(h.serverSeen.didOpen).toHaveLength(1);
    h.session.closeDoc("/proj/a.ts", 1);
    expect(h.serverSeen.didClose).toBeUndefined();
    h.session.closeDoc("/proj/a.ts", 2);
    await settle();
    expect(h.serverSeen.didClose).toHaveLength(1);
    expect(h.session.openDocCount).toBe(0);
  });

  it("fans publishDiagnostics out to the sink with path + version", async () => {
    await h.session.initialize();
    h.server.sendNotification("textDocument/publishDiagnostics", {
      uri: "file:///proj/a.ts",
      version: 7,
      diagnostics: [
        {
          range: {
            start: { line: 0, character: 0 },
            end: { line: 0, character: 1 },
          },
          message: "bad",
        },
      ],
    });
    await new Promise((r) => setTimeout(r, 20));
    expect(h.diagnostics).toEqual([{ path: "/proj/a.ts", version: 7, count: 1 }]);
  });

  it("serves doc-scoped requests and null for unknown docs", async () => {
    await h.session.initialize();
    h.session.openDoc("/proj/a.ts", "typescript", "text", 1);
    const hover = await h.session.hover("/proj/a.ts", { line: 0, character: 1 });
    expect(hover).toEqual({ contents: { kind: "markdown", value: "docs" } });
    expect(
      await h.session.hover("/proj/unknown.ts", { line: 0, character: 0 }),
    ).toBeNull();
  });

  it("dropRefsOf closes all docs of a dead window", async () => {
    await h.session.initialize();
    h.session.openDoc("/proj/a.ts", "typescript", "t", 1);
    h.session.openDoc("/proj/b.ts", "typescript", "t", 1);
    h.session.openDoc("/proj/b.ts", "typescript", "t", 2);
    const closed = h.session.dropRefsOf(1);
    expect(closed).toEqual(["/proj/a.ts"]);
    expect(h.session.openDocCount).toBe(1);
  });

  it("shuts down gracefully (shutdown request + exit notification)", async () => {
    await h.session.initialize();
    await h.session.shutdown();
    await settle();
    expect(h.serverSeen.shutdown).toHaveLength(1);
    expect(h.serverSeen.exit).toHaveLength(1);
  });
});
