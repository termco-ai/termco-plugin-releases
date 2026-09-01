import type { AiLibrarySkill as Skill } from "@termco/ai-library-base";
import ui from "@termco/ui";
import { MODELS } from "../models";
import {
  TOOL_GROUP_IDS,
  TOOL_GROUPS,
  type ToolGroupId,
} from "../toolGroups";
import {
  Cancel01Icon,
  PuzzleIcon,
  Tick02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useEffect, useState } from "react";

const {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  Input,
  Textarea,
  cn,
} = ui;

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-xs font-semibold text-foreground/85">{children}</span>
  );
}

/**
 * Modal editor for a library skill — a self-authored one, or an imported one
 * being tweaked. Edits a local draft, commits on Save. The body is what the
 * `skill` tool returns to the model on activation; the tool groups scope which
 * tools the skill may use (a full set means "inherit the persona's tools").
 * Rendering is gated on a non-null `skill`.
 */
export function SkillEditorDialog({
  skill,
  existing,
  onClose,
  onSave,
}: {
  skill: Skill | null;
  existing: Skill[];
  onClose: () => void;
  onSave: (s: Skill) => void;
}) {
  const [draft, setDraft] = useState<Skill | null>(skill);
  useEffect(() => setDraft(skill), [skill]);
  if (!draft) return null;

  const isNew = !existing.some((s) => s.id === draft.id);
  const canSave = draft.name.trim().length > 0 && draft.body.trim().length > 0;
  const enabledTools: readonly ToolGroupId[] =
    draft.allowedGroups ?? TOOL_GROUP_IDS;

  const toggleTool = (id: ToolGroupId) => {
    const next = enabledTools.includes(id)
      ? enabledTools.filter((g) => g !== id)
      : [...enabledTools, id];
    // A full set collapses to "inherit the persona's tools" (undefined).
    setDraft({
      ...draft,
      allowedGroups: next.length === TOOL_GROUP_IDS.length ? undefined : next,
    });
  };

  return (
    <Dialog open={!!skill} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        showCloseButton={false}
        className="w-[560px] max-w-[calc(100vw-48px)] gap-0 overflow-hidden rounded-xl p-0 sm:max-w-[560px]"
      >
        <div className="flex items-center gap-2.5 border-b border-border/50 px-4 py-3.5">
          <span className="flex size-[30px] shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <HugeiconsIcon icon={PuzzleIcon} size={15} strokeWidth={1.6} />
          </span>
          <div className="min-w-0 flex-1">
            <DialogTitle className="text-sm font-semibold text-foreground">
              {isNew ? "New skill" : "Edit skill"}
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              In your library — offered to the agent when enabled.
            </DialogDescription>
          </div>
          <DialogClose asChild>
            <button
              type="button"
              title="Close (Esc)"
              className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <HugeiconsIcon icon={Cancel01Icon} size={12} strokeWidth={2} />
            </button>
          </DialogClose>
        </div>

        <div className="flex max-h-[calc(100vh-16rem)] flex-col gap-3.5 overflow-y-auto p-4">
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Name</FieldLabel>
            <Input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              className="h-[30px] rounded-lg bg-background text-xs"
              placeholder="e.g. fill-pdf-forms"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Description</FieldLabel>
            <Input
              value={draft.description}
              onChange={(e) =>
                setDraft({ ...draft, description: e.target.value })
              }
              placeholder="One line — shown in the skills menu"
              className="h-[30px] rounded-lg bg-background text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel>When to use</FieldLabel>
            <Input
              value={draft.whenToUse ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, whenToUse: e.target.value || undefined })
              }
              placeholder="Optional — helps the agent pick the right skill"
              className="h-[30px] rounded-lg bg-background text-xs"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Model</FieldLabel>
            <select
              value={draft.model ?? ""}
              onChange={(e) =>
                setDraft({ ...draft, model: e.target.value || undefined })
              }
              className="h-[30px] rounded-lg border border-border/70 bg-background px-2.5 font-mono text-xs text-foreground outline-none"
            >
              <option value="">Default (keep the current model)</option>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Tools it may use</FieldLabel>
            <div className="grid grid-cols-2 gap-1.5">
              {TOOL_GROUPS.map((g) => {
                const on = enabledTools.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleTool(g.id)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg border bg-background px-2.5 py-2 text-left transition-colors",
                      on ? "border-primary/40" : "border-border/70",
                    )}
                  >
                    <span className="flex size-4 shrink-0 items-center justify-center">
                      {on ? (
                        <span className="grid size-3.5 place-items-center rounded bg-primary text-primary-foreground">
                          <HugeiconsIcon
                            icon={Tick02Icon}
                            size={9}
                            strokeWidth={3.5}
                          />
                        </span>
                      ) : (
                        <span className="block size-3.5 rounded border border-foreground/20" />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-xs font-medium text-foreground">
                        {g.label}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {g.hint}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel>Instructions</FieldLabel>
            <Textarea
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
              placeholder="Loaded into context when the agent activates this skill…"
              className="min-h-32 resize-y rounded-lg bg-background font-mono text-xs leading-[1.55]"
            />
          </div>
        </div>

        <div className="flex items-center gap-2 border-t border-border/50 px-4 py-3">
          <span className="font-mono text-xs text-muted-foreground/70">
            termco-ai-skills.json
          </span>
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="h-[30px] rounded-lg border border-border/80 px-3 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => onSave(draft)}
            className="h-[30px] rounded-lg bg-primary px-3.5 text-xs font-semibold text-primary-foreground shadow-sm transition-opacity disabled:opacity-50"
          >
            Save
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
