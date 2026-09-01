# AI Tools: Managed Coding Agents

This plugin owns the three AI tools for the coding agent attached to a chat:
spawn it, send a safe follow-up, and inspect its status/output. It uses the
session-scoped public runtime supplied by the selected AI-session consumer, so
it never imports terminal stores, chat stores, or another plugin.
