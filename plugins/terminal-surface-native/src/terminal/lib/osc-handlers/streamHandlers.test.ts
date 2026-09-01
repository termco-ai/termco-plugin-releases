// Kept with the source-owning terminal plugin.
import { describe, expect, it, vi } from "vitest";
import { TerminalLineSpace } from "../lineSpace";
import { PtyStreamParser, type ParserSink } from "../streamParser";
import { createShellIntegrationState } from "./shellIntegration";
import {
  registerCwdStreamHandler,
  registerOsc52StreamHandler,
  registerPromptStreamTracker,
} from "./streamHandlers";

// git-bash path mapping is Windows-only; exercise that branch like the
// xterm-variant test does.
vi.mock("../../../platform", () => ({ IS_WINDOWS: true }));

const enc = new TextEncoder();

/**
 * Drives handlers through the real parser: the sink counts newline
 * bytes written so `currentBufferLine` behaves like a terminal whose
 * cursor sits on the line after everything written so far.
 */
function makeHarness() {
  const parser = new PtyStreamParser();
  let lines = 0;
  const sink: ParserSink = {
    write(chunk) {
      for (const b of chunk) if (b === 0x0a) lines++;
    },
    respond() {},
    currentBufferLine: () => lines,
    cursorPosition: () => ({ row: 0, col: 0 }),
  };
  const push = (s: string) => parser.push(enc.encode(s), sink);
  return { parser, push };
}

async function flushClipboardQueue() {
  await Promise.resolve();
}

describe("registerCwdStreamHandler", () => {
  it("reports cwd from OSC 7 between commands", () => {
    const { parser, push } = makeHarness();
    const onCwd = vi.fn();
    registerCwdStreamHandler(parser, onCwd);
    push("\x1b]7;file://host/Users/kevin/dev\x07");
    expect(onCwd).toHaveBeenCalledWith("/Users/kevin/dev");
  });

  it("ignores OSC 7 while a command is running (untrusted output)", () => {
    const { parser, push } = makeHarness();
    const state = createShellIntegrationState();
    const onCwd = vi.fn();
    registerCwdStreamHandler(parser, onCwd, state);
    registerPromptStreamTracker(parser, new TerminalLineSpace(), state);

    push("\x1b]133;B\x07");
    push("\x1b]7;file://evil/tmp/attacker\x07");
    expect(onCwd).not.toHaveBeenCalled();

    push("\x1b]133;D;0\x07");
    push("\x1b]7;file://host/Users/kevin\x07");
    expect(onCwd).toHaveBeenCalledWith("/Users/kevin");
  });

  it("maps git-bash drive paths on Windows", () => {
    const { parser, push } = makeHarness();
    const onCwd = vi.fn();
    registerCwdStreamHandler(parser, onCwd);
    push("\x1b]7;file://host/c/Users/kevin\x07");
    expect(onCwd).toHaveBeenCalledWith("C:/Users/kevin");
  });
});

describe("registerOsc52StreamHandler", () => {
  it("decodes valid base64 to the clipboard", async () => {
    const { parser, push } = makeHarness();
    const write = vi.fn();
    registerOsc52StreamHandler(parser, write);
    push(`\x1b]52;c;${btoa("Hello")}\x07`);
    await flushClipboardQueue();
    expect(write).toHaveBeenCalledWith("Hello");
  });

  it.each([
    ["non-clipboard selection", `\x1b]52;p;${btoa("x")}\x07`],
    ["query payload", "\x1b]52;c;?\x07"],
    ["invalid base64", "\x1b]52;c;!!!\x07"],
    ["invalid UTF-8", "\x1b]52;c;/w==\x07"],
  ])("rejects %s", async (_label, seq) => {
    const { parser, push } = makeHarness();
    const write = vi.fn();
    registerOsc52StreamHandler(parser, write);
    push(seq);
    await flushClipboardQueue();
    expect(write).not.toHaveBeenCalled();
  });
});

describe("registerPromptStreamTracker", () => {
  it("anchors the prompt at the cursor line of OSC 133 A", () => {
    const { parser, push } = makeHarness();
    const space = new TerminalLineSpace();
    const tracker = registerPromptStreamTracker(parser, space);

    push("one\ntwo\n\x1b]133;A\x07");
    expect(tracker.getMarker()?.line).toBe(2);

    push("three\nfour\n\x1b]133;A\x07");
    expect(tracker.getMarker()?.line).toBe(4);
  });

  it("keeps the anchor stable across trims until evicted", () => {
    const { parser, push } = makeHarness();
    const space = new TerminalLineSpace();
    const tracker = registerPromptStreamTracker(parser, space);

    push("one\ntwo\n\x1b]133;A\x07");
    space.notifyTrim(1);
    expect(tracker.getMarker()?.line).toBe(1);
    space.notifyTrim(2);
    expect(tracker.getMarker()).toBeNull();
  });

  it("signals command running via C and idle via A/D", () => {
    const { parser, push } = makeHarness();
    const running = vi.fn();
    registerPromptStreamTracker(
      parser,
      new TerminalLineSpace(),
      undefined,
      running,
    );

    push("\x1b]133;C\x07");
    expect(running).toHaveBeenLastCalledWith(true);
    push("\x1b]133;D;0\x07");
    expect(running).toHaveBeenLastCalledWith(false);
    push("\x1b]133;A\x07");
    expect(running).toHaveBeenLastCalledWith(false);
  });

  it("dispose unregisters and drops the anchor", () => {
    const { parser, push } = makeHarness();
    const space = new TerminalLineSpace();
    const tracker = registerPromptStreamTracker(parser, space);
    push("\x1b]133;A\x07");
    const anchor = tracker.getMarker();
    tracker.dispose();
    expect(anchor?.isDisposed).toBe(true);
    expect(tracker.getMarker()).toBeNull();
  });
});
