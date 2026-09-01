import type { PtyCapability } from "@termco/terminal-base";
import { useEffect, useState } from "react";

export type SystemInfo = {
  os: "macOS" | "Windows" | "Linux" | null;
  shell: string | null;
};

const shellProbes = new WeakMap<object, Promise<string | null>>();

function platformLabel(platform: string): SystemInfo["os"] {
  const value = platform.toLowerCase();
  if (value.includes("mac")) return "macOS";
  if (value.includes("win")) return "Windows";
  if (value.includes("linux")) return "Linux";
  return null;
}

function shellProbe(
  pty: Pick<PtyCapability, "shellName">,
): Promise<string | null> {
  const existing = shellProbes.get(pty);
  if (existing) return existing;

  const probe = Promise.resolve()
    .then(() => pty.shellName())
    .then(
      (name) => name || null,
      () => null,
    );
  shellProbes.set(pty, probe);
  return probe;
}

export function useSystemInfo(
  pty: Pick<PtyCapability, "shellName">,
  platform = navigator.platform,
): SystemInfo {
  const [shell, setShell] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    void shellProbe(pty).then((name) => {
      if (current) setShell(name);
    });
    return () => {
      current = false;
    };
  }, [pty]);
  return { os: platformLabel(platform), shell };
}
