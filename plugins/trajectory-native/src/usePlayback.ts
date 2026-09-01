import { useCallback, useEffect, useRef, useState } from "react";

const MAX_HOP_MS = 3_000;
const MIN_HOP_MS = 30;

export type PlaybackState = {
  /** Index into the semantic record list, or null while following live state. */
  position: number | null;
  playing: boolean;
  speed: number;
  play: () => void;
  pause: () => void;
  step: (direction: 1 | -1) => void;
  setSpeed: (speed: number) => void;
  stop: () => void;
  seek: (index: number) => void;
};

/** Advances a display-only playhead over recorded semantic timestamps. */
export function usePlayback(timestamps: readonly number[]): PlaybackState {
  const [position, setPosition] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(1);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const count = timestamps.length;

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  useEffect(() => {
    clear();
    if (!playing || position === null) return;
    if (position >= count - 1) {
      setPlaying(false);
      return;
    }
    const current = timestamps[position] ?? 0;
    const next = timestamps[position + 1] ?? current;
    const delay = Math.min(
      MAX_HOP_MS,
      Math.max(MIN_HOP_MS, (next - current) / speed),
    );
    timer.current = setTimeout(() => setPosition(position + 1), delay);
    return clear;
  }, [playing, position, speed, count, timestamps]);

  const play = useCallback(() => {
    if (count === 0) {
      setPosition(null);
      setPlaying(false);
      return;
    }
    setPosition((current) =>
      current === null || current >= count - 1 ? 0 : current
    );
    setPlaying(true);
  }, [count]);
  const pause = useCallback(() => setPlaying(false), []);
  const step = useCallback(
    (direction: 1 | -1) => {
      setPlaying(false);
      if (count === 0) {
        setPosition(null);
        return;
      }
      setPosition((current) => {
        const base = current === null ? (direction === 1 ? -1 : count) : current;
        return Math.min(count - 1, Math.max(0, base + direction));
      });
    },
    [count],
  );
  const stop = useCallback(() => {
    setPlaying(false);
    setPosition(null);
  }, []);
  const seek = useCallback(
    (index: number) => {
      setPlaying(false);
      if (count === 0) {
        setPosition(null);
        return;
      }
      setPosition(Math.min(count - 1, Math.max(0, index)));
    },
    [count],
  );
  const setSpeed = useCallback((nextSpeed: number) => {
    setSpeedState(Math.min(10, Math.max(1, nextSpeed)));
  }, []);

  return { position, playing, speed, play, pause, step, setSpeed, stop, seek };
}
