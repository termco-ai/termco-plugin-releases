# AI Chat Sessions

Owns the application-wide chat session runtime and consumes the selected AI
inference, context-artifact, and speech capabilities. Credentials remain inside
those provider plugins and are never exposed to this consumer.

This source plugin owns the single application-wide chat session provider. Its
store, session metadata, credential/bootstrap lifecycle, transcript restoration,
model selection, panel navigation, and live Chat/seed/tool-context registries
travel with a copied replacement. Model execution, secrets, preferences, and
durable trace storage remain shared providers consumed through the public SDK.

Interactive generation executes through the selected application-wide
`ai.inference` provider. The chat runtime never receives provider keys or
endpoint client configuration. LSP, task-list, ask-user, skill, and
context-recall tools are separately source-owned `ai.tools` contributions
selected by the profile; the session supplies only session-scoped state and
context. The dock, composer, floating surface, transcript, model selector, rig
binding, and E2E lifecycle seam are source-owned here too.

Replacing this provider is destructive when chats are live. The platform warns
first, stops those runtimes after confirmation, activates the edited provider,
and rehydrates its durable sessions without restarting unrelated plugins.

The dock, floating window, compaction, rich cards, attachments, transcript,
composer, and model picker preserve the current baseline behavior and UI from
this source-owned folder.
