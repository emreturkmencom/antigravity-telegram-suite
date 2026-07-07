# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

## [3.6.0] - 2026-07-08

### Added
- **Multi-Account Switching**: Complete overhaul of the `/accounts` command. You can now authenticate and switch between multiple Google accounts. Accounts are persisted securely in `accounts.json` and credentials are automatically injected into the IDE's SQLite database or OS keychain when switching.
- **Telegraph Publishing**: Task checklists, implementation plans, and walkthroughs (like `/gettask` or `/getplan`) are now automatically published to telegra.ph. Links are shared in Telegram as tap-to-open Instant View articles for better readability.
- **Community Links**: Added Official Telegram Channel (`@agts_updates`) and Discussion Group (`@agts_community`) links to auto-update notifications and README for users to stay connected.

### Changed
- **Account Panel Redesign**: The `/accounts` panel now uses a two-row button layout per account, preventing email truncation while keeping action icons accessible.
- **Active Account Highlight**: The active account is now marked with a 🟢 green indicator, switching to 🔴 if the token is expired, or 🔄 for other registered accounts.

### Fixed
- **Standalone App New Chat Crash**: Fixed a bug where clicking the 'New Chat' button globally without a workspace context caused the Standalone IDE (`ag`) to crash or freeze.
- **Workspace State Persistence**: `switchacc` now remembers the last active workspace and restores it properly after restarting the IDE.
- **SQLite Python Fallback Pathing**: Fixed an issue where the Python SQLite fallback would fail if the IDE directory contained spaces (e.g., `Antigravity IDE`). Used `execFile` with piped standard input to securely execute queries.
- **New IDE Chat DOM Locator**: Updated `ui_locators.js` to correctly locate the active chat container (`.relative.flex.flex-col.gap-y-3.px-4`) in the newer VS Code-based Antigravity IDE, preventing `/latest` from incorrectly reporting "Active chat not found".## [3.5.5] - 2026-06-27

### Fixed
- **CDP Connection Failed — No Longer Requires PC Restart**: Fixed a persistent issue where the bot would report "CDP connection failed" after the IDE was closed or crashed. The root cause was stale Electron `SingletonLock` files left behind in the IDE's data directory, preventing the next instance from properly initializing its debugging port. Both `killIDE()` and `cleanLockFile()` in `platform.js` now automatically clean up `SingletonLock`, `SingletonCookie`, and `SingletonSocket` files.
  > 💡 **If you encounter "CDP connection failed"**: Run `/close_ide` (or `/close_ag`) followed by `/start_ide` (or `/start_ag`) from Telegram. This will clean up stale lock files and restart the IDE with a fresh CDP connection — no PC restart needed.

## [3.5.0] - 2026-06-11

### Added
- **Standalone App Support**: Introduced full support for Standalone Antigravity App via new DOM traversal and workspace switching strategies.
- **Watchdog Monitoring**: Replaced direct `npm start` execution with a robust `watchdog.js` process monitor that automatically detects crash loops and force-restarts frozen bots.
- **Dynamic Model Retrieval**: The `/model` command now dynamically fetches the list of available AI models directly from the UI, removing the need to update the bot when new models are released.
- **Heartbeat Mechanism**: Added a `.heartbeat` file to ensure the bot is actively running and responsive, managed by the new Watchdog.
- **Windows Start/Stop Scripts**: Added `start_bot.bat` and `stop_bot.bat` helper scripts for easier management on Windows.

### Changed
- **Auto-Update Architecture**: The `/update` command now uses a safer `git stash` + `git merge` strategy instead of `git reset --hard`, protecting local modifications while intelligently merging remote updates.

### Fixed
- **Standalone App DOM Locators**: Fallback selectors added to `ui_locators.js` to ensure the bot can successfully interact with newer versions of the Standalone App.
- **Locales Sync**: Updated and validated all 309 translation keys across `en`, `tr`, `de`, `es`, and `fr` locales.

## [3.4.0] - 2026-06-07

### Added
- **Goal Mode** (`/goal <task>`): Send autonomous long-running goals to the IDE agent via the native `/goal` slash command. The agent works independently until the task is complete.
- **Plan Mode** (`/plan <task>`): Generate an implementation plan before coding via the native `/plan` slash command.
- **Schedule Task** (`/schedule_task <task>`): Schedule recurring or one-time tasks in the IDE via the native `/schedule` slash command.
- **TaskWatcher (Proactive Notifications)**: New `task_watcher.js` module monitors the agent's `transcript.jsonl` for unsolicited messages (timer callbacks, sub-agent completions) and forwards them to Telegram as 🔔 notifications.
- **Message Reactions**: Shows 🤔 thinking reaction on user messages during processing, clears on completion.
- **Agent Modes in `/help`**: New "🎯 Agent Modes" section added to help text across all 5 languages.
- **Goal vs Turbo Comparison Table**: All 5 README files now include a detailed comparison between Goal Mode and Turbo Mode.
- **TR Acknowledgments Section**: Added missing acknowledgments and credits section to the Turkish README.

### Fixed
- **`/help` HTML Parse Error**: Fixed Telegram `Bad Request: can't parse entities` error caused by `<task>` being interpreted as HTML tags. Escaped with `&lt;` / `&gt;` across all 5 locales.
- **TaskWatcher False Positives**: Added `USER_INPUT` detection and 10-second busy→idle cooldown to prevent the bot's own responses from being treated as proactive notifications.
- **TaskWatcher Whitespace Cleanup**: Added `\n{3+}` compression to prevent excessive blank lines in forwarded notifications.

### Removed
- **`/browser` Command**: Removed the `/browser` command from handler, menu, all locales, and READMEs — unnecessary since the agent opens the browser itself when needed.

### Changed
- **Acknowledgments**: Added [mine260309](https://github.com/mine260309) (Lei YU) for PR #7 — i18n translations for hardcoded messages.
- **Architecture Docs**: Added `task_watcher.js` to the architecture section of all 5 READMEs.
- **GitHub Repo Description**: Updated to "Antigravity Telegram bot — remote-control your AI agent via Telegram."

## [3.3.1] - 2026-06-03

### Fixed
- **`/agents` Multi-Window Thread Collection**: Rewrote `listAgentThreads` to collect threads from ALL open IDE windows instead of returning from the first one. The history popup shows global recent threads, so workspaces with only older conversations were invisible.
- **Home Screen Thread Extraction**: Added a new extraction path that reads workspace-specific threads directly from the Agent panel's home screen (`button.group.cursor-pointer` inside `.antigravity-agent-side-panel`), catching threads that are too old to appear in the popup.
- **Workspace Name Normalization**: Fixed underscore/hyphen mismatch (e.g. `Dertli_Orman` vs `Dertli Orman`) in `resolveTargets` and `sendViaCDP` by normalizing with `replace(/[-_]/g, ' ')`.
- **`/latest` Workspace Scoping**: When no active chat window exists in the current workspace, the bot now returns a proper i18n warning instead of silently falling back to another workspace's conversation.

### Changed
- **i18n Convention Enforced**: All new UI strings must be added to all 5 locale files (`en`, `tr`, `de`, `es`, `fr`) simultaneously. Added `latest.not_found_active` key across all locales.

## [3.3.0] - 2026-06-03

### Added
- **Expanded Language Support**: The bot now officially supports 5 languages: English, Türkçe, Deutsch (German), Español (Spanish), and Français (French).
- **Dynamic Language Menu**: The `/lang` command automatically detects and offers all available `locales/*.json` translation files.

### Fixed
- **Complete Localization Audit (Phase 2)**: Eliminated all remaining hardcoded Turkish fallback strings scattered across the codebase.
- **Turbo Mode i18n**: The `/turbo` orchestration engine (Phase 1, 2, 3, etc. progress messages) is now fully translatable.
- **CDP Controller i18n**: Hardcoded UI elements like "Quota remaining" or internal console logs have been refactored to use English fallbacks and translation keys.


## [3.2.1] - 2026-05-28

### Fixed
- **Launcher Shortcuts**: Fixed a critical bug in the Linux desktop launcher scripts (`antigravity-ide-launcher.sh` and `antigravity-standalone-launcher.sh`) where opening a new window would aggressively kill existing IDE/Agent processes and the Telegram bot, causing ungraceful exits and chat history loss.
- **Fix Shortcuts Command**: Updated the internal template of the `/fix_shortcuts` bot command to generate the new, safe launcher scripts.
  > ⚠️ **IMPORTANT**: If you have previously used the `/fix_shortcuts` command, please run it again. An important bug has been discovered in the previously generated scripts.
## [3.2.0] - 2026-05-28

### Added
- **Interactive Modals via Inline Keyboards**: The IDE agent's interactive components (like multiple-choice questions or permission requests) are now fully bridged to Telegram natively. The user receives these choices as embedded Inline Keyboard buttons beneath the message, and responses are seamlessly forwarded back to the agent without disrupting the normal conversation flow or main menu.

### Changed
- **Bot Response Formatting**: Interactive questions no longer rely on clunky 'Reply Keyboards' and instead use modern inline buttons with the full text of the option embedded directly on the button.

## [3.1.1] - 2026-05-25

### Fixed
- **macOS Graceful Exit**: Replaced Unix `pkill -15` with `osascript -e 'quit app ...'` for smoother app shutdown and reliable `state.vscdb` persistence on macOS.
- **macOS Shortcut Support**: The `/fix_shortcuts` command now correctly supports macOS, generating `.app` launchers using `osacompile`.
- **Latest Command Truncation**: Removed the erroneous fallback to DOM extraction in `/latest` when encountering `<truncated \d+ bytes>`, fixing the issue of empty responses in Antigravity 2.0.
- **IDE Workspace Button**: Fixed the 🤖 menu button mistakenly triggering the Agents menu in IDE mode; it now correctly triggers the Workspace menu.
- **Agent QuickPick Selection**: Improved the `/agent` switch command to dispatch `mousedown`/`mouseup` events in the IDE, fixing the issue where it got stuck on the "Select where to open the conversation" popup.

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
