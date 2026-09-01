import type { PluginModule } from "@termco/kernel";
import type { AiToolRegistry } from "@termco/ai-tools-base";
import { AI_TOOLS_SERVICE } from "@termco/ai-tools-base";
import {
  PROFILE_TRANSACTIONS_SERVICE,
  type PluginAuthoringProfileApi,
  type PluginProfileApi,
} from "@termco/profile-base";
import {
  UI_CONTRIBUTION_EVIDENCE_SERVICE,
  type UiContributionEvidenceCapability,
} from "@termco/ui-shell-base";
import {
  UI_CHANGE_REVEAL_SERVICE,
  type UiChangeRevealCapability,
} from "@termco/ui-change-reveal-base";
import { createPluginDevelopmentContribution } from "./tools";
import {
  ONBOARDING_REGISTRY_SERVICE,
  type OnboardingRegistry,
} from "@termco/onboarding-base";

const plugin: PluginModule = {
  inject: [
    PROFILE_TRANSACTIONS_SERVICE,
    AI_TOOLS_SERVICE,
    UI_CONTRIBUTION_EVIDENCE_SERVICE,
    UI_CHANGE_REVEAL_SERVICE,
  ],
  optionalInject: [ONBOARDING_REGISTRY_SERVICE],
  async activate(context) {
    const profile = context.get<PluginProfileApi>(
      PROFILE_TRANSACTIONS_SERVICE,
    ) as PluginAuthoringProfileApi;
    const contribution = createPluginDevelopmentContribution(
      profile,
      context.get<UiContributionEvidenceCapability>(
        UI_CONTRIBUTION_EVIDENCE_SERVICE,
      ),
      context.get<UiChangeRevealCapability>(UI_CHANGE_REVEAL_SERVICE),
      context.observe<OnboardingRegistry>(ONBOARDING_REGISTRY_SERVICE),
    );
    await context.effect(() =>
      context.get<AiToolRegistry>("ai.tools").register(contribution),
    );
  },
};

export default plugin;
