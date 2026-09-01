import { describe, expect, it, vi } from "vitest";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { PreferencesCapability } from "@termco/storage-base";
import {
  configureAiUiPreferences,
  usePreferencesStore,
} from "./preferences";

describe("AI UI preference bootstrap", () => {
  it("loads custom endpoint context metadata before activation completes", async () => {
    const endpoint = {
      id: "local",
      name: "Test",
      baseURL: "http://localhost:20128/v1",
      modelId: "gh/gpt-5.6-sol",
      contextLimit: 1_000_000,
    };
    const preferences = {
      getMany: vi.fn(async () => ({ customEndpoints: [endpoint] })),
    } as unknown as PreferencesCapability;
    const disposeEvent = vi.fn();
    const events = {
      subscribe: vi.fn(() => disposeEvent),
    } as unknown as ApplicationEventsCapability;

    const dispose = await configureAiUiPreferences(preferences, events);

    expect(usePreferencesStore.getState().customEndpoints).toEqual([endpoint]);
    dispose();
    expect(disposeEvent).toHaveBeenCalledOnce();
  });
});
