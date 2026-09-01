import { describe, expect, it } from "vitest";
import type { WorkspaceRig } from "@termco/workspace-base";
import { orderedConnectionIds } from "./order";

const rigs: Array<Pick<WorkspaceRig, "id" | "name" | "root" | "workspace">> = [
  { id: "local", name: "Local", root: null, workspace: { kind: "local" } },
  { id: "a", name: "A", root: null, workspace: { kind: "ssh", connectionId: "a@host", host: "host", user: "a" } },
  { id: "b", name: "B", root: null, workspace: { kind: "ssh", connectionId: "b@host", host: "host", user: "b" } },
  { id: "a-copy", name: "A2", root: null, workspace: { kind: "ssh", connectionId: "a@host", host: "host", user: "a" } },
];

describe("SSH startup order", () => {
  it("connects the active host first and deduplicates remaining hosts", () => {
    expect(orderedConnectionIds(rigs, "b")).toEqual(["b@host", "a@host"]);
  });

  it("keeps rig order when the active rig is local", () => {
    expect(orderedConnectionIds(rigs, "local")).toEqual(["a@host", "b@host"]);
  });
});
