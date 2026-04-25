# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.1.0] - 2026-04-25

### Added
- **SAGA Export Module** (Romania-specific) — Extracts invoice data from PDF attachments and generates SAGA XML import files
  - Company Registry: Define your Romanian companies with full fiscal data (CIF, RegCom, address, bank, IBAN)
  - AI-powered PDF parsing via Claude 3.5 Sonnet, OpenAI GPT-4o, or local Ollama
  - Automatic direction detection (Intrări/Ieșiri) based on CIF matching
  - Invoice review queue with status tracking and manual export
  - XML generation conforming to SAGA import schema
  - Export to `Downloads/SAGA-Import/` via `browser.downloads` API
  - Dedicated SAGA tab in popup for quick access
  - Fully optional module — only activates when companies are configured
- New `downloads` permission for XML file export
- Design document: `docs/plans/2026-04-25-saga-export-design.md`

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
