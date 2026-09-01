import type { AiInferenceCapability } from "@termco/ai-inference-base";
import type { AiModelProviderCapability } from "@termco/ai-models-base";
import type { AiToolEntry } from "@termco/ai-tools-base";
import type { HttpCapability } from "@termco/http-base";
import type {
  PreferencesCapability,
  SecretsCapability,
} from "@termco/storage-base";
import { generateText, isStepCount, jsonSchema, streamText, tool } from "ai";
import {
  buildLanguageModel,
  resolveInferenceConfiguration,
  resolveModelConfiguration,
} from "./model";
import {
  mergeProviderOptions,
  reasoningLevel,
  reasoningProviderOptions,
} from "./reasoning";

export function adaptInferenceTools(definitions: Record<string, AiToolEntry>) {
  return Object.fromEntries(Object.entries(definitions).map(([name, definition]) => {
    if (typeof definition.execute !== "function") {
      throw new Error(`Inference tool "${name}" is interactive and cannot run without a session UI`);
    }
    if (definition.needsApproval === true || typeof definition.needsApproval === "function") {
      throw new Error(`Inference tool "${name}" requires approval and cannot run in an isolated request`);
    }
    return [name, tool({
      description: definition.description,
      inputSchema: jsonSchema(definition.inputSchema),
      execute: definition.execute,
      ...(definition.toModelOutput ? { toModelOutput: definition.toModelOutput } : {}),
    } as never)];
  }));
}

export function createInferenceCapability(dependencies: {
  providers: readonly AiModelProviderCapability[];
  preferences: PreferencesCapability;
  secrets: SecretsCapability;
  http: HttpCapability;
}): AiInferenceCapability {
  const resolveLanguageModel = async (modelId: string) => {
    if (!modelId.trim()) throw new Error("Inference model id is required");
    const config = await resolveModelConfiguration({
      modelId,
      providers: dependencies.providers,
      preferences: dependencies.preferences,
      secrets: dependencies.secrets,
    });
    return {
      config,
      model: await buildLanguageModel(config, dependencies.http),
    };
  };
  return {
    configuration: () => resolveInferenceConfiguration(dependencies),
    async generate(request) {
      if (!Number.isInteger(request.maxSteps) || request.maxSteps < 1) {
        throw new Error("Inference maxSteps must be a positive integer");
      }
      const { model } = await resolveLanguageModel(request.modelId);
      const start = Date.now();
      const result = await generateText({
        model,
        instructions: request.instructions as never,
        prompt: request.prompt,
        tools: adaptInferenceTools(request.tools ?? {}),
        stopWhen: isStepCount(request.maxSteps),
        maxOutputTokens: request.maxOutputTokens,
        temperature: request.temperature,
        providerOptions: request.providerOptions as never,
        timeout: {
          chunkMs: request.chunkTimeoutMs ?? 90_000,
          ...(request.totalTimeoutMs === undefined
            ? {}
            : { totalMs: request.totalTimeoutMs }),
        },
        abortSignal: request.abortSignal,
        onStepEnd: (step) => request.onStep?.({
          toolName: step.toolCalls?.at(-1)?.toolName,
        }),
      });
      return {
        text: result.text,
        stepCount: result.steps?.length ?? 0,
        durationMs: Date.now() - start,
      };
    },
    async stream(request) {
      if (!Number.isInteger(request.maxSteps) || request.maxSteps < 1) {
        throw new Error("Inference maxSteps must be a positive integer");
      }
      const { config, model } = await resolveLanguageModel(request.modelId);
      const reasoning = request.reasoningEffort
        ? reasoningLevel(config.provider.id, request.reasoningEffort)
        : undefined;
      const residualOptions = request.reasoningEffort && request.reasoningEffort !== "off"
        ? reasoningProviderOptions(config.provider.id)
        : {};
      const providerOptions = mergeProviderOptions(
        request.providerOptions,
        residualOptions,
      );
      const result = streamText({
        model,
        instructions: request.instructions as never,
        messages: request.messages as never,
        tools: request.tools as never,
        activeTools: request.activeTools as never,
        reasoning,
        providerOptions: providerOptions as never,
        toolApproval: request.toolApproval as never,
        experimental_toolApprovalSecret: request.toolApprovalSecret,
        stopWhen: isStepCount(request.maxSteps),
        abortSignal: request.abortSignal,
        timeout: { chunkMs: request.chunkTimeoutMs ?? 90_000 },
        prepareStep: request.prepareStep as never,
        onStepEnd: request.onStepEnd as never,
        onAbort: request.onAbort,
        onEnd: request.onEnd as never,
      } as never);
      return { stream: result.stream };
    },
  };
}
