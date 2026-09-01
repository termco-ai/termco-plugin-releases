import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearEditorSessions,
  editorSessions,
  registerEditorSession,
} from "./sessions";

afterEach(clearEditorSessions);

describe("editor sessions", () => {
  it("resolves whenReady when the source-owned editor handle mounts", async () => {
    const ready = vi.fn();
    const pending = editorSessions.whenReady(7).then(ready);
    await Promise.resolve();
    expect(ready).not.toHaveBeenCalled();

    registerEditorSession(7, {} as never);
    await pending;
    expect(ready).toHaveBeenCalledOnce();
  });

  it("resolves immediately for an already-mounted editor", async () => {
    registerEditorSession(4, {} as never);
    await expect(editorSessions.whenReady(4)).resolves.toBeUndefined();
  });

  it("releases pending consumers during provider disposal", async () => {
    const pending = editorSessions.whenReady(9);
    clearEditorSessions();
    await expect(pending).resolves.toBeUndefined();
  });
});
