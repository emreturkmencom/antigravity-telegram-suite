# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [3.1.0] - 2026-05-21

### Added
- **Multi-User Support**: `ALLOWED_CHAT_ID` now supports a comma-separated list of multiple Telegram Chat IDs, allowing a team to control the same bot.
- **Automated Changelog**: The `/update` command and background update notifications now automatically fetch and display the latest commit message from GitHub.
- **Custom Update Notices**: Added specific advisory notes regarding performance optimization for Antigravity IDE vs the Standalone App.

### Fixed
- **Artifacts Sorting**: Fixed the `/artifacts` command to correctly list files sorted by modification time (newest first).
- **Artifacts Path Targeting**: Fixed the artifacts directory resolution to respect the `ANTIGRAVITY_PREFERRED_APP` environment variable setting.
- **Temp File Leakage**: Globally excluded `test_*`, `dump_*`, and `patch_*` debug files from Git tracking.

## [3.0.0] - 2026-05-20

### Added
- **Dual-Port CDP Support**: Run Antigravity IDE and Standalone App simultaneously with independent CDP ports (`AGENT_CDP_PORT` / `IDE_CDP_PORT`)
- **Default Model Selection**: New `DEFAULT_MODEL` env var — automatically selects your preferred AI model on IDE startup and new chat creation
- **Standalone App Commands**: `/start_ag`, `/close_ag` for independent Standalone App lifecycle management
- **App Switcher** (`/app`): Switch active target between IDE and Standalone App
- **Desktop Shortcut Fixer** (`/fix_shortcuts`): Automatically update desktop shortcuts to include CDP debugging flags

### Fixed
- **Complete i18n Audit**: Eliminated 50+ hardcoded Turkish strings that appeared regardless of `LANGUAGE` setting
- **IDE 2.0 IPC Socket Discovery**: Fixed workspace opening failures caused by changed socket naming convention (`vscode-*-main.sock`)
- **IDE 2.0 DOM Selectors**: Updated history panel selectors for changed placeholder text and CSS classes in Antigravity IDE 2.0
- **Standalone App Launch**: Fixed `cli.js` detection for Electron apps that don't ship a CLI script (Standalone 2.0)

### Changed
- **`.env.example` Updated**: Now includes all current configuration options with documentation
- **Architecture Docs**: README updated with new files, commands, and known issues

### Known Issues
- Some features may not work with Standalone Antigravity App. Antigravity IDE remains fully supported. As a developer, I recommend using the IDE for the best experience.

## [2.2.3] - 2026-05-04

### Fixed
- **One-Way Update Sync**: The auto-updater now forces a one-way sync (`git reset --hard`) instead of standard pulls, eliminating update failures caused by local modifications like `package-lock.json`.
- **macOS Multi-Window IPC**: Corrected the macOS application launch strategy to use the built-in CLI (`bin/antigravity`) instead of the raw binary, ensuring the `--new-window` flag propagates correctly to already running instances.
- **Update Notifications**: Fixed a logic flaw that explicitly suppressed the "Update Successful" Telegram message. Notifications now correctly wait 3 seconds before PM2 restarts the process.
## [2.2.2] - 2026-05-04

### Fixed
- **Updater Notification**: Fixed a bug where the `/update` command failed to send the success notification because the PM2 restart killed the bot process instantly. The restart is now delayed by 3 seconds to ensure the Telegram message is delivered.
- **macOS Multi-Window**: Fixed a bug where switching workspaces via `/workspace` on macOS failed to open a new window if the IDE was already running. The bot now directly executes the binary instead of using `open -a`.

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
