import { describe, expect, it } from "vitest";
import { absolutePath } from "./shared";

// Regression: a model answering with a workspace-relative path made the tab
// opener stat that literal string — ENOENT, and on an SSH rig against the
// remote home instead of the project.
describe("absolutePath", () => {
  it("resolves a relative path against the workspace root", () => {
    expect(absolutePath("app/api/v2/swagger.json", "/srv/proj")).toBe(
      "/srv/proj/app/api/v2/swagger.json",
    );
  });

  it("strips a leading ./", () => {
    expect(absolutePath("./src/a.ts", "/srv/proj")).toBe("/srv/proj/src/a.ts");
  });

  it("leaves an absolute path alone", () => {
    expect(absolutePath("/etc/hosts", "/srv/proj")).toBe("/etc/hosts");
    expect(absolutePath("C:\\tmp\\a.ts", "C:\\proj")).toBe("C:\\tmp\\a.ts");
  });

  it("does not double the separator", () => {
    expect(absolutePath("a.ts", "/srv/proj/")).toBe("/srv/proj/a.ts");
  });

  it("uses backslashes only for a windows root", () => {
    expect(absolutePath("src\\a.ts", "C:\\proj")).toBe("C:\\proj\\src\\a.ts");
  });

  it("passes the path through unchanged with no root", () => {
    expect(absolutePath("a.ts", null)).toBe("a.ts");
  });
});
