import type { PluginModule } from "@termco/kernel";
import type { ShortcutRegistryCapability } from "@termco/shortcuts-base";
import { SETTINGS_PREFERENCES_SERVICE, type PreferencesCapability } from "@termco/storage-base";
import ui from "@termco/ui";
import { createStableShortcutRegistry } from "./model";

const { useLayoutEffect, useRef } = ui.React;

export function createStableShortcutCapability(
  target: Window = window,
): {
  capability: ShortcutRegistryCapability;
  bindPreferences(preferences: PreferencesCapability): Promise<() => void>;
  dispose(): void;
} {
  const model = createStableShortcutRegistry();
  const onKeyDown = (event: KeyboardEvent) => model.dispatch(event);
  target.addEventListener("keydown", onKeyDown, { capture: true });

  const capability: ShortcutRegistryCapability = {
    snapshot: model.snapshot,
    subscribe: model.subscribe,
    bindings: model.bindings,
    match: model.match,
    format: model.format,
    setBindings: model.setBindings,
    reset: model.reset,
    resetAll: model.resetAll,
    useHandlers(handlers, options) {
      const latest = useRef({ handlers, options });
      latest.current = { handlers, options };
      useLayoutEffect(
        () => model.registerSource(() => latest.current),
        [model],
      );
    },
  };

  return {
    capability,
    bindPreferences: model.bindPreferences,
    dispose: () =>
      target.removeEventListener("keydown", onKeyDown, { capture: true }),
  };
}

export async function createShortcutCapability(
  preferences: PreferencesCapability,
  target: Window = window,
): Promise<{
  capability: ShortcutRegistryCapability;
  dispose(): void;
}> {
  const runtime = createStableShortcutCapability(target);
  const unbind = await runtime.bindPreferences(preferences);
  return {
    capability: runtime.capability,
    dispose() {
      unbind();
      runtime.dispose();
    },
  };
}

const plugin: PluginModule = {
  inject: [],
  async activate(context) {
    const runtime = createStableShortcutCapability();
    await context.effect(() => runtime.dispose);
    context.provide("shortcuts.registry", runtime.capability);
    context.feature(
      {
        id: "preference-persistence",
        label: "Shortcut preference persistence",
        requires: [SETTINGS_PREFERENCES_SERVICE],
        uiPolicy: "fallback",
      },
      (feature) =>
        runtime.bindPreferences(
          feature.get<PreferencesCapability>(SETTINGS_PREFERENCES_SERVICE),
        ),
    );
  },
};

export default plugin;
