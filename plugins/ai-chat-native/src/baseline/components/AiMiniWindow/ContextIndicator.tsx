/**
 * Context-window meter for the mini-window header: shows the current request /
 * estimated context size, cache-hit rate, cumulative session tokens, and cost.
 */

import {
  Context,
  ContextContent,
  ContextContentBody,
  ContextContentFooter,
  ContextContentHeader,
  ContextTrigger,
} from "../../ai-elements/context";
import { usePreferencesStore } from "../../runtime/preferences";
import type { UIMessage } from "@ai-sdk/react";
import { useMemo } from "react";
import {
  estimateModelCost,
  modelContextLimit,
  resolveAvailableModel,
} from "../../../runtime";
import { useChatStore } from "../../store/chatStore";
import { estimateTokens, formatTokens } from "./tokenFormat";

export function ContextIndicator({ messages }: { messages: UIMessage[] }) {
  const modelId = useChatStore((s) => s.selectedModelId);
  const tokens = useChatStore((s) => s.agentMeta.tokens);
  const lastInput = useChatStore((s) => s.agentMeta.lastInputTokens);
  const lastCached = useChatStore((s) => s.agentMeta.lastCachedTokens);
  const tokensPerSecond = useChatStore((s) => s.agentMeta.lastTokensPerSecond);
  const firstOutputMs = useChatStore((s) => s.agentMeta.timeToFirstOutputMs);
  // A compacted session carries its summary into every request, so its context
  // is never really at zero — reporting it as such makes a freshly forked chat
  // look empty right up until it overflows again.
  const carriedSummary = useChatStore((s) => {
    const c = s.sessions.find((x) => x.id === s.activeSessionId)?.compaction;
    if (!c?.blocks.length) return 0;
    return Math.ceil(c.blocks.reduce((n, b) => n + b.length, 0) / 4);
  });
  const estimated = useMemo(
    () => estimateTokens(messages) + carriedSummary,
    [messages, carriedSummary],
  );
  const used = lastInput > 0 ? lastInput : estimated;
  const reported = tokens.inputTokens + tokens.outputTokens;
  const customEndpoints = usePreferencesStore((s) => s.customEndpoints);
  const max = modelContextLimit(modelId, customEndpoints);
  const modelLabel = useMemo(() => {
    return resolveAvailableModel(modelId, customEndpoints)?.label ?? modelId;
  }, [customEndpoints, modelId]);
  const cost = estimateModelCost(modelId, tokens);
  const cacheRate =
    tokens.inputTokens > 0
      ? Math.round((tokens.cachedInputTokens / tokens.inputTokens) * 100)
      : 0;

  return (
    <Context usedTokens={used} maxTokens={max}>
      <ContextTrigger className="h-6 gap-1 px-0 text-xs" />
      <ContextContent className="w-64 text-xs">
        <ContextContentHeader />
        <ContextContentBody>
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Model</span>
            <span className="font-mono text-foreground">{modelLabel}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-muted-foreground">
            <span>{lastInput > 0 ? "Last request" : "Estimated context"}</span>
            <span className="font-mono text-foreground">
              {formatTokens(used)}
            </span>
          </div>
          {lastCached > 0 && (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Of which cached</span>
              <span className="font-mono text-foreground">
                {formatTokens(lastCached)}
              </span>
            </div>
          )}
          {tokensPerSecond > 0 && (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>Speed</span>
              <span className="font-mono text-foreground">
                {Math.round(tokensPerSecond)} tok/s
              </span>
            </div>
          )}
          {firstOutputMs > 0 && (
            <div className="flex items-center justify-between text-muted-foreground">
              <span>First output</span>
              <span className="font-mono text-foreground">
                {firstOutputMs < 1000
                  ? `${Math.round(firstOutputMs)} ms`
                  : `${(firstOutputMs / 1000).toFixed(1)} s`}
              </span>
            </div>
          )}
          {reported > 0 && (
            <>
              <div className="mt-1.5 flex items-center justify-between text-muted-foreground">
                <span>Session input</span>
                <span className="font-mono text-foreground">
                  {formatTokens(tokens.inputTokens)}
                </span>
              </div>
              <div className="flex items-center justify-between text-muted-foreground">
                <span>Session output</span>
                <span className="font-mono text-foreground">
                  {formatTokens(tokens.outputTokens)}
                </span>
              </div>
              {tokens.cachedInputTokens > 0 && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Cache hit</span>
                  <span className="font-mono text-foreground">
                    {cacheRate}%
                  </span>
                </div>
              )}
              {cost != null && (
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Session cost</span>
                  <span className="font-mono text-foreground">
                    ${cost.toFixed(cost < 0.01 ? 4 : cost < 1 ? 3 : 2)}
                  </span>
                </div>
              )}
            </>
          )}
          <div className="flex items-center justify-between text-muted-foreground">
            <span>Window</span>
            <span className="font-mono text-foreground">
              {formatTokens(max)}
            </span>
          </div>
        </ContextContentBody>
        <ContextContentFooter>
          <span className="text-xs italic text-muted-foreground">
            {lastInput > 0
              ? "Last request reflects current context size; session totals are cumulative."
              : "Token count is approximate (chars / 4)."}
          </span>
        </ContextContentFooter>
      </ContextContent>
    </Context>
  );
}
