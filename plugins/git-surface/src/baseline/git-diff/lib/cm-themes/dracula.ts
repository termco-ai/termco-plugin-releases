/** The Dracula dark editor theme. */
import { build } from "./build";

export const dracula = build({
  mode: "dark",
  bg: "#282a36",
  fg: "#f8f8f2",
  caret: "#f8f8f0",
  selection: "#44475a",
  lineHighlight: "#343746",
  gutterFg: "#6272a4",
  comment: "#6272a4",
  keyword: "#ff79c6",
  string: "#f1fa8c",
  number: "#bd93f9",
  func: "#50fa7b",
  variable: "#f8f8f2",
  property: "#8be9fd",
  type: "#8be9fd",
  operator: "#ff79c6",
  tag: "#ff79c6",
  attr: "#50fa7b",
  heading: "#bd93f9",
  link: "#8be9fd",
  invalid: "#ff5555",
});
