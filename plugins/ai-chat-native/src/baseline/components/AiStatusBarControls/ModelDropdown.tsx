/** A compact, searchable model picker shared by every chat composer. */

import { Button } from "@termco/ui";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@termco/ui";
import { cn } from "@termco/ui";
import { usePreferencesStore } from "../../runtime/preferences";
import { openSettingsWindow } from "../../runtime/settings";
import {
  ArrowDown01Icon,
  Search01Icon,
  Settings01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useCallback, useMemo, useRef, useState } from "react";
import type {
  AiModelDefinition as ModelInfo,
  AiProviderId as ProviderId,
} from "@termco/ai-models-base";
import {
  availableModelProviders,
  availableModels,
  customEndpointModel,
  isCustomEndpointModel,
  modelIdForCustomEndpoint,
  providerRequiresKey,
} from "../../../runtime";
import { toggleFavoriteModel } from "../../lib/modelPrefs";
import { useChatStore } from "../../store/chatStore";
import { ModelRow } from "./ModelRow";
import { PROVIDER_ICON } from "./providerIcons";

export function ModelDropdown() {
  const selected = useChatStore((state) => state.selectedModelId);
  const apiKeys = useChatStore((state) => state.apiKeys);
  const setSelected = useChatStore((state) => state.setSelectedModelId);
  const favoriteIds = usePreferencesStore((state) => state.favoriteModelIds);
  const recentIds = usePreferencesStore((state) => state.recentModelIds);
  const customEndpoints = usePreferencesStore((state) => state.customEndpoints);
  const registeredModels = availableModels() as readonly ModelInfo[];
  const currentEndpoint = customEndpoints.find(
    (endpoint) => modelIdForCustomEndpoint(endpoint.id) === selected,
  );
  const current = isCustomEndpointModel(selected) && currentEndpoint
    ? customEndpointModel(currentEndpoint)
    : registeredModels.find((model) => model.id === selected) ??
      registeredModels[0];
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [activeProvider, setActiveProvider] = useState<string | null>(null);
  const [showAllModels, setShowAllModels] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const hasKeyFor = useCallback(
    (id: ProviderId) => (providerRequiresKey(id) ? !!apiKeys[id] : true),
    [apiKeys],
  );
  const currentProviderHasKey =
    isCustomEndpointModel(selected) || !current || hasKeyFor(current.provider);

  const endpointModels = useMemo(
    () =>
      customEndpoints.map((endpoint) => customEndpointModel(endpoint)),
    [customEndpoints],
  );
  // The provider plugin owns this catalogue. Read it on every render so a
  // dependency-closed live replacement is visible when the picker opens.
  const allModels = [...registeredModels, ...endpointModels];
  const readyModelCount = useMemo(
    () =>
      allModels.filter(
        (model) => isCustomEndpointModel(model.id) || hasKeyFor(model.provider),
      ).length,
    [allModels, hasKeyFor],
  );

  const providerOptions = useMemo(() => {
    const providersWithModels = new Set(
      allModels.map((model) => model.provider),
    );
    return availableModelProviders().filter((provider) => {
      if (!providersWithModels.has(provider.id)) return false;
      return showAllModels || hasKeyFor(provider.id);
    });
  }, [allModels, hasKeyFor, showAllModels]);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    let pool: readonly ModelInfo[] = allModels;

    // Search always respects the visible scope so the selected label remains
    // truthful: locked models only appear under "All models".
    if (!showAllModels) {
      pool = pool.filter(
          (model) => isCustomEndpointModel(model.id) || hasKeyFor(model.provider),
      );
    }
    if (activeProvider) {
      pool = pool.filter((model) => model.provider === activeProvider);
    }
    if (query) {
      pool = pool.filter(
        (model) =>
          model.label.toLowerCase().includes(query) ||
          model.hint.toLowerCase().includes(query) ||
          model.description.toLowerCase().includes(query) ||
          model.provider.includes(query) ||
          (model.tags?.some((tag) => tag.includes(query)) ?? false),
      );
    }

    const favoriteOrder = new Map(favoriteIds.map((id, index) => [id, index]));
    const recentOrder = new Map(recentIds.map((id, index) => [id, index]));
    const rank = (model: ModelInfo) => {
      if (model.id === selected) return 0;
      if (favoriteOrder.has(model.id)) {
        return 100 + (favoriteOrder.get(model.id) ?? 0);
      }
      if (recentOrder.has(model.id)) {
        return 200 + (recentOrder.get(model.id) ?? 0);
      }
      return 1_000;
    };

    return pool
      .map((model, index) => ({ model, index }))
      .sort(
        (left, right) =>
          rank(left.model) - rank(right.model) || left.index - right.index,
      )
      .map(({ model }) => model);
  }, [
    activeProvider,
    allModels,
    favoriteIds,
    hasKeyFor,
    recentIds,
    search,
    selected,
    showAllModels,
  ]);

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) requestAnimationFrame(() => inputRef.current?.focus());
      }}
    >
      <PopoverTrigger asChild>
        <Button
          data-onboarding-target="ai-chat.model"
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "my-0.5 h-7 min-w-0 shrink gap-1.5 rounded-md px-2 text-xs",
            currentProviderHasKey
              ? "text-muted-foreground hover:text-foreground"
              : "text-amber-600 dark:text-amber-400",
          )}
          title={
            currentProviderHasKey
              ? `Model: ${current.label}`
              : `${current.label} — no key configured`
          }
        >
          <HugeiconsIcon
            icon={PROVIDER_ICON[current.provider]}
            size={13}
            strokeWidth={1.6}
            className="shrink-0"
          />
          <span className="min-w-0 max-w-32 truncate font-medium">
            {current.label}
          </span>
          <HugeiconsIcon
            icon={ArrowDown01Icon}
            size={10}
            strokeWidth={2}
            className="shrink-0 opacity-65"
          />
        </Button>
      </PopoverTrigger>

      <PopoverContent
        data-model-browser
        align="start"
        side="top"
        sideOffset={8}
        collisionPadding={12}
        className="w-[min(25rem,calc(100vw-1.5rem))] gap-0 overflow-hidden rounded-xl p-0"
      >
        <div className="border-b border-border/70 p-2">
          <div className="flex min-w-0 items-center gap-2 rounded-md border border-border/70 bg-background px-2.5 focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20">
            <HugeiconsIcon
              icon={Search01Icon}
              size={14}
              strokeWidth={1.7}
              className="shrink-0 text-muted-foreground"
            />
            <input
              ref={inputRef}
              data-model-search
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
                  return;
                }
                const rows =
                  listRef.current?.querySelectorAll<HTMLElement>(
                    "[data-model-row]",
                  );
                if (!rows?.length) return;
                event.preventDefault();
                rows[event.key === "ArrowDown" ? 0 : rows.length - 1]?.focus();
              }}
              placeholder="Search by model"
              aria-label="Search models"
              className="h-8 min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 border-b border-border/60 px-2 py-1.5">
          <fieldset
            aria-label="Model availability"
            className="flex shrink-0 items-center rounded-md bg-muted/55 p-0.5"
          >
            <button
              type="button"
              aria-pressed={!showAllModels}
              aria-controls="model-picker-list"
              onClick={() => {
                setShowAllModels(false);
                if (
                  activeProvider &&
                  !hasKeyFor(activeProvider as ProviderId)
                ) {
                  setActiveProvider(null);
                }
              }}
              className={cn(
                "h-7 rounded-[5px] px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                !showAllModels
                  ? "bg-background text-foreground shadow-[var(--shadow-control)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Ready to use{" "}
              <span className="tabular-nums text-muted-foreground">
                {readyModelCount}
              </span>
            </button>
            <button
              type="button"
              aria-pressed={showAllModels}
              aria-controls="model-picker-list"
              onClick={() => setShowAllModels(true)}
              className={cn(
                "h-7 rounded-[5px] px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30",
                showAllModels
                  ? "bg-background text-foreground shadow-[var(--shadow-control)]"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              All models{" "}
              <span className="tabular-nums text-muted-foreground">
                {allModels.length}
              </span>
            </button>
          </fieldset>
          <select
            aria-label="Filter by provider"
            value={activeProvider ?? ""}
            onChange={(event) => {
              setActiveProvider(event.target.value || null);
            }}
            className="h-7 min-w-0 flex-1 rounded-md border border-border/70 bg-background px-2 text-xs text-foreground outline-none transition-colors hover:border-foreground/30 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
          >
            <option value="">All providers</option>
            {providerOptions.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </div>

        <div
          id="model-picker-list"
          ref={listRef}
          role="menu"
          aria-label="Models"
          className="max-h-[min(22rem,calc(100vh-11rem))] min-h-0 overflow-y-auto py-1"
        >
          {filtered.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center px-5 text-center">
              <p className="text-xs font-medium text-foreground">
                {showAllModels
                  ? "No models match"
                  : search
                    ? "No ready models match"
                    : "No models are ready"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {showAllModels
                  ? "Try another search or provider."
                  : search
                    ? "Try another search or view all models."
                    : "Connect a provider or view all models."}
              </p>
            </div>
          ) : (
            filtered.map((model) => (
              <ModelRow
                key={model.id}
                model={model}
                selected={model.id === selected}
                hasKey={isCustomEndpointModel(model.id) || hasKeyFor(model.provider)}
                favorite={favoriteIds.includes(model.id)}
                onPick={() => {
                  if (
                    !isCustomEndpointModel(model.id) &&
                    !hasKeyFor(model.provider)
                  ) {
                    void openSettingsWindow("models");
                    return;
                  }
                  setSelected(model.id);
                  setOpen(false);
                }}
                onToggleFavorite={() => void toggleFavoriteModel(model.id)}
              />
            ))
          )}
        </div>

        <div className="flex items-center justify-end border-t border-border/60 px-2 py-1">
          <button
            type="button"
            onClick={() => void openSettingsWindow("models")}
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          >
            <HugeiconsIcon icon={Settings01Icon} size={13} strokeWidth={1.7} />
            Manage providers
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
