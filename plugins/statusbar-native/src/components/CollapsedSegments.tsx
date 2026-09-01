import {
  Folder01Icon,
  Home03Icon,
  MoreHorizontalIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Segment } from "../lib/pathUtils";
import {
  BreadcrumbItem,
  BreadcrumbSeparator,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "../ui";

export function CollapsedSegments({
  segments,
  onCd,
}: {
  segments: Segment[];
  onCd: (path: string) => void;
}) {
  return (
    <span className="contents md:hidden">
      <BreadcrumbItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              title="Show hidden folders"
              className="flex items-center rounded-sm px-1 text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <HugeiconsIcon
                icon={MoreHorizontalIcon}
                className="size-3"
                strokeWidth={1.75}
              />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-44">
            {segments.map((segment) => (
              <DropdownMenuItem
                key={segment.fullPath}
                onSelect={() => onCd(segment.fullPath)}
              >
                <HugeiconsIcon
                  icon={segment.isHome ? Home03Icon : Folder01Icon}
                  className="size-3.5 text-muted-foreground"
                  strokeWidth={1.75}
                />
                <span className="truncate">
                  {segment.isHome ? "Home" : segment.label}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </BreadcrumbItem>
      <BreadcrumbSeparator className="[&>svg]:size-3" />
    </span>
  );
}
