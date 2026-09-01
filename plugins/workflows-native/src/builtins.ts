/**
 * The seed library of built-in workflows. Authored with a compact shorthand so
 * this file stays readable; `parseSpec` expands each entry into a full
 * {@link Workflow} with a plain `{{name}}` command + typed `parameters`.
 *
 * Shorthand inside `{{ }}`:  `name[=default][|source][|q]`
 *   - `=default`  → the parameter's default value
 *   - `|<source>` → a live-resource / enum source (container, ssh_host, port,
 *                   branch, terminal, file, cwd, …); omitted ⇒ free text
 *   - `|q`        → shell-quote the substituted value
 * e.g. `{{lines=100}}`, `{{container|container}}`, `{{message|q}}`
 */
import type {
  WorkflowDefinition as Workflow,
  WorkflowParameter as WorkflowParam,
  WorkflowParamSource as ParamSource,
  WorkflowTarget,
} from "@termco/workflows-base";

const SOURCES: ReadonlySet<string> = new Set<ParamSource>([
  "text",
  "enum",
  "container",
  "container_image",
  "ssh_host",
  "terminal",
  "port",
  "branch",
  "git_remote",
  "file",
  "cwd",
]);

const SPEC = /\{\{([^}]+)\}\}/g;

type Opts = {
  target?: WorkflowTarget;
  confirm?: boolean;
  icon?: string;
  steps?: string[];
  enums?: Record<string, string[]>;
};

/** Expand one shorthand entry into a full Workflow. */
function w(
  id: string,
  name: string,
  description: string,
  spec: string,
  tags: string[],
  opts: Opts = {},
): Workflow {
  const params = new Map<string, WorkflowParam>();

  const toPlain = (template: string): string =>
    template.replace(SPEC, (_all, body: string) => {
      const parts = body.split("|").map((s) => s.trim());
      const [nameAndDefault, ...flags] = parts;
      const eq = nameAndDefault.indexOf("=");
      const pName = (
        eq === -1 ? nameAndDefault : nameAndDefault.slice(0, eq)
      ).trim();
      const def = eq === -1 ? undefined : nameAndDefault.slice(eq + 1);

      let source: ParamSource = "text";
      let quote = false;
      for (const f of flags) {
        if (f === "q") quote = true;
        else if (SOURCES.has(f)) source = f as ParamSource;
      }

      if (!params.has(pName)) {
        params.set(pName, {
          name: pName,
          source,
          ...(def !== undefined ? { default: def } : {}),
          ...(quote ? { quote: true } : {}),
          ...(source !== "text" && source !== "enum" ? { required: true } : {}),
          ...(opts.enums?.[pName]
            ? { source: "enum", enumValues: opts.enums[pName] }
            : {}),
        });
      }
      return `{{${pName}}}`;
    });

  const command = toPlain(spec);
  const steps = opts.steps?.map(toPlain);

  return {
    id,
    name,
    description,
    command,
    ...(steps ? { steps } : {}),
    parameters: [...params.values()],
    tags,
    target: opts.target ?? { kind: "focused_terminal" },
    source: "builtin",
    ...(opts.confirm ? { confirm: true } : {}),
    ...(opts.icon ? { icon: opts.icon } : {}),
  };
}

const git: Workflow[] = [
  w(
    "git-status",
    "Status (short)",
    "Working tree status, compact",
    "git status -sb",
    ["git"],
  ),
  w(
    "git-log-graph",
    "Log graph",
    "Decorated commit graph",
    "git log --oneline --graph --decorate --all -n {{count=30}}",
    ["git"],
  ),
  w(
    "git-amend",
    "Amend last commit",
    "Amend without editing the message",
    "git commit --amend --no-edit",
    ["git"],
  ),
  w(
    "git-undo-commit",
    "Undo last commit",
    "Keep the changes staged",
    "git reset --soft HEAD~1",
    ["git"],
  ),
  w(
    "git-discard-all",
    "Discard all local changes",
    "Hard reset + clean untracked",
    "git reset --hard HEAD && git clean -fd",
    ["git"],
    { confirm: true },
  ),
  w(
    "git-new-branch",
    "Create & switch branch",
    "New branch from HEAD",
    "git switch -c {{branch}}",
    ["git"],
  ),
  w(
    "git-switch",
    "Switch branch",
    "Check out an existing branch",
    "git switch {{branch|branch}}",
    ["git"],
  ),
  w(
    "git-del-merged",
    "Delete merged branches",
    "Prune locally merged branches",
    "git branch --merged | grep -v '\\*' | xargs -n1 git branch -d",
    ["git"],
    { confirm: true },
  ),
  w(
    "git-rebase-onto",
    "Rebase onto",
    "Rebase current branch onto another",
    "git rebase {{onto=main}}",
    ["git"],
  ),
  w(
    "git-rebase-i",
    "Interactive rebase",
    "Rebase the last N commits",
    "git rebase -i HEAD~{{count=5}}",
    ["git"],
  ),
  w(
    "git-stash",
    "Stash with message",
    "Stash the working tree",
    "git stash push -m {{message|q}}",
    ["git"],
  ),
  w(
    "git-stash-pop",
    "Pop latest stash",
    "Restore the most recent stash",
    "git stash pop",
    ["git"],
  ),
  w(
    "git-push-upstream",
    "Set upstream & push",
    "Push and track the remote branch",
    "git push -u origin {{branch|branch}}",
    ["git"],
  ),
  w(
    "git-force-lease",
    "Force-push (with lease)",
    "Safe force push",
    "git push --force-with-lease",
    ["git"],
    { confirm: true },
  ),
  w(
    "git-fetch-prune",
    "Fetch & prune",
    "Fetch all remotes and prune",
    "git fetch --all --prune",
    ["git"],
  ),
  w(
    "git-cherry-pick",
    "Cherry-pick",
    "Apply a commit onto HEAD",
    "git cherry-pick {{commit}}",
    ["git"],
  ),
  w(
    "git-diff-branch",
    "Diff against branch",
    "Diff HEAD against a base branch",
    "git diff {{base=main}}...HEAD",
    ["git"],
  ),
  w(
    "git-file-history",
    "File history",
    "Follow a file's change history",
    "git log -p --follow -- {{file|file}}",
    ["git"],
  ),
  w(
    "git-blame",
    "Blame",
    "Line-by-line authorship",
    "git blame {{file|file}}",
    ["git"],
  ),
  w(
    "git-tag-release",
    "Tag release",
    "Annotated tag and push it",
    "git tag -a {{tag}} -m {{message|q}} && git push origin {{tag}}",
    ["git"],
  ),
  w(
    "git-reset-file",
    "Reset file to HEAD",
    "Discard changes to one file",
    "git checkout -- {{file|file}}",
    ["git"],
    { confirm: true },
  ),
];

const docker: Workflow[] = [
  w("dk-ps", "List running", "Running containers", "docker ps", ["docker"]),
  w("dk-ps-all", "List all", "All containers", "docker ps -a", ["docker"]),
  w(
    "dk-logs",
    "Tail logs",
    "Follow a container's logs",
    "docker logs -f --tail {{lines=100}} {{container|container}}",
    ["docker", "logs"],
  ),
  w(
    "dk-exec",
    "Exec shell",
    "Open a shell in a container",
    "docker exec -it {{container|container}} {{shell=/bin/sh}}",
    ["docker"],
  ),
  w(
    "dk-inspect",
    "Inspect",
    "Inspect a container",
    "docker inspect {{container|container}}",
    ["docker"],
  ),
  w(
    "dk-stats",
    "Stats (live)",
    "Live resource stats",
    "docker stats {{container|container}}",
    ["docker"],
  ),
  w(
    "dk-stop",
    "Stop",
    "Stop a container",
    "docker stop {{container|container}}",
    ["docker"],
  ),
  w(
    "dk-restart",
    "Restart",
    "Restart a container",
    "docker restart {{container|container}}",
    ["docker"],
  ),
  w(
    "dk-rm",
    "Remove",
    "Force-remove a container",
    "docker rm -f {{container|container}}",
    ["docker"],
    { confirm: true },
  ),
  w(
    "dk-cp",
    "Copy out of container",
    "Copy a path from a container",
    "docker cp {{container|container}}:{{src}} {{dest}}",
    ["docker"],
  ),
  w(
    "dk-port",
    "Port mappings",
    "Show published ports",
    "docker port {{container|container}}",
    ["docker"],
  ),
  w(
    "dk-run",
    "Run image",
    "Run a detached container",
    "docker run -d --name {{name}} -p {{port}}:{{cport}} {{image|container_image}}",
    ["docker"],
  ),
  w(
    "dk-build",
    "Build image",
    "Build from a Dockerfile",
    "docker build -t {{tag}} {{context=.}}",
    ["docker"],
  ),
  w(
    "dk-prune",
    "Prune system",
    "Remove unused data",
    "docker system prune -af",
    ["docker"],
    { confirm: true },
  ),
  w(
    "dk-prune-vol",
    "Prune volumes",
    "Remove unused volumes",
    "docker volume prune -f",
    ["docker"],
    { confirm: true },
  ),
  w("dk-images", "List images", "Local images", "docker images", ["docker"]),
  w(
    "dk-rmi",
    "Remove image",
    "Delete an image",
    "docker rmi {{image|container_image}}",
    ["docker"],
    { confirm: true },
  ),
  w(
    "dk-compose-up",
    "Compose up",
    "Start the stack detached",
    "docker compose up -d",
    ["docker", "compose"],
  ),
  w(
    "dk-compose-down",
    "Compose down",
    "Stop and remove the stack",
    "docker compose down",
    ["docker", "compose"],
  ),
  w(
    "dk-compose-logs",
    "Compose logs",
    "Follow a service's logs",
    "docker compose logs -f {{service}}",
    ["docker", "compose"],
  ),
  w(
    "dk-compose-restart",
    "Compose restart service",
    "Restart one service",
    "docker compose restart {{service}}",
    ["docker", "compose"],
  ),
  w("dk-df", "Disk usage", "Docker disk usage", "docker system df", ["docker"]),
];

const k8s: Workflow[] = [
  w(
    "k-pods",
    "Get pods",
    "Pods in a namespace",
    "kubectl get pods -n {{namespace=default}}",
    ["kubernetes"],
  ),
  w(
    "k-describe",
    "Describe pod",
    "Describe a pod",
    "kubectl describe pod {{pod}} -n {{namespace=default}}",
    ["kubernetes"],
  ),
  w(
    "k-logs",
    "Pod logs",
    "Follow a pod's logs",
    "kubectl logs -f {{pod}} -n {{namespace=default}}",
    ["kubernetes", "logs"],
  ),
  w(
    "k-exec",
    "Exec shell",
    "Shell into a pod",
    "kubectl exec -it {{pod}} -n {{namespace=default}} -- {{shell=/bin/sh}}",
    ["kubernetes"],
  ),
  w(
    "k-forward",
    "Port-forward",
    "Forward a pod port locally",
    "kubectl port-forward {{pod}} {{local}}:{{remote}} -n {{namespace=default}}",
    ["kubernetes"],
  ),
  w(
    "k-apply",
    "Apply manifest",
    "Apply a YAML manifest",
    "kubectl apply -f {{file|file}}",
    ["kubernetes"],
  ),
  w(
    "k-get-all",
    "Get all",
    "All resources in a namespace",
    "kubectl get all -n {{namespace=default}}",
    ["kubernetes"],
  ),
  w(
    "k-ctx",
    "Switch context",
    "Change kube context",
    "kubectl config use-context {{context}}",
    ["kubernetes"],
  ),
  w(
    "k-top",
    "Top pods",
    "Pod resource usage",
    "kubectl top pods -n {{namespace=default}}",
    ["kubernetes"],
  ),
  w(
    "k-rollout",
    "Rollout restart",
    "Restart a deployment",
    "kubectl rollout restart deployment/{{deploy}} -n {{namespace=default}}",
    ["kubernetes"],
  ),
];

const node: Workflow[] = [
  w("n-install", "Install deps", "Install dependencies", "{{pm=npm}} install", [
    "node",
  ]),
  w(
    "n-run",
    "Run script",
    "Run a package script",
    "{{pm=npm}} run {{script}}",
    ["node"],
  ),
  w("n-dev", "Dev server", "Start the dev server", "{{pm=npm}} run dev", [
    "node",
  ]),
  w("n-build", "Build", "Production build", "{{pm=npm}} run build", ["node"]),
  w("n-test", "Test", "Run the test suite", "{{pm=npm}} test", ["node"]),
  w("n-add", "Add dependency", "Add a package", "{{pm=npm}} add {{package}}", [
    "node",
  ]),
  w(
    "n-add-dev",
    "Add dev dependency",
    "Add a dev package",
    "{{pm=pnpm}} add -D {{package}}",
    ["node"],
  ),
  w("n-outdated", "Outdated", "List outdated packages", "{{pm=npm}} outdated", [
    "node",
  ]),
  w("n-update", "Update all", "Update dependencies", "{{pm=npm}} update", [
    "node",
  ]),
  w(
    "n-reinstall",
    "Clean reinstall",
    "Wipe and reinstall modules",
    "rm -rf node_modules && {{pm=npm}} install",
    ["node"],
    { confirm: true },
  ),
  w("n-npx", "npx run", "Run a package binary", "npx {{package}} {{args}}", [
    "node",
  ]),
  w(
    "n-why",
    "Why installed",
    "Explain a dependency",
    "{{pm=pnpm}} why {{package}}",
    ["node"],
  ),
  w(
    "n-ls-global",
    "List global",
    "Global top-level packages",
    "npm ls -g --depth=0",
    ["node"],
  ),
];

const python: Workflow[] = [
  w(
    "py-venv",
    "Venv create",
    "Create a virtualenv",
    "python -m venv {{dir=.venv}}",
    ["python"],
  ),
  w(
    "py-activate",
    "Venv activate",
    "Activate a virtualenv",
    "source {{dir=.venv}}/bin/activate",
    ["python"],
  ),
  w(
    "py-install",
    "Install requirements",
    "Install from a requirements file",
    "pip install -r {{file=requirements.txt}}",
    ["python"],
  ),
  w(
    "py-freeze",
    "Freeze",
    "Write installed packages",
    "pip freeze > requirements.txt",
    ["python"],
  ),
  w("py-run", "Run module", "Run a module", "python -m {{module}}", ["python"]),
  w("py-pytest", "pytest", "Run tests quietly", "pytest {{path=.}} -q", [
    "python",
  ]),
  w("py-fmt", "Format (ruff)", "Format with ruff", "ruff format {{path=.}}", [
    "python",
  ]),
  w(
    "py-lint",
    "Lint (ruff)",
    "Lint and autofix",
    "ruff check {{path=.}} --fix",
    ["python"],
  ),
  w("py-uv-sync", "uv sync", "Sync the environment", "uv sync", ["python"]),
  w("py-uv-run", "uv run", "Run in the uv env", "uv run {{cmd}}", ["python"]),
];

const system: Workflow[] = [
  w(
    "sys-lsof-port",
    "Find process on port",
    "What listens on a port",
    "lsof -i :{{port|port}}",
    ["system"],
  ),
  w(
    "sys-kill-port",
    "Kill process on port",
    "Kill whatever holds a port",
    "lsof -ti :{{port|port}} | xargs kill -9",
    ["system"],
    { confirm: true },
  ),
  w(
    "sys-pkill",
    "Kill by name",
    "Kill processes matching a pattern",
    "pkill -f {{pattern}}",
    ["system"],
    { confirm: true },
  ),
  w(
    "sys-top-cpu",
    "Top CPU",
    "Highest-CPU processes",
    "ps aux | sort -nrk 3 | head -{{n=10}}",
    ["system"],
  ),
  w(
    "sys-top-mem",
    "Top memory",
    "Highest-memory processes",
    "ps aux | sort -nrk 4 | head -{{n=10}}",
    ["system"],
  ),
  w(
    "sys-du",
    "Disk usage here",
    "Largest entries in the cwd",
    "du -sh * | sort -rh | head -{{n=20}}",
    ["system"],
  ),
  w("sys-df", "Free rig", "Filesystem free rig", "df -h", ["system"]),
  w(
    "sys-watch",
    "Watch command",
    "Re-run a command on an interval",
    "watch -n {{secs=2}} {{cmd}}",
    ["system"],
  ),
  w("sys-tail", "Tail log file", "Follow a file", "tail -f {{file|file}}", [
    "system",
  ]),
  w(
    "sys-grep",
    "Grep recursive",
    "Recursive text search",
    "grep -rn {{pattern|q}} {{path=.}}",
    ["system"],
  ),
  w(
    "sys-find",
    "Find files",
    "Find by name glob",
    "find {{path=.}} -name {{glob|q}}",
    ["system"],
  ),
  w(
    "sys-env",
    "Env var",
    "Print an environment variable",
    "printenv {{name}}",
    ["system"],
  ),
  w(
    "sys-chmod-x",
    "Make executable",
    "Add the executable bit",
    "chmod +x {{file|file}}",
    ["system"],
  ),
];

const net: Workflow[] = [
  w(
    "net-curl-json",
    "Curl JSON (pretty)",
    "GET and pretty-print JSON",
    "curl -s {{url}} | jq",
    ["network"],
  ),
  w(
    "net-curl-i",
    "Curl with headers",
    "Show response headers",
    "curl -i {{url}}",
    ["network"],
  ),
  w(
    "net-curl-post",
    "POST JSON",
    "POST a JSON body",
    "curl -s -X POST {{url}} -H 'Content-Type: application/json' -d {{body|q}} | jq",
    ["network"],
  ),
  w("net-ping", "Ping", "Ping a host", "ping -c {{count=5}} {{host}}", [
    "network",
  ]),
  w("net-dig", "DNS lookup", "Resolve a hostname", "dig {{host}} +short", [
    "network",
  ]),
  w("net-ip", "Public IP", "Show the public IP", "curl -s ifconfig.me", [
    "network",
  ]),
  w(
    "net-listen",
    "Listening ports",
    "Local listening sockets",
    "lsof -iTCP -sTCP:LISTEN -n -P",
    ["network"],
  ),
  w(
    "net-nc",
    "Test port open",
    "Check a remote port",
    "nc -zv {{host}} {{port|port}}",
    ["network"],
  ),
  w(
    "net-httpserver",
    "HTTP server here",
    "Serve the cwd over HTTP",
    "python -m http.server {{port=8000}}",
    ["network"],
  ),
];

const ssh: Workflow[] = [
  w("ssh-in", "SSH into host", "Open an SSH session", "ssh {{host|ssh_host}}", [
    "ssh",
  ]),
  w(
    "ssh-scp",
    "Copy file to remote",
    "scp a file to a host",
    "scp {{file|file}} {{host|ssh_host}}:{{dest}}",
    ["ssh"],
  ),
  w(
    "ssh-rsync",
    "Copy dir (rsync)",
    "rsync a directory to a host",
    "rsync -avz {{src}} {{host|ssh_host}}:{{dest}}",
    ["ssh"],
  ),
  w(
    "ssh-cmd",
    "Remote command",
    "Run a command on a host",
    "ssh {{host|ssh_host}} {{cmd|q}}",
    ["ssh"],
  ),
  w(
    "ssh-tunnel",
    "Tunnel port",
    "Forward a remote port locally",
    "ssh -L {{local|port}}:localhost:{{remote}} {{host|ssh_host}}",
    ["ssh"],
  ),
];

const db: Workflow[] = [
  w(
    "db-psql",
    "psql connect",
    "Connect with psql",
    "psql {{conn=postgres://localhost}}",
    ["database"],
  ),
  w(
    "db-pgdump",
    "pg dump",
    "Dump a Postgres database",
    "pg_dump {{db}} > {{out}}.sql",
    ["database"],
  ),
  w(
    "db-mysql",
    "mysql connect",
    "Connect with mysql",
    "mysql -u {{user=root}} -p {{db}}",
    ["database"],
  ),
  w(
    "db-redis",
    "redis-cli",
    "Connect with redis-cli",
    "redis-cli -h {{host=localhost}} -p {{port=6379}}",
    ["database"],
  ),
  w("db-sqlite", "sqlite open", "Open a SQLite file", "sqlite3 {{file|file}}", [
    "database",
  ]),
];

const files: Workflow[] = [
  w(
    "f-tar-c",
    "Tar create",
    "Create a gzip tarball",
    "tar -czf {{name}}.tar.gz {{path=.}}",
    ["files"],
  ),
  w(
    "f-tar-x",
    "Tar extract",
    "Extract a gzip tarball",
    "tar -xzf {{file|file}}",
    ["files"],
  ),
  w("f-zip", "Zip dir", "Zip a directory", "zip -r {{name}}.zip {{path}}", [
    "files",
  ]),
  w(
    "f-rsync-mirror",
    "Rsync mirror",
    "Mirror src into dest (deletes)",
    "rsync -avh --delete {{src}} {{dest}}",
    ["files"],
    { confirm: true },
  ),
  w(
    "f-count-lines",
    "Count lines",
    "Total lines across matching files",
    "find {{path=.}} -name {{glob=*.ts|q}} | xargs wc -l | tail -1",
    ["files"],
  ),
];

/** The full built-in library, builtin ids are stable across releases. */
export const BUILTIN_WORKFLOWS: Workflow[] = [
  ...git,
  ...docker,
  ...k8s,
  ...node,
  ...python,
  ...system,
  ...net,
  ...ssh,
  ...db,
  ...files,
];

/** All distinct tags in the built-in library, in first-seen order. */
export const BUILTIN_TAGS: string[] = [
  ...new Set(BUILTIN_WORKFLOWS.flatMap((wf) => wf.tags)),
];
