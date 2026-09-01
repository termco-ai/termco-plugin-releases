#!/usr/bin/env node
/**
 * Minimal scriptable LSP server over stdio (Content-Length framing) for
 * integration tests and Playwright E2E. Deterministic behavior:
 *  - initialize → hover/definition/completion capabilities
 *  - didOpen/didChange → publishes one diagnostic per line containing "TODO"
 *  - hover → "fake docs for <word>" markdown
 *  - definition → first line of the same document
 *  - completion → items ["fakeAlpha", "fakeBeta"]
 */
// Optional identity tag (--tag=NAME) so E2E can tell multiple fake servers
// apart by their hover text / diagnostics source.
const TAG =
  process.argv.find((a) => a.startsWith("--tag="))?.slice("--tag=".length) ??
  "fake-lsp";

let buffer = Buffer.alloc(0);
const docs = new Map();

process.stdin.on("data", (chunk) => {
  buffer = Buffer.concat([buffer, chunk]);
  for (;;) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) return;
    const header = buffer.slice(0, headerEnd).toString("utf8");
    const match = /Content-Length: (\d+)/i.exec(header);
    if (!match) {
      buffer = buffer.slice(headerEnd + 4);
      continue;
    }
    const length = Number(match[1]);
    const start = headerEnd + 4;
    if (buffer.length < start + length) return;
    const body = buffer.slice(start, start + length).toString("utf8");
    buffer = buffer.slice(start + length);
    handle(JSON.parse(body));
  }
});

function send(msg) {
  const body = Buffer.from(JSON.stringify(msg), "utf8");
  process.stdout.write(`Content-Length: ${body.length}\r\n\r\n`);
  process.stdout.write(body);
}

function respond(id, result) {
  send({ jsonrpc: "2.0", id, result });
}

function publishDiagnostics(uri) {
  const doc = docs.get(uri);
  if (!doc) return;
  const diagnostics = [];
  doc.text.split("\n").forEach((line, i) => {
    const at = line.indexOf("TODO");
    if (at >= 0) {
      diagnostics.push({
        range: {
          start: { line: i, character: at },
          end: { line: i, character: at + 4 },
        },
        severity: 2,
        source: TAG,
        message: `found a TODO (${TAG})`,
      });
    }
  });
  send({
    jsonrpc: "2.0",
    method: "textDocument/publishDiagnostics",
    params: { uri, version: doc.version, diagnostics },
  });
}

function applyChange(text, change) {
  if (!change.range) return change.text;
  const lines = text.split("\n");
  const offsetOf = (pos) => {
    let offset = 0;
    for (let i = 0; i < pos.line && i < lines.length; i++) {
      offset += lines[i].length + 1;
    }
    return offset + pos.character;
  };
  const start = offsetOf(change.range.start);
  const end = offsetOf(change.range.end);
  return text.slice(0, start) + change.text + text.slice(end);
}

function handle(msg) {
  const { id, method, params } = msg;
  switch (method) {
    case "initialize":
      respond(id, {
        capabilities: {
          textDocumentSync: 2,
          hoverProvider: true,
          definitionProvider: true,
          completionProvider: { triggerCharacters: ["."], resolveProvider: true },
          signatureHelpProvider: { triggerCharacters: ["("] },
          semanticTokensProvider: {
            legend: { tokenTypes: ["function"], tokenModifiers: [] },
            full: true,
          },
        },
      });
      break;
    case "shutdown":
      respond(id, null);
      break;
    case "exit":
      process.exit(0);
      break;
    case "textDocument/didOpen": {
      const { uri, text, version } = params.textDocument;
      docs.set(uri, { text, version: version ?? 1 });
      publishDiagnostics(uri);
      break;
    }
    case "textDocument/didChange": {
      const doc = docs.get(params.textDocument.uri);
      if (!doc) break;
      for (const change of params.contentChanges) {
        doc.text = applyChange(doc.text, change);
      }
      doc.version = params.textDocument.version;
      publishDiagnostics(params.textDocument.uri);
      break;
    }
    case "textDocument/didClose":
      docs.delete(params.textDocument.uri);
      break;
    case "textDocument/hover": {
      const doc = docs.get(params.textDocument.uri);
      const line = doc?.text.split("\n")[params.position.line] ?? "";
      const word =
        /\w+/.exec(line.slice(params.position.character))?.[0] ?? "nothing";
      respond(id, {
        contents: { kind: "markdown", value: `${TAG} docs for **${word}**` },
      });
      break;
    }
    case "textDocument/definition":
      respond(id, {
        uri: params.textDocument.uri,
        range: {
          start: { line: 0, character: 0 },
          end: { line: 0, character: 0 },
        },
      });
      break;
    case "textDocument/completion":
      respond(id, {
        isIncomplete: false,
        items: [
          { label: "fakeAlpha", kind: 3, detail: "fn fakeAlpha()" },
          { label: "fakeBeta", kind: 6 },
        ],
      });
      break;
    case "completionItem/resolve":
      respond(id, {
        ...params,
        documentation: { kind: "markdown", value: "resolved docs" },
      });
      break;
    case "textDocument/semanticTokens/full": {
      // First word of every line is a "function" token — deterministic and
      // easy to assert in E2E (span.cm-lsp-tok-function).
      const doc = docs.get(params.textDocument.uri);
      const data = [];
      let prevLine = 0;
      (doc?.text ?? "").split("\n").forEach((line, i) => {
        const m = /\w+/.exec(line);
        if (!m) return;
        data.push(i - prevLine, m.index, m[0].length, 0, 0);
        prevLine = i;
      });
      respond(id, { data });
      break;
    }
    case "textDocument/signatureHelp":
      respond(id, {
        signatures: [
          {
            label: "fakeAlpha(a: string, b: number)",
            parameters: [{ label: "a: string" }, { label: "b: number" }],
          },
        ],
        activeSignature: 0,
        activeParameter: 0,
      });
      break;
    default:
      if (id != null) respond(id, null);
  }
}
