/**
 * Data for one container detail tab: a once-per-mount inspect (rich
 * ContainerDetail) and a polled logs tail (follow-ish). Both scoped to a
 * container by runtime+id; stale-guarded so a re-key can't apply an old
 * container's data. Logs poll only while the tab is running AND active.
 */
import { useEffect, useRef, useState } from "react";
import {
  type ContainerDetail,
  emptyDetail,
  parseInspect,
} from "./lib/inspectParse";
import { containersNative } from "./lib/native";
import type { ContainerRuntime } from "./types";

const LOG_POLL_MS = 2500;
const LOG_TAIL = 50;

export function useContainerInspect(
  runtime: ContainerRuntime,
  id: string,
): ContainerDetail | null {
  const [detail, setDetail] = useState<ContainerDetail | null>(null);
  const ridRef = useRef(0);
  useEffect(() => {
    const rid = ++ridRef.current;
    setDetail(null);
    void containersNative
      .inspect(runtime, id)
      .then((raw) => {
        if (ridRef.current !== rid) return;
        setDetail(parseInspect(raw));
      })
      .catch(() => {
        if (ridRef.current !== rid) return;
        setDetail(emptyDetail());
      });
  }, [runtime, id]);
  return detail;
}

export type LogsState = { text: string; loading: boolean };

export function useContainerLogs(
  runtime: ContainerRuntime,
  id: string,
  /** Poll only while running; a stopped container's logs are fetched once. */
  running: boolean,
  /** Only the active (visible) tab polls; background tabs fetch once. */
  active = true,
  /** How many trailing lines to request (`--tail N`). */
  tail: number = LOG_TAIL,
  /**
   * Live-tail mode. When false (the default) the snapshot is static so
   * scrolling/searching isn't yanked; a one-shot fetch still runs on mount and
   * whenever `tail`/`reloadKey` change. When true the logs poll on an interval.
   */
  follow = false,
  /** Bump to force a fresh pull of the current `tail` (manual refresh). */
  reloadKey = 0,
): LogsState {
  const [state, setState] = useState<LogsState>({ text: "", loading: true });
  const ridRef = useRef(0);
  // biome-ignore lint/correctness/useExhaustiveDependencies: reloadKey is an intentional refetch trigger (nonce), not read in the body
  useEffect(() => {
    const rid = ++ridRef.current;
    setState((s) => ({ text: s.text, loading: true }));
    let inflight = false;
    const pull = async () => {
      if (inflight) return;
      inflight = true;
      try {
        const text = await containersNative.logs(runtime, id, tail);
        if (ridRef.current !== rid) return;
        setState({ text, loading: false });
      } catch {
        if (ridRef.current !== rid) return;
        setState((s) => ({ text: s.text, loading: false }));
      } finally {
        inflight = false;
      }
    };
    void pull();
    if (!running || !active || !follow) return;
    const timer = setInterval(() => void pull(), LOG_POLL_MS);
    return () => clearInterval(timer);
  }, [runtime, id, running, active, tail, follow, reloadKey]);
  return state;
}
