import { StreamLanguage, type StreamParser } from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { describe, expect, it } from "vitest";
import { defineLanguage } from "./loader";

describe("defineLanguage", () => {
  it("wraps a stream parser into a usable language extension", async () => {
    const parser: StreamParser<unknown> = {
      token(stream) {
        stream.next();
        return null;
      },
    };
    const ext = await defineLanguage(Promise.resolve(parser));
    expect(ext).toBeInstanceOf(StreamLanguage);
    expect(() =>
      EditorState.create({ doc: "hello", extensions: ext }),
    ).not.toThrow();
  });

  it("propagates parser load failures", async () => {
    await expect(
      defineLanguage(Promise.reject(new Error("load failed"))),
    ).rejects.toThrow("load failed");
  });
});
