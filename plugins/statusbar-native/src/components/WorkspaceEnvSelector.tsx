import type { UiStatusbarRuntime } from "@termco/ui-statusbar-base";
import { Refresh01Icon, ServerStack03Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui";

export function WorkspaceEnvSelector({
  runtime,
}: {
  runtime: UiStatusbarRuntime;
}) {
  if (runtime.platform !== "windows") return null;

  const handleOpenChange = (open: boolean) => {
    if (open && runtime.wslDistros.length === 0 && !runtime.wslLoading) {
      void runtime.refreshWslDistros();
    }
  };
  const label =
    runtime.workspace.kind === "wsl"
      ? `WSL: ${runtime.workspace.distro}`
      : "Windows";

  return (
    <DropdownMenu onOpenChange={handleOpenChange}>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-6 shrink-0 items-center gap-1 rounded-sm px-1.5 text-xs text-muted-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:outline-1 focus-visible:outline-offset-1 focus-visible:outline-ring data-[state=open]:bg-accent data-[state=open]:text-foreground"
          title="Workspace environment"
        >
          <HugeiconsIcon icon={ServerStack03Icon} size={13} strokeWidth={1.75} />
          <span className="max-w-28 truncate">{label}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 overflow-hidden p-0">
        <div className="border-b border-border/70 px-3.5 py-3">
          <p className="text-xs font-semibold text-foreground">
            Execution environment
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Choose where workspace commands and tools run.
          </p>
        </div>
        <div className="p-1.5">
          <DropdownMenuItem
            onSelect={() => runtime.changeWorkspace({ kind: "local" })}
            className="items-start rounded-lg px-2.5 py-2"
          >
            <HugeiconsIcon
              icon={ServerStack03Icon}
              size={14}
              strokeWidth={1.7}
              className="mt-0.5"
            />
            <span className="flex flex-col">
              <span className="text-xs font-medium">Windows local</span>
              <span className="text-xs text-muted-foreground">
                PowerShell and native Windows tools
              </span>
            </span>
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-1" />
          {runtime.wslDistros.length === 0 ? (
            <DropdownMenuItem disabled className="rounded-lg">
              {runtime.wslLoading
                ? "Loading WSL distros..."
                : runtime.wslError
                  ? "WSL unavailable"
                  : "No WSL distros found"}
            </DropdownMenuItem>
          ) : (
            runtime.wslDistros.map((distro) => (
              <DropdownMenuItem
                key={distro.name}
                onSelect={() =>
                  runtime.changeWorkspace({ kind: "wsl", distro: distro.name })
                }
                className="items-start rounded-lg px-2.5 py-2"
              >
                <HugeiconsIcon
                  icon={ServerStack03Icon}
                  size={14}
                  strokeWidth={1.7}
                  className="mt-0.5"
                />
                <span className="flex flex-col">
                  <span className="text-xs font-medium">{distro.name}</span>
                  <span className="text-xs text-muted-foreground">
                    Windows Subsystem for Linux
                  </span>
                </span>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => void runtime.refreshWslDistros()}
            className="rounded-lg"
          >
            <HugeiconsIcon icon={Refresh01Icon} size={13} strokeWidth={1.75} />
            Refresh
          </DropdownMenuItem>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
