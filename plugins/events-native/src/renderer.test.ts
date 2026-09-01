import {
  createKernelEvents,
  type KernelEventsCapability,
  type ProcessTransport,
} from "@termco/kernel";
import { describe, expect, it, vi } from "vitest";
import { connectRendererApplicationEvents } from "./renderer";

describe("application-events renderer bridge", () => {
  it("redirects local emits through main and delivers the remote echo once", async () => {
    let channelListener: ((...messages: unknown[]) => void) | undefined;
    const releaseChannel = vi.fn();
    const releaseRemote = vi.fn(async () => undefined);
    const transport = {
      call: vi.fn(async () => ({ __termcoRemoteDispose: 7 })),
      registerChannel(listener) {
        channelListener = listener;
        return { __termcoChannel: 3 };
      },
      releaseChannel,
      releaseRemote,
    } satisfies ProcessTransport;
    const local: KernelEventsCapability = createKernelEvents();
    const connectOutbound = vi.fn(local.connectOutbound);
    local.connectOutbound = connectOutbound;
    const dispose = connectRendererApplicationEvents(local, transport);
    const listener = vi.fn();
    local.subscribeAll(listener);

    local.emit("company.updated", { id: 4 });
    expect(listener).not.toHaveBeenCalled();
    expect(transport.call).toHaveBeenCalledWith(
      "events.application",
      "emit",
      ["company.updated", { id: 4 }],
    );

    channelListener?.("company.updated", { id: 4 });
    expect(listener).toHaveBeenCalledWith("company.updated", { id: 4 });
    dispose();
    dispose();
    await Promise.resolve();
    expect(releaseChannel).toHaveBeenCalledTimes(1);
    expect(releaseRemote).toHaveBeenCalledTimes(1);
    expect(connectOutbound).toHaveBeenCalledTimes(1);

    local.emit("local.fallback", true);
    expect(listener).toHaveBeenCalledWith("local.fallback", true);
  });
});
