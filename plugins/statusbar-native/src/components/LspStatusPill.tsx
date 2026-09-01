import type { UiStatusbarRuntime } from "@termco/ui-statusbar-base";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui";

export function LspStatusPill({ runtime }: { runtime: UiStatusbarRuntime }) {
  if (!runtime.lspServerId) return null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={runtime.openLanguagesSettings}
          className="flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-400"
        >
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <span>{runtime.lspServerId}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-64 text-xs leading-relaxed">
        Language server active for this file — hover, go-to-definition,
        diagnostics, and completions are live. Click to manage servers.
      </TooltipContent>
    </Tooltip>
  );
}
