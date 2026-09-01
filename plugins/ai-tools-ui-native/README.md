# AI Tools: Rich UI

This plugin owns the AI-facing rich-view vocabulary and its two delivery modes.
`show_ui` renders structured data and lets the run continue. `ask_ui` renders a
decision and intentionally has no executor, so the chat waits for the user.

Copy this whole folder to change the supported view types, descriptions,
validation limits, or interaction contract. Reloading the replacement updates
the selected `ai.tools:ui` contribution without restarting the application.
