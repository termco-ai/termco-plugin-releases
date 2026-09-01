import type { UIMessage } from "@ai-sdk/react";
import { describe, expect, it } from "vitest";
import {
  flattenGroups,
  groupMessages,
  preserveCount,
  sanitizeTail,
  splitAtGroup,
} from "./groups";

function conversation(groups: number): UIMessage[] {
  return Array.from({ length: groups }, (_, index) => [
    {
      id: `u${index}`,
      role: "user" as const,
      parts: [{ type: "text" as const, text: `q${index}` }],
    },
    {
      id: `a${index}`,
      role: "assistant" as const,
      parts: [{ type: "text" as const, text: `a${index}` }],
    },
  ]).flat();
}

describe("compaction turn groups", () => {
  it("covers the source once and keeps assistant work with its user turn", () => {
    const messages = conversation(4);
    const groups = groupMessages(messages);
    expect(groups).toHaveLength(4);
    expect(flattenGroups(groups)).toEqual(messages);
    expect(groups.every((group) => group.messages[0].role === "user")).toBe(
      true,
    );
  });

  it("never preserves more than half the conversation", () => {
    for (let count = 2; count <= 20; count += 1) {
      const groups = groupMessages(conversation(count), () => 100);
      expect(
        preserveCount(groups, { tokenGap: 10_000_000, min: count * 5 }),
      ).toBeLessThanOrEqual(Math.floor(count / 2));
    }
  });

  it("splits only at a user-turn boundary", () => {
    const split = splitAtGroup(groupMessages(conversation(6)), 2);
    expect(split.headGroups).toBe(4);
    expect(split.tailGroups).toBe(2);
    expect(split.tail[0].role).toBe("user");
  });

  it("removes unresolved tool calls from a durable tail", () => {
    const tail = [
      ...conversation(1).slice(0, 1),
      {
        id: "tool",
        role: "assistant" as const,
        parts: [
          {
            type: "tool-read_file",
            toolCallId: "call",
            state: "approval-requested",
          },
        ],
      } as unknown as UIMessage,
    ];
    expect(sanitizeTail(tail)).toHaveLength(1);
  });
});
