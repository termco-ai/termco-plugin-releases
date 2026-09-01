/** Per-provider glyphs used across the model picker UI. */

import {
  AppleIcon,
  ChatGptIcon,
  ClaudeIcon,
  ComputerIcon,
  CpuIcon,
  DeepseekIcon,
  FlashIcon,
  GlobeIcon,
  GoogleGeminiIcon,
  Grok02Icon,
  MistralIcon,
  PlugIcon,
  ServerStack01Icon,
} from "@hugeicons/core-free-icons";
import type { AiProviderId as ProviderId } from "@termco/ai-models-base";

export const PROVIDER_ICON = {
  openai: ChatGptIcon,
  anthropic: ClaudeIcon,
  google: GoogleGeminiIcon,
  xai: Grok02Icon,
  cerebras: CpuIcon,
  groq: FlashIcon,
  deepseek: DeepseekIcon,
  mistral: MistralIcon,
  openrouter: GlobeIcon,
  "openai-compatible": PlugIcon,
  lmstudio: ComputerIcon,
  mlx: AppleIcon,
  ollama: ServerStack01Icon,
} as const satisfies Record<ProviderId, typeof ChatGptIcon>;
