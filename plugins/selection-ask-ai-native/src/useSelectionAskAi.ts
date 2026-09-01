import { useCallback, useEffect, useState } from "react";
import type { CapturedSelection } from "./selection";

export function useSelectionAskAi(
  capture: () => CapturedSelection | null,
  onAsk: (selection: CapturedSelection) => void,
) {
  const [popup, setPopup] = useState<{
    x: number;
    y: number;
    selection: CapturedSelection;
  } | null>(null);

  useEffect(() => {
    const insideAi = (target: EventTarget | null) => {
      const element = target as HTMLElement | null;
      return Boolean(
        element?.closest(
          "[data-selection-ask-ai], [data-ai-input-bar], [data-ai-mini-window]",
        ),
      );
    };
    const onDown = (event: MouseEvent) => {
      if (!insideAi(event.target)) setPopup(null);
    };
    const onUp = (event: MouseEvent) => {
      if (insideAi(event.target)) return;
      const element = event.target as HTMLElement | null;
      if (!element?.closest?.(".terminal-host, .cm-editor")) return;
      const { clientX: x, clientY: y } = event;
      setTimeout(() => {
        const selection = capture();
        setPopup(selection ? { x, y, selection } : null);
      }, 0);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("mouseup", onUp);
    };
  }, [capture]);

  const ask = useCallback(() => {
    if (popup) onAsk(popup.selection);
    setPopup(null);
  }, [onAsk, popup]);

  return { popup, setPopup, ask };
}
