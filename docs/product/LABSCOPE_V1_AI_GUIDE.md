# LabScope V1 AI Guide

AI Providers are configured in the AI Analysis workspace. Provider name, model, base URL and API key cross the preload boundary only to the Electron main process. API keys are encrypted with Electron `safeStorage` when available and are never returned to the Renderer after saving. The provider file contains encrypted key material and non-secret connection metadata.

Supported adapter shapes are OpenAI-compatible, Anthropic and Gemini. A provider test sends a short request. AI analysis prompts include deterministic local experiment metadata. Raw MCAP, full images and arbitrary files are not automatically uploaded. The current Gateway does not grant a provider filesystem access or arbitrary command execution.

Local visualization and recording remain available with no Provider configured. The current AI surface is a provider and summary gateway. ROS/TXT/JSON log parsing, deterministic topic and sensor analysis tools, evidence-linked timeline actions, report export and the controlled AI tool registry are future V1 completion work.

Before using a remote provider, review the generated prompt in the AI workspace and confirm that the selected experiment summary is appropriate for external processing. Real provider credentials and network calls were not part of the packaged acceptance run.
