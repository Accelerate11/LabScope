# Security policy

## Reporting a vulnerability

Please do not publish credentials, exploit details, or sensitive robot data in a public issue. Use GitHub Security Advisories for the `Accelerate11/LabScope` repository when that feature is available. If private advisory access is unavailable, open a minimal issue that asks the maintainers to enable a private security discussion and do not include the sensitive details.

Include the affected version or commit, platform, a concise reproduction, and the impact. Redact API keys, tokens, private network addresses, user paths, and experiment data.

## Credential handling

Never commit API keys, access tokens, private keys, certificates, credential exports, or `.env` files. LabScope stores configured AI keys through Electron `safeStorage` when available. Review any data selected for remote AI processing before sending it.

## Supported versions

This is a development release. Security fixes are applied to the current `main` branch. Unsigned Windows packages are intended for controlled development environments and are not commercial releases.
