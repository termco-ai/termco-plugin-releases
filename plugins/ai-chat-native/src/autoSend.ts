import {
  getToolName,
  isToolUIPart,
  lastAssistantMessageIsCompleteWithApprovalResponses,
  type UIMessage,
} from "ai";
import { toolsService } from "./baseline/runtime/toolContributions";

/** Resume only after the UI has settled an interactive tool in the last step.
 * Using the SDK's generic completed-tool predicate here would also resume an
 * ordinary tool call stopped by the step cap and could create an endless loop. */
export function lastAssistantMessageHasAnsweredInteractiveTool({
  messages,
}: {
  messages: UIMessage[];
}): boolean {
  const message = messages.at(-1);
  if (message?.role !== "assistant") return false;

  const lastStepStart = message.parts.reduce(
    (last, part, index) => (part.type === "step-start" ? index : last),
    -1,
  );
  const toolParts = message.parts
    .slice(lastStepStart + 1)
    .filter(isToolUIPart)
    .filter((part) => !part.providerExecuted);

  if (
    !toolParts.some(
      (part) => toolsService.presentation(getToolName(part))?.interactive,
    )
  ) {
    return false;
  }
  return toolParts.every(
    (part) =>
      part.state === "output-available" || part.state === "output-error",
  );
}

export function shouldResumeOwnedChat(options: {
  messages: UIMessage[];
}): boolean {
  return (
    lastAssistantMessageIsCompleteWithApprovalResponses(options) ||
    lastAssistantMessageHasAnsweredInteractiveTool(options)
  );
}
