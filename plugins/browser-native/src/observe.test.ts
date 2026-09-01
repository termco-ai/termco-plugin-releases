import { describe, expect, it } from "vitest";
import { consoleEntryFrom, formatConsoleArgs } from "./observe";

describe("formatConsoleArgs", () => {
  it("joins plain args", () => {
    expect(
      formatConsoleArgs([{ value: "hello" }, { value: 42 }]),
    ).toBe("hello 42");
  });

  it("drops %c and its style argument", () => {
    // console.log("%cStyled text", "color:red; font-weight:bold")
    expect(
      formatConsoleArgs([
        { value: "%cStyled text" },
        { value: "color:red; font-weight:bold" },
      ]),
    ).toBe("Styled text");
  });

  it("substitutes %s and %d", () => {
    expect(
      formatConsoleArgs([{ value: "%s = %d" }, { value: "x" }, { value: 7 }]),
    ).toBe("x = 7");
  });

  it("appends leftover args after the format string", () => {
    expect(
      formatConsoleArgs([{ value: "%cA" }, { value: "css" }, { value: "extra" }]),
    ).toBe("A extra");
  });
});

describe("Electron security-warning filter", () => {
  it("drops Electron's dev-only CSP warning", () => {
    const e = consoleEntryFrom(
      "Runtime.consoleAPICalled",
      {
        type: "warning",
        args: [
          { value: "%cElectron Security Warning (Insecure Content-Security-Policy) font-weight: bold" },
          { value: "font-weight: bold" },
        ],
      },
      1,
      0,
    );
    expect(e).toBeNull();
  });
});

describe("consoleEntryFrom", () => {
  it("maps console.log args into a text entry", () => {
    const e = consoleEntryFrom(
      "Runtime.consoleAPICalled",
      {
        type: "log",
        args: [{ value: "hello" }, { value: 42 }],
      },
      1,
      1000,
    );
    expect(e).toMatchObject({ id: 1, level: "log", text: "hello 42", ts: 1000 });
  });

  it("normalizes the warning level to warn", () => {
    const e = consoleEntryFrom(
      "Runtime.consoleAPICalled",
      { type: "warning", args: [{ value: "careful" }] },
      2,
      0,
    );
    expect(e?.level).toBe("warn");
  });

  it("captures uncaught exceptions with a stack frame", () => {
    const e = consoleEntryFrom(
      "Runtime.exceptionThrown",
      {
        exceptionDetails: {
          text: "Uncaught",
          exception: { description: "TypeError: x is not a function" },
          stackTrace: {
            callFrames: [
              { functionName: "boom", url: "https://x.dev/a.js", lineNumber: 9 },
            ],
          },
        },
      },
      3,
      0,
    );
    expect(e?.level).toBe("error");
    expect(e?.text).toContain("TypeError");
    expect(e?.stackTop).toBe("boom (https://x.dev/a.js:10)");
  });

  it("folds in Log.entryAdded (network/CSP errors) with the source url", () => {
    const e = consoleEntryFrom(
      "Log.entryAdded",
      { entry: { level: "error", text: "Failed to load", url: "https://x.dev/api" } },
      4,
      0,
    );
    expect(e).toMatchObject({ level: "error" });
    expect(e?.text).toContain("Failed to load");
    expect(e?.text).toContain("https://x.dev/api");
  });

  it("returns null for unrelated methods", () => {
    expect(consoleEntryFrom("Network.requestWillBeSent", {}, 1, 0)).toBeNull();
  });

  it("uses the object description when a value is not serializable", () => {
    const e = consoleEntryFrom(
      "Runtime.consoleAPICalled",
      { type: "log", args: [{ type: "object", description: "Array(3)" }] },
      1,
      0,
    );
    expect(e?.text).toBe("Array(3)");
  });
});
