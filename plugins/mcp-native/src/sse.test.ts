import { describe, expect, it } from "vitest";
import { SseParser } from "./sse";

describe("SseParser", () => {
  it("emits one frame per blank-line-terminated block", () => {
    const p = new SseParser();
    const frames = p.push("event: message\ndata: hello\n\n");
    expect(frames).toEqual([{ event: "message", data: "hello", id: undefined }]);
  });

  it("defaults the event name to 'message'", () => {
    const p = new SseParser();
    expect(p.push("data: x\n\n")).toEqual([
      { event: "message", data: "x", id: undefined },
    ]);
  });

  it("joins multi-line data with newlines", () => {
    const p = new SseParser();
    expect(p.push("data: a\ndata: b\n\n")[0].data).toBe("a\nb");
  });

  it("reassembles a frame split across chunks", () => {
    const p = new SseParser();
    expect(p.push("data: hel")).toEqual([]);
    expect(p.push("lo\n\n")).toEqual([
      { event: "message", data: "hello", id: undefined },
    ]);
  });

  it("handles CRLF line endings and comments", () => {
    const p = new SseParser();
    const frames = p.push(": keep-alive\r\nevent: ping\r\ndata: 1\r\n\r\n");
    expect(frames).toEqual([{ event: "ping", data: "1", id: undefined }]);
  });

  it("carries an id field", () => {
    const p = new SseParser();
    expect(p.push("id: 7\ndata: x\n\n")[0].id).toBe("7");
  });
});
