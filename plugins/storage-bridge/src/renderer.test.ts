import { bindProcessTransport, type CapabilityTransport } from "@termco/kernel";
import { describe, expect, it, vi } from "vitest";
import { createRendererPreferencesCapability } from "./renderer";

describe("storage renderer bridge", () => {
  it("routes methods through the bridge Fiber identity", async () => {
    const call = vi.fn(async () => undefined);
    const transport = bindProcessTransport(
      "storage-bridge",
      call as CapabilityTransport,
    );
    const capability = createRendererPreferencesCapability(transport);

    await capability.set("terminalFontSize", 15);

    expect(call).toHaveBeenCalledExactlyOnceWith({
      consumerPluginId: "storage-bridge",
      capability: "settings.preferences",
      method: "set",
      args: ["terminalFontSize", 15],
    });
  });

  it("projects committed changes and releases channel plus remote disposer", async () => {
    let eventListener: (...payload: unknown[]) => void = () => {};
    const releaseChannel = vi.fn();
    const remoteDispose = { __termcoDispose: "preferences-1" };
    const call = Object.assign(
      vi.fn(async (request: { method: string }) =>
        request.method === "subscribe" ? remoteDispose : undefined,
      ),
      {
        registerChannel: vi.fn((listener: (...payload: unknown[]) => void) => {
          eventListener = listener;
          return 8;
        }),
        releaseChannel,
      },
    ) as CapabilityTransport;
    const capability = createRendererPreferencesCapability(
      bindProcessTransport("storage-bridge", call),
    );
    const listener = vi.fn();

    const unsubscribe = capability.subscribe(listener);
    eventListener("zoomLevel", 1.25);
    eventListener(undefined, 2);

    expect(listener).toHaveBeenCalledExactlyOnceWith("zoomLevel", 1.25);
    unsubscribe();
    await vi.waitFor(() => {
      expect(releaseChannel).toHaveBeenCalledExactlyOnceWith(8);
      expect(call).toHaveBeenLastCalledWith({
        consumerPluginId: "storage-bridge",
        capability: "kernel.process-transport",
        method: "release",
        args: [remoteDispose],
      });
    });
  });

  it("keeps preferences usable in memory while the main provider is disabled", async () => {
    const unavailable = new Error(
      'capability "settings.preferences" is unavailable',
    );
    const call = vi.fn(async () => {
      throw unavailable;
    });
    const capability = createRendererPreferencesCapability(
      bindProcessTransport("storage-bridge", call as CapabilityTransport),
    );

    await expect(capability.get("theme")).resolves.toBeUndefined();
    await expect(capability.set("theme", "dark")).resolves.toBeUndefined();
    await expect(capability.get("theme")).resolves.toBe("dark");
    await expect(capability.getMany(["theme", "missing"])).resolves.toEqual({
      theme: "dark",
    });
    await expect(capability.delete("theme")).resolves.toBe(true);
    await expect(capability.get("theme")).resolves.toBeUndefined();
  });

  it("does not hide preference provider failures unrelated to availability", async () => {
    const call = vi.fn(async () => {
      throw new Error("preference file is corrupt");
    });
    const capability = createRendererPreferencesCapability(
      bindProcessTransport("storage-bridge", call as CapabilityTransport),
    );

    await expect(capability.get("theme")).rejects.toThrow(
      "preference file is corrupt",
    );
  });
});
