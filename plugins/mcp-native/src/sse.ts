/**
 * Incremental Server-Sent Events parser (the framing both HTTP MCP transports
 * ride on). Feed it decoded text chunks; it emits one frame per event block
 * (blank-line terminated). Handles multi-line `data:`, `event:`, comments, and
 * chunk boundaries that split a line. Pure + synchronous, so it unit-tests
 * without a network.
 */

export type SseFrame = { event: string; data: string; id?: string };

export class SseParser {
  private buf = "";
  private event = "";
  private data: string[] = [];
  private id: string | undefined;

  /** Push a text chunk; returns any frames that completed within it. */
  push(chunk: string): SseFrame[] {
    this.buf += chunk;
    const out: SseFrame[] = [];
    let nl = this.buf.indexOf("\n");
    while (nl !== -1) {
      let line = this.buf.slice(0, nl);
      this.buf = this.buf.slice(nl + 1);
      if (line.endsWith("\r")) line = line.slice(0, -1);

      if (line === "") {
        // Blank line dispatches the accumulated event.
        if (this.data.length > 0 || this.event) {
          out.push({
            event: this.event || "message",
            data: this.data.join("\n"),
            id: this.id,
          });
        }
        this.event = "";
        this.data = [];
        this.id = undefined;
      } else if (!line.startsWith(":")) {
        const colon = line.indexOf(":");
        const field = colon === -1 ? line : line.slice(0, colon);
        let value = colon === -1 ? "" : line.slice(colon + 1);
        if (value.startsWith(" ")) value = value.slice(1);
        if (field === "event") this.event = value;
        else if (field === "data") this.data.push(value);
        else if (field === "id") this.id = value;
      }
      nl = this.buf.indexOf("\n");
    }
    return out;
  }
}
