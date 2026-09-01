/**
 * The frozen deny-list surface for path safety.
 *
 * Every literal in this file is a **security contract**: the basename regexes,
 * the protected-directory prefixes, and the write-only deny prefixes are what
 * keep AI tool calls from reading obvious secrets or mutating system locations.
 * Do not weaken or reword these patterns without a security review.
 *
 * Goals:
 *  - Block reads of files that almost always contain secrets (.env*, *.pem,
 *    id_rsa*, .aws/credentials, .ssh/, .git/, kube/azure config, etc.).
 *  - Block writes/exec into the same set, plus directories where automated
 *    mutation is dangerous (system dirs, Windows system dirs).
 *
 * This is a *defense layer*, not a sandbox. The model may still be coaxed
 * into doing something silly within allowed paths — the user-confirmation
 * UI for write/exec is the real safety net. These checks ensure that
 * read tools (which auto-approve) can never silently exfiltrate obvious
 * secrets, and that a single bad approval can't blow up the system.
 */

export const SECRET_BASENAME_PATTERNS: RegExp[] = [
  // Match `.env` and `.env.<suffix>` with no required tail anchor — Windows
  // strips trailing dots/spaces at open time and NTFS exposes alternate data
  // streams via `name:stream`, both of which would otherwise slip past a `$`
  // anchored pattern (`.env.`, `.env::$DATA`).
  /^\.env(\..+)?(?:[.\s:]|$)/i,
  /^.*\.pem(?:[.\s:]|$)/i,
  /^.*\.key(?:[.\s:]|$)/i, // private keys
  /^.*\.p12(?:[.\s:]|$)/i,
  /^.*\.pfx(?:[.\s:]|$)/i,
  /^.*\.asc(?:[.\s:]|$)/i, // PGP armored keys
  /^.*\.gpg(?:[.\s:]|$)/i,
  /^.*\.keystore(?:[.\s:]|$)/i,
  /^.*\.jks(?:[.\s:]|$)/i,
  // Match `id_rsa`, `id_rsa.pub`, and common backup/copy patterns like
  // `id_rsa.bak`, `id_rsa_old`, `id_rsa-backup`.
  /^id_(rsa|dsa|ecdsa|ed25519)([._-].*)?(?:[.\s:]|$)/i,
  /^known_hosts(?:[.\s:]|$)/i,
  /^authorized_keys(?:[.\s:]|$)/i,
  /^htpasswd(?:[.\s:]|$)/i,
  /^\.netrc(?:[.\s:]|$)/i,
  /^_netrc(?:[.\s:]|$)/i, // Windows variant
  /^credentials(?:[.\s:]|$)/i, // .aws/credentials, gcloud, etc.
  /^\.pgpass(?:[.\s:]|$)/i,
  /^\.npmrc(?:[.\s:]|$)/i,
  /^\.pypirc(?:[.\s:]|$)/i,
  /^secrets?\.(json|ya?ml|toml|env)(?:[.\s:]|$)/i,
  /^service[-_]?account.*\.json(?:[.\s:]|$)/i, // GCP service account keys
];

/**
 * Protected directories. Matched as **exact path** OR **prefix where the next
 * char is a separator** — never raw substring. Listed without trailing slash;
 * the comparator handles separators.
 */
export const PROTECTED_DIRS = [
  "/.ssh",
  "/.gnupg",
  "/.aws",
  "/.azure",
  "/.kube",
  "/.docker",
  "/.config/gh",
  "/.config/git",
  "/.config/gcloud",
  "/.config/op", // 1Password CLI
  "/.git", // git internals — refusing avoids tools mutating refs/objects
  "/.terraform.d",
  "/library/keychains",
  "/library/cookies",
  // System dirs holding host secrets/PII/process state. Per-PID files under
  // /proc leak env vars and command lines from other processes; /sys exposes
  // kernel state and hardware identifiers. /etc and /private/etc hold global
  // config that frequently contains credentials in basenames the regex won't
  // match (passwd, shadow, master.passwd, *.cnf, *.conf with creds).
  "/etc",
  "/private/etc",
  "/proc",
  "/sys",
  "/var/db",
  "/var/root",
  "/private/var/db",
  "/private/var/root",
  // Windows user profile equivalents (post drive-strip + lowercase).
  "/appdata/roaming/microsoft/credentials",
  "/appdata/local/microsoft/credentials",
  "/appdata/roaming/gcloud",
];

/**
 * Write-only deny prefixes (system locations). Read access is *not* universally
 * blocked — reading `/etc/hosts` is fine; writing to it isn't.
 */
export const WRITE_DENY_PREFIXES = [
  "/etc/",
  "/var/db/",
  "/var/root/",
  "/system/", // case-folded from /System/
  "/library/keychains/",
  "/library/launchagents/",
  "/library/launchdaemons/",
  "/private/etc/",
  "/private/var/db/",
  "/usr/bin/",
  "/usr/sbin/",
  "/usr/local/bin/",
  "/bin/",
  "/sbin/",
  "/boot/",
  // Windows (post drive-strip + lowercase). Note: these block writes to the
  // system drive's Windows / Program Files. Drives are stripped, so any
  // /windows/... etc. matches regardless of drive letter.
  "/windows/",
  "/program files/",
  "/program files (x86)/",
  "/programdata/",
];
