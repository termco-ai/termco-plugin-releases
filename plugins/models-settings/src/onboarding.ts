import {
  domOnboardingTarget,
  type OnboardingContribution,
} from "@termco/onboarding-base";
import type { UiSettingsViewCapability } from "@termco/ui-settings-base";

const target = (id: string) =>
  document.querySelector<HTMLElement>(`[data-onboarding-target="${id}"]`);

export function createModelsOnboardingContribution(
  settings: UiSettingsViewCapability,
): OnboardingContribution {
  const show = () => settings.show("models");
  return {
    id: "models-guidance",
    targets: [
      domOnboardingTarget({ id: "models.overview", label: "Models settings", reveal: show, element: () => target("models.overview") }),
      domOnboardingTarget({ id: "models.default", label: "Default AI model", reveal: show, element: () => target("models.default") }),
      domOnboardingTarget({ id: "models.add-provider", label: "Add model provider", reveal: show, element: () => target("models.add-provider") }),
      domOnboardingTarget({ id: "models.catalog", label: "Model provider catalog", element: () => target("models.catalog"), unavailableMessage: "Choose Add provider to compare cloud, local, and custom model sources." }),
    ],
    journeys: [{
      id: "models-settings.connect-a-model",
      title: "Connect the AI model you choose",
      description: "Use a cloud key, a local runtime, or a custom compatible endpoint, then choose defaults for Chat and supporting tasks.",
      order: 10,
      estimatedMinutes: 3,
      presentation: "contextual",
      steps: [
        { id: "overview", version: 1, kind: "tour", title: "Models are providers, not a Termco account", scope: { kind: "user" }, targetId: "models.overview", body: { markdown: "Termco does not require a hosted account or one model vendor. Configure the providers and runtimes you already use; cloud credentials stay in the operating-system keychain." } },
        { id: "default", version: 1, kind: "tour", title: "Choose sensible defaults", scope: { kind: "user" }, targetId: "models.default", body: { markdown: "New chats start with the default model, while each conversation can switch independently. Autocomplete, compaction, and voice may use different lower-latency or lower-cost providers." } },
        { id: "add", version: 1, kind: "interaction", title: "Compare available model sources", scope: { kind: "user" }, targetId: "models.add-provider", expectation: { kind: "click" }, body: { markdown: "Open the provider catalog. Termco separates hosted providers from local and custom endpoints so the user can see where inference runs before connecting it." } },
        { id: "catalog", version: 1, kind: "tour", title: "Cloud, local, and compatible endpoints", scope: { kind: "user" }, targetId: "models.catalog", body: { markdown: "Add a cloud API key, connect Ollama, LM Studio, MLX, or Whisper.cpp locally, or describe any OpenAI-compatible endpoint and model ID. Secrets never enter exported profiles." } },
      ],
    }],
  };
}
