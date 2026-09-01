/**
 * Live end-to-end test of the SSH backend against a REAL sshd (a container).
 * Skipped unless TERMCO_E2E_HOST is set (a ~/.ssh/config alias or user@host:port).
 * Drives the actual transport: probe → server deploy (scp) → connect → RPC, and
 * exercises fs / git / shell / search / write-roundtrip on the remote.
 *
 * Setup used in CI/dev:
 *   docker run -d --name termco-e2e -p 2222:22 <sshd-image-with-node-git-rg>
 *   ~/.ssh/config: Host termco-e2e → 127.0.0.1:2222, key auth
 *   TERMCO_E2E_HOST=termco-e2e pnpm vitest run -c vitest.electron.config.ts plugins/ssh-native/src/e2e.integration.test.ts
 */
import { tmpdir } from "node:os";
import { afterAll, describe, expect, it, vi } from "vitest";

// Asset lookup needs electron's app; stub it to the repository so the
// source-owned plugin asset resolves from its compiled cache.
vi.mock("electron", () => ({
  app: { getAppPath: () => process.cwd(), getPath: () => tmpdir() },
}));

import { sshFs, sshGitRun } from "./backend";
import { disconnectAll, getConnection } from "./connection";
import { ensureShellIntegration } from "./shellIntegration";
import type { SshTarget } from "./types";

const HOST = process.env.TERMCO_E2E_HOST;
const run = HOST ? describe : describe.skip;
const target: SshTarget = { connectionId: HOST ?? "", host: HOST ?? "" };

run("ssh live e2e", () => {
  afterAll(() => disconnectAll());

  it("connects, deploys the server, and reports the remote home", { timeout: 90_000 }, async () => {
    const conn = await getConnection(target);
    const home = await conn.client.call<string>("sys.home");
    expect(home.startsWith("/")).toBe(true);
    (globalThis as Record<string, unknown>).__E2E_HOME = home;
  });

  it("lists the remote home directory", { timeout: 30_000 }, async () => {
    const home = (globalThis as Record<string, unknown>).__E2E_HOME as string;
    const entries = (await sshFs.readDir(target as never, home, true)) as Array<{ name: string; kind: string }>;
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.some((e) => e.name === ".ssh")).toBe(true);
  });

  it("writes a file and reads it back on the remote", { timeout: 30_000 }, async () => {
    const home = (globalThis as Record<string, unknown>).__E2E_HOME as string;
    const path = `${home}/termco-e2e-probe.txt`;
    const body = `hello-${Date.now()}`;
    await sshFs.writeFile(target as never, path, body);
    const read = (await sshFs.readFile(target as never, path)) as { kind: string; content?: string };
    expect(read.kind).toBe("text");
    expect(read.content).toBe(body);
  });

  it("runs git on the remote", { timeout: 30_000 }, async () => {
    const out = await sshGitRun(target as never, undefined, ["--version"]);
    expect(out.exitCode).toBe(0);
    expect(out.stdout.toString("utf8")).toMatch(/git version/);
  });

  it("runs a remote shell command", { timeout: 30_000 }, async () => {
    const conn = await getConnection(target);
    const res = await conn.client.call<{ stdout: string; exit_code: number }>("shell.run", {
      command: "uname -sm && whoami",
    });
    expect(res.exit_code).toBe(0);
    expect(res.stdout).toMatch(/Linux|Darwin/);
  });

  it("searches remote files with ripgrep", { timeout: 30_000 }, async () => {
    const home = (globalThis as Record<string, unknown>).__E2E_HOME as string;
    const res = (await sshFs.listFiles(target as never, { root: home, limit: 50 })) as {
      files: string[];
    };
    expect(Array.isArray(res.files)).toBe(true);
  });

  it("uploads terminal shell-integration and it lands on the remote", { timeout: 30_000 }, async () => {
    const prep = await ensureShellIntegration(target);
    expect(prep.integrationArg).toBeTruthy(); // zsh ZDOTDIR or bash rcfile
    // Verify the uploaded rc file actually exists on the remote.
    const conn = await getConnection(target);
    const check = await conn.client.call<{ stdout: string; exit_code: number }>("shell.run", {
      command:
        prep.shellName === "zsh"
          ? `test -f '${prep.integrationArg}/.zshrc' && echo INT_OK`
          : `test -f '${prep.integrationArg}' && echo INT_OK`,
    });
    expect(check.stdout).toContain("INT_OK");
  });
});
