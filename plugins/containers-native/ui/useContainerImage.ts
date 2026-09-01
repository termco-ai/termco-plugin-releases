/**
 * Image facts for a container's detail tab — fetched once per (runtime, image)
 * through the shared `containers.runtime` capability. Stale-guarded so re-keying to another image
 * can't apply an old response. Returns null while loading / on failure the
 * Image section renders "unavailable".
 */
import { useEffect, useRef, useState } from "react";
import { type ImageInfo, parseImage } from "./lib/imageParse";
import { containersNative } from "./lib/native";
import type { ContainerRuntime } from "./types";

export function useContainerImage(
  runtime: ContainerRuntime,
  imageRef: string,
): ImageInfo | null {
  const [info, setInfo] = useState<ImageInfo | null>(null);
  const ridRef = useRef(0);
  useEffect(() => {
    if (!imageRef) {
      setInfo(null);
      return;
    }
    const rid = ++ridRef.current;
    setInfo(null);
    void containersNative
      .imageInspect(runtime, imageRef)
      .then((raw) => {
        if (ridRef.current !== rid) return;
        setInfo(raw ? parseImage(raw) : null);
      })
      .catch(() => {
        if (ridRef.current !== rid) return;
        setInfo(null);
      });
  }, [runtime, imageRef]);
  return info;
}
