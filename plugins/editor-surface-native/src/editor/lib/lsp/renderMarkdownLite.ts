/**
 * Tiny markdown → DOM renderer for LSP hover/signature docs. Covers what
 * language servers actually emit (fenced code, inline code, bold/italic,
 * links, rules, headings); everything else stays escaped plain text. No
 * external dependency — hover content is untrusted server output.
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inline markdown (bold/italic/code/links) on an already-escaped string. */
function renderInline(escaped: string): string {
  return (
    escaped
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>")
      // Links render as their text — hover tooltips shouldn't navigate.
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<span class="cm-lsp-md-link">$1</span>',
      )
  );
}

function renderTextBlock(block: string): string {
  const lines = block.split("\n").map((line) => {
    if (/^\s*(-{3,}|\*{3,})\s*$/.test(line)) return "<hr>";
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      return `<div class="cm-lsp-md-heading">${renderInline(escapeHtml(heading[2]))}</div>`;
    }
    return renderInline(escapeHtml(line));
  });
  // Collapse the line array into paragraphs at blank lines.
  const html: string[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) {
      html.push(`<p>${paragraph.join("<br>")}</p>`);
      paragraph = [];
    }
  };
  for (const line of lines) {
    if (line === "<hr>") {
      flush();
      html.push(line);
    } else if (line.startsWith('<div class="cm-lsp-md-heading"')) {
      flush();
      html.push(line);
    } else if (line.trim() === "") {
      flush();
    } else {
      paragraph.push(line);
    }
  }
  flush();
  return html.join("");
}

/** Render markdown into a detached element with class `cm-lsp-md`. */
export function renderMarkdownLite(markdown: string): HTMLElement {
  const root = document.createElement("div");
  root.className = "cm-lsp-md";
  const html: string[] = [];
  // Split on fenced code blocks; odd segments are [lang, code] pairs.
  const parts = markdown.split(/```([^\n`]*)\n([\s\S]*?)```/g);
  for (let i = 0; i < parts.length; i += 3) {
    const text = parts[i];
    if (text?.trim()) html.push(renderTextBlock(text.trim()));
    const code = parts[i + 2];
    if (code !== undefined) {
      html.push(
        `<pre class="cm-lsp-code"><code>${escapeHtml(code.replace(/\n$/, ""))}</code></pre>`,
      );
    }
  }
  root.innerHTML = html.join("");
  return root;
}
