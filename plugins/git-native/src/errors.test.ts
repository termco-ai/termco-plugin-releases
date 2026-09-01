/**
 * ensureSuccess / auth-error classification tests.
 */
import { describe, expect, it } from "vitest";
import { ensureSuccess, GitError } from "./errors";
import type { GitOutput } from "./runner";

function output(
  exit: number | null,
  stdout: string,
  stderr: string,
  timedOut: boolean,
): GitOutput {
  return {
    stdout: Buffer.from(stdout),
    stderr: Buffer.from(stderr),
    exitCode: exit,
    timedOut,
    truncated: false,
  };
}

describe("ensureSuccess", () => {
  it("zero_exit_is_success", () => {
    expect(() => ensureSuccess(output(0, "", "", false), "ctx")).not.toThrow();
  });

  it("timeout_maps_to_timed_out", () => {
    try {
      ensureSuccess(output(null, "", "", true), "git fetch");
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as GitError).kind).toBe("timedOut");
    }
  });

  it("auth_failures_map_to_auth_required", () => {
    const cases = [
      "fatal: Authentication failed for 'https://example.com/repo.git'",
      "fatal: could not read Username for 'https://example.com'",
      "git@example.com: Permission denied (publickey).",
      "remote: Invalid credentials",
    ];
    for (const stderr of cases) {
      try {
        ensureSuccess(output(128, "", stderr, false), "ctx");
        throw new Error(`should have thrown for ${stderr}`);
      } catch (e) {
        expect((e as GitError).kind).toBe("authRequired");
      }
    }
  });

  it("host_key_failure_maps_to_dedicated_variant", () => {
    try {
      ensureSuccess(output(128, "", "Host key verification failed.", false), "ctx");
      throw new Error("should have thrown");
    } catch (e) {
      expect((e as GitError).kind).toBe("hostKeyUnverified");
    }
  });

  it("detail_falls_back_from_stderr_to_stdout_to_placeholder", () => {
    expect(() => ensureSuccess(output(1, "", "stderr detail", false), "ctx")).toThrow(
      /stderr detail/,
    );
    expect(() => ensureSuccess(output(1, "stdout detail", "", false), "ctx")).toThrow(
      /stdout detail/,
    );
    expect(() => ensureSuccess(output(1, "", "", false), "ctx")).toThrow(
      /unknown git error/,
    );
  });
});
