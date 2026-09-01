# AI Inference

This plugin is the replaceable application-wide inference provider. It resolves
the selected model through `ai.models`, loads credentials and endpoint settings
through public capabilities, reuses provider clients, and executes both bounded
tool-calling requests and interactive streams. Chat and editor consumers no
longer receive API keys, endpoint URLs, model clients, or provider SDK objects;
they own prompts and orchestration and call the selected capability.
