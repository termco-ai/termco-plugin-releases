import type { UIMessage } from "ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installToolPresentationFixture } from "../../../../test/toolPresentationFixture";
import {
  answerLabel,
  collectAskUserEntries,
  deriveAskUserSession,
  readAskUserInput,
  readAskUserOutput,
  sessionToMarkdown,
} from "./askUserData";

type Part = Record<string, unknown>;

let disposePresentations: () => void;
beforeAll(() => {
  disposePresentations = installToolPresentationFixture();
});
afterAll(() => disposePresentations());

function ask(
  id: string,
  state: string,
  input: Record<string, unknown>,
  output?: unknown,
): Part {
  return { type: "tool-ask_user", toolCallId: id, state, input, output };
}

function assistant(id: string, ...parts: Part[]): UIMessage {
  return { id, role: "assistant", parts } as unknown as UIMessage;
}

describe("readAskUserInput", () => {
  it("reads the normalized question supplied by the selected tool adapter", () => {
    const normalized = {
      question: "Where?",
      context: "Matters because…",
      options: [
        { label: "A", description: "first", recommended: true },
        { label: "B" },
      ],
      multiSelect: true,
      topic: "The plan",
      estimatedRemaining: 3,
    };
    expect(readAskUserInput("ask_user", normalized)).toStrictEqual(normalized);
  });

  it("renders a safe preparing state when no adapter payload is ready", () => {
    expect(readAskUserInput("ask_user", undefined).question).toBe("");
  });
});

describe("readAskUserOutput", () => {
  it("reads a real answer", () => {
    expect(
      readAskUserOutput("ask_user", {
        state: "output-available",
        output: { answer: "A", selected: ["A"], freeText: false },
      }),
    ).toEqual({
      answer: "A",
      selected: ["A"],
      freeText: false,
    });
  });

  it("returns null for anything that is not an answered call", () => {
    expect(readAskUserOutput("ask_user", { state: "input-available" })).toBeNull();
    expect(
      readAskUserOutput("ask_user", { state: "output-available", output: "nope" }),
    ).toBeNull();
    expect(
      readAskUserOutput("ask_user", { state: "output-available", output: { answer: 7 } }),
    ).toBeNull();
  });
});

describe("answerLabel", () => {
  it("prefers the chosen labels, and names the exits", () => {
    expect(answerLabel({ answer: "long prose", selected: ["A", "B"] })).toBe(
      "A, B",
    );
    expect(answerLabel({ answer: "typed it out" })).toBe("typed it out");
    expect(answerLabel({ answer: "x", skipped: true })).toBe("Skipped");
    expect(answerLabel({ answer: "x", stopped: true })).toBe("Ended");
  });
});

describe("collectAskUserEntries", () => {
  it("collects questions across messages, oldest first", () => {
    const entries = collectAskUserEntries([
      assistant(
        "m1",
        ask(
          "q1",
          "output-available",
          { question: "One?" },
          {
            answer: "yes",
          },
        ),
      ),
      { id: "u1", role: "user", parts: [] } as unknown as UIMessage,
      assistant("m2", ask("q2", "input-available", { question: "Two?" })),
    ]);
    expect(entries.map((e) => e.toolCallId)).toEqual(["q1", "q2"]);
    expect(entries[0]?.output?.answer).toBe("yes");
    expect(entries[1]?.open).toBe(true);
  });

  it("skips questions that are still streaming and other tools", () => {
    const entries = collectAskUserEntries([
      assistant("m1", ask("q1", "input-streaming", {}), {
        type: "tool-read_file",
        toolCallId: "r",
        state: "output-available",
      }),
    ]);
    expect(entries).toHaveLength(0);
  });
});

describe("deriveAskUserSession", () => {
  const messages = [
    assistant(
      "m1",
      ask(
        "q1",
        "output-available",
        { question: "One?", topic: "Plan" },
        {
          answer: "A",
          selected: ["A"],
        },
      ),
    ),
    assistant(
      "m2",
      ask("q2", "input-available", {
        question: "Two?",
        topic: "Plan",
        estimatedRemaining: 2,
      }),
    ),
  ];

  it("counts answers and carries the topic", () => {
    const s = deriveAskUserSession(messages);
    expect(s.answered).toBe(1);
    expect(s.topic).toBe("Plan");
    expect(s.openEntry?.toolCallId).toBe("q2");
  });

  it("counts the model's estimate of what is still to come", () => {
    // 1 answered + 1 open + the 2 the model says are still coming.
    expect(deriveAskUserSession(messages).total).toBe(4);

    const answered = [
      messages[0] as UIMessage,
      assistant(
        "m2",
        ask(
          "q2",
          "output-available",
          { question: "Two?", estimatedRemaining: 2 },
          { answer: "B" },
        ),
      ),
    ];
    expect(deriveAskUserSession(answered).total).toBe(4);
  });

  it("closes the total when the user ended the session", () => {
    const stopped = [
      messages[0] as UIMessage,
      assistant(
        "m2",
        ask(
          "q2",
          "output-available",
          { question: "Two?", estimatedRemaining: 5 },
          { answer: "done", stopped: true },
        ),
      ),
    ];
    expect(deriveAskUserSession(stopped).total).toBe(2);
  });

  it("is empty for a conversation with no questions", () => {
    const s = deriveAskUserSession([
      { id: "u", role: "user", parts: [] } as unknown as UIMessage,
    ]);
    expect(s.entries).toHaveLength(0);
    expect(s.openEntry).toBeNull();
  });
});

describe("sessionToMarkdown", () => {
  it("writes the decisions with the chosen option in bold", () => {
    const md = sessionToMarkdown(
      deriveAskUserSession([
        assistant(
          "m1",
          ask(
            "q1",
            "output-available",
            {
              question: "Where does state live?",
              context: "Everything depends on it.",
              topic: "The plan",
              options: [
                { label: "Store", recommended: true, description: "in memory" },
                { label: "Disk" },
              ],
            },
            { answer: "Store", selected: ["Store"] },
          ),
        ),
      ]),
      { date: "2026-07-25" },
    );
    expect(md).toContain("# Grilling — The plan");
    expect(md).toContain("_2026-07-25_");
    expect(md).toContain("## 1. Where does state live?");
    expect(md).toContain("- **Store** _(recommended)_ — in memory");
    expect(md).toContain("- Disk");
    expect(md).toContain("**Decision:** Store");
  });

  it("marks an unanswered question as open", () => {
    const md = sessionToMarkdown(
      deriveAskUserSession([
        assistant("m1", ask("q1", "input-available", { question: "Open?" })),
      ]),
    );
    expect(md).toContain("**Decision:** _open_");
  });
});
