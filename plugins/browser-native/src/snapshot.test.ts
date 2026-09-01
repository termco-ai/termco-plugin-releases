import { describe, expect, it } from "vitest";
import { buildAxSnapshot, type AXNode } from "./snapshot";

function node(partial: Partial<AXNode> & { nodeId: string }): AXNode {
  return partial;
}

const rootFrame = (childIds: string[]): AXNode =>
  node({ nodeId: "1", role: { value: "RootWebArea" }, childIds });

describe("buildAxSnapshot", () => {
  it("emits numbered refs mapped to backend node ids for interactive nodes", () => {
    const nodes: AXNode[] = [
      rootFrame(["2", "3"]),
      node({
        nodeId: "2",
        role: { value: "button" },
        name: { value: "Sign in" },
        backendDOMNodeId: 100,
      }),
      node({
        nodeId: "3",
        role: { value: "link" },
        name: { value: "Forgot password?" },
        backendDOMNodeId: 101,
      }),
    ];
    const { text, refs } = buildAxSnapshot(nodes, 3);
    expect(text).toContain('- button "Sign in" [ref=s3e1]');
    expect(text).toContain('- link "Forgot password?" [ref=s3e2]');
    expect(refs.get("s3e1")).toBe(100);
    expect(refs.get("s3e2")).toBe(101);
  });

  it("uses Chromium-computed names for images and disambiguates duplicates", () => {
    const nodes: AXNode[] = [
      rootFrame(["2", "3", "4"]),
      node({
        nodeId: "2",
        role: { value: "link" },
        name: { value: "sheep" },
        backendDOMNodeId: 10,
      }),
      node({
        nodeId: "3",
        role: { value: "link" },
        name: { value: "sheep" },
        backendDOMNodeId: 11,
      }),
      node({
        nodeId: "4",
        role: { value: "link" },
        name: { value: "" },
        backendDOMNodeId: 12,
      }),
    ];
    const { text, refs } = buildAxSnapshot(nodes, 1);
    // Duplicate "sheep" links get distinct labels...
    expect(text).toContain('"sheep" [ref=s1e1]');
    expect(text).toContain('"sheep #2" [ref=s1e2]');
    // ...and an unnamed link still gets a distinct, resolvable ref.
    expect(refs.get("s1e3")).toBe(12);
    expect(refs.size).toBe(3);
  });

  it("skips ignored nodes but descends into their children", () => {
    const nodes: AXNode[] = [
      rootFrame(["2"]),
      node({ nodeId: "2", ignored: true, childIds: ["3"] }),
      node({
        nodeId: "3",
        role: { value: "button" },
        name: { value: "Go" },
        backendDOMNodeId: 5,
      }),
    ];
    const { text, refs } = buildAxSnapshot(nodes, 1);
    expect(text).toContain('- button "Go" [ref=s1e1]');
    expect(refs.get("s1e1")).toBe(5);
  });

  it("renders headings and static text, and a textbox value", () => {
    const nodes: AXNode[] = [
      rootFrame(["2", "3", "4"]),
      node({ nodeId: "2", role: { value: "heading" }, name: { value: "Login" } }),
      node({
        nodeId: "3",
        role: { value: "StaticText" },
        name: { value: "Welcome back" },
      }),
      node({
        nodeId: "4",
        role: { value: "textbox" },
        name: { value: "Email" },
        value: { value: "me@x.dev" },
        backendDOMNodeId: 7,
      }),
    ];
    const { text } = buildAxSnapshot(nodes, 1);
    expect(text).toContain('- heading "Login"');
    expect(text).toContain('- text: "Welcome back"');
    expect(text).toContain('- textbox "Email" [ref=s1e1] value="me@x.dev"');
  });
});
