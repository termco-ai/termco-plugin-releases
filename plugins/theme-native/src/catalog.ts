import type { ThemeDefinition } from "@termco/ui-theme-base";
import { caffeine } from "./themes/caffeine";
import { catppuccin } from "./themes/catppuccin";
import { claude } from "./themes/claude";
import { dracula } from "./themes/dracula";
import { everforest } from "./themes/everforest";
import { gruvbox } from "./themes/gruvbox";
import { kanagawaDragon } from "./themes/kanagawa-dragon";
import { kanagawa } from "./themes/kanagawa";
import { nord } from "./themes/nord";
import { rosePine } from "./themes/rose-pine";
import { sage } from "./themes/sage";
import { solarized } from "./themes/solarized";
import { termcoDefault } from "./themes/termco-default";
import { tide } from "./themes/tide";
import { tokyoNight } from "./themes/tokyo-night";

export const DEFAULT_THEME_ID = "termco-default";

/** Exact built-in catalog owned by the default provider. A copied provider can
 * replace, remove, or restyle any entry without changing host source. */
export const BUILTIN_THEMES: ThemeDefinition[] = [
  termcoDefault,
  claude,
  kanagawa,
  kanagawaDragon,
  tokyoNight,
  catppuccin,
  rosePine,
  everforest,
  nord,
  gruvbox,
  dracula,
  solarized,
  tide,
  sage,
  caffeine,
];
