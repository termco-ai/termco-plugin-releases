import type {
  ThemeDefinition as Theme,
} from "@termco/ui-theme-base";

export const termcoDefault: Theme = {
  id: "termco-default",
  name: "Termco Default",
  description: "The default Termco look — clean glass over neutral surfaces.",
  editorTheme: { dark: "atomone", light: "atomone" },
  variants: {
    light: {},
    dark: {},
  },
};
