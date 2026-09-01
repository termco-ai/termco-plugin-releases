import { describe, expect, it } from "vitest";
import { isSecretEnv } from "./secretMask";

describe("isSecretEnv", () => {
  it("masks values whose key looks sensitive", () => {
    for (const key of [
      "DB_PASSWORD",
      "PASSWD",
      "SECRET_KEY",
      "API_TOKEN",
      "GITHUB_TOKEN",
      "AWS_ACCESS_KEY_ID",
      "STRIPE_API_KEY",
      "PRIVATE_KEY",
      "MY_CREDENTIAL",
      "JWT_AUTH",
      "KEY",
    ]) {
      expect(isSecretEnv(key, "x")).toBe(true);
    }
  });

  it("does not mask plainly-named config keys", () => {
    for (const key of [
      "PATH",
      "NODE_ENV",
      "HOME",
      "LANG",
      "PORT",
      "HOSTNAME",
    ]) {
      expect(isSecretEnv(key, "production")).toBe(false);
    }
  });

  it("allow-lists public keys despite the word 'key'", () => {
    expect(isSecretEnv("SSH_PUBLIC_KEY", "ssh-rsa AAAA")).toBe(false);
    expect(isSecretEnv("PKG_CONFIG", "/usr/lib")).toBe(false);
  });

  it("masks high-entropy values even under a plain key", () => {
    expect(isSecretEnv("SESSION", "aB3kL9xQ7zR2mN5pT8wY1vC4")).toBe(true);
  });

  it("leaves low-entropy / path-like / short values visible", () => {
    expect(isSecretEnv("MSG", "hello world this is fine")).toBe(false);
    expect(isSecretEnv("DIR", "/usr/local/share/app/data")).toBe(false);
    expect(isSecretEnv("SHORT", "abc123")).toBe(false);
  });
});
