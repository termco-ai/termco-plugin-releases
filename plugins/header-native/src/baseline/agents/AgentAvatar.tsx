import {
  ChatGptIcon,
  ClaudeIcon,
  GoogleGeminiIcon,
  RoboticIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import ui from "@termco/ui";
import { headerDependencies } from "../runtime";

function tint(agent: string): string {
  const name = agent.toLowerCase();
  if (name.includes("claude")) return "#c1623f";
  if (name.includes("gemini")) return "#3b7ff0";
  if (name.includes("codex") || name.includes("gpt") || name.includes("openai")) return "#0f9d76";
  if (name.includes("termco")) return "var(--primary)";
  return "#64748b";
}

function icon(agent: string) {
  const name = agent.toLowerCase();
  if (name.includes("claude")) return ClaudeIcon;
  if (name.includes("gemini")) return GoogleGeminiIcon;
  if (name.includes("codex") || name.includes("gpt") || name.includes("openai")) return ChatGptIcon;
  return RoboticIcon;
}

export function AgentAvatar({ agent, size = 28 }: { agent: string; size?: number }) {
  const termco = agent.toLowerCase().includes("termco");
  const logoUrl = termco ? headerDependencies().branding?.logoUrl : undefined;
  const [failedLogo, setFailedLogo] = ui.React.useState<string>();
  return (
    <span className="flex shrink-0 items-center justify-center rounded-[8px] text-white" style={{ width: size, height: size, background: tint(agent) }}>
      {logoUrl && logoUrl !== failedLogo ? (
        <img src={logoUrl} alt="" width={Math.round(size * 0.55)} height={Math.round(size * 0.55)} onError={() => setFailedLogo(logoUrl)} />
      ) : (
        <HugeiconsIcon icon={icon(agent)} size={Math.round(size * 0.55)} strokeWidth={1.75} className="text-white" />
      )}
    </span>
  );
}
