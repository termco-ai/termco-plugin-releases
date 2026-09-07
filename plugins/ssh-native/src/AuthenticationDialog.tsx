import ui from "@termco/ui";
import type { ApplicationEventsCapability } from "@termco/events-base";
import type { SshAuthPrompt, SshClientCapability } from "@termco/ssh-base";

const { useEffect, useState } = ui.React;

export function AuthenticationDialog({
  ssh,
  events,
}: {
  ssh: SshClientCapability;
  events: ApplicationEventsCapability;
}) {
  const [prompts, setPrompts] = useState<SshAuthPrompt[]>([]);
  useEffect(() => {
    let active = true;
    let revision = 0;
    const refresh = () => {
      const request = ++revision;
      void ssh
        .authPrompts()
        .then((value) => {
          if (active && request === revision) setPrompts(value);
        })
        .catch(() => {});
    };
    const dispose = events.subscribe("ssh:authentication-changed", refresh);
    refresh();
    return () => {
      active = false;
      dispose();
    };
  }, [ssh, events]);
  const prompt = prompts[0];
  return prompt ? <PromptForm key={prompt.id} prompt={prompt} ssh={ssh} /> : null;
}

function PromptForm({ prompt, ssh }: { prompt: SshAuthPrompt; ssh: SshClientCapability }) {
  const [value, setValue] = useState("");
  const [save, setSave] = useState(!prompt.error);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(prompt.error ?? "");
  const confirmation = prompt.kind === "confirmation";
  const respond = async (answer: string | null) => {
    setBusy(true);
    setError("");
    try {
      await ssh.authRespond(
        prompt.id,
        answer === null ? null : { value: answer, save: prompt.kind === "password" && save },
      );
      setValue("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "SSH authentication failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <ui.Dialog
      open
      onOpenChange={(open) => {
        if (!open) void respond(null);
      }}
    >
      <ui.DialogContent className="max-w-md">
        <ui.DialogHeader>
          <ui.DialogTitle>{confirmation ? "Verify SSH host" : "SSH authentication"}</ui.DialogTitle>
          <ui.DialogDescription>Connect to {prompt.connectionId}</ui.DialogDescription>
        </ui.DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!busy) void respond(confirmation ? "yes" : value);
          }}
        >
          <p className="whitespace-pre-wrap break-words text-sm">{prompt.message}</p>
          {prompt.retry && (
            <p className="text-sm text-destructive">
              The previous credential was rejected. Please try again.
            </p>
          )}
          {!confirmation && (
            <>
              <label className="block space-y-2 text-sm">
                <span>
                  {prompt.kind === "password"
                    ? "Password or passphrase"
                    : "Authentication response"}
                </span>
                <ui.Input
                  autoFocus
                  type="password"
                  autoComplete="off"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  disabled={busy}
                />
              </label>
              {prompt.kind === "password" && (
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={save}
                    onChange={(event) => setSave(event.target.checked)}
                    disabled={busy}
                  />
                  Save in Termco
                </label>
              )}
            </>
          )}
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <ui.DialogFooter>
            <ui.Button
              type="button"
              variant="outline"
              onClick={() => void respond(null)}
              disabled={busy}
            >
              Cancel
            </ui.Button>
            <ui.Button type="submit" disabled={busy || (!confirmation && !value)}>
              {busy ? "Connecting…" : confirmation ? "Trust host and connect" : "Connect"}
            </ui.Button>
          </ui.DialogFooter>
        </form>
      </ui.DialogContent>
    </ui.Dialog>
  );
}
