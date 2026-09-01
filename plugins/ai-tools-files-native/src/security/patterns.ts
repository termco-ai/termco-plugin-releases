export const SECRET_BASENAME_PATTERNS: RegExp[] = [
  /^\.env(\..+)?(?:[.\s:]|$)/i,
  /^.*\.pem(?:[.\s:]|$)/i,
  /^.*\.key(?:[.\s:]|$)/i,
  /^.*\.p12(?:[.\s:]|$)/i,
  /^.*\.pfx(?:[.\s:]|$)/i,
  /^.*\.asc(?:[.\s:]|$)/i,
  /^.*\.gpg(?:[.\s:]|$)/i,
  /^.*\.keystore(?:[.\s:]|$)/i,
  /^.*\.jks(?:[.\s:]|$)/i,
  /^id_(rsa|dsa|ecdsa|ed25519)([._-].*)?(?:[.\s:]|$)/i,
  /^known_hosts(?:[.\s:]|$)/i,
  /^authorized_keys(?:[.\s:]|$)/i,
  /^htpasswd(?:[.\s:]|$)/i,
  /^\.netrc(?:[.\s:]|$)/i,
  /^_netrc(?:[.\s:]|$)/i,
  /^credentials(?:[.\s:]|$)/i,
  /^\.pgpass(?:[.\s:]|$)/i,
  /^\.npmrc(?:[.\s:]|$)/i,
  /^\.pypirc(?:[.\s:]|$)/i,
  /^secrets?\.(json|ya?ml|toml|env)(?:[.\s:]|$)/i,
  /^service[-_]?account.*\.json(?:[.\s:]|$)/i,
];

export const PROTECTED_DIRS = [
  "/.ssh", "/.gnupg", "/.aws", "/.azure", "/.kube", "/.docker",
  "/.config/gh", "/.config/git", "/.config/gcloud", "/.config/op",
  "/.git", "/.terraform.d", "/library/keychains", "/library/cookies",
  "/etc", "/private/etc", "/proc", "/sys", "/var/db", "/var/root",
  "/private/var/db", "/private/var/root",
  "/appdata/roaming/microsoft/credentials",
  "/appdata/local/microsoft/credentials", "/appdata/roaming/gcloud",
];

export const WRITE_DENY_PREFIXES = [
  "/etc/", "/var/db/", "/var/root/", "/system/", "/library/keychains/",
  "/library/launchagents/", "/library/launchdaemons/", "/private/etc/",
  "/private/var/db/", "/usr/bin/", "/usr/sbin/", "/usr/local/bin/",
  "/bin/", "/sbin/", "/boot/", "/windows/", "/program files/",
  "/program files (x86)/", "/programdata/",
];
