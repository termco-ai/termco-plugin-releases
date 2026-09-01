import { describe, expect, it } from "vitest";
import { createRunStore, type RunStoreDeps } from "./persistence";

/** An in-memory fs seam. */
function memFs(initial: string | null = null) {
  let text = initial;
  const deps: RunStoreDeps = {
    read: () => text,
    write: (t) => {
      text = t;
    },
  };
  return { deps, current: () => text };
}

describe("createRunStore", () => {
  it("upserts, persists, and lists newest-first", () => {
    const fs = memFs();
    const store = createRunStore(fs.deps);
    store.upsert({ runId: "a", backend: "claude", cwd: "/r", createdAt: 1, status: "running" });
    store.upsert({ runId: "b", backend: "codex", cwd: "/r", createdAt: 2, status: "idle" });
    const list = store.list();
    expect(list.map((r) => r.runId)).toEqual(["b", "a"]);
    // The write seam captured the serialized records.
    expect(JSON.parse(fs.current()!)).toHaveLength(2);
  });

  it("merges an upsert, preserving unspecified fields", () => {
    const fs = memFs();
    const store = createRunStore(fs.deps);
    store.upsert({
      runId: "a",
      backend: "claude",
      title: "the task",
      cwd: "/r",
      permissionMode: "bypass",
      createdAt: 1,
      status: "running",
    });
    // A later event only knows the session id + status.
    store.upsert({ runId: "a", sessionId: "s1", status: "done", updatedAt: 5 });
    const rec = store.list()[0];
    expect(rec).toMatchObject({
      runId: "a",
      title: "the task",
      permissionMode: "bypass",
      sessionId: "s1",
      status: "done",
      updatedAt: 5,
    });
  });

  it("loads persisted records from disk", () => {
    const seed = JSON.stringify([
      { runId: "x", backend: "claude", title: "x", cwd: "/r", sessionId: "s", projectSlug: null, createdAt: 3, updatedAt: 3, status: "done", workspace: { kind: "local" }, rigId: null },
    ]);
    const fs = memFs(seed);
    const store = createRunStore(fs.deps);
    store.load();
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].runId).toBe("x");
  });

  it("tolerates a missing or corrupt file", () => {
    expect(() => createRunStore(memFs(null).deps).load()).not.toThrow();
    const corrupt = createRunStore(memFs("{not json").deps);
    expect(() => corrupt.load()).not.toThrow();
    expect(corrupt.list()).toEqual([]);
  });

  it("round-trips the run's workspace and preserves it across partial upserts", () => {
    const fs = memFs();
    const store = createRunStore(fs.deps);
    const ssh = {
      kind: "ssh" as const,
      connectionId: "c1",
      host: "opendoc-v2",
      user: "root",
    };
    store.upsert({
      runId: "a",
      backend: "claude",
      cwd: "/srv/app",
      createdAt: 1,
      status: "running",
      workspace: ssh,
    });
    // A later status-only upsert must not drop the workspace.
    store.upsert({ runId: "a", status: "done", updatedAt: 5 });
    // Reload from the serialized text — the field survives disk.
    const reloaded = createRunStore(fs.deps);
    reloaded.load();
    expect(reloaded.get("a")?.workspace).toEqual(ssh);
    expect(reloaded.get("a")?.workspace).toEqual(ssh);
  });

  it("round-trips rigId and preserves it across partial upserts", () => {
    const fs = memFs();
    const store = createRunStore(fs.deps);
    store.upsert({ runId: "a", backend: "claude", cwd: "/r", createdAt: 1, status: "running", rigId: "rig-7" });
    store.upsert({ runId: "a", status: "done", updatedAt: 5 });
    const reloaded = createRunStore(fs.deps);
    reloaded.load();
    expect(reloaded.get("a")?.rigId).toBe("rig-7");
  });

  it("rejects records that do not satisfy the current persisted schema", () => {
    const seed = JSON.stringify([
      { runId: "old", backend: "claude", title: "old", cwd: "/r", sessionId: null, projectSlug: null, createdAt: 3, updatedAt: 3, status: "done", rigId: null },
    ]);
    const store = createRunStore(memFs(seed).deps);
    store.load();
    expect(store.get("old")).toBeUndefined();
  });

  it("rejects records without an explicit rig scope", () => {
    const seed = JSON.stringify([
      { runId: "old", backend: "claude", title: "old", cwd: "/r", sessionId: null, projectSlug: null, createdAt: 3, updatedAt: 3, status: "done", workspace: { kind: "local" } },
    ]);
    const store = createRunStore(memFs(seed).deps);
    store.load();
    expect(store.get("old")).toBeUndefined();
  });

  it("persists an explicit local workspace for new local runs", () => {
    const fs = memFs();
    const store = createRunStore(fs.deps);
    store.upsert({ runId: "local", backend: "claude", cwd: "/r", createdAt: 1, status: "idle" });
    expect(store.get("local")?.workspace).toEqual({ kind: "local" });
    expect(store.get("local")?.rigId).toBeNull();
    const reloaded = createRunStore(fs.deps);
    reloaded.load();
    expect(reloaded.get("local")?.workspace).toEqual({ kind: "local" });
  });

  it("gets a single record by id", () => {
    const store = createRunStore(memFs().deps);
    store.upsert({ runId: "a", backend: "claude", cwd: "/r", createdAt: 1, status: "idle" });
    expect(store.get("a")?.runId).toBe("a");
    expect(store.get("nope")).toBeUndefined();
  });

  it("removes a record and re-persists", () => {
    const fs = memFs();
    const store = createRunStore(fs.deps);
    store.upsert({ runId: "a", backend: "claude", cwd: "/r", createdAt: 1, status: "idle" });
    store.remove("a");
    expect(store.list()).toEqual([]);
    expect(JSON.parse(fs.current()!)).toEqual([]);
  });
});
// Owned by the coding-agent-native provider plugin.
