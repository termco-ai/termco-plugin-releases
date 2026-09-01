/**
 * Heuristics for hiding sensitive container env values by default. Env often
 * carries API keys, DB passwords, tokens — masked so a screenshot/screenshare
 * of a container's detail tab doesn't leak them (reveal is per-value, opt-in).
 */

const SECRET_KEY_RE =
  /(secret|token|password|passwd|api[_-]?key|access[_-]?key|private[_-]?key|credential|auth|_key$|^key$)/i;

/** Non-secret keys that nonetheless contain "key"/"token"-like words. */
const ALLOW_KEY_RE = /^(pkg_config|.*_public_key)$/i;

/** Shannon entropy per character — high for random tokens, low for prose/paths. */
function entropyPerChar(value: string): number {
  if (value.length === 0) return 0;
  const counts = new Map<string, number>();
  for (const ch of value) counts.set(ch, (counts.get(ch) ?? 0) + 1);
  let bits = 0;
  for (const n of counts.values()) {
    const p = n / value.length;
    bits -= p * Math.log2(p);
  }
  return bits;
}

/**
 * True when an env value should be masked by default — either its KEY looks
 * secret, or the VALUE looks like a high-entropy credential (long, random,
 * no rigs or path separators).
 */
export function isSecretEnv(key: string, value: string): boolean {
  if (ALLOW_KEY_RE.test(key)) return false;
  if (SECRET_KEY_RE.test(key)) return true;
  const v = value.trim();
  if (v.length >= 24 && !/[\s/]/.test(v) && entropyPerChar(v) >= 3.5) {
    return true;
  }
  return false;
}
