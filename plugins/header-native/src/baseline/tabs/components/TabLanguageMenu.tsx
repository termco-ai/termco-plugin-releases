/**
 * Language-override dropdown attached to an editor tab's icon. Lets the user
 * force a syntax mode (or return to auto-detect) and toggle between the curated
 * and full language lists. The open/close and "show all" state is owned by the
 * parent `TabBar` so it stays shared across the strip; this component only
 * renders and reports intent.
 */
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../ui";
import { headerDependencies } from "../../runtime";
import { Search01Icon, Tick02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type Dispatch, type SetStateAction, useMemo, useState } from "react";
import type { EditorTab, Tab } from "../../types";
import { TabIcon } from "./TabIcon";

type TabLanguageMenuProps = {
  tab: Tab;
  showAllLanguages: boolean;
  setShowAllLanguages: Dispatch<SetStateAction<boolean>>;
  onOverrideLanguage?: (id: number, lang: string | null) => void;
};

/** Editor-tab icon with its language-override menu. */
export function TabLanguageMenu({
  tab: t,
  showAllLanguages,
  setShowAllLanguages,
  onOverrideLanguage,
}: TabLanguageMenuProps) {
  const runtime = headerDependencies();
  const ALL_LANGUAGES = runtime.languages.all();
  const EXPOSED_LANGUAGES = runtime.languages.common();
  const resolveDisplayName = runtime.languages.displayName;
  const fileIconUrl = runtime.fileIcons.fileIconUrl;
  const [query, setQuery] = useState("");
  const languages = useMemo(() => {
    const source = showAllLanguages ? ALL_LANGUAGES : EXPOSED_LANGUAGES;
    const needle = query.trim().toLowerCase();
    if (!needle) return source;
    return source.filter(
      (language) =>
        language.name.toLowerCase().includes(needle) ||
        language.ext.toLowerCase().includes(needle),
    );
  }, [query, showAllLanguages]);

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) {
          setShowAllLanguages(false);
          setQuery("");
        }
      }}
    >
      <DropdownMenuTrigger asChild>
        {/* span, not button: a button nested in the TabsTrigger button is invalid DOM and breaks WebKit focus. */}
        <span
          role="button"
          tabIndex={-1}
          data-no-drag
          className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-sm p-1 -m-1 transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <TabIcon tab={t} />
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        side="bottom"
        sideOffset={6}
        alignOffset={-4}
        className="w-72 overflow-hidden p-0"
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onPointerUp={(e) => e.stopPropagation()}
      >
        <div className="border-b border-border/70 px-3.5 py-3">
          <p className="text-xs font-semibold text-foreground">Language mode</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Override syntax and language services for this tab.
          </p>
        </div>
        <div className="border-b border-border/70 p-2">
          <div className="flex items-center gap-2 rounded-md border border-border px-2.5">
            <HugeiconsIcon
              icon={Search01Icon}
              size={13}
              strokeWidth={1.7}
              className="text-muted-foreground"
            />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => event.stopPropagation()}
              placeholder="Search languages"
              className="h-8 min-w-0 flex-1 bg-transparent text-xs outline-none"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto p-1.5">
          <DropdownMenuItem
            onSelect={() => {
              onOverrideLanguage?.(t.id, null);
            }}
            className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-xs"
          >
            <img
              src={fileIconUrl(t.title)}
              className="size-3.5 shrink-0 object-contain"
              alt=""
            />
            <div className="flex flex-1 flex-col">
              <span>Auto Detect</span>
              <span className="text-xs text-muted-foreground italic">
                Mode: {resolveDisplayName(t.title)}
              </span>
            </div>
            {!(t as EditorTab).overrideLanguage && (
              <HugeiconsIcon
                icon={Tick02Icon}
                className="size-3.5 text-primary"
              />
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator className="my-1" />
          {languages.map((lang) => {
            const isSelected = (t as EditorTab).overrideLanguage === lang.ext;
            return (
              <DropdownMenuItem
                key={lang.ext}
                onSelect={() => onOverrideLanguage?.(t.id, lang.ext)}
                className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-xs"
              >
                <img
                  src={fileIconUrl(`dummy.${lang.ext}`)}
                  className="size-3.5 shrink-0 object-contain"
                  alt=""
                />
                <span className="flex-1">{lang.name}</span>
                {isSelected && (
                  <HugeiconsIcon
                    icon={Tick02Icon}
                    className="size-3.5 text-primary"
                  />
                )}
              </DropdownMenuItem>
            );
          })}
          {languages.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-muted-foreground">
              No language matches “{query}”.
            </div>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setShowAllLanguages((value) => !value)}
          className="flex h-8 w-full items-center border-t border-border/70 px-3 text-left text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          {showAllLanguages
            ? "Show common languages only"
            : `Browse all ${ALL_LANGUAGES.length} languages`}
        </button>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
