import {
  Cancel01Icon,
  Copy01Icon,
  MinusSignIcon,
  SquareIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { Dispose } from "@termco/kernel";
import { useEffect, useState, type ReactNode } from "react";
import type { HeaderRuntime } from "../../types";
import { cn } from "../../ui";

let subscribeWindowResize: (listener: () => void) => Dispose = () => () => {};

export function installWindowResizeSubscriber(
  subscribe: (listener: () => void) => Dispose,
): Dispose {
  subscribeWindowResize = subscribe;
  return () => {
    if (subscribeWindowResize === subscribe) {
      subscribeWindowResize = () => () => {};
    }
  };
}

export function WindowControls({
  runtime,
  closeOnly = false,
}: {
  runtime: HeaderRuntime;
  closeOnly?: boolean;
}) {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    if (!runtime.customWindowControls || closeOnly) return;
    const refresh = () => void runtime.isWindowMaximized().then(setMaximized);
    refresh();
    const dispose = subscribeWindowResize(refresh);
    return () => void dispose();
  }, [runtime, closeOnly]);
  if (!runtime.customWindowControls) return null;
  return (
    <div className="flex h-full shrink-0 items-center gap-0.5 pr-1">
      {!closeOnly ? (
        <>
          <Control label="Minimize" onClick={runtime.minimizeWindow}>
            <HugeiconsIcon icon={MinusSignIcon} size={12} strokeWidth={2} />
          </Control>
          <Control
            label={maximized ? "Restore" : "Maximize"}
            onClick={() => {
              runtime.toggleMaximizeWindow();
              setMaximized((value) => !value);
            }}
          >
            <HugeiconsIcon
              icon={maximized ? Copy01Icon : SquareIcon}
              size={12}
              strokeWidth={2}
            />
          </Control>
        </>
      ) : null}
      <Control label="Close" onClick={runtime.closeWindow} danger>
        <HugeiconsIcon icon={Cancel01Icon} size={14} strokeWidth={2} />
      </Control>
    </div>
  );
}

function Control({
  label,
  onClick,
  children,
  danger = false,
}: {
  label: string;
  onClick(): void;
  children: ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "grid size-7 place-items-center rounded-md text-muted-foreground transition-colors",
        danger
          ? "hover:bg-destructive/15 hover:text-destructive"
          : "hover:bg-accent hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}
