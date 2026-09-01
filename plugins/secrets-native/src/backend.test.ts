// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createSecretStore } from "./backend";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true })));
});

async function root(): Promise<string> {
  const path = await fs.mkdtemp(join(tmpdir(), "termco-secrets-plugin-"));
  roots.push(path);
  return path;
}

function testSafeStorage() {
  return {
    isEncryptionAvailable: () => true,
    encryptString: (value: string) => Buffer.from(`encrypted:${value}`, "utf8"),
    decryptString: (value: Buffer) =>
      value.toString("utf8").replace(/^encrypted:/, ""),
  };
}

describe("secrets-native", () => {
  it("keeps getAll in requested account order", async () => {
    const store = createSecretStore({
      userData: await root(),
      safeStorage: testSafeStorage(),
    });
    await store.set("termco", "anthropic", "sk-ant");
    await store.set("termco", "openai", "sk-oai");
    expect(
      await store.getAll("termco", ["openai", "missing", "anthropic"]),
    ).toEqual(["sk-oai", null, "sk-ant"]);
  });

  it("uses safeStorage in E2E mode too", async () => {
    const store = createSecretStore({
      userData: await root(),
      safeStorage: testSafeStorage(),
    });
    await store.set("termco", "openai", "isolated-secret");
    expect(await store.get("termco", "openai")).toBe("isolated-secret");
  });

  it("encrypts persisted secrets with Electron safeStorage", async () => {
    const userData = await root();
    const encryptString = vi.fn((value: string) =>
      Buffer.from(`encrypted:${value}`, "utf8"),
    );
    const decryptString = vi.fn((value: Buffer) =>
      value.toString("utf8").replace(/^encrypted:/, ""),
    );
    const store = createSecretStore({
      userData,
      safeStorage: {
        isEncryptionAvailable: () => true,
        encryptString,
        decryptString,
      },
    });
    await store.set("termco", "openai", "secret");
    const persisted = await fs.readFile(
      join(userData, "secrets.safe-storage.json"),
      "utf8",
    );
    expect(persisted).not.toContain("secret");
    expect(encryptString).toHaveBeenCalledWith("secret");
    expect(await store.get("termco", "openai")).toBe("secret");
    expect(decryptString).toHaveBeenCalledOnce();
    await store.delete("termco", "openai");
    expect(await store.get("termco", "openai")).toBeNull();
  });

  it("fails clearly when Electron secure storage is unavailable", async () => {
    const store = createSecretStore({
      userData: await root(),
      safeStorage: {
        isEncryptionAvailable: () => false,
        encryptString: vi.fn(),
        decryptString: vi.fn(),
      },
    });

    await expect(store.set("termco", "openai", "secret")).rejects.toThrow(
      "Electron safeStorage is unavailable",
    );
  });
});
