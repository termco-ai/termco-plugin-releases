import {
  AbsoluteIcon,
  Bug01Icon,
  CloudServerIcon,
  CodeIcon,
  HelpCircleIcon,
  Mortarboard01Icon,
  PaintBrush04Icon,
  PencilEdit02Icon,
  Recycle01Icon,
  ShieldUserIcon,
  SparklesIcon,
  TestTube01Icon,
} from "@hugeicons/core-free-icons";
import type { AiAgentIconId } from "@termco/ai-library-base";

export const ICONS: Record<AiAgentIconId, typeof CodeIcon> = {
  coder: CodeIcon,
  architect: AbsoluteIcon,
  reviewer: PencilEdit02Icon,
  security: ShieldUserIcon,
  designer: PaintBrush04Icon,
  debugger: Bug01Icon,
  tester: TestTube01Icon,
  refactor: Recycle01Icon,
  devops: CloudServerIcon,
  explainer: Mortarboard01Icon,
  interviewer: HelpCircleIcon,
  spark: SparklesIcon,
};
