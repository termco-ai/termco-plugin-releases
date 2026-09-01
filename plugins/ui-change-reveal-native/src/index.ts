import type { ContributionRecord, PluginModule } from "@termco/kernel";
import {
  UI_CHANGE_REVEAL_ADAPTERS_SERVICE,
  UI_CHANGE_REVEAL_SERVICE,
  type UiChangeRevealAdapter,
  type UiChangeRevealAdapterResult,
  type UiChangeRevealAdapterDirectory,
  type UiChangeRevealCapability,
  type UiChangeRevealResult,
} from "@termco/ui-change-reveal-base";
import {
  UI_CONTRIBUTION_EVIDENCE_SERVICE,
  type UiContributionEvidenceCapability,
} from "@termco/ui-shell-base";

function createAdapterRegistry(): UiChangeRevealAdapterDirectory {
  const listeners = new Set<() => void>();
  let records: readonly ContributionRecord<UiChangeRevealAdapter>[] = [];
  return {
    register(adapter, owner) {
      if (records.some((record) => record.value.id === adapter.id)) {
        throw new Error(`reveal adapter "${adapter.id}" is already registered`);
      }
      const record = { ...owner, value: adapter };
      records = [...records, record];
      for (const listener of listeners) listener();
      let active = true;
      return () => {
        if (!active) return;
        active = false;
        records = records.filter((candidate) => candidate !== record);
        for (const listener of listeners) listener();
      };
    },
    records: () => records,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

function announce(message: string): void {
  let region = document.querySelector<HTMLElement>("[data-plugin-change-announcer]");
  if (!region) {
    region = document.createElement("div");
    region.dataset.pluginChangeAnnouncer = "true";
    region.setAttribute("aria-live", "polite");
    region.setAttribute("aria-atomic", "true");
    Object.assign(region.style, {
      position: "fixed",
      width: "1px",
      height: "1px",
      overflow: "hidden",
      clipPath: "inset(50%)",
    });
    document.body.append(region);
  }
  region.textContent = message;
}

function spotlight(
  element: HTMLElement,
  active: Map<HTMLElement, () => void>,
): void {
  active.get(element)?.();
  const previousReveal = element.dataset.pluginChangeReveal;
  const previousOutline = element.style.outline;
  let settled = false;
  let timer: number | undefined;
  let animation: Animation | undefined;
  const dispose = () => {
    if (settled) return;
    settled = true;
    if (timer !== undefined) window.clearTimeout(timer);
    if (animation) {
      animation.onfinish = null;
      animation.oncancel = null;
      animation.cancel();
    }
    if (previousReveal === undefined) {
      delete element.dataset.pluginChangeReveal;
    } else {
      element.dataset.pluginChangeReveal = previousReveal;
    }
    element.style.outline = previousOutline;
    if (active.get(element) === dispose) active.delete(element);
  };
  active.set(element, dispose);
  const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  if (reduced || typeof element.animate !== "function") {
    element.dataset.pluginChangeReveal = "static";
    element.style.outline = "2px solid var(--primary)";
    timer = window.setTimeout(dispose, 4_000);
    return;
  }
  element.dataset.pluginChangeReveal = "active";
  animation = element.animate(
    [
      { outline: "0 solid color-mix(in srgb, var(--primary) 70%, transparent)", outlineOffset: "0px" },
      { outline: "2px solid color-mix(in srgb, var(--primary) 65%, transparent)", outlineOffset: "4px" },
      { outline: "0 solid transparent", outlineOffset: "8px" },
      { outline: "2px solid color-mix(in srgb, var(--primary) 65%, transparent)", outlineOffset: "4px" },
      { outline: "0 solid transparent", outlineOffset: "8px" },
    ],
    { duration: 1_400, easing: "ease-out", iterations: 1 },
  );
  animation.onfinish = dispose;
  animation.oncancel = dispose;
}

function createRevealCapability(
  evidence: UiContributionEvidenceCapability,
  adapters: UiChangeRevealAdapterDirectory,
  activeSpotlights: Map<HTMLElement, () => void>,
): UiChangeRevealCapability {
  return {
    async reveal(request): Promise<UiChangeRevealResult> {
      const current = evidence.snapshot().some((candidate) =>
        candidate.service === request.target.service &&
        candidate.pluginId === request.target.pluginId &&
        candidate.generation === request.target.generation &&
        candidate.key === request.target.key &&
        candidate.contributionId === request.target.contributionId
      );
      if (!current) {
        return {
          status: "not-found",
          target: request.target,
          message: "The verified contribution generation is no longer active.",
        };
      }
      const adapter = adapters.records().find((record) =>
        record.value.services.includes(request.target.service)
      )?.value;
      if (!adapter) {
        return {
          status: "unsupported",
          target: request.target,
          message: `No reveal adapter owns ${request.target.service}.`,
        };
      }
      const result: UiChangeRevealAdapterResult = await adapter.reveal(request);
      if (result.status === "revealed") {
        if (request.mode !== "show" && result.element) {
          spotlight(result.element, activeSpotlights);
        }
        announce(request.announcement);
      }
      return {
        status: result.status,
        target: result.target,
        message: result.message,
      };
    },
  };
}

const plugin: PluginModule = {
  inject: [UI_CONTRIBUTION_EVIDENCE_SERVICE],
  async activate(context) {
    const adapters = createAdapterRegistry();
    const activeSpotlights = new Map<HTMLElement, () => void>();
    context.provide<UiChangeRevealAdapterDirectory>(
      UI_CHANGE_REVEAL_ADAPTERS_SERVICE,
      adapters,
    );
    context.provide<UiChangeRevealCapability>(
      UI_CHANGE_REVEAL_SERVICE,
      createRevealCapability(
        context.get<UiContributionEvidenceCapability>(
          UI_CONTRIBUTION_EVIDENCE_SERVICE,
        ),
        adapters,
        activeSpotlights,
      ),
    );
    return () => {
      for (const dispose of [...activeSpotlights.values()]) dispose();
      activeSpotlights.clear();
      document.querySelector("[data-plugin-change-announcer]")?.remove();
    };
  },
};

export default plugin;
