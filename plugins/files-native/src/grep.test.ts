// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fsGrepInteractive } from "./grep";
import { configureWorkspace } from "./runtime";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("workspace grep provider", () => {
  it("searches the working directory instead of waiting for child stdin", async () => {
    const root = mkdtempSync(join(tmpdir(), "termco-files-grep-"));
    roots.push(root);
    writeFileSync(join(root, "README.md"), "hello capability search\n");
    configureWorkspace({
      resolvePath: (path: string) => path,
      toCanonicalDisplay: (path: string) => path,
    } as never);

    const result = await fsGrepInteractive("capability search", root, 10, { kind: "local" });
    expect(result.hits).toEqual([
      expect.objectContaining({ rel: "README.md", line: 1, text: "hello capability search" }),
    ]);
  });
});
