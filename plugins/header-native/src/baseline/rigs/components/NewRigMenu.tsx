/**
 * Create-rig chooser shared by both New-Rig surfaces (tab-strip "+" and the
 * switcher popover). A searchable palette: a pinned "New rig" (local) plus the
 * SSH hosts from ~/.ssh/config (filtered as you type, scroll-capped), and — when
 * you type anything else — a "Connect to <target>" action for an arbitrary
 * `user@host[:port]`. Picking an SSH entry creates a new rig backed by it.
 */
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "../../ui";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "../../ui";
import type { SshHost } from "@termco/ssh-base";
import { headerDependencies } from "../../runtime";
import {
  Add01Icon,
  PlusSignIcon,
  ServerStack03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type ReactNode, useState } from "react";

function hostSubtitle(host: SshHost): string {
  const target = `${host.user ? `${host.user}@` : ""}${host.hostName ?? host.alias}${host.port ? `:${host.port}` : ""}`;
  return target !== host.alias ? target : "";
}

export function NewRigMenu({
  onNewRig,
  onNewSshRig,
  children,
  align = "start",
}: {
  onNewRig: () => void;
  onNewSshRig: (connectionId: string) => void;
  children: ReactNode;
  align?: "start" | "center" | "end";
}) {
  const [hosts, setHosts] = useState<SshHost[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const refresh = async () => {
    setLoading(true);
    try {
      setHosts([...(await Promise.resolve(headerDependencies().ssh.listHosts()))]);
    } catch {
      setHosts([]);
    } finally {
      setLoading(false);
    }
  };

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const typed = query.trim();
  const showConnectTyped =
    typed.length > 0 && !hosts.some((host) => host.alias === typed);

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o && !loading) void refresh();
        if (!o) setQuery("");
      }}
    >
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent
        data-onboarding-target="header.rig-types"
        align={align}
        sideOffset={7}
        className="w-80 gap-0 overflow-hidden p-0"
      >
        <div className="border-b border-border/70 px-3.5 py-3">
          <p className="text-xs font-semibold text-foreground">
            Create workspace
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Start locally or connect an SSH host.
          </p>
        </div>
        <Command
          filter={(value, search) =>
            value.toLowerCase().includes(search.toLowerCase().trim()) ? 1 : 0
          }
        >
          <CommandInput
            placeholder="Find a host or type user@host"
            value={query}
            onValueChange={setQuery}
          />

          {/* Pinned local action — never scrolls with the hosts. */}
          <div className="border-b border-border/60 p-1.5">
            <button
              type="button"
              onClick={() => {
                onNewRig();
                close();
              }}
              className="group flex w-full items-center gap-3 rounded-lg border border-transparent px-2.5 py-2 text-left outline-hidden transition-colors hover:border-border hover:bg-muted/30"
            >
              <span className="grid size-8 place-items-center rounded-md border border-border bg-background text-muted-foreground group-hover:text-foreground">
                <HugeiconsIcon
                  icon={PlusSignIcon}
                  size={15}
                  strokeWidth={1.75}
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-medium text-foreground">
                  Local workspace
                </span>
                <span className="block text-xs text-muted-foreground">
                  Use this Mac and its local shell
                </span>
              </span>
            </button>
          </div>

          <CommandList>
            <CommandEmpty>No matching hosts.</CommandEmpty>
            {hosts.length > 0 ? (
              <CommandGroup heading="SSH">
                {hosts.map((h) => {
                  const subtitle = hostSubtitle(h);
                  return (
                    <CommandItem
                      key={h.alias}
                      value={`${h.alias} ${h.hostName ?? h.alias} ${h.user ?? ""}`}
                      onSelect={() => {
                        onNewSshRig(h.alias);
                        close();
                      }}
                      className="mx-1 rounded-lg py-2"
                    >
                      <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-background text-muted-foreground">
                        <HugeiconsIcon
                          icon={ServerStack03Icon}
                          size={15}
                          strokeWidth={1.75}
                        />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-xs font-medium">
                          {h.alias}
                        </span>
                        {subtitle ? (
                          <span className="truncate text-xs font-normal text-muted-foreground">
                            {subtitle}
                          </span>
                        ) : null}
                      </div>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ) : null}

            {showConnectTyped ? (
              <CommandGroup heading={hosts.length > 0 ? undefined : "SSH"}>
                <CommandItem
                  value={typed}
                  onSelect={() => {
                    onNewSshRig(typed);
                    close();
                  }}
                  className="mx-1 rounded-lg py-2"
                >
                  <HugeiconsIcon
                    icon={Add01Icon}
                    size={15}
                    strokeWidth={1.75}
                  />
                  Connect to “{typed}”
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
