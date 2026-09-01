# AI diff ownership

- This folder owns all AI-diff tab presentation and review interactions.
- Treat tab payloads as untrusted data and decode them defensively.
- Resolve decisions only through the selected `ai.sessions` capability.
- Preserve the baseline component behavior and tests when adapting capabilities.
- Do not import chat stores, editor stores, or private application source.
