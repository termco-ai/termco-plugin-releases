/**
 * LSP hover tooltips: `hoverTooltip` source that flushes pending doc changes,
 * asks main for hover content, and renders the markdown via the dependency-free
 * mini renderer. Styling piggybacks on the app's popover variables.
 */
import { EditorView, hoverTooltip, type Tooltip } from "@codemirror/view";
import { lspSyncOf } from "./docSync";
import { lspHover } from "./ipc";
import { lspRangeToCm, offsetToLsp } from "./positions";
import { renderMarkdownLite } from "./renderMarkdownLite";

const lspHoverTheme = EditorView.baseTheme({
  ".cm-tooltip:has(> .cm-lsp-md)": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    maxWidth: "44rem",
    maxHeight: "20rem",
    overflow: "auto",
    padding: "0",
  },
  ".cm-lsp-md": {
    padding: "6px 10px",
    fontSize: "12px",
    lineHeight: "1.5",
  },
  ".cm-lsp-md p": { margin: "0.25em 0" },
  ".cm-lsp-md hr": {
    border: "none",
    borderTop: "1px solid var(--border)",
    margin: "0.4em -10px",
  },
  ".cm-lsp-md .cm-lsp-md-heading": { fontWeight: "600", margin: "0.3em 0" },
  ".cm-lsp-md code": {
    fontFamily: "inherit",
    fontSize: "11.5px",
    backgroundColor: "color-mix(in srgb, var(--muted) 60%, transparent)",
    borderRadius: "3px",
    padding: "0 3px",
  },
  ".cm-lsp-md .cm-lsp-code": {
    margin: "0.3em 0",
    padding: "4px 6px",
    borderRadius: "4px",
    backgroundColor: "color-mix(in srgb, var(--muted) 45%, transparent)",
    overflowX: "auto",
  },
  ".cm-lsp-md .cm-lsp-code code": {
    backgroundColor: "transparent",
    padding: "0",
    whiteSpace: "pre",
  },
});

export const lspHoverExtension = [
  hoverTooltip(
    async (view, pos): Promise<Tooltip | null> => {
      const plugin = lspSyncOf(view);
      if (!plugin?.active) return null;
      await plugin.flush();
      let result: Awaited<ReturnType<typeof lspHover>>;
      try {
        result = await lspHover(
          plugin.env,
          plugin.path,
          offsetToLsp(view.state.doc, pos),
        );
      } catch {
        return null;
      }
      if (!result) return null;
      const doc = view.state.doc;
      const range = result.range
        ? lspRangeToCm(doc, result.range)
        : (view.state.wordAt(pos) ?? { from: pos, to: pos });
      return {
        pos: range.from,
        end: range.to,
        above: true,
        create: () => {
          const dom = renderMarkdownLite(result.markdown);
          return { dom };
        },
      };
    },
    { hoverTime: 300, hideOnChange: true },
  ),
  lspHoverTheme,
];
