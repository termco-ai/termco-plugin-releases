/** Small square ghost icon-button used throughout the AI status-bar controls. */

import { Button } from "@termco/ui";
import { cn } from "@termco/ui";

export function IconBtn({
  title,
  onClick,
  disabled,
  className,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "size-6 rounded-md text-muted-foreground hover:text-foreground",
        className,
      )}
    >
      {children}
    </Button>
  );
}
