# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-04-25

### Fixed
- Resolved Thunderbird Add-on Validator security warnings by replacing all DOM `innerHTML` assignments with safe `createElement`/`textContent` construction in:
  - `popup/popup.js` — `createRecentItem()` and recent-list clearing
  - `options/options.js` — account list, history table rendering, and sort-button arrow updates
- Reduced validator warnings from 31 to 27 (remaining warnings are Thunderbird-specific MailExtension API permissions that are expected for Thunderbird-only add-ons)

## [1.0.0] - 2026-04-25

### Added
- Initial release of IncoBills
- AI-powered invoice detection using keyword, Claude, OpenAI, and Ollama backends
- Automatic email organization (move/copy/flag) across all Thunderbird accounts
- Per-account or unified folder modes
- Classification history with CSV export
- Manual scan of existing emails
- Options page for backend configuration, thresholds, and account selection
