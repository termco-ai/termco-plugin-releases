// @vitest-environment node
import { NETWORK_HTTP_SERVICE, type HttpCapability } from "@termco/http-base";
import { processTransportService, type ProcessTransport } from "@termco/kernel";
import { describe, expect, it, vi } from "vitest";
import plugin from "./renderer";

describe("company HTTP renderer bridge", () => {
  it("projects the selected company main provider through the generic transport", async () => {
    const transport = {
      call: vi.fn(async () => 298),
      registerChannel: vi.fn(),
      releaseChannel: vi.fn(),
      releaseRemote: vi.fn(),
    } as unknown as ProcessTransport;
    let capability: HttpCapability | undefined;

    await plugin.activate({
      get: (service: string) => {
        expect(service).toBe(processTransportService);
        return transport;
      },
      effect: vi.fn(),
      provide: (service: string, value: unknown) => {
        expect(service).toBe(NETWORK_HTTP_SERVICE);
        capability = value as HttpCapability;
        return () => {};
      },
    } as never);

    await expect(capability?.ping("https://example.invalid")).resolves.toBe(
      298,
    );
    expect(transport.call).toHaveBeenCalledExactlyOnceWith(
      NETWORK_HTTP_SERVICE,
      "ping",
      ["https://example.invalid"],
    );
  });
});
