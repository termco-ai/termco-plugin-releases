import { describe, expect, it } from "vitest";
import { explorerGitTextClass } from "./gitStatusColor";
import type { GitStatusCode } from "./gitStatusUtils";

describe("explorerGitTextClass", () => {
  it("returns a distinct class per status family", () => {
    expect(explorerGitTextClass("M")).toBe("text-amber-200/85");
    expect(explorerGitTextClass("A")).toBe("text-[#73C991]/90");
    expect(explorerGitTextClass("U")).toBe("text-[#73C991]/90");
    expect(explorerGitTextClass("R")).toBe("text-sky-300/85");
    expect(explorerGitTextClass("D")).toBe("text-rose-200/80");
  });

  it("covers every status code with a non-empty class", () => {
    const codes: GitStatusCode[] = ["M", "A", "D", "U", "R"];
    for (const code of codes) {
      expect(explorerGitTextClass(code)).toBeTruthy();
    }
  });
});
