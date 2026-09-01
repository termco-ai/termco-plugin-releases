// @vitest-environment jsdom
import type { PluginActivationContext } from "@termco/kernel";
import {
  UI_CHANGE_REVEAL_ADAPTERS_SERVICE,
  UI_CHANGE_REVEAL_SERVICE,
  type UiChangeRevealAdapterDirectory,
  type UiChangeRevealCapability,
} from "@termco/ui-change-reveal-base";
import {
  UI_CONTRIBUTION_EVIDENCE_SERVICE,
  type UiContributionEvidenceCapability,
  type UiContributionRef,
} from "@termco/ui-shell-base";
import { afterEach, describe, expect, it, vi } from "vitest";
import plugin from "./index";

const REF: UiContributionRef = {
  service: "ui.overlays",
  pluginId: "calculator-fab",
  generation: "sha256-calculator-v1",
  key: "calculator-fab",
  contributionId: "calculator-fab",
};

function evidence(refs: readonly UiContributionRef[]): UiContributionEvidenceCapability {
  return {
    snapshot: () => refs,
    subscribe: () => () => {},
    verify: vi.fn(),
  };
}

async function activate(refs: readonly UiContributionRef[]) {
  const provided = new Map<string, unknown>();
  const effects: Array<() => void | Promise<void>> = [];
  const context = {
    pluginId: "ui-change-reveal-native",
    generation: "sha256-reveal-v1",
    get(service: string) {
      if (service === UI_CONTRIBUTION_EVIDENCE_SERVICE) return evidence(refs);
      throw new Error(`unexpected service: ${service}`);
    },
    provide(service: string, value: unknown) {
      provided.set(service, value);
      return () => provided.delete(service);
    },
    async effect(install: () => () => void | Promise<void>) {
      const dispose = install();
      effects.push(dispose);
      return dispose;
    },
  } as unknown as PluginActivationContext;
  const dispose = await plugin.activate(context);
  return {
    reveal: provided.get(UI_CHANGE_REVEAL_SERVICE) as UiChangeRevealCapability,
    adapters: provided.get(
      UI_CHANGE_REVEAL_ADAPTERS_SERVICE,
    ) as UiChangeRevealAdapterDirectory,
    async dispose() {
      if (typeof dispose === "function") await dispose();
      for (const effect of effects.reverse()) await effect();
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("semantic change reveal", () => {
  it("does no idle polling and reveals only the exact owned generation", async () => {
    vi.useFakeTimers();
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn(() => ({ matches: true })),
    });
    document.body.innerHTML = `
      <button
        data-plugin-owner="other-plugin"
        data-plugin-generation="sha256-other"
        data-contribution-service="ui.overlays"
        data-contribution-key="calculator-fab"
      >Other calculator</button>
      <button
        data-plugin-owner="calculator-fab"
        data-plugin-generation="sha256-calculator-v1"
        data-contribution-service="ui.overlays"
        data-contribution-key="calculator-fab"
      >Calculator</button>
    `;

    const runtime = await activate([REF]);
    expect(vi.getTimerCount()).toBe(0);
    const exact = document.querySelectorAll<HTMLElement>("button")[1];
    runtime.adapters.register({
      id: "overlay-host-reveal",
      services: ["ui.overlays"],
      reveal: async (request) => ({
        status: "revealed",
        target: request.target,
        message: "The overlay host located the exact control.",
        element: exact,
      }),
    }, {
      pluginId: "ui-shell-native",
      generation: "sha256-shell-v1",
      key: "overlay-host-reveal",
    });

    await expect(runtime.reveal.reveal({
      target: REF,
      mode: "show-and-spotlight",
      announcement: "Calculator was added as a floating control.",
    })).resolves.toMatchObject({ status: "revealed", target: REF });

    const [other] = document.querySelectorAll<HTMLElement>("button");
    expect(other.dataset.pluginChangeReveal).toBeUndefined();
    expect(exact.dataset.pluginChangeReveal).toBe("static");
    expect(document.querySelector("[aria-live=polite]")?.textContent).toBe(
      "Calculator was added as a floating control.",
    );
    expect(vi.getTimerCount()).toBe(1);
    await runtime.dispose();
    expect(vi.getTimerCount()).toBe(0);
    expect(exact.dataset.pluginChangeReveal).toBeUndefined();
    expect(exact.style.outline).toBe("");
  });

  it("rejects a stale generation without routing or announcing it", async () => {
    const runtime = await activate([{ ...REF, generation: "sha256-calculator-v2" }]);
    const reveal = vi.fn();
    runtime.adapters.register({
      id: "overlay-host-reveal",
      services: ["ui.overlays"],
      reveal,
    }, {
      pluginId: "ui-shell-native",
      generation: "sha256-shell-v1",
      key: "overlay-host-reveal",
    });

    await expect(runtime.reveal.reveal({
      target: REF,
      mode: "spotlight",
      announcement: "This must not be announced.",
    })).resolves.toMatchObject({
      status: "not-found",
      message: "The verified contribution generation is no longer active.",
    });

    expect(reveal).not.toHaveBeenCalled();
    expect(document.querySelector("[data-plugin-change-announcer]")).toBeNull();
    await runtime.dispose();
  });

  it("routes a current contribution to one surface-owned adapter and cleans it up", async () => {
    const commandRef: UiContributionRef = {
      ...REF,
      service: "ui.commands",
      key: "calculator.open",
      contributionId: "calculator.open",
    };
    const runtime = await activate([commandRef]);
    const reveal = vi.fn(async (request) => ({
      status: "revealed" as const,
      target: request.target,
      message: "The command palette is filtered to the new command.",
    }));
    const disposeAdapter = runtime.adapters.register({
      id: "command-palette-reveal",
      services: ["ui.commands"],
      reveal,
    }, {
      pluginId: "command-palette-native",
      generation: "sha256-palette-v1",
      key: "command-palette-reveal",
    });

    await expect(runtime.reveal.reveal({
      target: commandRef,
      mode: "show",
      announcement: "Calculator command is ready.",
    })).resolves.toMatchObject({ status: "revealed" });
    expect(reveal).toHaveBeenCalledOnce();

    disposeAdapter();
    await expect(runtime.reveal.reveal({
      target: commandRef,
      mode: "show",
      announcement: "Calculator command is ready.",
    })).resolves.toMatchObject({ status: "unsupported" });
    await runtime.dispose();
  });
});
