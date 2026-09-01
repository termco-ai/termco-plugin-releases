/**
 * The header search bar. It *is* the command palette's input: the palette
 * portals its field into this chrome, and focusing it unfolds the panel
 * directly below — the bar drops its bottom border and squares its lower
 * corners so the two read as one shape.
 *
 * Pressing the find shortcut takes the same bar over as the incremental find
 * field for the active terminal/editor; Escape hands it back.
 */

import { Button } from "../../ui";
import { Input } from "../../ui";
import { MOD_KEY } from "../../platform";
import type { HeaderRuntime } from "../../types";
import { Cancel01Icon, Search01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { forwardRef, useCallback, useRef } from "react";
import { useInlineSearch } from "../hooks/useInlineSearch";
import type { SearchInlineHandle, SearchTarget } from "../types";

type Props = {
  target: SearchTarget;
  runtime: HeaderRuntime;
  /** When true, collapse to an icon-only button until the user opens it. */
  compact?: boolean;
};

export const SearchInline = forwardRef<SearchInlineHandle, Props>(
  function SearchInline({ target, runtime, compact }, ref) {
    const {
      q,
      setQ,
      setFindActive,
      inputRef,
      setInputRef,
      placeholder,
      expanded,
      clearTarget,
      restoreTargetFocus,
      applyIncremental,
      findDirection,
    } = useInlineSearch(target, ref, runtime);

    const paletteOpen = runtime.palette.open;
    const closePalette = runtime.palette.close;
    const showPalette = runtime.palette.show;
    const setBar = runtime.palette.setAnchor;
    const setInputSlot = runtime.palette.setInputSlot;

    // Callback refs: the palette needs these nodes as soon as they exist.
    const barRef = useCallback(
      (el: HTMLDivElement | null) => setBar(el),
      [setBar],
    );
    const slotRef = useCallback(
      (el: HTMLDivElement | null) => setInputSlot(el),
      [setInputSlot],
    );
    const rootRef = useRef<HTMLDivElement>(null);

    const leaveFind = () => {
      clearTarget();
      setQ("");
      setFindActive(false);
      restoreTargetFocus();
    };

    return (
      <div
        ref={rootRef}
        className="relative h-7 shrink-0 transition-[width] duration-200 ease-out"
        style={{ width: compact && !expanded ? 28 : 440 }}
      >
        {expanded ? (
          <div className="absolute inset-0 animate-in fade-in-0 duration-150">
            <HugeiconsIcon
              icon={Search01Icon}
              size={13}
              strokeWidth={1.75}
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              ref={setInputRef}
              value={q}
              placeholder={placeholder}
              className="termco-raised h-7 w-full rounded-md border-border pr-7 pl-8 text-xs! placeholder:text-muted-foreground/80"
              onChange={(e) => {
                const next = e.target.value;
                setQ(next);
                applyIncremental(next);
              }}
              onBlur={() => {
                // An empty field has nothing to keep; give the bar back.
                if (!q) setFindActive(false);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  findDirection(!e.shiftKey);
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  leaveFind();
                }
              }}
            />
            {q && (
              <button
                type="button"
                onClick={() => {
                  setQ("");
                  clearTarget();
                  inputRef.current?.focus();
                }}
                className="absolute top-1/2 right-1.5 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Clear search"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={11} strokeWidth={2} />
              </button>
            )}
          </div>
        ) : compact ? (
          <div className="absolute inset-0 flex items-center justify-end animate-in fade-in-0 duration-150">
            <Button
              variant="ghost"
              size="icon"
              className="size-7 shrink-0 text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={showPalette}
              title={`Search or run a command… (${MOD_KEY}K)`}
            >
              <HugeiconsIcon icon={Search01Icon} size={15} strokeWidth={1.75} />
            </Button>
          </div>
        ) : (
          <div
            ref={barRef}
            data-testid="palette-bar"
            className={`termco-raised absolute inset-0 z-51 flex items-center gap-[9px] border border-border/80 pr-[7px] pl-[11px] transition-[border-radius,border-color,box-shadow] ${
              paletteOpen
                ? "rounded-t-md rounded-b-none border-ring border-b-transparent shadow-none"
                : "rounded-md hover:border-ring"
            }`}
          >
            <HugeiconsIcon
              icon={Search01Icon}
              size={14}
              strokeWidth={1.8}
              className="shrink-0 text-muted-foreground"
            />
            {/* The palette portals its input in here. */}
            <div ref={slotRef} className="flex min-w-0 flex-1 items-center" />
            {paletteOpen ? (
              <button
                type="button"
                onClick={closePalette}
                className="shrink-0 rounded-sm border border-border px-1.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                esc
              </button>
            ) : (
              <span className="shrink-0 rounded-sm border border-border px-[5px] py-px font-mono text-xs text-muted-foreground">
                {MOD_KEY}K
              </span>
            )}
          </div>
        )}
      </div>
    );
  },
);
