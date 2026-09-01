// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHeaderRuntime } from "../../testRuntime";
import type { AgentNotification, AgentSession, HeaderRuntime } from "../../types";

const mocks = vi.hoisted(() => ({
  status: vi.fn(async () => false),
  enable: vi.fn(async () => undefined),
}));

vi.mock("../../runtime", () => ({
  headerDependencies: () => ({
    agentHooks: { status: mocks.status, enable: mocks.enable },
  }),
}));

import { NotificationBell } from "./index";

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let sessions: AgentSession[];
let notifications: AgentNotification[];
let runtime: HeaderRuntime;

function notification(kind: AgentNotification["kind"], id = String(notifications.length)): AgentNotification {
  return {
    id,
    source: "terminal",
    leafId: 7,
    tabId: 2,
    agent: "claude",
    kind,
    at: Date.now(),
    read: false,
    location: null,
  };
}

function rebuildRuntime() {
  runtime = createHeaderRuntime({
    agentSessions: sessions,
    agentNotifications: notifications,
    markAgentNotificationsRead: vi.fn(() => {
      for (const entry of notifications) entry.read = true;
    }),
    clearAgentNotifications: vi.fn(() => {
      notifications.splice(0);
    }),
  });
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
  mocks.status.mockReset().mockResolvedValue(false);
  mocks.enable.mockReset().mockResolvedValue(undefined);
  sessions = [];
  notifications = [];
  rebuildRuntime();
});

afterEach(cleanup);

function setup() {
  rebuildRuntime();
  const onActivate = vi.fn();
  const onActivateLocal = vi.fn();
  render(
    <NotificationBell
      runtime={runtime}
      onActivate={onActivate}
      onActivateLocal={onActivateLocal}
    />,
  );
  return { onActivate, onActivateLocal };
}

const bellButton = () => screen.getByTitle("Agent activity");

describe("NotificationBell", () => {
  it("shows no badge when idle", () => {
    setup();
    expect(bellButton().querySelector("span")).toBeNull();
  });

  it("counts waiting sessions and unread completed events", () => {
    sessions.push({ source: "terminal", leafId: 7, tabId: 2, agent: "claude", status: "waiting", location: null });
    notifications.push(notification("finished"), notification("attention"));
    setup();
    expect(bellButton().textContent).toBe("2");
  });

  it("caps the badge display at 9+", () => {
    for (let i = 0; i < 12; i += 1) notifications.push(notification("finished", String(i)));
    setup();
    expect(bellButton().textContent).toBe("9+");
  });

  it("opening marks all read and refreshes hook status", async () => {
    notifications.push(notification("finished"));
    setup();
    fireEvent.click(bellButton());
    await waitFor(() => expect(notifications.every((entry) => entry.read)).toBe(true));
    await waitFor(() => expect(mocks.status).toHaveBeenCalledTimes(3));
  });

  it("shows the empty state when there is no activity", async () => {
    setup();
    fireEvent.click(bellButton());
    expect(await screen.findByText(/No agent activity yet/)).toBeDefined();
  });

  it("activates local and terminal sessions", async () => {
    sessions.push(
      { source: "local", leafId: 0, tabId: 0, agent: "termco", status: "working", location: null },
      { source: "terminal", leafId: 7, tabId: 2, agent: "claude", status: "working", location: null },
    );
    const { onActivateLocal } = setup();
    fireEvent.click(bellButton());
    fireEvent.click((await screen.findByText("Termco")).closest("button") as HTMLElement);
    expect(onActivateLocal).toHaveBeenCalledOnce();
  });

  it("clears the notification feed", async () => {
    notifications.push(notification("finished"));
    setup();
    fireEvent.click(bellButton());
    fireEvent.click(await screen.findByText("Clear all"));
    expect(notifications).toEqual([]);
  });

  it("enables hooks from the collapsed setup section", async () => {
    setup();
    fireEvent.click(bellButton());
    fireEvent.click(screen.getByText("Alert hooks"));
    fireEvent.click((await screen.findAllByText("Enable"))[0]);
    await waitFor(() => expect(mocks.enable).toHaveBeenCalledWith("claude"));
  });
});
