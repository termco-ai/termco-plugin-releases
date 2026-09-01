/**
 * Small square avatar for a rig: shows the rig's initial tinted with its
 * accent colour, with active/inactive ring styling. Presentational only.
 */
import { cn } from "../../ui";
import { accentFor, rigInitial } from "../lib/rigColor";
import type { RigMeta } from "../../types";

type Size = "sm" | "md";

const SIZES: Record<Size, string> = {
  sm: "size-5 rounded-[5px] text-xs",
  md: "size-7 rounded-md text-xs",
};

type Props = {
  rig: Pick<RigMeta, "name" | "color">;
  size?: Size;
  active?: boolean;
  className?: string;
};

export function RigAvatar({ rig, size = "sm", active, className }: Props) {
  const accent = accentFor(rig);
  return (
    <span
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center font-semibold leading-none ring-1 ring-inset",
        SIZES[size],
        active ? "ring-transparent" : "ring-border/50 text-muted-foreground",
        className,
      )}
      style={
        active
          ? {
              color: accent,
              backgroundColor: `color-mix(in oklch, ${accent} 16%, transparent)`,
              boxShadow: `inset 0 0 0 1px color-mix(in oklch, ${accent} 35%, transparent)`,
            }
          : undefined
      }
    >
      {rigInitial(rig.name)}
    </span>
  );
}
