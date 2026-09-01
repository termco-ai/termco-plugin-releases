/**
 * Incremental newline splitter for a child process's stdout, which arrives in
 * arbitrary chunks that may split a JSON line mid-way. `push` returns only the
 * complete lines seen so far and retains any trailing partial line until the
 * next chunk completes it; `flush` returns whatever remains at EOF.
 *
 * Pure and synchronous so the driver's parse pipeline stays unit-testable.
 */
export function createLineSplitter() {
  let buffer = "";
  return {
    push(chunk: string): string[] {
      buffer += chunk;
      const lines = buffer.split("\n");
      // The last element is an incomplete line (or "" if the chunk ended on \n).
      buffer = lines.pop() ?? "";
      return lines;
    },
    flush(): string[] {
      if (buffer.length === 0) return [];
      const rest = buffer;
      buffer = "";
      return [rest];
    },
  };
}
// Owned by the coding-agent-native provider plugin.
