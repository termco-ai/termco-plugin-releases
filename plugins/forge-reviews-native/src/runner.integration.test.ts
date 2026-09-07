// @vitest-environment node
import { expect, it, vi } from "vitest";
vi.mock("./executableDiscovery", () => ({
  resolveForgeExecutable: async () => process.execPath,
  forgeExecutableEnvironment: (env: unknown) => env,
  clearForgeExecutableCache: () => {},
}));
import { createForgeCommandRunner } from "./runner";

it("survives a real child exiting before reading a large input", async () => {
  const result = await createForgeCommandRunner({} as never).run({
    executable: "gh", args: ["-e", "process.exit(1)"], stdin: "x".repeat(1024 * 1024),
  }, { kind: "local" });
  expect(result.exitCode).not.toBe(0);
  expect(result.timedOut).toBe(false);
  expect(result.notFound).toBe(false);
  expect(result.stderr).toMatch(/EPIPE|ECONNRESET/);
});
