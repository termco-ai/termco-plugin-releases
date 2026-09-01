import type { ReactNode } from "react";

export function PanelCenter({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
      <div className="text-sm font-medium">{title}</div>
      {body ? (
        <div className="max-w-64 text-xs leading-relaxed text-muted-foreground">
          {body}
        </div>
      ) : null}
      {action}
    </div>
  );
}
