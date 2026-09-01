import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ensureServer = vi.hoisted(() => vi.fn());
vi.mock("./deploy", () => ({ ensureServer }));

import {
  CONNECT_FAILURE_BACKOFF_MS,
  connectionStatus,
  disconnectAll,
  getConnection,
} from "./connection";

describe("SSH connection failure coalescing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-19T08:00:00Z"));
    ensureServer.mockReset();
  });

  afterEach(async () => {
    await disconnectAll();
    vi.useRealTimers();
  });

  it("shares one failed attempt across callers and retries after cooldown", async () => {
    ensureServer.mockRejectedValue(new Error("network is unreachable"));
    const target = {
      connectionId: "offline-host",
      host: "offline-host",
    };

    const first = getConnection(target);
    const concurrent = getConnection(target);
    expect(concurrent).toBe(first);
    await expect(first).rejects.toThrow("network is unreachable");
    await expect(concurrent).rejects.toThrow("network is unreachable");
    expect(ensureServer).toHaveBeenCalledOnce();
    expect(connectionStatus(target.connectionId)).toEqual({
      connectionId: target.connectionId,
      state: "error",
      error: "network is unreachable",
    });

    const cachedFailure = getConnection(target);
    expect(cachedFailure).toBe(first);
    await expect(cachedFailure).rejects.toThrow("network is unreachable");
    expect(ensureServer).toHaveBeenCalledOnce();

    vi.advanceTimersByTime(CONNECT_FAILURE_BACKOFF_MS + 1);
    const retry = getConnection(target);
    expect(retry).not.toBe(first);
    await expect(retry).rejects.toThrow("network is unreachable");
    expect(ensureServer).toHaveBeenCalledTimes(2);
  });
});
