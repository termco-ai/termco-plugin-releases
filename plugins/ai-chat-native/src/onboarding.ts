import {
  domOnboardingTarget,
  type OnboardingContribution,
} from "@termco/onboarding-base";
import { useChatStore } from "./store/store";

const element = (id: string) =>
  document.querySelector<HTMLElement>(`[data-onboarding-target="${id}"]`);

export function createChatOnboardingContribution(): OnboardingContribution {
  const revealChat = () => useChatStore.getState().openPanel();
  return {
    id: "chat-guidance",
    targets: [
      domOnboardingTarget({
        id: "ai-chat.panel",
        label: "AI Chat panel",
        reveal: revealChat,
        element: () => element("ai-chat.panel"),
        unavailableMessage: "Connect an AI model in Settings before starting the Chat journey.",
      }),
      domOnboardingTarget({
        id: "ai-chat.agent",
        label: "Agent selector",
        reveal: revealChat,
        element: () => element("ai-chat.agent"),
      }),
      domOnboardingTarget({
        id: "ai-chat.model",
        label: "Model selector",
        reveal: revealChat,
        element: () => element("ai-chat.model"),
      }),
      domOnboardingTarget({
        id: "ai-chat.composer",
        label: "AI request composer",
        reveal: revealChat,
        element: () => element("ai-chat.composer"),
      }),
      domOnboardingTarget({
        id: "ai-chat.send",
        label: "Send request",
        reveal: revealChat,
        element: () => element("ai-chat.send"),
      }),
    ],
    journeys: [{
      id: "ai-chat-native.first-request",
      title: "Work with AI in Termco",
      description: "Choose an agent and model, provide project context, and understand how tools and approvals appear in a real conversation.",
      order: 20,
      estimatedMinutes: 4,
      presentation: "contextual",
      steps: [
        {
          id: "panel",
          version: 1,
          kind: "tour",
          title: "A conversation beside the work",
          scope: { kind: "user" },
          targetId: "ai-chat.panel",
          placement: "left",
          body: {
            markdown: "Chat stays attached to the active workspace and rig. Responses can open files, diffs, terminals, tables, charts, findings, and approval cards directly in Termco instead of only returning text.",
          },
        },
        {
          id: "agent",
          version: 1,
          kind: "interaction",
          title: "Choose how the AI should work",
          scope: { kind: "user" },
          targetId: "ai-chat.agent",
          expectation: { kind: "click" },
          body: {
            markdown: "Open the agent selector. An agent combines instructions with an allowed tool set; use a built-in role, your own agent, or the Plugin Creator for product extensions.",
          },
        },
        {
          id: "model",
          version: 1,
          kind: "interaction",
          title: "Pick the model for this request",
          scope: { kind: "user" },
          targetId: "ai-chat.model",
          expectation: { kind: "click" },
          body: {
            markdown: "Open the model selector to compare configured providers. The agent determines behavior and tools; the model determines the engine used for the request.",
          },
        },
        {
          id: "compose",
          version: 1,
          kind: "interaction",
          title: "Describe a concrete outcome",
          scope: { kind: "workspace" },
          targetId: "ai-chat.composer",
          expectation: { kind: "input", completion: "non-empty" },
          body: {
            markdown: "Type a real outcome, for example: **Inspect this project and explain how its API starts locally.** Attach images or files, use `@` for workspace files, `#` for reusable snippets, and `/` for commands.",
          },
        },
        {
          id: "send-and-review",
          version: 1,
          kind: "tour",
          title: "Send, then review real tool work",
          scope: { kind: "workspace" },
          targetId: "ai-chat.send",
          placement: "top",
          body: {
            markdown: "Send when ready. Tool calls remain visible in the transcript; consequential changes use plans, diffs, or approval cards so you can inspect what the agent wants to do before it proceeds.",
          },
        },
      ],
    }],
  };
}

export function subscribeToFirstChatUse(suggest: () => void): () => void {
  let eligible = false;
  const check = () => {
    const state = useChatStore.getState();
    const hasModel = [
      ...Object.values(state.apiKeys),
      ...Object.values(state.customEndpointKeys),
    ].some(Boolean);
    const next = state.panelOpen && hasModel;
    if (next && !eligible) suggest();
    eligible = next;
  };
  check();
  return useChatStore.subscribe(check);
}
