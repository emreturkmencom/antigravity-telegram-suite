# Antigravity Telegram Suite - Professional SaaS Web GUI Dashboard

## 1. Executive Summary & Design Vision
The **Antigravity Telegram Suite Web GUI Dashboard** is transformed into a high-end, SaaS-grade management console inspired by modern developer platforms (Linear, Vercel, Supabase).

It features:
- **Primary Operational Hub (Dashboard & Logs Tab)**: Instant real-time view of system health, active sessions, live Telegram prompt executions, and color-coded streaming logs.
- **Dedicated Log Explorer Tab**: Full-screen terminal inspection with regex search, tag filtering (`SYS`, `BOT`, `CDP`, `WATCHER`, `ERROR`), and stack trace diagnostics.
- **Telegram Interaction Timeline Tab**: Rich user profile cards, prompt execution timelines, and status badges.
- **Playground & Interactive Diagnostics Tab**: Live CDP reconnection, manual model switching, screenshot viewing, and health ping.
- **Settings & Config Manager Tab**: Clean tabbed SaaS settings panel with sensitive token masking, real-time `.env` validation, and hot reload.

---

## 2. Information Architecture & Navigation

```
+-----------------------------------------------------------------------------------------------+
| HEADER: App Identity | CDP IDE Status | CDP Agent Status | Bot Status | Reconnect | Restart   |
+-----------------------------------------------------------------------------------------------+
| SIDEBAR NAVIGATION     | TAB CONTENT AREA                                                    |
|                        |                                                                      |
| [⚡ Dashboard & Logs]   |  • Top KPI Cards (Uptime, Memory RSS/Heap, Active Users, CDP Health) |
|   (Primary View)       |  • Dual Stream: Live Telegram Interactions + Realtime Terminal Logs  |
|                        |  • Error Sticky Banner with Diagnostic Insights                      |
|                        |                                                                      |
| [📜 Log Explorer]      |  • Full-Screen Terminal Inspector with autoscroll lock               |
|                        |  • Severity & Tag Filters, Export logs to JSON/Text                  |
|                        |                                                                      |
| [👥 Telegram Activity] |  • Detailed Timeline Cards of User Interactions & Prompts            |
|                        |  • Status progression (Queued -> Thinking -> Streaming -> Done)      |
|                        |                                                                      |
| [🛠️ Tools & Play]      |  • Live Test Error Generator                                         |
|                        |  • Manual CDP Bridge Reconnection Trigger                            |
|                        |  • Bot Process Soft/Hard Restart Trigger                             |
|                        |                                                                      |
| [⚙️ Settings]          |  • Sub-sections: Core Connection, Bot Auth, AI Mode, Cloud Sync      |
|                        |  • Form Input Masking & Direct .env Synchronization                  |
+------------------------+----------------------------------------------------------------------+
```

---

## 3. Implementation Roadmap

### Phase 1: SaaS Layout & Tab Navigation
- Redesign `src/web/public/index.html` with a modern dark-mode sidebar, breadcrumbs, responsive drawer for mobile, and smooth tab switching.
- Ensure the default active tab on launch is the **Dashboard & Logs** primary operational view.

### Phase 2: Enhanced Log Explorer & Interactive Tools
- Add dedicated full-screen Log Explorer view with export capability and live counter badges.
- Add interactive testing triggers (test error emit, CDP reconnect ping).

### Phase 3: Categorized Settings Management
- Organize settings into clean sub-groups (General / Ports, Telegram Bot & Auth, AI Modes, Cloud Sync).
- Implement password visibility toggles and toast notifications.

### Phase 4: Automated Testing & Validation
- Ensure all tests pass via `npm test` and i18n keys are fully maintained via `npm run i18n:validate`.
