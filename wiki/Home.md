# Home

Welcome to the **Antigravity Telegram Suite** wiki!

This repository contains a Node.js-based Telegram Bot designed to act as a remote, headless interface for the Antigravity Agent IDE. Instead of sitting in front of a browser window, you can interact with your agent, review its code, authorize commands, and view artifacts directly from your phone or desktop via Telegram.

## High-Level Value Proposition
- **Remote Access**: Manage complex engineering tasks while away from your computer.
- **Headless Mode**: The bot hooks into the Antigravity UI via the Chrome DevTools Protocol (CDP), allowing the IDE to run entirely in the background.
- **Auto-Accept**: Automatically accept routine commands and prompts to keep the agent moving without constant manual intervention.
- **Rich Media**: Instantly view UI screenshots, read generated markdown files, and even watch WebP videos of the agent navigating the browser right inside Telegram.

## Getting Started

### Prerequisites
1. **PM2**: Recommended for running the bot as a background daemon.
2. **FFmpeg**: Required for converting WebP animations to MP4 format for native Telegram video playback.

### Environment Setup
Create a `.env` file in the root directory:
```env
# Your Telegram Bot Token from BotFather
TELEGRAM_BOT_TOKEN=your_token_here

# (Optional) Restrict access to a specific Telegram Chat ID for security
ALLOWED_CHAT_ID=your_chat_id

# The port where Chrome is exposing the DevTools Protocol
CDP_PORT=9333
```

### Running the Bot
Start the bot using PM2 to keep it alive in the background:
```bash
pm2 start src/index.js --name antigravity-bot
```

To view the bot's logs:
```bash
pm2 logs antigravity-bot
```

## Documentation

Explore the rest of the wiki to understand the inner workings and capabilities of the bot:

- 🏗️ **[Architecture](Architecture.md)**: Deep dive into how the bot uses Chrome DevTools Protocol to remote-control the headless IDE.
- ⌨️ **[Commands Reference](Commands.md)**: A complete list of all Telegram commands, aliases, and chat management tools.
- 🤖 **[Auto-Accept State Machine](Auto-Accept.md)**: How the intelligent DOM observer automatically handles IDE prompts to keep your agent running autonomously.
