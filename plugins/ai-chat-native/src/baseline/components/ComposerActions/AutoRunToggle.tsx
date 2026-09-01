/**
 * Composer toggle for "auto-run" (unsafe) mode. When on, the agent runs tools
 * without approval cards (catastrophic shell commands still ask). Rendered amber
 * while active so the user always knows they're unattended.
 */
import { cn } from "@termco/ui";
import {
  setAgentAutoApprove,
  usePreferencesStore,
} from "../../runtime/preferences";
import { FlashIcon, FlashOffIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { IconBtn } from "../AiStatusBarControls/IconBtn";

export function AutoRunToggle() {
  const on = usePreferencesStore((s) => s.agentAutoApprove);
  return (
    <IconBtn
      title={
        on
          ? "Auto-run is ON — tools run without asking (catastrophic commands still confirm). Click to turn off."
          : "Auto-run is off — you approve each action. Click to let the agent run unattended (unsafe)."
      }
      onClick={() => void setAgentAutoApprove(!on)}
      className={cn(
        on &&
          "bg-amber-500/15 text-amber-600 hover:bg-amber-500/20 hover:text-amber-600 dark:text-amber-400 dark:hover:text-amber-400",
      )}
    >
      <HugeiconsIcon
        icon={on ? FlashIcon : FlashOffIcon}
        size={13}
        strokeWidth={1.75}
      />
    </IconBtn>
  );
}
