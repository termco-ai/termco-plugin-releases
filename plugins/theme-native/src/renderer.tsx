import { EVENTS_APPLICATION_SERVICE, type ApplicationEventsCapability } from "@termco/events-base";
import type { PluginModule } from "@termco/kernel";
import { SETTINGS_PREFERENCES_SERVICE, type PreferencesCapability } from "@termco/storage-base";
import {
  UI_BACKGROUND_TASKS_SERVICE,
  type UiBackgroundRegistry,
} from "@termco/ui-shell-base";
import type {
  ThemeModePreference,
  ThemeMutation,
  ThemeSnapshot,
  UiThemeCapability,
} from "@termco/ui-theme-base";
import ui from "@termco/ui";
import { applyTheme, clearTheme } from "./apply";
import { deleteBackground, getBackground, importBackground } from "./background";
import { BUILTIN_THEMES, DEFAULT_THEME_ID } from "./catalog";
import { createStarterTheme, normalizeCustomThemes, normalizeEditorThemePreference, resolveEditorTheme, validateTheme } from "./model";

const { useEffect, useRef, useState, useSyncExternalStore } = ui.React;
const KEYS = ["theme", "themeId", "editorTheme", "backgroundKind", "backgroundImageId", "backgroundOpacity", "backgroundBlur", "appearance.customThemes"];

function modeValue(value: unknown): ThemeModePreference {
  return value === "light" || value === "dark" || value === "system" ? value : "system";
}
function numberValue(value: unknown, fallback: number, min: number, max: number): number {
  return typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}
function backgroundBlurValue(value: unknown, fallback = 0): number {
  if (typeof value !== "number") return fallback;
  if (!Number.isFinite(value)) return 16;
  return Math.min(64, Math.max(0, Math.round(value)));
}
export function renderedBackgroundOpacity(value: number): number {
  return value * 0.5;
}

export async function createThemeCapability(preferences: PreferencesCapability, events: ApplicationEventsCapability): Promise<UiThemeCapability> {
  const stored = await preferences.getMany(KEYS);
  let mode = modeValue(stored.theme);
  let themeId = typeof stored.themeId === "string" ? stored.themeId : DEFAULT_THEME_ID;
  let previewId: string | null = null;
  let editorTheme = normalizeEditorThemePreference(stored.editorTheme);
  let customThemes = normalizeCustomThemes(stored["appearance.customThemes"]);
  let backgroundKind = stored.backgroundKind === "image" ? "image" as const : "none" as const;
  let backgroundImageId = typeof stored.backgroundImageId === "string" ? stored.backgroundImageId : null;
  let backgroundOpacity = numberValue(stored.backgroundOpacity, 0.5, 0, 1);
  let backgroundBlur = backgroundBlurValue(stored.backgroundBlur);
  let systemDark = typeof window === "undefined" ? true : window.matchMedia("(prefers-color-scheme: dark)").matches;
  let revision = 0;
  let snapshot: ThemeSnapshot;
  const listeners = new Set<() => void>();
  const themes = () => [...BUILTIN_THEMES, ...customThemes];
  const rebuild = () => {
    revision += 1;
    snapshot = {
      revision, mode, resolvedMode: mode === "system" ? (systemDark ? "dark" : "light") : mode,
      themeId: previewId ?? themeId, themes: themes(), customThemeIds: customThemes.map((theme) => theme.id), editorTheme,
      background: { kind: backgroundKind, imageId: backgroundImageId, opacity: backgroundOpacity, blur: backgroundBlur },
    };
    for (const listener of listeners) listener();
  };
  rebuild();
  const persist = async (key: string, value: unknown, rollback: () => void) => {
    try { await preferences.set(key, value); }
    catch (error) { rollback(); rebuild(); throw error; }
  };
  const setSystemDark = (value: boolean) => { if (systemDark !== value) { systemDark = value; rebuild(); } };

  const mutate = async (mutation: ThemeMutation): Promise<{ imageId?: string; themeId?: string }> => {
    switch (mutation.type) {
      case "set-mode": { const previous = mode; mode = mutation.mode; rebuild(); await persist("theme", mode, () => { mode = previous; }); return {}; }
      case "set-theme": { const previous = themeId; previewId = null; themeId = themes().some((theme) => theme.id === mutation.id) ? mutation.id : DEFAULT_THEME_ID; rebuild(); await persist("themeId", themeId, () => { themeId = previous; }); return {}; }
      case "preview-theme": previewId = mutation.id; rebuild(); return {};
      case "set-editor-theme": { const previous = editorTheme; editorTheme = normalizeEditorThemePreference(mutation.id); rebuild(); await persist("editorTheme", editorTheme, () => { editorTheme = previous; }); return {}; }
      case "save-custom-theme": {
        const validated = validateTheme(mutation.theme); if (!validated.ok) throw new Error(validated.error);
        const previous = customThemes; customThemes = customThemes.filter((theme) => theme.id !== validated.theme.id).concat(validated.theme); rebuild();
        await persist("appearance.customThemes", customThemes, () => { customThemes = previous; }); return {};
      }
      case "delete-custom-theme": {
        const previous = customThemes; const previousId = themeId; customThemes = customThemes.filter((theme) => theme.id !== mutation.id);
        if (themeId === mutation.id) themeId = DEFAULT_THEME_ID; rebuild();
        try { await preferences.set("appearance.customThemes", customThemes); if (themeId !== previousId) await preferences.set("themeId", themeId); }
        catch (error) { customThemes = previous; themeId = previousId; rebuild(); throw error; } return {};
      }
      case "import-background": {
        const id = await importBackground(mutation.file); const previousId = backgroundImageId; const previousKind = backgroundKind;
        backgroundImageId = id; backgroundKind = "image"; rebuild();
        try { await preferences.set("backgroundImageId", id); await preferences.set("backgroundKind", "image"); }
        catch (error) {
          backgroundImageId = previousId;
          backgroundKind = previousKind;
          rebuild();
          await Promise.allSettled([
            preferences.set("backgroundImageId", previousId),
            preferences.set("backgroundKind", previousKind),
          ]);
          await deleteBackground(id).catch(() => {});
          throw error;
        }
        if (previousId && previousId !== id) await deleteBackground(previousId).catch(() => {}); return { imageId: id };
      }
      case "remove-background": {
        const previousId = backgroundImageId; const previousKind = backgroundKind; backgroundImageId = null; backgroundKind = "none"; rebuild();
        try { await preferences.set("backgroundKind", "none"); await preferences.set("backgroundImageId", null); }
        catch (error) {
          backgroundImageId = previousId;
          backgroundKind = previousKind;
          rebuild();
          await Promise.allSettled([
            preferences.set("backgroundKind", previousKind),
            preferences.set("backgroundImageId", previousId),
          ]);
          throw error;
        }
        if (previousId) await deleteBackground(previousId).catch(() => {}); return {};
      }
      case "set-background-opacity": { const previous = backgroundOpacity; backgroundOpacity = numberValue(mutation.value, previous, 0, 1); rebuild(); await persist("backgroundOpacity", backgroundOpacity, () => { backgroundOpacity = previous; }); return {}; }
      case "set-background-blur": { const previous = backgroundBlur; backgroundBlur = backgroundBlurValue(mutation.value, previous); rebuild(); await persist("backgroundBlur", backgroundBlur, () => { backgroundBlur = previous; }); return {}; }
      case "request-edit": {
        if (mutation.request.action === "create") {
          const starter = createStarterTheme();
          await mutate({ type: "save-custom-theme", theme: starter });
          await mutate({ type: "set-theme", id: starter.id });
          await Promise.resolve(events.emit("termco://theme-edit", { action: "edit", id: starter.id }));
          return { themeId: starter.id };
        }
        await Promise.resolve(events.emit("termco://theme-edit", mutation.request));
        return { themeId: mutation.request.id };
      }
    }
  };

  function BackgroundSurface({ state }: { state: ThemeSnapshot["background"] }) {
    const [image, setImage] = useState<{ url: string; animated: boolean } | null>(null);
    const [visible, setVisible] = useState(false);
    const lastUrl = useRef<string | null>(null);
    const resizing = useWindowResizing(280);
    const documentHidden = useDocumentHidden();
    useEffect(() => {
      if (state.kind !== "image" || !state.imageId) { setImage(null); setVisible(false); return; }
      let active = true;
      let frame: number | null = null;
      setVisible(false);
      void getBackground(state.imageId).then((blob) => {
        if (!active || !blob) return;
        const url = URL.createObjectURL(blob);
        if (lastUrl.current) URL.revokeObjectURL(lastUrl.current);
        lastUrl.current = url;
        const type = blob.type.toLowerCase();
        setImage({ url, animated: type === "image/gif" || type === "image/apng" || type === "image/webp" });
        frame = requestAnimationFrame(() => { frame = null; if (active) setVisible(true); });
      });
      return () => { active = false; if (frame !== null) cancelAnimationFrame(frame); };
    }, [state.kind, state.imageId]);
    useEffect(() => () => { if (lastUrl.current) URL.revokeObjectURL(lastUrl.current); }, []);
    if (!image) return null;
    const suspendAnimated = image.animated && (resizing || documentHidden);
    const blurActive = !image.animated && state.blur > 0 && !resizing;
    return <div aria-hidden className="termco-bg-surface" style={{ position: "fixed", inset: 0, zIndex: 2147483646, pointerEvents: "none", backgroundImage: suspendAnimated ? "none" : `url(${image.url})`, backgroundSize: "cover", backgroundPosition: "center", opacity: visible && !suspendAnimated ? renderedBackgroundOpacity(state.opacity) : 0, filter: blurActive ? `blur(${state.blur}px)` : undefined, transform: "translateZ(0)", transition: "opacity 200ms ease-out" }} />;
  }
  function useWindowResizing(idleMs: number): boolean {
    const [resizing, setResizing] = useState(false);
    useEffect(() => {
      let timer: number | null = null;
      const onResize = () => {
        setResizing(true);
        if (timer !== null) window.clearTimeout(timer);
        timer = window.setTimeout(() => { setResizing(false); timer = null; }, idleMs);
      };
      window.addEventListener("resize", onResize, { passive: true });
      return () => { window.removeEventListener("resize", onResize); if (timer !== null) window.clearTimeout(timer); };
    }, [idleMs]);
    return resizing;
  }
  function useDocumentHidden(): boolean {
    const [hidden, setHidden] = useState(() => typeof document !== "undefined" && document.hidden);
    useEffect(() => {
      const onChange = () => setHidden(document.hidden);
      document.addEventListener("visibilitychange", onChange);
      return () => document.removeEventListener("visibilitychange", onChange);
    }, []);
    return hidden;
  }
  function Root({ children }: { children?: import("react").ReactNode }) {
    const state = useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, () => snapshot, () => snapshot);
    useEffect(() => {
      const media = window.matchMedia("(prefers-color-scheme: dark)"); const listener = (event: MediaQueryListEvent) => setSystemDark(event.matches);
      setSystemDark(media.matches); media.addEventListener("change", listener); return () => media.removeEventListener("change", listener);
    }, []);
    useEffect(() => {
      const selected = state.themes.find((theme) => theme.id === state.themeId) ?? state.themes.find((theme) => theme.id === DEFAULT_THEME_ID);
      applyTheme(selected, state.resolvedMode); return clearTheme;
    }, [state]);
    return <><BackgroundSurface state={state.background} />{children}</>;
  }
  return {
    Root, snapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    mutate, validate: validateTheme,
    resolveEditorTheme(preference) { return resolveEditorTheme(preference, snapshot.themeId, snapshot.themes, snapshot.resolvedMode); },
  };
}

const plugin: PluginModule = {
  inject: [
    SETTINGS_PREFERENCES_SERVICE,
    EVENTS_APPLICATION_SERVICE,
    UI_BACKGROUND_TASKS_SERVICE,
  ],
  async activate(context) {
    const capability = await createThemeCapability(
      context.get<PreferencesCapability>("settings.preferences"),
      context.get<ApplicationEventsCapability>(EVENTS_APPLICATION_SERVICE),
    );
    context.provide("ui.theme", capability);
    await context.effect(() =>
      context.get<UiBackgroundRegistry>(UI_BACKGROUND_TASKS_SERVICE).register(
        {
          id: "theme-runtime",
          label: "Application theme runtime",
          description: "Applies the selected colors and desktop background.",
          order: -1_000,
          Component: capability.Root,
        },
        {
          pluginId: context.pluginId,
          generation: context.generation,
          key: "theme-runtime",
        },
      ),
    );
    return () => clearTheme();
  },
};
export default plugin;
