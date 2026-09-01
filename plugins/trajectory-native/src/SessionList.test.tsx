import { SessionId, SessionRevision, type SessionHistoryCapability, type SessionListing } from "@termco/session-base";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SessionList } from "./SessionList";

afterEach(cleanup);

function listing(id: string, parent?: string, health: SessionListing["health"] = "healthy"): SessionListing {
  return {
    sessionId: SessionId(id),
    createdAt: 1,
    updatedAt: Date.now(),
    backend: "chat",
    fidelity: "full",
    revision: SessionRevision(1),
    title: id,
    health,
    ...(parent ? { parentSessionId: SessionId(parent) } : {}),
  };
}

describe("SessionList", () => {
  it("presents parent and child sessions as an accessible lineage tree", async () => {
    const history = {
      list: async () => ({ sessions: [listing("child", "root"), listing("root")], exhausted: true }),
    } as unknown as SessionHistoryCapability;
    render(<SessionList history={history} onOpenSession={vi.fn()} onResume={vi.fn()} />);

    const tree = await screen.findByRole("tree", { name: "Recorded session lineage" });
    const rows = screen.getAllByRole("treeitem");
    expect(tree).toBeTruthy();
    expect(rows.map((row) => row.getAttribute("aria-level"))).toEqual(["1", "2"]);
    expect(rows[0]?.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Child of root")).toBeTruthy();
  });

  it("keeps corrupt sessions inspectable but prevents unsafe resume", async () => {
    const history = {
      list: async () => ({ sessions: [listing("broken", undefined, "corrupt-prefix")], exhausted: true }),
    } as unknown as SessionHistoryCapability;
    render(<SessionList history={history} onOpenSession={vi.fn()} onResume={vi.fn()} />);

    expect((await screen.findByRole("button", { name: "Resume broken" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("Corrupt history")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Open broken" }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("labels sessions that are safely waiting for input and keeps resume available", async () => {
    const history = {
      list: async () => ({ sessions: [listing("paused", undefined, "waiting-input")], exhausted: true }),
    } as unknown as SessionHistoryCapability;
    render(<SessionList history={history} onOpenSession={vi.fn()} onResume={vi.fn()} />);

    expect(await screen.findByText("Waiting for input")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Resume paused" }) as HTMLButtonElement).disabled).toBe(false);
  });
});
