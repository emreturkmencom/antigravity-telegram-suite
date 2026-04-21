# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added
- **Auto-Accept** (`/autoaccept`): Automatically clicks Run, Accept, Always Allow, Allow, Retry, and Continue buttons in the agent panel via CDP MutationObserver injection
  - Toggle on/off/status via Telegram command
  - Inline keyboard buttons for quick toggling
  - Heartbeat monitoring every 10s with auto re-injection for dead observers
  - Built-in safety: 18 blocked dangerous commands (rm -rf, git push --force, etc.)
  - 5s cooldown per button to prevent double-clicks
  - Circuit breaker: stops retry/continue after 3 attempts within 60s
  - Sidebar guard: prevents accidental clicks on chat list items
- Auto-Accept status reporting with click statistics

### Changed
- Message confirmation no longer echoes user text — now shows clean "✅ Message Sent, waiting for response..."
- Updated help text and Telegram menu to include `/autoaccept`

### Architecture
- New module: `src/autoaccept.js` — self-contained auto-accept engine with no external extension dependencies

## [1.0.0] - 2026-04-20

### Added
- Initial release
- Headless chat via Telegram (direct text or `/ask` command)
- File & image upload forwarding to agent
- IDE screenshot capture via CDP
- AI model switching with inline buttons (Gemini, Claude, etc.)
- File explorer with paginated directory browsing
- Workspace switching with automatic IDE restart
- Multi-language support (English, Turkish)
- Typing indicator during agent processing
- Cross-platform support (Linux, macOS, Windows)
- Agent stop command
- CDP-based response extraction with diff filtering
- Terminal command execution via `/cmd`
- Automated IDE lifecycle management (start, stop, trust workspace)
- PM2 production deployment support
