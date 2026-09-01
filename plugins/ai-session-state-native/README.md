# AI Session State

Provides stable `ai.sessions` and `ui.workspace-composer` facades. Execution
and presentation hosts bind dynamically, so history/navigation consumers do
not lose their service when Chat, inference, or speech is unavailable.
