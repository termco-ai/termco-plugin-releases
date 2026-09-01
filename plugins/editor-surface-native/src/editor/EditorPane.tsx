/**
 * `EditorPane` — the CodeMirror-backed text editor for a single file.
 *
 * Owns the editor's extension wiring (vim, word-wrap, language, inline AI
 * autocomplete, save keymap), reacts to preference changes via compartment
 * reconfiguration, and renders load/error/binary fallbacks. The imperative
 * handle, autocomplete glue, and binary preview live in sibling files; this
 * component threads them together.
 */
import { usePreferencesStore } from "../preferences";
import { LOCAL_WORKSPACE, type WorkspaceEnv } from "../workspace";
import { Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { vim } from "@replit/codemirror-vim";
import CodeMirror, { type ReactCodeMirrorRef } from "@uiw/react-codemirror";
import { forwardRef, useCallback, useEffect, useMemo, useRef } from "react";
import { BinaryFilePreview } from "./components/BinaryFilePreview";
import { inlineCompletion } from "./lib/autocomplete/inlineExtension";
import {
  buildSharedExtensions,
  languageCompartment,
  vimCompartment,
  wrapCompartment,
} from "./lib/extensions";
import { type LanguageResult, resolveLanguage } from "./lib/languageResolver";
import { formatEditor } from "./lib/format";
import { lspDocSave } from "./lib/lsp/ipc";
import { lspSupport } from "./lib/lsp/lspExtension";
import { readAutocompletePrefs } from "./lib/readAutocompletePrefs";
import { useDocument } from "./lib/useDocument";
import {
  type EditorPaneHandle,
  useEditorPaneImperativeHandle,
} from "./lib/useEditorPaneImperativeHandle";
import { useEditorThemeExt } from "./lib/useEditorThemeExt";
import { initVimGlobals, vimHandlersExtension } from "./lib/vim";

export type { EditorPaneHandle } from "./lib/useEditorPaneImperativeHandle";

initVimGlobals();

type Props = {
  path: string;
  overrideLanguage?: string | null;
  /** The env of the tab's OWN rig (threaded from the tab, not the global). */
  env?: WorkspaceEnv;
  rigRoot?: string | null;
  /** Open (or focus) another file at a position — go-to-definition target. */
  onOpenFileAt?: (path: string, line: number, character: number) => void;
  onDirtyChange?: (dirty: boolean) => void;
  onSaved?: () => void;
  onClose?: () => void;
};

export const EditorPane = forwardRef<EditorPaneHandle, Props>(
  function EditorPane(props, ref) {
    const {
      path,
      overrideLanguage,
      env,
      rigRoot,
      onOpenFileAt,
      onDirtyChange,
      onSaved,
      onClose,
    } = props;

    const { doc, onChange, save, reload } = useDocument({
      path,
      env,
      onDirtyChange,
    });
    const reloadRef = useRef(reload);
    reloadRef.current = reload;
    const cmRef = useRef<ReactCodeMirrorRef>(null);
    const themeExt = useEditorThemeExt();
    const vimMode = usePreferencesStore((s) => s.vimMode);
    const editorWordWrap = usePreferencesStore((s) => s.editorWordWrap);
    const languageRef = useRef<string | null>(null);
    // Stabilize save + onSaved via refs so the extensions array never changes
    // identity — a new identity makes @uiw/react-codemirror reconfigure the
    // whole state, wiping the language compartment.
    const saveRef = useRef(save);
    saveRef.current = save;
    const onSavedRef = useRef(onSaved);
    onSavedRef.current = onSaved;
    // Format the buffer BEFORE writing (project formatter → LSP fallback) so
    // one explicit save produces the final file. Autosave stays format-free —
    // reformatting under the cursor mid-thought is hostile.
    const formatBeforeSaveRef = useRef<() => Promise<void>>(async () => {});
    formatBeforeSaveRef.current = async () => {
      const view = cmRef.current?.view;
      if (!view || !usePreferencesStore.getState().editorFormatOnSave) return;
      try {
        await formatEditor(
          view,
          envRef.current,
          rigRootRef.current,
          pathRef.current,
        );
      } catch {
        // fail-open: saving must never block on a formatter
      }
    };
    // Single save entry point for every trigger (⌘S keymap, vim :w, the
    // imperative handle): persist, then notify — identical side effects.
    const saveAndNotifyRef = useRef<() => Promise<unknown>>(async () => {});
    saveAndNotifyRef.current = async () => {
      await formatBeforeSaveRef.current();
      await saveRef.current();
      // Forward textDocument/didSave so servers that lint-on-save re-check.
      void lspDocSave(envRef.current, pathRef.current).catch(() => {});
      onSavedRef.current?.();
    };
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    const pathRef = useRef(path);
    pathRef.current = path;

    const envRef = useRef(env ?? LOCAL_WORKSPACE);
    envRef.current = env ?? LOCAL_WORKSPACE;
    const rigRootRef = useRef(rigRoot ?? null);
    rigRootRef.current = rigRoot ?? null;
    const onOpenFileAtRef = useRef(onOpenFileAt);
    onOpenFileAtRef.current = onOpenFileAt;

    const pendingLineRef = useRef<{ line: number; character?: number } | null>(
      null,
    );
    const statusRef = useRef(doc.status);
    statusRef.current = doc.status;

    const applyPendingGoto = useCallback(() => {
      const view = cmRef.current?.view;
      const pending = pendingLineRef.current;
      if (!view || pending == null || statusRef.current !== "ready") return;
      const target = Math.max(1, Math.min(pending.line, view.state.doc.lines));
      const line = view.state.doc.line(target);
      const at = Math.min(
        line.from + Math.max(0, pending.character ?? 0),
        line.to,
      );
      view.dispatch({
        selection: { anchor: at },
        effects: EditorView.scrollIntoView(at, { y: "center" }),
      });
      view.focus();
      pendingLineRef.current = null;
    }, []);

    useEffect(() => {
      if (doc.status === "ready") applyPendingGoto();
    }, [doc.status, applyPendingGoto]);

    const extensions = useMemo(
      () => [
        // basicSetup is added before user extensions by @uiw/react-codemirror,
        // so we must elevate vim's precedence to win the keymap.
        vimCompartment.of(
          usePreferencesStore.getState().vimMode ? Prec.highest(vim()) : [],
        ),
        wrapCompartment.of(
          usePreferencesStore.getState().editorWordWrap
            ? EditorView.lineWrapping
            : [],
        ),
        vimHandlersExtension(() => ({
          save: () => {
            void saveAndNotifyRef.current();
          },
          close: () => onCloseRef.current?.(),
        })),
        ...buildSharedExtensions(),
        languageCompartment.of([]),
        inlineCompletion({
          getPrefs: readAutocompletePrefs,
          getPath: () => pathRef.current,
          getLanguage: () => languageRef.current,
        }),
        ...lspSupport({
          getEnv: () => envRef.current,
          getRigRoot: () => rigRootRef.current,
          getPath: () => pathRef.current,
          getLanguageId: () => languageRef.current,
          openFileAt: (target, line, character) =>
            onOpenFileAtRef.current?.(target, line, character),
        }),
        keymap.of([
          {
            key: "Mod-s",
            preventDefault: true,
            run: () => {
              void saveAndNotifyRef.current();
              return true;
            },
          },
          {
            key: "Shift-Alt-f",
            preventDefault: true,
            run: (view) => {
              void formatEditor(
                view,
                envRef.current,
                rigRootRef.current,
                pathRef.current,
              ).catch(() => {});
              return true;
            },
          },
        ]),
      ],
      [],
    );

    useEffect(() => {
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: vimCompartment.reconfigure(vimMode ? Prec.highest(vim()) : []),
      });
    }, [vimMode]);

    useEffect(() => {
      const view = cmRef.current?.view;
      if (!view) return;
      view.dispatch({
        effects: wrapCompartment.reconfigure(
          editorWordWrap ? EditorView.lineWrapping : [],
        ),
      });
    }, [editorWordWrap]);

    useEffect(() => {
      const ext =
        overrideLanguage || (path.split(".").pop()?.toLowerCase() ?? null);
      languageRef.current = ext;
      if (doc.status !== "ready") return;
      let cancelled = false;
      const resolve = async (): Promise<LanguageResult> => {
        const resolvePath = overrideLanguage
          ? `dummy.${overrideLanguage}`
          : path;
        return (
          (await resolveLanguage(resolvePath)) ?? { ext: [], name: "", id: "" }
        );
      };
      void resolve().then((result) => {
        if (cancelled) return;
        if (result.id) languageRef.current = result.id;
        const view = cmRef.current?.view;
        if (!view) return;
        view.dispatch({
          effects: languageCompartment.reconfigure(result.ext),
        });
      });
      return () => {
        cancelled = true;
      };
    }, [path, doc.status, overrideLanguage]);

    useEditorPaneImperativeHandle(ref, {
      cmRef,
      path,
      applyPendingGoto,
      saveRef: saveAndNotifyRef,
      reloadRef,
      pendingLineRef,
    });

    if (doc.status === "loading") {
      return (
        <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
          Loading…
        </div>
      );
    }
    if (doc.status === "error") {
      return (
        <div className="flex h-full items-center justify-center px-6 text-center text-xs text-destructive">
          {doc.message}
        </div>
      );
    }
    if (doc.status === "binary" || doc.status === "toolarge") {
      return (
        <BinaryFilePreview path={path} status={doc.status} size={doc.size} />
      );
    }

    return (
      <div className="flex h-full min-h-0 flex-col zoom-exempt">
        <CodeMirror
          ref={cmRef}
          value={doc.content}
          onChange={onChange}
          theme={themeExt}
          extensions={extensions}
          height="100%"
          className="flex-1 min-h-0 overflow-hidden"
          basicSetup={{
            lineNumbers: true,
            highlightActiveLineGutter: true,
            foldGutter: true,
            bracketMatching: true,
            closeBrackets: true,
            // Popup completion comes from lspSupport()'s compartment (word-based
            // fallback or LSP source) — not from basicSetup, which couldn't be
            // reconfigured at runtime.
            autocompletion: false,
            highlightActiveLine: true,
            highlightSelectionMatches: true,
            searchKeymap: true,
          }}
        />
      </div>
    );
  },
);
