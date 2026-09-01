import { describe, expect, it } from "vitest";
import { draftFromServer, serverFromDraft } from "./model";

describe("language-server settings model", () => {
  it("builds a complete custom server configuration", () => {
    const draft = draftFromServer();
    Object.assign(draft, { id: "elixir", languages: "EX, exs", command: "elixir-ls", args: "--stdio", settings: "{\"dialyzer\":true}" });
    expect(serverFromDraft(draft)).toMatchObject({ id: "elixir", name: "elixir", languages: ["ex", "exs"], command: "elixir-ls", args: ["--stdio"], settings: { dialyzer: true }, custom: true });
  });

  it("explains malformed JSON fields", () => {
    const draft = draftFromServer();
    Object.assign(draft, { id: "x", languages: "x", command: "x", settings: "{" });
    expect(() => serverFromDraft(draft)).toThrow("Settings is not valid JSON");
  });
});
