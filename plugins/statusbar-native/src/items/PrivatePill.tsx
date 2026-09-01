import type { UiStatusbarRuntime } from "@termco/ui-statusbar-base";
import { IncognitoIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui";

export function PrivatePill({ runtime }: { runtime: UiStatusbarRuntime }) {
  if (!runtime.privateActive) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="flex shrink-0 cursor-default items-center gap-1 rounded-md bg-amber-500/12 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          <HugeiconsIcon icon={IncognitoIcon} size={11} strokeWidth={2} />
          <span>Private: hidden from AI</span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 text-xs leading-relaxed">
        AI can't see this terminal's output. Use it for secrets, SSH, or anything
        you don't want sent to the model.
      </TooltipContent>
    </Tooltip>
  );
}
