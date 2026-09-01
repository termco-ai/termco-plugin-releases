import { createReadStream } from "node:fs";

export async function readLineRange(
  path: string,
  start = 0,
): Promise<{ lines: string[]; parsedBytes: number }> {
  const lines: string[] = [];
  const stream = createReadStream(path, { start, highWaterMark: 1 << 20 });
  let rest: Buffer | null = null;
  let consumed = start;
  for await (const chunk of stream as AsyncIterable<Buffer>) {
    const buffer: Buffer = rest ? Buffer.concat([rest, chunk]) : chunk;
    let lineStart = 0;
    let index = buffer.indexOf(0x0a, lineStart);
    while (index !== -1) {
      lines.push(buffer.subarray(lineStart, index).toString("utf8"));
      lineStart = index + 1;
      index = buffer.indexOf(0x0a, lineStart);
    }
    rest = lineStart < buffer.length ? buffer.subarray(lineStart) : null;
    consumed += lineStart;
  }
  return { lines, parsedBytes: consumed };
}
