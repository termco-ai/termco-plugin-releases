/**
 * The composer's action row: attach, voice, model picker, and send/stop —
 * shown inside the chat composer (docked panel, floating popup, and the bottom
 * bar). Backed by the shared `useComposer` hook. `showAgent` adds the agent
 * switcher for hosts that have no header of their own (the bottom bar).
 *
 * (Superseded the old status-bar `AiStatusBarControls`; the surface-specific
 * close/mini buttons live in the dock/popup headers instead.)
 */
import { Button } from "@termco/ui";
import { Spinner } from "@termco/ui";
import { cn } from "@termco/ui";
import {
  ArrowUpIcon,
  Attachment01Icon,
  Mic01Icon,
  StopCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { AiSpeechProvider } from "@termco/ai-inference-base";
import { useRef } from "react";
import { ACCEPTED_FILES, useComposer } from "../../lib/composer";
import { AgentSwitcher } from "../AgentSwitcher";
import { IconBtn } from "../AiStatusBarControls/IconBtn";
import { ModelDropdown } from "../AiStatusBarControls/ModelDropdown";

const STT_PROVIDER_LABELS: Record<AiSpeechProvider, string> = {
  openai: "OpenAI Whisper",
  groq: "Groq Whisper",
  whispercpp: "Whisper.cpp (local)",
};
import { AutoRunToggle } from "./AutoRunToggle";
import { ThinkingToggle } from "./ThinkingToggle";

export function ComposerActions({
  showAgent = false,
}: {
  showAgent?: boolean;
}) {
  const c = useComposer();
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="@container/composer-actions flex items-center gap-0.5">
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPTED_FILES}
        className="hidden"
        onChange={(e) => {
          void c.addFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {showAgent && <AgentSwitcher />}

      <IconBtn
        title="Attach file or image"
        onClick={() => fileInputRef.current?.click()}
        disabled={c.isBusy}
      >
        <HugeiconsIcon icon={Attachment01Icon} size={13} strokeWidth={1.8} />
      </IconBtn>

      {c.voice.supported && (
        <IconBtn
          title={
            !c.voice.hasKey
              ? `Voice needs a ${STT_PROVIDER_LABELS[c.voice.sttProvider]} key`
              : c.voice.recording
                ? "Stop & transcribe"
                : c.voice.transcribing
                  ? "Transcribing…"
                  : "Voice input"
          }
          onClick={() =>
            c.voice.recording ? c.voice.stop() : void c.voice.start()
          }
          disabled={c.isBusy || c.voice.transcribing || !c.voice.hasKey}
          className={cn(
            c.voice.recording &&
              "bg-destructive/10 text-destructive hover:bg-destructive/15",
          )}
        >
          {c.voice.recording ? (
            <span className="size-2 animate-pulse rounded-full bg-destructive" />
          ) : c.voice.transcribing ? (
            <Spinner className="size-3" />
          ) : (
            <HugeiconsIcon icon={Mic01Icon} size={13} strokeWidth={1.75} />
          )}
        </IconBtn>
      )}

      <span className="mx-1 h-4 w-px bg-border/70" />
      <ModelDropdown />

      <ThinkingToggle />

      <AutoRunToggle />

      <span className="flex-1" />

      {c.isBusy ? (
        <Button
          data-onboarding-target="ai-chat.send"
          type="button"
          size="sm"
          variant="outline"
          onClick={c.stop}
          className="h-7 gap-1.5 px-2.5 text-xs"
          aria-label="Stop"
          title="Stop"
        >
          <HugeiconsIcon icon={StopCircleIcon} size={13} strokeWidth={1.75} />
          Stop
        </Button>
      ) : (
        <Button
          data-onboarding-target="ai-chat.send"
          type="button"
          size="sm"
          onClick={c.submit}
          disabled={!c.canSend}
          className="ml-1 h-7 gap-1.5 rounded-md px-3 text-xs @max-[20rem]/composer-actions:size-7 @max-[20rem]/composer-actions:gap-0 @max-[20rem]/composer-actions:px-0"
          aria-label="Send"
          title="Send (Enter)"
        >
          <HugeiconsIcon icon={ArrowUpIcon} size={13} strokeWidth={1.75} />
          <span
            data-send-label
            className="@max-[20rem]/composer-actions:hidden"
          >
            Send
          </span>
        </Button>
      )}
    </div>
  );
}
