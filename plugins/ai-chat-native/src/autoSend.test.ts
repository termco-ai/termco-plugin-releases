import type { UIMessage } from "ai";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { installToolPresentationFixture } from "../test/toolPresentationFixture";
import {
  lastAssistantMessageHasAnsweredInteractiveTool,
  shouldResumeOwnedChat,
} from "./autoSend";

type Part = Record<string, unknown>;

let disposePresentations: () => void;
beforeAll(() => {
  disposePresentations = installToolPresentationFixture();
});
afterAll(() => disposePresentations());

function assistant(...parts: Part[]): UIMessage {
  return { id: "m1", role: "assistant", parts } as unknown as UIMessage;
}

const askOpen: Part = {
  type: "tool-ask_user",
  toolCallId: "q1",
  state: "input-available",
  input: { question: "Which one?" },
};
const askAnswered: Part = {
  ...askOpen,
  state: "output-available",
  output: { answer: "The first" },
};
const richUiAnswered: Part = {
  type: "tool-ask_ui",
  toolCallId: "ui1",
  state: "output-available",
  input: { type: "question" },
  output: { answer: "Continue" },
};
const readDone: Part = {
  type: "tool-read_file",
  toolCallId: "r1",
  state: "output-available",
  input: { path: "/a" },
  output: "text",
};

const fire = (...parts: Part[]) =>
  lastAssistantMessageHasAnsweredInteractiveTool({
    messages: [assistant(...parts)],
  });

describe("interactive chat auto-resume", () => {
  it("resumes answered ask_user and rich UI cards", () => {
    expect(fire({ type: "step-start" }, askAnswered)).toBe(true);
    expect(fire({ type: "step-start" }, richUiAnswered)).toBe(true);
  });

  it("waits for every tool in the last step to settle", () => {
    expect(fire({ type: "step-start" }, askOpen)).toBe(false);
    expect(
      fire({ type: "step-start" }, askAnswered, {
        ...readDone,
        state: "input-available",
        output: undefined,
      }),
    ).toBe(false);
  });

  it("does not bypass the step cap for ordinary completed tools", () => {
    expect(fire({ type: "step-start" }, readDone)).toBe(false);
  });

  it("only considers the final step", () => {
    expect(
      fire(
        { type: "step-start" },
        askAnswered,
        { type: "step-start" },
        readDone,
      ),
    ).toBe(false);
  });

  it("also resumes completed approval responses", () => {
    expect(
      shouldResumeOwnedChat({
        messages: [
          assistant({
            type: "tool-write_file",
            toolCallId: "w1",
            state: "approval-responded",
            input: {},
            approval: { id: "a1", approved: true },
          }),
        ],
      }),
    ).toBe(true);
  });
});
