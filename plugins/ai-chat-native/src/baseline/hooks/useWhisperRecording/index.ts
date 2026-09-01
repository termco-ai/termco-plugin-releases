// useWhisperRecording: microphone capture + STT transcription hook, managing
// the MediaRecorder lifecycle and idle/recording/transcribing state machine.
import { usePreferencesStore } from "../../runtime/preferences";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { transcribeAudio } from "../../lib/stt";
import { useChatStore } from "../../store/chatStore";
import { getApiKeyForStt, pickMime, providerNeedsKey } from "./helpers";

type State = "idle" | "recording" | "transcribing";

export function useWhisperRecording({
  onResult,
}: {
  onResult: (text: string) => void;
}) {
  const apiKeys = useChatStore((s) => s.apiKeys);
  const sttProvider = usePreferencesStore((s) => s.sttProvider);
  const [state, setState] = useState<State>("idle");
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const needsKey = providerNeedsKey(sttProvider);
  const providerKey = needsKey ? getApiKeyForStt(apiKeys, sttProvider) : null;
  const hasKey = needsKey ? !!providerKey : true;

  const supported =
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined";

  const teardownStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const stop = useCallback(() => {
    const rec = recRef.current;
    if (rec && rec.state !== "inactive") rec.stop();
  }, []);

  const start = useCallback(async () => {
    if (!supported || !hasKey || state !== "idle") return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMime();
      const rec = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined,
      );
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: rec.mimeType || "audio/webm",
        });
        chunksRef.current = [];
        teardownStream();
        if (blob.size === 0) {
          setState("idle");
          return;
        }
        setState("transcribing");
        try {
          const text = await transcribeAudio(blob, sttProvider);
          if (text.trim()) onResult(text.trim());
        } catch (e) {
          console.error("stt.transcribe", e);
          toast.error(e instanceof Error ? e.message : "Transcription failed");
        } finally {
          setState("idle");
        }
      };
      recRef.current = rec;
      rec.start();
      setState("recording");
    } catch (e) {
      console.error("stt.getUserMedia", e);
      toast.error("Microphone access failed");
      teardownStream();
      setState("idle");
    }
  }, [sttProvider, onResult, state, supported, hasKey]);

  useEffect(() => {
    return () => {
      recRef.current?.stop();
      teardownStream();
    };
  }, []);

  return {
    state,
    recording: state === "recording",
    transcribing: state === "transcribing",
    start,
    stop,
    supported,
    hasKey,
    sttProvider,
  };
}
