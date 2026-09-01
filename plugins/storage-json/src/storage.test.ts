// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createJsonStorage } from "./storage";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true })));
});

async function root(): Promise<string> {
  const path = await fs.mkdtemp(join(tmpdir(), "termco-storage-plugin-"));
  roots.push(path);
  return path;
}

describe("storage-json", () => {
  it("shares one live store between consumers and persists it", async () => {
    const directory = await root();
    const storage = createJsonStorage(directory);
    const first = await storage.open("settings.json", { theme: "system" });
    const second = await storage.open("settings.json");
    first.set("theme", "dark");
    expect(second.get("theme")).toBe("dark");
    await second.save();
    const persisted = JSON.parse(
      await fs.readFile(join(directory, "settings.json"), "utf8"),
    );
    expect(persisted).toEqual({ theme: "dark" });
  });

  it("serializes concurrent saves without colliding on the temporary file", async () => {
    const directory = await root();
    const storage = createJsonStorage(directory);
    const store = await storage.open("state.json");
    store.set("revision", 1);
    const first = store.save();
    store.set("revision", 2);
    const second = store.save();
    await Promise.all([first, second]);
    const persisted = JSON.parse(
      await fs.readFile(join(directory, "state.json"), "utf8"),
    );
    expect(persisted.revision).toBe(2);
  });

  it("refuses paths that escape the provider-owned storage directory", async () => {
    const storage = createJsonStorage(await root());
    await expect(storage.open("../secrets.json")).rejects.toThrow(/bare filename/);
  });
});
