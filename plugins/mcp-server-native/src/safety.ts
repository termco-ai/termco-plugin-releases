/** Provider-owned last-line denylist for MCP shell tools. */
const CATASTROPHIC: RegExp[] = [
  /\brm\s+(?:-\S*\s+)*-\S*r\S*f|\brm\s+(?:-\S*\s+)*-\S*f\S*r/i,
  /\brm\s+-\S*r\S*\s+\/(?:\s|$)/i,
  /\bmkfs(\.\w+)?\b/i,
  /\bdd\b[^|&;]*\bof=\/dev\//i,
  /[:\w]+\s*\(\)\s*\{\s*[:\w]+\s*[|:]/,
  /\b(shutdown|reboot|halt|poweroff|init\s+0|init\s+6)\b/i,
  /\b(chmod|chown)\s+-\S*r\S*\s+\S*\s*\/(?:\s|$)/i,
  /\bgit\s+push\b[^\n]*(--force\b|--force-with-lease\b|\s-f\b)/i,
  /\bgit\s+reset\s+--hard\b/i,
  /\bgit\s+clean\s+-\S*f/i,
  /\bsudo\b/i,
  /\b(curl|wget)\b[^|]*\|\s*(sudo\s+)?\w*sh\b/i,
  />\s*\/dev\/(sd|nvme|disk|hd|mapper)/i,
  /\bkillall\b|\bkill\s+-9?\s+-1\b/i,
  /\b(npm|yarn|pnpm)\s+publish\b/i,
  /\bdocker\s+system\s+prune\b/i,
];

export function isCatastrophic(command: string): boolean {
  return CATASTROPHIC.some((pattern) => pattern.test(command.trim()));
}
