/**
 * AgentRunBridge — headless component that mirrors chat lifecycle into the
 * store and manages AI diff tabs. Owns the effect wiring; the pure
 * file-mutation parsing/diff helpers live in `./fileMutations`.
 */

import { type UIMessage, useChat } from "@ai-sdk/react";
import { useEffect, useMemo, useRef } from "react";
import { getOrCreateChat } from "../../store/chatRuntime";
import { type AgentRunStatus, useChatStore } from "../../store/chatStore";
import { useTodosStore } from "../../store/todoStore";
import { resolvePath } from "../../tools/tools";
import { respondToOwnedApproval } from "../../../chatRuntime";
import {
  type AnyPart,
  applyEditsLocally,
  type EditOp,
  extractFileMutation,
  readOriginal,
} from "./fileMutations";

/**
 * Headless bridge that mirrors chat lifecycle into the store, so the status
 * pill / mini-window / panel can react without being inside the chat hook tree.
 *
 * Side effects:
 *  - Patches `agentMeta` on every status / approvals change.
 *  - Auto-opens the mini-window when an approval is pending — the user has
 *    to act on it; hiding it would be hostile.
 *  - For pending `write_file` calls, opens an AI diff tab in the editor area
 *    so the user can review the proposed change before approving.
 *  - Persists messages of the active session on every change.
 */

export type DiffOpenInput = {
  path: string;
  originalContent: string;
  proposedContent: string;
  approvalId: string;
  isNewFile: boolean;
};

export type AgentRunBridgeProps = {
  openAiDiffTab: (input: DiffOpenInput) => number | null;
  closeAiDiffTab: (approvalId: string) => void;
};

export function AgentRunBridge(props: AgentRunBridgeProps) {
  const sessionId = useChatStore((s) => s.activeSessionId);
  if (!sessionId) return null;
  return <Bridge sessionId={sessionId} {...props} />;
}

type BridgeProps = { sessionId: string } & AgentRunBridgeProps;

function Bridge({ sessionId, openAiDiffTab, closeAiDiffTab }: BridgeProps) {
  const chat = useMemo(() => getOrCreateChat(sessionId), [sessionId]);
  const { status, messages, addToolApprovalResponse } = useChat<UIMessage>({
    chat,
    throttle: 50,
  });
  const patch = useChatStore((s) => s.patchAgentMeta);
  const openMini = useChatStore((s) => s.openMini);
  const persistMessages = useChatStore((s) => s.persistMessages);
  const setApprovalResponder = useChatStore((s) => s.setApprovalResponder);

  // Expose the approval responder so the diff tab can resolve approvals.
  // We keep it in a ref-stable closure so identity is stable per render.
  useEffect(() => {
    setApprovalResponder((id, approved) => {
      void respondToOwnedApproval({
        sessionId,
        approvalId: id,
        approved,
      }, () => addToolApprovalResponse({ id, approved })).catch((cause) => {
        patch({
          status: "error",
          error: cause instanceof Error ? cause.message : String(cause),
        });
      });
    });
    return () => setApprovalResponder(null);
  }, [sessionId, setApprovalResponder, addToolApprovalResponse, patch]);

  // Message durability lives in the trace; this only keeps the derived
  // session title in step with the conversation.
  useEffect(() => {
    persistMessages(sessionId, messages);
  }, [sessionId, messages, persistMessages]);

  const approvalsPending = useMemo(() => {
    let n = 0;
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const p of m.parts) {
        if ((p as { state?: string }).state === "approval-requested") n++;
      }
    }
    return n;
  }, [messages]);

  const interactionsPending = useMemo(() => {
    let count = 0;
    for (const message of messages) {
      if (message.role !== "assistant") continue;
      for (const part of message.parts) {
        const candidate = part as { type?: string; state?: string };
        if (
          candidate.state === "input-available" &&
          (candidate.type === "tool-ask_user" || candidate.type === "tool-ask_ui")
        ) {
          count += 1;
        }
      }
    }
    return count;
  }, [messages]);

  // Remembers the run's prior activity per session, so a terminal transition
  // (run ended / stopped / errored) is detected only within the same session —
  // never confused with an idle state on mount or a session switch.
  const prevRunRef = useRef<{ sessionId: string; active: boolean } | null>(
    null,
  );
  useEffect(() => {
    let runStatus: AgentRunStatus;
    if (approvalsPending > 0) runStatus = "awaiting-approval";
    else if (interactionsPending > 0) runStatus = "awaiting-input";
    else if (status === "submitted") runStatus = "thinking";
    else if (status === "streaming") runStatus = "streaming";
    else if (status === "error") runStatus = "error";
    else runStatus = "idle";
    patch({
      status: runStatus,
      approvalsPending,
      ...(runStatus === "idle" || runStatus === "error" ? { step: null } : {}),
      ...(runStatus === "idle" ? { error: null } : {}),
    });

    // A todo list belongs to the run that created it. When that run finishes,
    // is stopped, or errors, clear it — so it never lingers (or spins forever)
    // past the work it tracked.
    const active =
      runStatus === "thinking" ||
      runStatus === "streaming" ||
      runStatus === "awaiting-approval" ||
      runStatus === "awaiting-input";
    const prev = prevRunRef.current;
    if (
      prev?.sessionId === sessionId &&
      prev.active &&
      (runStatus === "idle" || runStatus === "error")
    ) {
      useTodosStore.getState().clearSession(sessionId);
    }
    prevRunRef.current = { sessionId, active };
  }, [status, approvalsPending, interactionsPending, patch, sessionId]);

  useEffect(() => {
    // Surface a pending approval in the floating chat — unless the dock is
    // already showing it (never open both surfaces at once).
    if (
      (approvalsPending > 0 || interactionsPending > 0) &&
      !useChatStore.getState().panelOpen
    ) {
      openMini();
    }
  }, [approvalsPending, interactionsPending, openMini]);

  // ---- AI diff tab management ----------------------------------------------
  // We track which approvalIds have already opened a tab so re-renders don't
  // open duplicates. Reset when the session changes.
  const openedRef = useRef<Set<string>>(new Set());
  const fileMutationFingerprintRef = useRef<string>("");
  useEffect(() => {
    void sessionId;
    openedRef.current = new Set();
    fileMutationFingerprintRef.current = "";
  }, [sessionId]);

  // Cheap fingerprint of file-mutation tool parts only. The diff-tab effect
  // is the most expensive thing on the streaming path, so we skip it when
  // only text/reasoning tokens have arrived (the common case).
  const fileMutationFingerprint = useMemo(() => {
    let fp = "";
    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const p of m.parts as AnyPart[]) {
        const t = (p as { type?: string }).type;
        if (
          t === "tool-write_file" ||
          t === "tool-edit" ||
          t === "tool-multi_edit"
        ) {
          const state = (p as { state?: string }).state ?? "";
          const id = (p as { approval?: { id?: string } }).approval?.id ?? "";
          fp += `${id}:${state}|`;
        }
      }
    }
    return fp;
  }, [messages]);

  useEffect(() => {
    type Pending = {
      approvalId: string;
      path: string;
      /**
       * Either a literal proposed content (write_file), or a function that
       * derives proposed content from the on-disk original (edit/multi_edit).
       */
      derive:
        | { kind: "literal"; content: string }
        | { kind: "edits"; edits: EditOp[] };
    };
    if (fileMutationFingerprint === fileMutationFingerprintRef.current) {
      return;
    }
    fileMutationFingerprintRef.current = fileMutationFingerprint;

    const pending: Pending[] = [];
    const toClose = new Set<string>();

    for (const m of messages) {
      if (m.role !== "assistant") continue;
      for (const part of m.parts as AnyPart[]) {
        const info = extractFileMutation(part);
        if (!info) continue;
        const { state, approvalId, path, derive } = info;
        if (!approvalId) continue;
        if (state === "approval-requested") {
          if (!openedRef.current.has(approvalId)) {
            pending.push({ approvalId, path, derive });
          }
        } else if (
          state === "approval-responded" ||
          state === "output-available" ||
          state === "output-error"
        ) {
          if (openedRef.current.has(approvalId)) toClose.add(approvalId);
        }
      }
    }

    for (const id of toClose) {
      openedRef.current.delete(id);
      closeAiDiffTab(id);
    }

    if (pending.length === 0) return;

    let cancelled = false;
    void (async () => {
      const cwd = useChatStore.getState().live.getCwd();
      for (const p of pending) {
        if (cancelled) return;
        // Mark as opened up-front so a re-render mid-await doesn't double-open.
        openedRef.current.add(p.approvalId);
        let abs: string;
        try {
          abs = resolvePath(p.path, cwd);
        } catch {
          abs = p.path;
        }
        const original = await readOriginal(abs);
        if (cancelled) return;
        let proposed = "";
        if (p.derive.kind === "literal") {
          proposed = p.derive.content;
        } else {
          const r = applyEditsLocally(original.content, p.derive.edits);
          if (!r.ok) {
            // Edit precondition failed (string not found / not unique).
            // Skip opening the tab; the approval modal will surface the error.
            continue;
          }
          proposed = r.content;
        }
        openAiDiffTab({
          path: abs,
          originalContent: original.content,
          proposedContent: proposed,
          approvalId: p.approvalId,
          isNewFile: original.isNewFile,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [messages, fileMutationFingerprint, openAiDiffTab, closeAiDiffTab]);

  return null;
}
