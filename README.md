![IncoBills](https://cdn.serverspan.com/img/ss-logov2.png)

# IncoBills — AI-Powered Invoice Detection for Thunderbird

A Thunderbird MailExtension that monitors all incoming emails, classifies them with AI (or local keyword heuristics), and automatically organizes invoice-related messages into monthly subfolders — so you never miss an invoice again.

Built by [ServerSpan](https://www.serverspan.com/en/) — the hosting company where real sysadmins answer your tickets.

---

## Features

- **AI Classification** — Plug in Claude, OpenAI, or a local Ollama model to classify emails with high accuracy. Falls back to built-in keyword heuristics automatically if the API is unreachable.
- **Automatic Organization** — Detected invoices are moved (or copied) into `Invoices/YYYY-MM` subfolders, neatly grouped by month for easy accounting.
- **Per-Account or Unified** — Choose to keep invoices in each mailbox separately, or funnel them all into a single account.
- **Move or Copy** — Decide whether invoices are removed from the original folder or kept as a copy.
- **Works Across All Accounts** — Monitors every IMAP and POP3 account in Thunderbird. No server credentials needed — the extension runs entirely inside Thunderbird.
- **Privacy First** — Only the first 1000 characters of email body are sent to AI APIs. Full content never leaves the extension. For total privacy, use the local Ollama or keyword-only backends.
- **Scan Existing Emails** — Retroactively scan your inbox for invoices you may have missed before installing IncoBills.
- **Classification History** — Every decision is logged with confidence score, reason, and backend used. Export as CSV for your records.

## Screenshots

*Coming soon.*

## Installation

### Temporary Install (for testing)

1. Open Thunderbird
2. Go to **Menu → Add-ons and Themes** (or `Ctrl+Shift+A`)
3. Click the gear icon → **Debug Add-ons** → **Load Temporary Add-on**
4. Select `manifest.json` from this repository

> Temporary add-ons are removed when Thunderbird closes.

### Permanent Install (.xpi)

1. Download the latest `incobills-x.x.x.xpi` from [Releases](../../releases)
2. In Thunderbird: **Add-ons → Gear → Install Add-on From File**
3. Select the downloaded `.xpi` file

> **Note:** Thunderbird requires extensions to be signed by Mozilla for permanent installation on Release channel. For Nightly/Daily builds, you can set `xpinstall.signatures.required` to `false` in the Config Editor.

## Configuration

Click the IncoBills toolbar icon → **Settings**.

### AI Backend

| Backend | Setup | Cost | Privacy |
|---------|-------|------|---------|
| **Claude API** (recommended) | Anthropic API key | ~$1/month at typical volume | First 1000 chars only |
| **OpenAI API** | OpenAI API key | ~$1/month at typical volume | First 1000 chars only |
| **Local Ollama** | [Install Ollama](https://ollama.com), set `OLLAMA_ORIGINS="*,moz-extension://*"` | Free | Fully local |
| **Keywords Only** | No setup required | Free | Fully local |

Both Claude and OpenAI support custom API URLs — useful if you're running through a proxy or compatible endpoint.

### Folder Settings

- **Folder name**: Root folder name (default: `Invoices`)
- **Folder mode**: Per account (each mailbox gets its own tree) or unified (all go to one mailbox)
- **Monthly subfolders**: Automatically created as `YYYY-MM` (e.g. `2026-04`) inside the root folder

### Action

- **Move**: Removes the email from the original folder, places it in Invoices
- **Copy**: Keeps the email in the original folder, creates a duplicate in Invoices

## How It Works

```
New email arrives in Thunderbird
         │
         ▼
onNewMailReceived event fires
         │
         ▼
Extract metadata (subject, sender, body snippet, attachment filenames)
         │
         ▼
AI Classifier ──or── Keyword Heuristics (fallback)
         │
         ▼
Confidence ≥ threshold?
    │           │
   YES          NO
    │           │
    ▼        Log & skip
Find/create
Invoices/YYYY-MM
    │
    ▼
Move or Copy
    │
    ▼
Desktop notification
```

## Building from Source

IncoBills is plain JavaScript — no build step, no bundler, no npm.

```bash
git clone https://github.com/serverspan/incobills.git
cd incobills
```

Load `manifest.json` as a temporary add-on in Thunderbird. That's it.

To package as `.xpi`:

```bash
zip -r incobills-1.0.0.xpi manifest.json shared/ background/ popup/ options/ icons/
```

## Tech Stack

- **Thunderbird MailExtensions API** (Manifest V2, targeting TB 128+)
- **Vanilla JavaScript** — zero dependencies, zero build step
- **Pluggable AI backends** — Claude, OpenAI, Ollama, or keywords

## Project Structure

```
incobills/
├── manifest.json
├── background/
│   ├── background.js              # Entry point — listeners & message handling
│   ├── email-monitor.js           # New mail handler & metadata extraction
│   ├── classifier.js              # Dispatcher with automatic fallback
│   ├── classifiers/
│   │   ├── claude.js              # Anthropic Claude API
│   │   ├── openai.js              # OpenAI Chat Completions API
│   │   ├── ollama.js              # Local Ollama (fully private)
│   │   └── keywords.js            # Heuristic fallback (zero setup)
│   ├── folder-manager.js          # Folder creation with fallback chain
│   └── history.js                 # Classification history & CSV export
├── popup/
│   ├── popup.html / .js / .css    # Toolbar popup
├── options/
│   ├── options.html / .js / .css  # Full settings page
├── shared/
│   ├── constants.js               # Defaults, keyword lists, AI prompts
│   └── storage.js                 # browser.storage.local wrapper
└── icons/                         # SVG icons (16/32/48/96px)
```

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes
4. Open a Pull Request

## License

MIT License — see [LICENSE](LICENSE) for details.

---

<p align="center">
  <a href="https://www.serverspan.com/en/">
    <img src="https://cdn.serverspan.com/img/logo_white.png" alt="ServerSpan" width="160">
  </a>
</p>

<p align="center">
  Built with care by <a href="https://www.serverspan.com/en/">ServerSpan</a>.<br>
  Need reliable <a href="https://www.serverspan.com/en/services/">hosting infrastructure</a> for your projects?<br>
  <a href="https://www.serverspan.com/en/#faq">cPanel & DirectAdmin certified</a> sysadmins, &lt;2h response time, free migration.
</p>
