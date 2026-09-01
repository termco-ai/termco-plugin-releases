import wtermCss from "./terminal/wterm.css";
import blockCss from "./terminal/block/block.css";
import blockCardsCss from "./terminal/block/blockCards.css";
import searchCss from "./terminal/lib/terminalSearch/search.css";

export function installTerminalStyles(): () => void {
  const style = document.createElement("style");
  style.dataset.termcoPlugin = "terminal-surface-native";
  style.textContent = [wtermCss, blockCss, blockCardsCss, searchCss].join("\n");
  document.head.appendChild(style);
  return () => style.remove();
}
