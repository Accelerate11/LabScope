# M3 AI Gateway

The existing main-process gateway remains the only remote model boundary. It supports OpenAI-compatible, Anthropic, and Gemini adapters. A built-in Local Mock Provider performs deterministic offline responses for Simulation-First tests and does not require a key.

Keys are encrypted with Electron `safeStorage` when available. Provider keys are never returned to the Renderer. Capability-aware streaming and native tool-calling adapters are planned after the read-only analysis path is stable.
