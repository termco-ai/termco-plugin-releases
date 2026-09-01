// Kept with the source-owning terminal plugin.
// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { parseOsc52Clipboard } from "./clipboard";
import { parseOsc7 } from "./shellIntegration";

// git-bash path mapping is Windows-only; exercise that branch.
vi.mock("../../../platform", () => ({ IS_WINDOWS: true }));

describe("parseOsc7", () => {
  it("extracts the path from a file URL", () => {
    expect(parseOsc7("file://host/Users/kevin/dev")).toBe("/Users/kevin/dev");
    expect(parseOsc7("file:///tmp")).toBe("/tmp");
  });

  it("percent-decodes path components", () => {
    expect(parseOsc7("file://h/Users/kevin/My%20Repo")).toBe(
      "/Users/kevin/My Repo",
    );
  });

  it("survives malformed percent escapes", () => {
    expect(parseOsc7("file://h/bad%zz")).toBe("/bad%zz");
  });

  it("maps Windows drive prefixes", () => {
    expect(parseOsc7("file://h/C:/Users/kevin")).toBe("C:/Users/kevin");
  });

  it("maps git-bash MSYS drive paths on Windows", () => {
    expect(parseOsc7("file://h/c/Users/kevin")).toBe("C:/Users/kevin");
    expect(parseOsc7("file://h/d")).toBe("D:/");
  });

  it("rejects non-file URLs and garbage", () => {
    expect(parseOsc7("https://example.com/x")).toBeNull();
    expect(parseOsc7("")).toBeNull();
    expect(parseOsc7("not-a-url")).toBeNull();
  });
});

describe("parseOsc52Clipboard", () => {
  const b64 = (s: string) => btoa(s);

  it("decodes valid clipboard payloads", () => {
    expect(parseOsc52Clipboard(`c;${b64("Hello")}`)).toBe("Hello");
  });

  it("accepts an empty selection field as clipboard", () => {
    expect(parseOsc52Clipboard(`;${b64("x")}`)).toBe("x");
  });

  it("decodes UTF-8 content", () => {
    const utf8 = btoa(
      String.fromCharCode(...new TextEncoder().encode("héllo")),
    );
    expect(parseOsc52Clipboard(`c;${utf8}`)).toBe("héllo");
  });

  it("tolerates whitespace inside the base64", () => {
    const encoded = b64("Hello World");
    const spaced = `${encoded.slice(0, 4)}\n${encoded.slice(4)}`;
    expect(parseOsc52Clipboard(`c;${spaced}`)).toBe("Hello World");
  });

  it("rejects non-clipboard selections", () => {
    expect(parseOsc52Clipboard(`p;${b64("x")}`)).toBeNull();
    expect(parseOsc52Clipboard(`s;${b64("x")}`)).toBeNull();
  });

  it("rejects clipboard queries", () => {
    expect(parseOsc52Clipboard("c;?")).toBeNull();
  });

  it("rejects invalid base64", () => {
    expect(parseOsc52Clipboard("c;!!!")).toBeNull();
    expect(parseOsc52Clipboard("c;ab=c=")).toBeNull();
  });

  it("rejects invalid UTF-8 bytes", () => {
    // 0xFF alone is never valid UTF-8.
    expect(parseOsc52Clipboard("c;/w==")).toBeNull();
  });

  it("rejects oversized payloads without decoding them", () => {
    const oversize = "A".repeat(Math.ceil((1024 * 1024 * 4) / 3) + 8);
    expect(parseOsc52Clipboard(`c;${oversize}`)).toBeNull();
  });

  it("rejects payloads missing the separator", () => {
    expect(parseOsc52Clipboard("c")).toBeNull();
    expect(parseOsc52Clipboard("")).toBeNull();
  });
});
