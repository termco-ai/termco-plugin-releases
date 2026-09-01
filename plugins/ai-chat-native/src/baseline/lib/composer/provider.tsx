/**
 * Composer context provider + hook.
 *
 * Owns the `<AiComposerProvider>` React context and the `useComposer` hook:
 * draft value, attachments, picked snippets/commands, voice dictation, and the
 * submit/stop wiring that composes the outgoing message and hands it to the
 * chat runtime. Attachment shapes/helpers live in `./attachments`.
 */

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { toast } from "sonner";
import { useWhisperRecording } from "../../hooks/useWhisperRecording";
// The LIGHT state module — importing compaction.ts here would statically pull
// the whole pipeline (+ the `ai` package) into the eager startup bundle.
import {
  cancelCompaction,
  isCompacting,
} from "../../store/chatRuntime/compactionState";
import { useChatStore } from "../../store/chatStore";
import { useSnippetsStore } from "../../store/snippetsStore";
import { type SlashCommandMeta, tryRunSlashCommand } from "../slashCommands";
import { expandSnippetTokens, type Snippet } from "../snippets";
import {
  browserPageElementBlock,
  type BrowserPageElementContext,
  type FileAttachment,
  readAttachment,
} from "./attachments";
import { native } from "../native";

type MessagePart =
  | { type: "text"; text: string }
  | { type: "file"; mediaType: string; url: string; filename?: string };

type Voice = ReturnType<typeof useWhisperRecording>;

type ComposerCtx = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  value: string;
  setValue: React.Dispatch<React.SetStateAction<string>>;
  files: FileAttachment[];
  addFiles: (list: FileList | null) => Promise<void>;
  /** Attach a file by absolute path — used by the file explorer's "Attach to Agent". */
  attachFileByPath: (path: string) => Promise<void>;
  removeFile: (id: string) => void;
  pickedSnippets: Snippet[];
  addSnippet: (s: Snippet) => void;
  removeSnippet: (id: string) => void;
  pickedCommands: SlashCommandMeta[];
  addCommand: (c: SlashCommandMeta) => void;
  removeCommand: (name: string) => void;
  isBusy: boolean;
  submit: () => void;
  stop: () => void;
  voice: Voice;
  canSend: boolean;
};

let currentComposer: ComposerCtx | null = null;
const composerListeners = new Set<() => void>();

function publishComposer(): void {
  for (const listener of composerListeners) listener();
}

export function useComposer(): ComposerCtx {
  const ctx = useSyncExternalStore(
    (listener) => {
      composerListeners.add(listener);
      return () => composerListeners.delete(listener);
    },
    () => currentComposer,
    () => currentComposer,
  );
  if (!ctx)
    throw new Error("useComposer must be used inside <AiComposerProvider>");
  return ctx;
}

type ProviderProps = {
  children: React.ReactNode;
};

export function AiComposerProvider({ children }: ProviderProps) {
  const sessionId = useChatStore((s) => s.activeSessionId);
  const status = useChatStore((s) => s.agentMeta.status);
  const compacting = useChatStore((s) => s.agentMeta.compacting);
  // Compaction blocks the composer the same way a run does — it rewrites the
  // conversation, so typing into it mid-flight would be meaningless.
  const isBusy =
    status === "thinking" ||
    status === "streaming" ||
    status === "awaiting-approval" ||
    status === "awaiting-input" ||
    // Only THIS session's compaction blocks this composer.
    (compacting != null && compacting.sessionId === sessionId);

  const [value, setValue] = useState("");
  const [files, setFiles] = useState<FileAttachment[]>([]);
  const [pickedSnippets, setPickedSnippets] = useState<Snippet[]>([]);
  const [pickedCommands, setPickedCommands] = useState<SlashCommandMeta[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const focusSignal = useChatStore((s) => s.focusSignal);
  const pendingPrefill = useChatStore((s) => s.pendingPrefill);
  const consumePrefill = useChatStore((s) => s.consumePrefill);
  const pendingSelections = useChatStore((s) => s.pendingSelections);
  const consumeSelections = useChatStore((s) => s.consumeSelections);

  useEffect(() => {
    if (focusSignal === 0) return;
    textareaRef.current?.focus();
    if (pendingPrefill != null) {
      const text = consumePrefill();
      if (text) setValue((v) => (v ? `${text}${v}` : text));
    }
  }, [focusSignal, pendingPrefill, consumePrefill]);

  // Re-focus the textarea whenever the agent finishes a response
  const prevIsBusyRef = useRef(false);
  useEffect(() => {
    if (prevIsBusyRef.current && !isBusy) {
      requestAnimationFrame(() => textareaRef.current?.focus());
    }
    prevIsBusyRef.current = isBusy;
  }, [isBusy, textareaRef]);

  // Listen for explorer's "Attach to Agent" event.
  useEffect(() => {
    const onAttach = (e: Event) => {
      const path = (e as CustomEvent<string>).detail;
      if (typeof path === "string" && path.length > 0) {
        void attachFileByPath(path);
      }
    };
    window.addEventListener("termco:ai-attach-file", onAttach);
    return () => window.removeEventListener("termco:ai-attach-file", onAttach);
    // attachFileByPath is stable for our purposes (closes over setFiles only)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Listen for grab-from-page: an image (data URL) + optional text plucked
  // from the embedded browser. Mirrors the file/selection attach pattern.
  useEffect(() => {
    const onAttachImage = (e: Event) => {
      const detail = (
        e as CustomEvent<{
          dataUrl: string;
          name?: string;
          text?: string;
          pageElement?: BrowserPageElementContext;
        }>
      ).detail;
      if (!detail?.dataUrl) return;
      const id = `grab-${detail.dataUrl.length}-${detail.name ?? "element"}`;
      setFiles((prev) => {
        if (prev.some((f) => f.id === id)) return prev;
        // One chip for the grabbed element — it carries both the cropped image
        // (for vision) and the element's text (for exact content / non-vision
        // models); both are emitted on send. Two chips read as duplicates.
        const attachment: FileAttachment = {
          id,
          name: detail.name ?? "Page element",
          kind: "image",
          mediaType: "image/png",
          url: detail.dataUrl,
          text: detail.text?.trim() || undefined,
          size: detail.dataUrl.length,
          ...(detail.pageElement ? { pageElement: detail.pageElement } : {}),
        };
        return [...prev, attachment];
      });
    };
    window.addEventListener("termco:ai-attach-image", onAttachImage);
    return () =>
      window.removeEventListener("termco:ai-attach-image", onAttachImage);
  }, []);

  useEffect(() => {
    if (pendingSelections.length === 0) return;
    const drained = consumeSelections();
    if (drained.length === 0) return;
    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.id));
      const next: FileAttachment[] = [];
      for (const sel of drained) {
        if (existing.has(sel.id)) continue;
        next.push({
          id: sel.id,
          name:
            sel.source === "editor" ? "Editor selection" : "Terminal selection",
          kind: "selection",
          mediaType: "text/plain",
          text: sel.text,
          size: sel.text.length,
          source: sel.source,
        });
      }
      return next.length ? [...prev, ...next] : prev;
    });
  }, [pendingSelections, consumeSelections]);

  const voice = useWhisperRecording({
    onResult: (transcript: string) => {
      setValue((v) => (v ? `${v} ${transcript}` : transcript));
      requestAnimationFrame(() => textareaRef.current?.focus());
    },
  });

  const addFiles = async (list: FileList | null) => {
    if (!list) return;
    const next: FileAttachment[] = [];
    for (const f of Array.from(list)) {
      const att = await readAttachment(f);
      if (att) next.push(att);
    }
    if (next.length) setFiles((prev) => [...prev, ...next]);
  };

  const removeFile = (id: string) =>
    setFiles((prev) => prev.filter((f) => f.id !== id));

  const addSnippet = (s: Snippet) =>
    setPickedSnippets((prev) =>
      prev.some((p) => p.id === s.id) ? prev : [...prev, s],
    );
  const removeSnippet = (id: string) =>
    setPickedSnippets((prev) => prev.filter((s) => s.id !== id));

  const addCommand = (cmd: SlashCommandMeta) =>
    setPickedCommands((prev) =>
      prev.some((p) => p.name === cmd.name) ? prev : [...prev, cmd],
    );
  const removeCommand = (name: string) =>
    setPickedCommands((prev) => prev.filter((c) => c.name !== name));

  const attachFileByPath = async (path: string) => {
    try {
      const result = await native.readFile(path);
      if (result.kind !== "text") {
        // Binary/oversize files: skip (could surface a toast in future).
        console.warn("attachFileByPath: skipped non-text file", path, result);
        return;
      }
      const name = path.split("/").pop() || path;
      const id = `path-${path}`;
      setFiles((prev) => {
        if (prev.some((f) => f.id === id)) return prev;
        const att: FileAttachment = {
          id,
          name,
          kind: "text",
          mediaType: "text/plain",
          text: result.content,
          size: result.size,
        };
        return [...prev, att];
      });
      // Open the AI panel & focus the input so the user sees the chip.
      useChatStore.getState().focusInput();
    } catch (e) {
      console.error("attachFileByPath failed:", e);
    }
  };

  const submit = () => {
    if (isBusy) return;
    const trimmed = value.trim();
    if (
      !trimmed &&
      files.length === 0 &&
      pickedSnippets.length === 0 &&
      pickedCommands.length === 0
    )
      return;

    // Slash-command interception. `/plan` toggles plan mode; `/init` rewrites
    // the prompt to the AGENTS.md scan template before sending.
    let effectiveText = trimmed;
    let commandMarker: string | null = null;
    let commandSource = trimmed;
    if (
      pickedCommands.length > 0 &&
      !trimmed.startsWith("/") &&
      !trimmed.startsWith("#")
    ) {
      commandSource = `#${pickedCommands[0].name} ${trimmed}`.trim();
    }
    if (commandSource.startsWith("/") || commandSource.startsWith("#")) {
      const outcome = tryRunSlashCommand(commandSource);
      if (outcome.kind === "handled") {
        setValue("");
        // Clear the chip too, not just the text. Left behind, it prefixes the
        // NEXT message (`#compact fix the login bug`), which re-runs the command
        // with the user's prompt as its argument — and swallows the message
        // instead of sending it.
        setPickedCommands([]);
        // A real toast, not console.info. `/compact` and `/plan` arm something
        // that only takes effect on the NEXT send, so without visible feedback
        // the command looks like it did nothing at all.
        if (outcome.toast) toast.success(outcome.toast);
        return;
      }
      if (outcome.kind === "send-prompt") {
        effectiveText = outcome.prompt;
        if (outcome.commandName) {
          commandMarker = `<termco-command name="${outcome.commandName}" />`;
        }
      }
    }

    const parts: MessagePart[] = [];
    const fileBlocks = files
      .filter((f) => f.kind === "text")
      .map(
        (f) =>
          `<file name="${f.name}" mediaType="${f.mediaType}">\n${f.text ?? ""}\n</file>`,
      );
    const selectionBlocks = files
      .filter((f) => f.kind === "selection")
      .map(
        (f) =>
          `<selection source="${f.source ?? "terminal"}">\n${f.text ?? ""}\n</selection>`,
      );
    // Grabbed page elements are single image chips that also carry their text —
    // emit that text alongside the image part so non-vision models still get it.
    const grabbedTextBlocks = files
      .filter((f) => f.kind === "image" && (f.pageElement || f.text?.trim()))
      .map(
        (f) => f.pageElement
          ? browserPageElementBlock(f.pageElement)
          : `<page-element name="${f.name}">\n${f.text}\n</page-element>`,
      );
    const { body: bodyAfterTokens, blocks: snippetBlocks } =
      expandSnippetTokens(effectiveText, useSnippetsStore.getState().snippets);
    const seenHandles = new Set<string>();
    const allSnippetBlocks: string[] = [];
    for (const s of pickedSnippets) {
      if (seenHandles.has(s.handle)) continue;
      seenHandles.add(s.handle);
      allSnippetBlocks.push(
        `<snippet name="${s.handle}">\n${s.content}\n</snippet>`,
      );
    }
    for (const block of snippetBlocks) {
      const m = block.match(/^<snippet name="([^"]+)"/);
      if (m && seenHandles.has(m[1])) continue;
      if (m) seenHandles.add(m[1]);
      allSnippetBlocks.push(block);
    }
    const composed = [
      commandMarker ?? "",
      allSnippetBlocks.join("\n\n"),
      selectionBlocks.join("\n\n"),
      grabbedTextBlocks.join("\n\n"),
      fileBlocks.join("\n\n"),
      bodyAfterTokens,
    ]
      .filter(Boolean)
      .join("\n\n");
    if (composed) parts.push({ type: "text", text: composed });

    for (const f of files) {
      if (f.kind === "image" && f.url) {
        parts.push({
          type: "file",
          mediaType: f.mediaType,
          url: f.url,
          filename: f.name,
        });
      }
    }

    if (!sessionId) return;
    const store = useChatStore.getState();
    store.patchAgentMeta({ hitStepCap: false, compactionNotice: null });
    // Pop the floating chat only when NO surface is open (composer in the bottom
    // bar). Submitting from the dock keeps the dock; from the mini keeps the mini
    // — never open both.
    if (!store.mini.open && !store.panelOpen) store.openMini();
    void (async () => {
      // Through `sendChatMessage`, not straight at the Chat instance: that is
      // where the compaction gate and the overflow retry live. Sending directly
      // is exactly the bug that made "compact automatically" a no-op for every
      // message a user actually typed.
      const { sendChatMessage } = await import("../../store/chatRuntime/send");
      void sendChatMessage({ sessionId, parts });
    })();
    setValue("");
    setFiles([]);
    setPickedSnippets([]);
    setPickedCommands([]);
    // Re-focus immediately after submit so the user can type a follow-up
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const stop = () => {
    // Stop means "stop what is running". During a compaction that is the
    // compaction, not the (idle) chat — but only THIS session's compaction.
    if (sessionId && isCompacting(sessionId)) {
      cancelCompaction(sessionId);
      return;
    }
    if (!sessionId) return;
    void import("../../../chatRuntime").then(({ stopOwnedChat }) =>
      stopOwnedChat(sessionId)
    );
  };

  const canSend =
    !isBusy &&
    (value.trim().length > 0 ||
      files.length > 0 ||
      pickedSnippets.length > 0 ||
      pickedCommands.length > 0);

  const ctx: ComposerCtx = {
    textareaRef,
    value,
    setValue,
    files,
    addFiles,
    attachFileByPath,
    removeFile,
    pickedSnippets,
    addSnippet,
    removeSnippet,
    pickedCommands,
    addCommand,
    removeCommand,
    isBusy,
    submit,
    stop,
    voice,
    canSend,
  };

  // The provider is mounted as a non-structural background contribution. Its
  // consumers live in independent dock/footer/overlay slots, so a module-level
  // external store shares the one composer without wrapping (and therefore
  // remounting) the complete application shell.
  currentComposer = ctx;
  useLayoutEffect(() => {
    publishComposer();
    return () => {
      if (currentComposer !== ctx) return;
      currentComposer = null;
      publishComposer();
    };
  }, [ctx]);

  return <>{children}</>;
}
