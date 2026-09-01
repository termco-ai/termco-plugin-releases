import { Home03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from "../ui";

export function BreadcrumbSegment({
  label,
  isHome,
  onClick,
}: {
  label: string;
  isHome: boolean;
  onClick: () => void;
}) {
  return (
    <>
      <BreadcrumbItem>
        <BreadcrumbLink asChild>
          <button
            type="button"
            onClick={onClick}
            className="flex cursor-pointer items-center gap-1 rounded px-0.5 text-muted-foreground hover:text-foreground"
          >
            {isHome ? (
              <HugeiconsIcon
                icon={Home03Icon}
                className="size-3"
                strokeWidth={1.75}
              />
            ) : null}
            {isHome ? "Home" : label}
          </button>
        </BreadcrumbLink>
      </BreadcrumbItem>
      <BreadcrumbSeparator className="[&>svg]:size-3" />
    </>
  );
}
