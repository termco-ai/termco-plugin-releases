/**
 * Fallback preview for files the text editor can't render: images, video,
 * audio, and PDFs get a media element; anything else shows a size/unsupported
 * hint. Rendered by `EditorPane` when the document is binary or too large.
 */

import { convertFileSrc } from "../../platform";
import { formatBytes } from "../lib/formatBytes";

type Props = {
  path: string;
  status: "binary" | "toolarge";
  size: number;
};

/** Media/unsupported preview for a non-text document at `path`. */
export function BinaryFilePreview({ path, status, size }: Props) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg", "ico"].includes(
    ext,
  );
  const isVideo = ["mp4", "webm", "ogg", "mov"].includes(ext);
  const isAudio = ["mp3", "wav", "flac", "aac", "m4a"].includes(ext);
  const isPdf = ext === "pdf";

  if (isImage || isVideo || isAudio || isPdf) {
    const assetUrl = convertFileSrc(path);
    return (
      <div className="flex h-full min-h-0 flex-col items-center justify-center bg-background p-4 overflow-auto">
        {isImage && (
          <img
            src={assetUrl}
            loading="lazy"
            decoding="async"
            className="max-w-full max-h-full object-contain rounded-md border border-border shadow-sm"
            style={{
              backgroundImage:
                "conic-gradient(#e5e7eb 0.25turn, #f3f4f6 0.25turn 0.5turn, #e5e7eb 0.5turn 0.75turn, #f3f4f6 0.75turn)",
              backgroundSize: "20px 20px",
            }}
            alt={path.split("/").pop()}
          />
        )}
        {isVideo && (
          // biome-ignore lint/a11y/useMediaCaption: local media preview opens arbitrary files with no caption track
          <video
            controls
            preload="metadata"
            className="max-w-full max-h-full"
            src={assetUrl}
          />
        )}
        {isAudio && (
          // biome-ignore lint/a11y/useMediaCaption: local media preview opens arbitrary files with no caption track
          <audio
            controls
            preload="metadata"
            className="w-full max-w-md"
            src={assetUrl}
          />
        )}
        {isPdf && (
          <iframe
            src={assetUrl}
            className="w-full h-full border-none"
            title={path.split("/").pop()}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-6 text-center">
      <div className="text-sm text-foreground">
        {status === "binary" ? "Binary file" : "File too large"}
      </div>
      <div className="text-xs text-muted-foreground">
        {formatBytes(size)} · preview not supported
      </div>
    </div>
  );
}
