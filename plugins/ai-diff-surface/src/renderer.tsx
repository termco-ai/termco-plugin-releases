import type { AiSessionsCapability } from "@termco/ai-sessions-base";
import type { PluginModule } from "@termco/kernel";
import type {
  UiTabKindContribution,
  UiTabKindRegistry,
  UiTabSurfaceProps,
} from "@termco/ui-tabs-base";
import type { UiThemeCapability } from "@termco/ui-theme-base";
import { AiDiffStack } from "./baseline/components/AiDiffStack";
import { installAiDiffRuntime } from "./runtime";
import { toAiDiffTab } from "./tabs";
import { AI_SESSIONS_SERVICE } from "@termco/ai-sessions-base";
import { UI_THEME_SERVICE } from "@termco/ui-theme-base";
import { UI_TABS_KINDS_SERVICE } from "@termco/ui-tabs-base";

function createAiDiffSurface(sessions: AiSessionsCapability) {
  return function AiDiffSurface({ tabs, activeId }: UiTabSurfaceProps) {
    const reviewTabs = tabs.flatMap((tab) => {
      const mapped = toAiDiffTab(tab);
      return mapped ? [mapped] : [];
    });
    return (
      <AiDiffStack
        tabs={reviewTabs}
        activeId={activeId}
        onAccept={(approvalId) =>
          sessions.respondToApproval(approvalId, true)
        }
        onReject={(approvalId) =>
          sessions.respondToApproval(approvalId, false)
        }
      />
    );
  };
}

const plugin: PluginModule = {
  inject: [
    AI_SESSIONS_SERVICE,
    UI_THEME_SERVICE,
    UI_TABS_KINDS_SERVICE,
  ],
  async activate(context) {
    const sessions = context.get<AiSessionsCapability>("ai.sessions");
    await context.effect(() =>
      installAiDiffRuntime(context.get<UiThemeCapability>("ui.theme")),
    );
    const contribution: UiTabKindContribution = {
      id: "ai-diff",
      label: "AI Diff Review",
      description:
        "Review AI-proposed content in the established CodeMirror merge view, then accept or reject it.",
      kinds: ["ai-diff"],
      mountWhen: "whenOpen",
      Component: createAiDiffSurface(sessions),
    };
    await context.effect(() =>
      context
        .get<UiTabKindRegistry>("ui.tabs.kinds")
        .register(contribution, { pluginId: "ai-diff-surface", generation: context.generation, key: contribution.id }),
    );
    const host = window as unknown as {
      __termco?: { e2e?: boolean };
      __termcoE2E?: Record<string, unknown>;
    };
    const label = () => contribution.label;
    if (host.__termco?.e2e) {
      await context.effect(() => {
        const seam = (host.__termcoE2E ??= {});
        seam.aiDiffSurfaceLabel = label;
        return () => {
          if (seam.aiDiffSurfaceLabel === label) {
            delete seam.aiDiffSurfaceLabel;
          }
        };
      });
    }
  },
};

export default plugin;
