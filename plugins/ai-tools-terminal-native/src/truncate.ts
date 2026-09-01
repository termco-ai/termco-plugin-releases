function safeIndex(text: string, index: number): number {
  if (index <= 0 || index >= text.length) return index;
  const code = text.charCodeAt(index - 1);
  return code >= 0xd800 && code <= 0xdbff ? index - 1 : index;
}

/** Preserve both the cause at the beginning and the final status at the end. */
export function truncateTerminalOutput(text: string, maxChars = 24_000): string {
  if (text.length <= maxChars) return text;
  const headLength = safeIndex(text, Math.floor(maxChars * 0.4));
  const tailStart = safeIndex(text, text.length - (maxChars - headLength));
  const removedTokens = Math.ceil((tailStart - headLength) / 3);
  return `${text.slice(0, headLength)}\n…${removedTokens} tokens truncated…\n${text.slice(tailStart)}`;
}
