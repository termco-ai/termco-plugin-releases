/**
 * Built-in rich widgets, registered into the block widget registry:
 *   files (ls → chips) · git (git status → diff rows) · url (dev-server
 *   pill under the log). Import for side effect.
 */
import { openPreviewFromBlock } from "../../lib/blockEvents";
import {
  type BlockWidgetProps,
  registerBlockWidget,
} from "../../lib/widgetRegistry";
import { FilesWidget, lsTarget } from "./FilesWidget";
import { GitStatusWidget } from "./GitStatusWidget";

const URL_RE = /https?:\/\/[^\s"')\]>]+/;

registerBlockWidget({
  id: "files",
  mode: "replace",
  match: (ctx) => {
    if (ctx.exitCode !== 0 && ctx.exitCode !== null) return null;
    if (!/^ls(\s|$)/.test(ctx.command.trim())) return null;
    const target = lsTarget(ctx.command);
    return target === null ? null : { target };
  },
  component: ({ ctx, onEmpty }: BlockWidgetProps) => (
    <FilesWidget
      cwd={ctx.cwd}
      env={ctx.env}
      command={ctx.command}
      readOutput={ctx.readOutput}
      onEmpty={onEmpty}
    />
  ),
});

registerBlockWidget({
  id: "git",
  mode: "replace",
  match: (ctx) => {
    if (ctx.exitCode !== 0 && ctx.exitCode !== null) return null;
    return /^git status\s*$/.test(ctx.command.trim()) ? {} : null;
  },
  component: ({ ctx, onEmpty }: BlockWidgetProps) => (
    <GitStatusWidget cwd={ctx.cwd} env={ctx.env} onEmpty={onEmpty} />
  ),
});

registerBlockWidget({
  id: "url",
  mode: "augment",
  match: (ctx) => {
    const url = URL_RE.exec(ctx.readOutput())?.[0];
    return url ? { url } : null;
  },
  component: ({ data }: BlockWidgetProps) => {
    const { url } = data as { url: string };
    return (
      <button
        type="button"
        className="tb-url"
        onClick={() => openPreviewFromBlock(url)}
      >
        <span className="tb-url-dot" />
        {url}
        <span>Open preview →</span>
      </button>
    );
  },
});
