# SSH Port Forwarding

This plugin owns the complete Ports sidebar feature: its rail icon and badge,
forward list, start/stop/remove actions, add form, remote listener discovery,
browser launch, clipboard action, loading states, and errors.

It consumes the application-wide `ssh.client` provider. Copying this plugin
does not create another SSH connection pool; every fork uses the one provider
selected by the active profile.

Copy this directory, change its id, declare `replaces: "ports-sidebar"`, and
edit `src/` to replace the running feature without changing the application.
