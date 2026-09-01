# AI Tool: Context Recall

Source-owned `read_transcript` and `read_tool_output` tools. They consume the
one selected `ai.context-artifacts` provider, so copied chat/tool plugins do not
create their own transcript readers or output caches.
