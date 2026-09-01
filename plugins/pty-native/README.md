# Native PTY Sessions

This source-owning provider implements `terminal.pty`. It owns native child
processes, the session map, shell integration assets, output filtering, and
terminal-agent signals. Consumers share this pool through the `terminal.pty`
contract from `@termco/terminal-base`; plugin lifecycle types come from
`@termco/kernel`.

Replacing the plugin destroys the listed live terminal sessions after explicit
user confirmation; the old provider is disposed before the replacement starts.
