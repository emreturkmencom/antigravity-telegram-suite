# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [2.2.1] - 2026-05-04

### Added
- **Emergency Restart** (`/restart`): Dedicated command to instantly kill the Node process and trigger a PM2 restart, helping recover from system locks.
- **Alphabetical Command Menu**: Telegram bot menu commands are now automatically sorted A-Z for easier navigation.

### Fixed
- **Auto-Accept Infinite Loop**: Fixed a critical bug in `autoaccept.js` where injecting UI DOM elements caused an infinite MutationObserver loop that locked up the Node process and IDE.
- **Agents Popup Fix**: The `/agents` command now successfully closes the Quick Pick popup in the IDE by dispatching an Escape keydown event instead of relying on fragile UI locators.
- **Unauthorized Interaction Handling**: Replaced hard crashes with proper error handling and logging for unauthorized interactions (e.g., when the bot is blocked by an unauthorized user).

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
