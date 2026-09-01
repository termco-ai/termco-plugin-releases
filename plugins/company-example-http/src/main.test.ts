// @vitest-environment node
import type { HttpCapability } from "@termco/http-base";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "./main";

afterEach(() => vi.unstubAllGlobals());

describe("example company HTTP provider", () => {
  it("publishes one shared provider and returns response bytes", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response("company", {
          status: 201,
          headers: { "x-company-provider": "example" },
        }),
      ),
    );
    let capability: HttpCapability | undefined;
    await plugin.activate({
      provide: (id: string, value: unknown) => {
        expect(id).toBe("network.http");
        capability = value as HttpCapability;
        return () => {};
      },
    } as never);

    const response = await capability?.request({ url: "https://example.test" });
    expect(response).toMatchObject({
      status: 201,
      headers: { "x-company-provider": "example" },
    });
    expect(new TextDecoder().decode(new Uint8Array(response?.body ?? []))).toBe(
      "company",
    );
  });

  it("rejects non-HTTP protocols before calling the network", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    let capability: HttpCapability | undefined;
    await plugin.activate({
      provide: (_id: string, value: unknown) => {
        capability = value as HttpCapability;
        return () => {};
      },
    } as never);
    await expect(capability?.request({ url: "file:///etc/passwd" })).rejects.toThrow(
      "unsupported HTTP protocol",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
