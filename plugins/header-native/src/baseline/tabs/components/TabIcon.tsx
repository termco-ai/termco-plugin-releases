/**
 * Renders the leading icon for a tab, chosen by tab kind: file-type glyph for
 * editor/markdown tabs (honouring a language override), and Hugeicons for
 * preview, ai-diff, private terminal, git diff/history, and plain terminal tabs.
 */
import { headerDependencies } from "../../runtime";
import {
  Clock01Icon,
  ComputerTerminal02Icon,
  ContainerIcon,
  GitCompareIcon,
  Globe02Icon,
  IncognitoIcon,
  PuzzleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { isPluginTab, type Tab } from "../../types";

/** Icon element for a single tab, dispatched on `tab.kind`. */
export function TabIcon({ tab }: { tab: Tab }) {
  const fileIconUrl = headerDependencies().fileIcons.fileIconUrl;
  if (tab.kind === "editor" || tab.kind === "markdown") {
    const url =
      tab.kind === "editor" && tab.overrideLanguage
        ? fileIconUrl(`dummy.${tab.overrideLanguage}`)
        : fileIconUrl(tab.title);
    return url ? (
      <img
        src={url}
        alt=""
        className="size-3.5 shrink-0 object-contain"
        onError={(e) => {
          const img = e.currentTarget;
          if (img.dataset.fallback) return;
          img.dataset.fallback = "1";
          img.src = fileIconUrl("dummy.txt");
        }}
      />
    ) : null;
  }
  if (tab.kind === "preview") {
    return (
      <HugeiconsIcon
        icon={Globe02Icon}
        size={14}
        strokeWidth={2}
        className="shrink-0"
      />
    );
  }
  if (tab.kind === "ai-diff") {
    return (
      <HugeiconsIcon
        icon={GitCompareIcon}
        size={14}
        strokeWidth={2}
        className="shrink-0"
      />
    );
  }
  if (tab.kind === "terminal" && tab.private) {
    return (
      <HugeiconsIcon
        icon={IncognitoIcon}
        size={14}
        strokeWidth={2}
        className="shrink-0"
      />
    );
  }
  if (tab.kind === "git-diff" || tab.kind === "git-commit-file") {
    return (
      <HugeiconsIcon
        icon={GitCompareIcon}
        size={14}
        strokeWidth={2}
        className="shrink-0"
      />
    );
  }
  if (tab.kind === "git-history") {
    return (
      <HugeiconsIcon
        icon={Clock01Icon}
        size={14}
        strokeWidth={2}
        className="shrink-0"
      />
    );
  }
  if (tab.kind === "container") {
    return (
      <HugeiconsIcon
        icon={ContainerIcon}
        size={14}
        strokeWidth={2}
        className="shrink-0"
      />
    );
  }
  // Generic fallback for plugin-owned kinds (`plugin:*`).
  if (isPluginTab(tab)) {
    return (
      <HugeiconsIcon
        icon={PuzzleIcon}
        size={14}
        strokeWidth={2}
        className="shrink-0"
      />
    );
  }
  return (
    <HugeiconsIcon
      icon={ComputerTerminal02Icon}
      size={14}
      strokeWidth={2}
      className="shrink-0"
    />
  );
}
