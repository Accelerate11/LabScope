# M3.0-R1 Multi-session

AI conversations are persisted by the Electron main process in the user data directory. The Renderer can create, list, save, append messages, and delete conversations. Conversation records contain experiment and provider references, messages, timestamps, and archive state. API keys are never stored in conversation data.

The current UI restores the conversation list and associates deterministic analysis and model responses with the selected session. Search, archive controls, and cross-device synchronization remain follow-up work.
