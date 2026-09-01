/**
 * Composer control for the model's thinking effort. Only rendered for
 * reasoning-capable models (`getReasoningSupport`); the level is remembered per
 * model. Picking a level maps to the provider's native thinking option in
 * `runStream` and also enables the model to emit its reasoning for display.
 */
import { Button } from "@termco/ui";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@termco/ui";
import { cn } from "@termco/ui";
import type {
  AiModelDefinition,
  AiReasoningEffort as ReasoningEffort,
} from "@termco/ai-models-base";
import {
  effectiveReasoningEffort,
  resolveAvailableModel,
} from "../../../runtime";
import { setModelReasoning } from "../../lib/modelPrefs";
import { useTranscriptPrefs } from "../../lib/transcriptPrefs";
import {
  setRichChatUi,
  setTerseReplies,
  usePreferencesStore,
} from "../../runtime/preferences";
import { Brain03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useChatStore } from "../../store/chatStore";

const LABELS: Record<ReasoningEffort, string> = {
  off: "Off",
  minimal: "Minimal",
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "Max",
};

const DESCRIPTIONS: Record<ReasoningEffort, string> = {
  off: "Respond directly without extra reasoning.",
  minimal: "Use the smallest reasoning budget.",
  low: "Keep analysis light and responses fast.",
  medium: "Balance reasoning depth and response time.",
  high: "Spend more time on complex analysis.",
  xhigh: "Use the deepest available reasoning.",
};

const FILL_BY_LEVEL: Record<ReasoningEffort, number> = {
  off: 0,
  minimal: 18,
  low: 35,
  medium: 55,
  high: 78,
  xhigh: 100,
};

export function ThinkingToggle() {
  const modelId = useChatStore((s) => s.selectedModelId);
  const endpoints = usePreferencesStore((s) => s.customEndpoints);
  const stored = usePreferencesStore((s) => s.reasoningByModel[modelId]);
  const showThinking = useTranscriptPrefs((s) => s.showThinking);
  const setShowThinking = useTranscriptPrefs((s) => s.setShowThinking);
  const richChatUi = usePreferencesStore((s) => s.richChatUi);
  const terseReplies = usePreferencesStore((s) => s.terseReplies);

  let support: AiModelDefinition["reasoning"];
  let current: ReasoningEffort = "off";
  let modelLabel = "Selected model";
  const info = resolveAvailableModel(modelId, endpoints);
  if (!info) {
    return null; // unknown model id mid-transition — nothing to show
  }
  modelLabel = info.label;
  support = info.reasoning;
  current = effectiveReasoningEffort(info, stored);

  const on = current !== "off";
  const options: ReasoningEffort[] = support ? ["off", ...support.levels] : [];
  const levelLabel = support ? LABELS[current] : "Unavailable";
  const fill = support ? FILL_BY_LEVEL[current] : 0;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={`Thinking level: ${levelLabel}`}
          aria-label={`Thinking level: ${levelLabel}`}
          data-thinking-level={support ? current : "unavailable"}
          className={cn(
            "text-muted-foreground hover:text-foreground",
            on &&
              "bg-indigo-500/15 text-indigo-600 hover:bg-indigo-500/20 hover:text-indigo-600 dark:text-indigo-400 dark:hover:text-indigo-400",
          )}
        >
          <ThinkingLevelIcon fill={fill} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72">
        <DropdownMenuLabel className="space-y-1 px-3 py-2">
          <span className="block font-semibold text-foreground">
            Thinking level
          </span>
          <span className="block font-normal leading-relaxed">
            {support
              ? `Choose how much reasoning ${modelLabel} uses before answering.`
              : `${modelLabel} does not offer adjustable thinking levels.`}
          </span>
        </DropdownMenuLabel>

        {support ? (
          <DropdownMenuRadioGroup
            value={current}
            onValueChange={(value) =>
              void setModelReasoning(modelId, value as ReasoningEffort)
            }
          >
            {options.map((level) => (
              <DropdownMenuRadioItem
                key={level}
                value={level}
                className="items-start py-2"
              >
                <span className="min-w-0">
                  <span className="block text-xs font-medium">
                    {LABELS[level]}
                  </span>
                  <span className="block text-xs font-normal leading-relaxed text-muted-foreground">
                    {DESCRIPTIONS[level]}
                  </span>
                </span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        ) : null}

        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={showThinking}
          onCheckedChange={(checked) => setShowThinking(checked === true)}
          className="items-start py-2"
        >
          <span className="min-w-0">
            <span className="block text-xs font-medium">
              Show thinking in transcript
            </span>
            <span className="block text-xs font-normal leading-relaxed text-muted-foreground">
              Display the model’s reasoning alongside its answer.
            </span>
          </span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={richChatUi}
          onCheckedChange={(checked) => void setRichChatUi(checked === true)}
          className="items-start py-2"
        >
          <span className="min-w-0">
            <span className="block text-xs font-medium">
              Rich views in chat
            </span>
            <span className="block text-xs font-normal leading-relaxed text-muted-foreground">
              Let it answer with tables, charts and clickable findings.
            </span>
          </span>
        </DropdownMenuCheckboxItem>
        <DropdownMenuCheckboxItem
          checked={terseReplies}
          onCheckedChange={(checked) => void setTerseReplies(checked === true)}
          className="items-start py-2"
        >
          <span className="min-w-0">
            <span className="block text-xs font-medium">Terse replies</span>
            <span className="block text-xs font-normal leading-relaxed text-muted-foreground">
              Cut the preamble and the recap. Warnings still come in full.
            </span>
          </span>
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ThinkingLevelIcon({ fill }: { fill: number }) {
  return (
    <span
      aria-hidden="true"
      data-thinking-fill={fill}
      className="relative block size-4"
    >
      <HugeiconsIcon
        icon={Brain03Icon}
        size={16}
        strokeWidth={1.6}
        className="absolute inset-0 opacity-70"
      />
      {fill > 0 ? (
        <HugeiconsIcon
          icon={Brain03Icon}
          size={16}
          strokeWidth={1.25}
          fill="currentColor"
          className="absolute inset-0"
          style={{ clipPath: `inset(${100 - fill}% 0 0 0)` }}
        />
      ) : null}
    </span>
  );
}
