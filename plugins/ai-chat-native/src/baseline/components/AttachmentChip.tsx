/**
 * A transcript attachment chip. The whole pill is a button that expands the
 * full image inline in the chat (no overlay) — reusing the app's chip pill and
 * the chevron-to-reveal pattern the tool cards already use, so it reads as part
 * of the same system.
 */

import { cn } from "@termco/ui";
import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";

export function AttachmentChip({ src, name }: { src: string; name?: string }) {
  const [open, setOpen] = useState(false);
  const label = name ?? "Image";
  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1 rounded-md border border-border/50 bg-card/60 px-1.5 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-card"
      >
        <img
          src={src}
          alt=""
          className="size-4 shrink-0 rounded object-cover"
        />
        <span className="max-w-[12rem] truncate font-medium text-foreground">
          {label}
        </span>
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={11}
          strokeWidth={2}
          className={cn(
            "shrink-0 opacity-60 transition-transform",
            open && "rotate-90",
          )}
        />
      </button>
      {open ? (
        <img
          src={src}
          alt={label}
          className="max-h-80 max-w-full rounded-md border border-border/50 object-contain duration-150 animate-in fade-in-0 slide-in-from-top-1"
        />
      ) : null}
    </div>
  );
}
