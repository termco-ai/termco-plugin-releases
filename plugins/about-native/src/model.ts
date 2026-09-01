import type { ApplicationInfo } from "@termco/application-base";

const PLATFORM_LABEL: Partial<Record<NodeJS.Platform, string>> = {
  darwin: "macOS",
  win32: "Windows",
  linux: "Linux",
  freebsd: "FreeBSD",
};

export const REPOSITORY_URL = "https://github.com/termco-ai/termco";
export const WEBSITE_URL = "https://termco.app";

export function buildLabel(info: ApplicationInfo): string {
  if (!info.platform || !info.architecture) return `v${info.version}`;
  return `${PLATFORM_LABEL[info.platform] ?? info.platform} · ${info.architecture} · v${info.version}`;
}
