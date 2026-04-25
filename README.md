<div align="center">

# 🤖 Antigravity Telegram Suite

**Control your [Antigravity IDE](https://antigravity.google/) remotely via Telegram.**

Send messages, switch AI models, manage workspaces, take screenshots — all from your phone.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)]()

</div>

---

## ✨ Features

| Feature | Description |
|---|---|
| 💬 **Headless Chat** | Send messages directly to the AI agent via Telegram |
| 📎 **File & Image Upload** | Forward files/images to the agent with captions |
| 📸 **IDE Screenshots** | Capture and receive IDE screenshots remotely |
| 🤖 **Model Switching** | Change AI models (Gemini, Claude) with inline buttons |
| 📂 **File Explorer** | Browse, navigate, and download project files |
| 🔄 **Workspace Management** | Switch between projects without touching the keyboard |
| ⚡ **Auto-Accept** | Automatically click Run, Accept, Allow, Continue buttons |
| 🌐 **Multi-Language** | English and Turkish UI (extensible) |
| ⌨️ **Typing Indicator** | Shows "typing..." instead of spamming progress messages |
| 🖥️ **Cross-Platform** | Works on Linux, macOS (Intel), and Windows |

## 🚀 Quick Start

### Prerequisites

- [Node.js](https://nodejs.org/) >= 18
- [Antigravity IDE](https://antigravity.google/) installed
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
BOT_TOKEN=your_telegram_bot_token
ALLOWED_CHAT_ID=your_chat_id
DEBUGGING_PORT=9333
LANGUAGE=en
```

> 💡 Send `/start` to your bot to get your Chat ID.

### 3. Launch the IDE with CDP

The bot communicates with the IDE via Chrome DevTools Protocol. Launch Antigravity with:

```bash
# Linux
antigravity --remote-debugging-port=9333

# macOS
open -a Antigravity --args --remote-debugging-port=9333

# Windows
Antigravity.exe --remote-debugging-port=9333
```

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

## 📱 Commands

| Command | Description |
|---|---|
| *(any text)* | Send directly to the AI agent |
| `/latest` | Get the latest agent response |
| `/screenshot` | Take an IDE screenshot |
| `/status` | System status (IDE, CDP, Bot) |
| `/start_ide` | Start the IDE remotely |
| `/close` | Fully close the IDE |
| `/new` | Open a new chat session |
| `/model` | Switch AI model |
| `/workspace` | Switch project workspace |
| `/window` | Select specific IDE window (multi-window support) |
| `/file` | Browse & download project files |
| `/quota` | Check AI credits and model usage limits |
| `/autoaccept` | Toggle auto-accept (on/off/status) |
| `/lang` | Switch language (EN/TR) |
| `/stop` | Stop the running agent |
| `/menu` | Update Telegram command menu |

## 🏗️ Architecture

```
antigravity-telegram-suite/
├── src/
│   ├── index.js           # Main bot logic & Telegram handlers
│   ├── cdp_controller.js   # Chrome DevTools Protocol communication
│   ├── autoaccept.js       # Auto-accept button clicker via CDP
│   ├── i18n.js             # Internationalization module
│   └── platform.js         # Cross-platform OS abstraction
├── locales/
│   ├── en.json             # English strings
│   └── tr.json             # Turkish strings
├── scripts/
│   ├── install.sh          # Linux/macOS installer
│   └── install.ps1         # Windows installer
├── .env.example            # Environment template
└── package.json
```

### How It Works

```
┌──────────┐     Telegram API     ┌──────────────┐     CDP (WebSocket)     ┌─────────────┐
│ Telegram │ ◄──────────────────► │ Antigravity  │ ◄────────────────────► │ Antigravity  │
│   App    │     Bot Commands     │     Bot      │    DOM Interaction     │     IDE      │
└──────────┘                      └──────────────┘                        └─────────────┘
```

1. You send a message via Telegram
2. The bot injects text into the IDE's chat input via CDP
3. The bot monitors the IDE for agent completion (typing indicator shown)
4. Once done, the response is extracted and sent back to Telegram
5. **Auto-Accept**: When enabled, a MutationObserver watches for action buttons (Run, Accept, Allow, Continue) and clicks them automatically — no manual intervention needed

## 🌐 Adding a Language

1. Copy `locales/en.json` to `locales/xx.json`
2. Translate all string values
3. Set `LANGUAGE=xx` in your `.env`

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 🙏 Acknowledgments

- **[yvg](https://github.com/yvg/antigravity-telegram-suite)** — For the excellent Multi-Window Support feature that added the ability to route commands to specific IDE windows!
- **[acmavirus/antigravity-telegram-control](https://github.com/acmavirus/antigravity-telegram-control)** — A clean, open-source Telegram integration for Antigravity that served as the foundation for this project.
- **[yazanbaker94/AntiGravity-AutoAccept](https://github.com/yazanbaker94/AntiGravity-AutoAccept)** — The DOM observer pattern used in the Auto-Accept module was inspired by this project's approach to automated button clicking.

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.

---

<div align="center">
Made with ❤️ by [Emre Türkmen](https://emreturkmen.com) for remote developers who code from their couch.

**Hey Google, if you would like to give me a job you can contact me at [hello@emreturkmen.com](mailto:hello@emreturkmen.com) 😂**
</div>
