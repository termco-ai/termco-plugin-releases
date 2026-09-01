# AI Tool Runtime

Provides the application-wide `ai.tools`, `ai.toolsets`, and
`ai.tool-execution` services. Tool contributors come and go with their own
plugin lifecycles; this provider remains the single authority that validates
and invokes their bodies. It flushes each canonical call before its side effect
and flushes the canonical result after completion.
