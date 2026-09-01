/** A compact model choice used by the model picker. */

import { cn } from "@termco/ui";
import {
  CheckmarkCircle02Icon,
  LockKeyIcon,
  StarIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AiModelDefinition as ModelInfo } from "@termco/ai-models-base";
import { modelProvider } from "../../../runtime";
import { PROVIDER_ICON } from "./providerIcons";

export function ModelRow({
  model,
  selected,
  hasKey,
  favorite,
  onPick,
  onToggleFavorite,
}: {
  model: ModelInfo;
  selected: boolean;
  hasKey: boolean;
  favorite: boolean;
  onPick: () => void;
  onToggleFavorite: () => void;
}) {
  const provider = modelProvider(model.provider);

  return (
    <div
      role="menuitem"
      data-model-row
      tabIndex={0}
      title={`${model.description} Quality ${model.capabilities.intelligence}/5 · Speed ${model.capabilities.speed}/5 · Value ${model.capabilities.cost}/5`}
      onClick={onPick}
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const browser = event.currentTarget.closest("[data-model-browser]");
          const rows = Array.from(
            browser?.querySelectorAll<HTMLElement>("[data-model-row]") ?? [],
          );
          if (rows.length === 0) return;
          const index = rows.indexOf(event.currentTarget);
          if (event.key === "ArrowUp" && index === 0) {
            browser?.querySelector<HTMLElement>("[data-model-search]")?.focus();
            return;
          }
          const nextIndex =
            event.key === "ArrowDown"
              ? (index + 1) % rows.length
              : Math.max(0, index - 1);
          rows[nextIndex]?.focus();
          return;
        }
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onPick();
        }
      }}
      className={cn(
        "group relative mx-1 cursor-pointer rounded-md px-2 py-2 outline-none transition-colors",
        "focus-visible:ring-2 focus-visible:ring-ring/50",
        selected ? "bg-[var(--signal-soft)]" : "hover:bg-muted/45",
      )}
    >
      <div className="flex items-center gap-2.5">
        <HugeiconsIcon
          icon={PROVIDER_ICON[model.provider]}
          size={15}
          strokeWidth={1.55}
          className="shrink-0 text-muted-foreground"
        />

        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-xs font-semibold text-foreground">
              {model.label}
            </span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {model.hint}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {hasKey
              ? `${provider?.label ?? model.provider} · ${model.description}`
              : `Connect ${provider?.label ?? model.provider} to use`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onToggleFavorite();
            }}
            title={favorite ? "Unfavorite" : "Favorite"}
            className={cn(
              "grid size-7 place-items-center rounded-md opacity-0 transition-[color,background-color,opacity] hover:bg-background group-hover:opacity-100 group-focus-within:opacity-100",
              favorite
                ? "text-amber-500 opacity-100"
                : "text-muted-foreground/45 hover:text-foreground",
            )}
          >
            <HugeiconsIcon
              icon={StarIcon}
              size={13}
              strokeWidth={favorite ? 2 : 1.7}
              className={favorite ? "fill-amber-500" : undefined}
            />
          </button>
          {selected ? (
            <HugeiconsIcon
              icon={CheckmarkCircle02Icon}
              size={16}
              strokeWidth={1.9}
              className="text-primary"
              aria-label="Selected"
            />
          ) : !hasKey ? (
            <HugeiconsIcon
              icon={LockKeyIcon}
              size={14}
              strokeWidth={1.7}
              className="text-muted-foreground"
              aria-label="Provider not connected"
            />
          ) : (
            <span className="size-4" />
          )}
        </div>
      </div>
    </div>
  );
}
