/**
 * The palette's mode switcher: one chip per mode, sitting under the input.
 *
 * The sigils (`>` history, `#` in-files) are faster once you know them, but
 * undiscoverable until you do — the chips make the modes visible and clickable
 * while still teaching the sigil that gets you there.
 */
import { cn } from "../../ui";

export type PaletteChipMode = "commands" | "history" | "content" | "themes";

const CHIPS: { id: PaletteChipMode; label: string; sigil?: string }[] = [
  { id: "commands", label: "Commands" },
  { id: "history", label: "History", sigil: ">" },
  { id: "content", label: "In files", sigil: "#" },
  { id: "themes", label: "Themes" },
];

export function ModeChips({
  active,
  onPick,
}: {
  active: PaletteChipMode;
  onPick: (mode: PaletteChipMode) => void;
}) {
  return (
    <div className="flex shrink-0 gap-1.5 border-b border-border/60 px-3 py-2">
      {CHIPS.map((chip) => {
        const isActive = chip.id === active;
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => onPick(chip.id)}
            aria-pressed={isActive}
            className={cn(
              "flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
              isActive
                ? "border-primary/20 bg-[var(--signal-soft)] text-primary"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {chip.sigil ? (
              <span
                className={cn(
                  "font-mono",
                  isActive ? "text-primary" : "text-primary/70",
                )}
              >
                {chip.sigil}
              </span>
            ) : null}
            {chip.label}
          </button>
        );
      })}
    </div>
  );
}
