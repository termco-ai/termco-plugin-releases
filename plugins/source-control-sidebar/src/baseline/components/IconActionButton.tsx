import { Button } from "@termco/ui";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@termco/ui";
import { cn } from "@termco/ui";
import type { ReactNode } from "react";
import { SOURCE_CONTROL_TOOLTIP_CLASS } from "./constants";

export function IconActionButton({
  label,
  disabled,
  side = "left",
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  side?: "left" | "top" | "right" | "bottom";
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon-sm"
          variant="ghost"
          className="size-6 p-3 cursor-pointer rounded-md text-muted-foreground hover:text-foreground disabled:cursor-not-allowed"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent
        side={side}
        className={cn(SOURCE_CONTROL_TOOLTIP_CLASS, "text-xs")}
      >
        {label}
      </TooltipContent>
    </Tooltip>
  );
}
