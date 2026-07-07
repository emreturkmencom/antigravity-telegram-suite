<div align="center">

# 🤖 Antigravity Telegram Suite

**Works with both [Antigravity Standalone App](https://antigravity.google/)\* and [Antigravity IDE](https://antigravity.google/).**

🌍 Languages: [English](README.md) | [中文](README.zh.md) | [한국어](README.ko.md) | [Türkçe](README.tr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

Control your Antigravity AI agent remotely via Telegram.
Send messages, switch AI models, manage workspaces, take screenshots, and run multi-agent workflows — all from your phone.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)]()
[![Version](https://img.shields.io/badge/Version-3.6.0-orange.svg)]()

\* *Some features may have limitations on the Standalone App. See [Known Issues](#-known-issues).*

</div>

---

## 📢 Community
- **Updates Channel:** [@agts_updates](https://t.me/agts_updates)
- **Discussion Group:** [@agts_community](https://t.me/agts_community)

## ✨ Features

| Feature | Description |
|---|---|
| 💬 **Headless Chat** | Send messages directly to the AI agent via Telegram |
| 📎 **File & Image Upload** | Forward files/images to the agent with captions |
| 📸 **IDE Screenshots** | Capture and receive screenshots remotely |
| 🤖 **Model Switching** | Change AI models (Gemini, Claude, GPT) with inline buttons |
| 📂 **File Explorer** | Browse, navigate, and download project files |
| 🔄 **Workspace Management** | Switch between projects without touching the keyboard |
| 🪟 **Multi-Window Support** | Route commands to a specific IDE window when multiple are open |
| 👥 **Multi-User** | Share bot control with your team via comma-separated Chat IDs |
| 💬 **Thread Management** | List, switch, and manage chat threads (agent conversations) |
| ⚡ **Auto-Accept** | Automatically click Run, Accept, Allow, Continue buttons via a DOM MutationObserver |
| 🚀 **Turbo Mode** | Multi-agent orchestration: Claude plans → Gemini codes → Claude reviews → Gemini fixes |
| 🎯 **Goal Mode** | Autonomous long-running tasks — agent works until the goal is fully achieved |
| 📋 **Plan Mode** | Generate implementation plans before coding |
| 🔔 **Proactive Notifications** | TaskWatcher detects unsolicited agent messages (timers, sub-agents) and forwards to Telegram |
| 🤔 **Message Reactions** | Shows 🤔 while processing, clears when done |
| 🔄 **Auto-Update** | Check for updates and self-update with one command |
| 🌐 **Multi-Language** | 7 languages supported: English, Chinese, Korean, Turkish, German, Spanish, French |
| ⌨️ **Typing Indicator** | Shows "typing..." in Telegram while the agent is working |
| 🖥️ **Cross-Platform** | Works on Linux, macOS (Intel & Apple Silicon), and Windows |
| 🔀 **Dual App Support** | Seamlessly switch between Antigravity IDE and Standalone Agent App |
| 🔐 **Multi-Account Switching** | Authenticate and switch between Google accounts, injecting credentials directly into the IDE database or OS keychain |
| 📡 **Telegraph Publishing** | Task checklists, implementation plans, and walkthroughs are automatically published to telegra.ph and shared as tap-to-open links in Telegram for better visibility and readability |


---

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Antigravity IDE](https://antigravity.google/) and/or [Antigravity Standalone App](https://antigravity.google/) installed
- A Telegram bot token (get one from [@BotFather](https://t.me/BotFather))

### 1. Clone & Install

```bash
git clone https://github.com/emreturkmencom/antigravity-telegram-suite.git
cd antigravity-telegram-suite
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Telegram
BOT_TOKEN=your_telegram_bot_token
ALLOWED_CHAT_ID=your_chat_id,another_chat_id_optional

# CDP Debugging Ports (must match the --remote-debugging-port used when launching)
AGENT_CDP_PORT=9333    # Port for the Standalone Antigravity App
IDE_CDP_PORT=9334      # Port for the Antigravity IDE

# Default AI model to select on new chat
DEFAULT_MODEL=Gemini 3.5 Flash (Medium)

# Language: en | zh | ko | tr | de | es | fr
LANGUAGE=en

# Preferred app target: 'agent' (Standalone) or 'ide' (IDE)
ANTIGRAVITY_PREFERRED_APP=ide

# Enable auto-accept by default
AUTOACCEPT_DEFAULT=true

# Filter which models appear in /getinfo quota output (comma-separated, matches display names)
QUOTA_DISPLAY_MODELS=Claude Opus 4.6,Claude Sonnet 4.6,Gemini 3.5 Flash (High),Gemini 3.5 Flash (Low),Gemini 3.5 Flash (Medium),Gemini 3.1 Pro (High),Gemini 3.1 Pro (Low)

```

> 💡 Send `/start` to your bot to get your Chat ID.

### 3. Launch the App with CDP

The bot communicates with Antigravity via Chrome DevTools Protocol (CDP). You must launch the app with a debugging port.

#### 🚀 Launching the Bot & Watchdog

To run the bot in the background with auto-restart on crash or unresponsiveness, run the cross-platform watchdog agent:

```bash
npm run watchdog
```

Alternatively, to start the bot directly:

```bash
npm start
```

#### Manual Launch Options

**If running both apps side-by-side, use different ports:**

```bash
# --- Standalone Antigravity App ---
# Linux
antigravity --remote-debugging-port=9333

# macOS
open -a Antigravity --args --remote-debugging-port=9333

# Windows
Antigravity.exe --remote-debugging-port=9333
```

```bash
# --- Antigravity IDE ---
# Linux
antigravity-ide --remote-debugging-port=9334

# macOS
open -a "Antigravity IDE" --args --remote-debugging-port=9334

# Windows
"Antigravity IDE.exe" --remote-debugging-port=9334
```

> ⚠️ The port numbers must match `AGENT_CDP_PORT` and `IDE_CDP_PORT` in your `.env` file.

### 4. Start the Bot

```bash
npm start
```

For 24/7 operation with PM2:

```bash
npm install -g pm2
pm2 start src/index.js --name antigravity-bot
pm2 save
pm2 startup
```

### Automated Setup (Optional)

```bash
# Linux & macOS
bash scripts/install.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

---

## 📱 Commands

### Core Commands

| Command | Description |
|---|---|
| *(any text)* | Send directly to the AI agent |
| `/latest` | Get the latest agent response as text |
| `/screenshot` | Take a screenshot of the active agent window |
| `/status` | Show system status (IDE, CDP connection, Bot) |
| `/stop` | Stop the currently running agent |
| `/new` | Open a new chat session |

### AI Model & Agent

| Command | Description |
|---|---|
| `/model` | Switch AI model (Gemini, Claude, etc.) |
| `/turbo` | Toggle **Turbo Mode** — multi-agent orchestration (see below) |
| `/goal <task>` | Start **Goal Mode** — agent works autonomously until done |
| `/plan <task>` | Generate an **implementation plan** before coding |
| `/schedule_task <task>` | Schedule a recurring or one-time task in the IDE |
| `/agents` | List and switch between chat threads |
| `/quota` | Check AI credits and model usage limits |

### App & Window Management

| Command | Description |
|---|---|
| `/start_ide` | Start the Antigravity IDE remotely |
| `/start_ag` | Start the Standalone Antigravity Agent App |
| `/close_ide` | Close the Antigravity IDE |
| `/close_ag` | Close the Standalone Agent App |
| `/close` | Close the currently active app |
| `/app` | Switch between IDE and Standalone Agent (`ANTIGRAVITY_PREFERRED_APP`) |
| `/window` | Select a specific window when multiple are open |
| `/workspace` | Switch project workspace |
| `/restart` | Restart the bot process (PM2) |

### Files & Utilities

| Command | Description |
|---|---|
| `/file` | Browse & download project files |
| `/artifacts` | List and download artifacts from the current thread |
| `/autoaccept` | Toggle auto-accept (on / off / status) |
| `/lang` | Switch display language |
| `/update` | Check for updates, view changelog, and auto-update the bot |
| `/version` | Show current version info |
| `/menu` | Update the Telegram command menu |
| `/fix_shortcuts` | Repair desktop shortcuts for Antigravity apps |

### Account Management

| Command | Description |
|---|---|
| `/login` | Start the Google OAuth flow to authenticate a new account |
| `/logincode <url_or_code>` | Manually process a Google OAuth callback redirect URL or code (useful for mobile/headless setups) |
| `/accounts` | List all saved accounts, showing active status, names, emails, and subscription tiers |
| `/switchacc <id>` | Inject credentials for the specified account, gracefully restart the IDE/Agent, and log in |
| `/getinfo <id>` | Retrieve detailed subscription details and render custom model usage progress bars |
| `/delacc <id>` | Delete a saved Google account's authentication token from the bot's database |


---

## 🚀 Turbo Mode (Multi-Agent Orchestration)

Turbo Mode runs an **Agents Council** workflow that coordinates multiple AI models automatically:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TURBO MODE PIPELINE                         │
│                                                                     │
│  Phase 1: PLANNING        Claude Opus → Creates implementation plan │
│  Phase 2: CODING          Gemini Pro  → Writes the code             │
│  Phase 3: REVIEW          Claude Opus → Security & code review      │
│  Phase 4: FIX (if needed) Gemini Pro  → Fixes issues found          │
│  Phase 5: SUMMARY         Gemini Pro  → Executive summary for user  │
└─────────────────────────────────────────────────────────────────────┘
```

**How to use:**
1. Enable Turbo Mode: `/turbo` → Select "Enable"
2. Send your request as normal text
3. The bot will automatically switch models and run all phases
4. You'll receive real-time phase updates and a final summary

> 💡 Turbo Mode requires access to both Claude and Gemini models in your Antigravity subscription.

---

## 🎯 Goal Mode vs 🚀 Turbo Mode

| | Goal Mode (`/goal`) | Turbo Mode (`/turbo`) |
|---|---|---|
| **How it works** | Agent works autonomously in a single session until done | Bot orchestrates multi-model pipeline externally |
| **Models used** | Whichever model is currently selected | Claude (plan/review) + Gemini (code/fix) — automatic switching |
| **Key advantage** | Simple, reliable, native IDE feature | Multi-model collaboration: different models cross-check each other |
| **Token usage** | Single context window (efficient) | Multiple round-trips (more tokens) |
| **Progress** | 🤔 reaction → final result | Real-time pinned message with phase updates |
| **Best for** | Long tasks with a single model | Complex tasks benefiting from multi-model review |
| **Architecture** | IDE-native (`/goal` slash command) | External orchestration via CDP + `turbo_orchestrator.js` |

**When to use which:**
- **Simple long task** (e.g., "refactor this module") → `/goal` 
- **Complex task needing cross-model review** (e.g., "build this feature, review security, fix issues") → `/turbo`
- **Planning** → `/plan` (generates plan, then you decide)

---

## 🏗️ Architecture

```
antigravity-telegram-suite/
├── src/
│   ├── index.js               # Main bot logic & Telegram command handlers
│   ├── cdp_controller.js      # Chrome DevTools Protocol communication
│   ├── autoaccept.js          # Auto-accept button clicker via CDP MutationObserver
│   ├── turbo_orchestrator.js  # Multi-agent Turbo Mode (Agents Council) orchestration
│   ├── task_watcher.js        # Proactive notification watcher (transcript.jsonl monitor)
│   ├── updater.js             # Self-update module (git pull + pm2 restart)
│   ├── ui_locators.js         # DOM element locators for IDE/Agent UI interaction
│   ├── i18n.js                # Internationalization module
│   ├── platform.js            # Cross-platform OS abstraction (launch, close, paths)
│   ├── model_utils.js         # Model name normalization & fuzzy-matching utilities
│   ├── account_manager.js     # Google OAuth login, multi-account store, credential injection
│   ├── protobuf_utils.js      # Zero-dependency protobuf serialization for credential injection
│   ├── telegraph_publisher.js # Publishes task/plan/walkthrough to telegra.ph; maps file links to URLs
│   ├── cdp_health.js          # CDP connection health-check helpers
│   ├── local_media.js         # Local image extraction from markdown
│   └── watchdog.js            # Bot process watchdog / auto-restart
├── locales/
│   ├── en.json                # English
│   ├── zh.json                # Chinese (中文)
│   ├── ko.json                # Korean (한국어)
│   ├── tr.json                # Turkish
│   ├── de.json                # German
│   ├── es.json                # Spanish
│   └── fr.json                # French
├── scripts/
│   ├── install.sh             # Linux/macOS installer
│   └── install.ps1            # Windows installer
├── test/
│   ├── model_utils.test.js    # Unit tests for model_utils
│   ├── protobuf_utils.test.js # Unit tests for protobuf_utils
│   ├── telegraph.test.js      # Tests for telegraph_publisher
│   ├── cdp_health.test.js     # Tests for CDP health helpers
│   ├── local_media.test.js    # Tests for local media extraction
│   ├── i18n.test.js           # Tests for i18n module
│   ├── updater.test.js        # Tests for updater module
│   ├── smoke.test.js          # Smoke / integration tests
│   └── test_helpers.js        # Shared test utilities
├── .env.example               # Environment variable template
├── CHANGELOG.md               # Release history
└── package.json
```

### How It Works

```
┌──────────┐     Telegram API     ┌──────────────┐     CDP (WebSocket)     ┌─────────────────┐
│ Telegram │ ◄──────────────────► │ Antigravity  │ ◄────────────────────► │ Antigravity IDE  │
│   App    │     Bot Commands     │     Bot      │    DOM Interaction     │       or         │
└──────────┘                      └──────────────┘                        │ Standalone Agent │
                                                                          └─────────────────┘
```

1. You send a message via Telegram
2. The bot injects your text into the AI agent's chat input via CDP
3. The bot monitors the agent for completion (typing indicator shown in Telegram)
4. Once done, the response is extracted and sent back to Telegram
5. **Auto-Accept**: When enabled, a MutationObserver watches for action buttons (Run, Accept, Allow, Continue) and clicks them automatically

### Dual App Architecture

The bot supports **two Antigravity applications** running simultaneously:

| App | Default Port | Config Key | Description |
|-----|-------------|------------|-------------|
| **Standalone Agent** | `9333` | `AGENT_CDP_PORT` | Lightweight chat-focused Antigravity app |
| **Antigravity IDE** | `9334` | `IDE_CDP_PORT` | Full IDE with editor, terminal, and extensions |

Use `/app` to switch the bot's focus between apps. The `ANTIGRAVITY_PREFERRED_APP` setting in `.env` determines which app the bot targets by default.

---

## 🌐 Adding a Language

1. Copy `locales/en.json` to `locales/xx.json`
2. Translate all string values
3. Set `LANGUAGE=xx` in your `.env`

---

## ⚠️ Known Issues

| Issue | Details |
|-------|---------|
| **Standalone App Limitations** | Some features (workspace switching, thread management) may not work reliably with the Standalone Antigravity App. **Antigravity IDE is fully supported and recommended.** |
| **Auto-Update on IDE 2.0** | If Antigravity IDE auto-updates, DOM selectors may break until the bot is also updated. |
| **Turbo Mode Model Access** | Turbo Mode requires both Claude and Gemini models to be available. If one model is unavailable, the pipeline will fail. |
| **Telegraph on restricted networks** | If `api.telegra.ph` is blocked, set `TELEGRAPH_API_HOST=api.graph.org` in your `.env` (this is already the default). |

> 💡 As a developer, I prefer to focus on IDE support. The Standalone App integration is provided on a best-effort basis.

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request against [`gtxPrime/antigravity-telegram-suite`](https://github.com/gtxPrime/antigravity-telegram-suite)

---

## 🙏 Acknowledgments

- **[gtxPrime](https://github.com/gtxPrime)** — Google OAuth multi-account switching, OS keychain & database credential injection, Telegraph publishing (task/plan/walkthrough auto-shared to telegra.ph with tap-to-open buttons)
- **[ATX-AI-Dev](https://github.com/ATX-AI-Dev)** — PR #8: Standalone App support, Watchdog agent, and dynamic model fetching
- **[yvg](https://github.com/yvg/antigravity-telegram-suite)** — Multi-Window Support feature
- **[achshar](https://github.com/achshar/antigravity-telegram-suite)** — Agent Manager UI locators for thread management
- **[mine260309](https://github.com/mine260309)** — i18n translations for hardcoded messages
- **[acmavirus/antigravity-telegram-control](https://github.com/acmavirus/antigravity-telegram-control)** — The open-source Telegram integration that served as the foundation for this project
- **[yazanbaker94/AntiGravity-AutoAccept](https://github.com/yazanbaker94/AntiGravity-AutoAccept)** — DOM observer pattern inspiration for the Auto-Accept module
- **[vassoz](https://github.com/vassoz)** — PR #12: Fix CDP connection, X11 display auto-detection, and dynamic port shortcuts
- **[wade19990814-hue](https://github.com/wade19990814-hue)** — PR #14: Chinese (中文) localization
- **[ienground](https://github.com/ienground)** — PR #17: Korean (한국어) localization

## 🌟 Credits & Inspirations

The multi-agent **Turbo Mode** orchestration was inspired by the [Agents-Council](https://github.com/interdesigncorp-lab/Agents-Council) repository by Interdesigncorp Lab.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
Made with ❤️ by <a href="https://emreturkmen.com">Emre Türkmen</a> for remote developers who code from their couch.

**Hey Google, if you would like to give me a job you can contact me at [hello@emreturkmen.com](mailto:hello@emreturkmen.com) 😂**
</div>
