import type { PluginModule } from "@termco/kernel";
import {
  ONBOARDING_REGISTRY_SERVICE,
  ONBOARDING_RUNTIME_SERVICE,
  type OnboardingRegistry,
  type OnboardingRuntime,
} from "@termco/onboarding-base";
import {
  SETTINGS_PREFERENCES_SERVICE,
  type PreferencesCapability,
} from "@termco/storage-base";
import { createOnboardingRegistry } from "./registry";
import { createOnboardingRuntime } from "./runtime";

const plugin: PluginModule = {
  inject: [SETTINGS_PREFERENCES_SERVICE],
  async activate(context) {
    const registry = createOnboardingRegistry();
    const runtime = await createOnboardingRuntime(
      registry,
      context.get<PreferencesCapability>(SETTINGS_PREFERENCES_SERVICE),
    );
    await context.effect(() => runtime.dispose);
    context.provide<OnboardingRegistry>(ONBOARDING_REGISTRY_SERVICE, registry);
    context.provide<OnboardingRuntime>(ONBOARDING_RUNTIME_SERVICE, runtime);
  },
};

export default plugin;
