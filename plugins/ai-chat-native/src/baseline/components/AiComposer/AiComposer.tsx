/**
 * The self-contained AI chat composer for panel surfaces — the docked panel and
 * the floating popup. Renders attachment chips, a full-width text input, and the
 * action row (model, attach, mic, send). Uses the one shared composer instance
 * (`useComposer`), so it must be mounted in only one host at a time; the dock and
 * popup are mutually exclusive, which guarantees that. The agent switcher lives
 * in each surface's header, so it's omitted here.
 */
import { useComposer } from "../../lib/composer";
import { AiComposerInput } from "../AiComposerInput";
import { ChipsRow } from "../ChipsRow";
import { ComposerActions } from "../ComposerActions";

export function AiComposer() {
  const c = useComposer();
  return (
    <div className="shrink-0 border-t border-border/70 bg-background/95 px-3 pb-3 pt-2.5 backdrop-blur">
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-[var(--shadow-control)] transition-shadow focus-within:border-primary/35 focus-within:shadow-[0_0_0_3px_var(--signal-soft)]">
        <div className="px-3 pt-2">
          <ChipsRow
            files={c.files}
            onRemoveFile={c.removeFile}
            snippets={c.pickedSnippets}
            onRemoveSnippet={(id) => {
              const snip = c.pickedSnippets.find((s) => s.id === id);
              c.removeSnippet(id);
              if (!snip) return;
              const re = new RegExp(`(^|\\s)#${snip.handle}\\b ?`);
              c.setValue((v) => v.replace(re, (_m, lead: string) => lead));
            }}
            commands={c.pickedCommands}
            onRemoveCommand={(name) => c.removeCommand(name)}
          />
        </div>
        <div className="px-3 pb-1 pt-2">
          <AiComposerInput />
        </div>
        <div className="border-t border-border/60 bg-muted/20 px-2 py-1">
          <ComposerActions />
        </div>
      </div>
    </div>
  );
}
