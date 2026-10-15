# Changelog

## 1.0.8

- Keep a turn running when the model calls an unavailable tool or a tool fails; the error goes back to the model as the call's result instead of ending the turn.
- Keep tools the model already called in this chat available in later turns and in the step after a call that failed because the tool was unavailable.
- Before a stopped, failed, or finished turn closes, wait for tool calls that are still being written and give every call without a result one.
- Repair the session and accept new messages when a turn could not be closed, instead of failing every later message with the same error.

## 1.0.7

- Keep expanded Chat and Agents above native browser panes while resizing across the workspace.
- Preserve interaction with exposed browser content during partial chat expansion.

## 1.0.6

- Expand Chat and Agents up to the left sidebar instead of stopping at 560 pixels, and drag the panel back to a narrower width.
- Keep the sidebar in place and preserve chat drafts and workspace contents while resizing.
- Follow window and sidebar changes when the dock fills the available width.
- Support resizing with arrow keys, Home, and End on the focused resize handle.

## 1.0.5

- Show a dedicated folder-access approval card with the target, directory, reason, and chat scope; require an individual decision for every grant.

## 1.0.4

- Restore chat sessions and their workspace context reliably, keep running sessions attached to the correct rig, and improve on-demand discovery of AI tools.
