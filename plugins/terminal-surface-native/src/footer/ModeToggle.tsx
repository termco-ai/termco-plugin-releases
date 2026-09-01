import { AiContentGenerator02Icon, TerminalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import ui from "@termco/ui";

export function ModeToggle({
  mode,
  onChange,
}: {
  mode: "shell" | "ai";
  onChange(next: "shell" | "ai"): void;
}) {
  return (
    <div className="relative grid shrink-0 grid-cols-2 rounded-lg bg-accent p-0.5 text-xs">
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-md bg-primary/15 transition-transform duration-200 ease-out"
        style={{ transform: mode === "ai" ? "translateX(100%)" : "translateX(0)" }}
      />
      {(["shell", "ai"] as const).map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          className={ui.cn(
            "relative z-10 flex items-center justify-center gap-1 rounded-md px-2 py-0.5 font-medium transition-colors",
            mode === value
              ? "text-primary"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <HugeiconsIcon
            icon={value === "shell" ? TerminalIcon : AiContentGenerator02Icon}
            size={11}
            strokeWidth={1.75}
          />
          {value === "shell" ? "Shell" : "AI"}
        </button>
      ))}
    </div>
  );
}
