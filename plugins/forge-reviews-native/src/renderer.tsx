import { AI_SESSIONS_SERVICE, type AiSessionsCapability } from "@termco/ai-sessions-base";
import { AI_TOOLS_SERVICE, type AiToolRegistry } from "@termco/ai-tools-base";
import {
  DESKTOP_INTEGRATION_SERVICE,
  type DesktopIntegrationCapability,
} from "@termco/desktop-base";
import { FORGE_REVIEWS_SERVICE, type ForgeReviewsCapability } from "@termco/forge-reviews-base";
import {
  SOURCE_CONTROL_SECTIONS_SERVICE,
  type SourceControlSectionProps,
  type SourceControlSectionRegistry,
} from "@termco/git-base";
import {
  createProcessServiceProxy,
  processTransportService,
  type PluginModule,
  type ProcessTransport,
} from "@termco/kernel";
import {
  UI_TABS_KINDS_SERVICE,
  type UiTabKindContribution,
  type UiTabKindRegistry,
  type UiTabSurfaceProps,
} from "@termco/ui-tabs-base";
import { WORKSPACE_TABS_SERVICE, type WorkspaceTabsCapability } from "@termco/workspace-base";
import { useSyncExternalStore } from "react";
import { ReviewSurface } from "./ReviewSurface";
import { ReviewsSection } from "./ReviewsSection";
import { discardRestoredForgeReviewTabs, FORGE_REVIEW_TAB_KIND } from "./tabs";
import { createForgeReviewToolContribution } from "./tools";

const plugin: PluginModule = {
  inject: [
    processTransportService,
    SOURCE_CONTROL_SECTIONS_SERVICE,
    WORKSPACE_TABS_SERVICE,
    UI_TABS_KINDS_SERVICE,
    AI_TOOLS_SERVICE,
  ],
  optionalInject: [AI_SESSIONS_SERVICE, DESKTOP_INTEGRATION_SERVICE],
  activate(context) {
    const forge = createProcessServiceProxy<ForgeReviewsCapability>(
      FORGE_REVIEWS_SERVICE,
      context.get<ProcessTransport>(processTransportService),
    );
    context.provide(FORGE_REVIEWS_SERVICE, forge);
    const sessions = context.observe<AiSessionsCapability>(AI_SESSIONS_SERVICE);
    const desktop = context.observe<DesktopIntegrationCapability>(DESKTOP_INTEGRATION_SERVICE);
    const tabs = context.get<WorkspaceTabsCapability>(WORKSPACE_TABS_SERVICE);
    const discardRestoredReviews = () => {
      discardRestoredForgeReviewTabs(tabs);
    };
    discardRestoredReviews();
    const disposeRestoredReviewCleanup = tabs.subscribe(discardRestoredReviews);
    const Component = (props: SourceControlSectionProps) => {
      const currentSessions = useSyncExternalStore(
        (listener) => sessions.subscribe(listener),
        () => sessions.current(),
        () => sessions.current(),
      );
      const currentDesktop = useSyncExternalStore(
        (listener) => desktop.subscribe(listener),
        () => desktop.current(),
        () => desktop.current(),
      );
      return (
        <ReviewsSection
          {...props}
          forge={forge}
          sessions={() => currentSessions}
          desktop={() => currentDesktop}
          tabs={tabs}
        />
      );
    };
    const ReviewSurfaceComponent = (props: UiTabSurfaceProps) => {
      const currentSessions = useSyncExternalStore(
        (listener) => sessions.subscribe(listener),
        () => sessions.current(),
        () => sessions.current(),
      );
      const currentDesktop = useSyncExternalStore(
        (listener) => desktop.subscribe(listener),
        () => desktop.current(),
        () => desktop.current(),
      );
      return (
        <ReviewSurface
          {...props}
          forge={forge}
          sessions={() => currentSessions}
          desktop={() => currentDesktop}
        />
      );
    };
    const surface: UiTabKindContribution = {
      id: "forge-review",
      label: "Forge review",
      description: "Inspect a hosted review locally at an exact revision.",
      kinds: [FORGE_REVIEW_TAB_KIND],
      mountWhen: "whenOpen",
      receivesVisibility: true,
      Component: ReviewSurfaceComponent,
    };
    const owner = {
      pluginId: "forge-reviews-native",
      generation: context.generation,
      key: "forge-reviews",
    };
    const disposeSection = context
      .get<SourceControlSectionRegistry>(SOURCE_CONTROL_SECTIONS_SERVICE)
      .register(
        { id: "forge-reviews", label: "Reviews", order: 10, placement: "view", Component },
        owner,
      );
    const disposeSurface = context
      .get<UiTabKindRegistry>(UI_TABS_KINDS_SERVICE)
      .register(surface, { ...owner, key: "forge-review-surface" });
    const disposeTools = context
      .get<AiToolRegistry>(AI_TOOLS_SERVICE)
      .register(createForgeReviewToolContribution(forge));
    return () => {
      disposeRestoredReviewCleanup();
      disposeTools();
      disposeSurface();
      disposeSection();
    };
  },
};

export default plugin;
