# Native Git Repository

The complete default implementation of `git.repository`. Copy this folder to fork or replace Git behavior without editing the platform or another plugin.

Local commands use the system Git executable. Remote commands reuse the application-wide `ssh.client` connection, and working-tree reads use `workspace.files`.
