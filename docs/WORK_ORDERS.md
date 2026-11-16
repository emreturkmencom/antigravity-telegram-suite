# Work Orders

Give specialist Antigravity agents jobs from Telegram — or from external orchestrators (Claude Code, cron jobs, CI scripts) — and get structured results back automatically in Telegram and on disk.

A **desk** is a persistent specialist agent for one kind of job (for example `comments`, `video-qa`, `security-audit`, or `weekly-report`). Each desk has its own folder (`desks/wo-<desk>/`), its own `AGENT.md` for instructions and long-term memory, and its own `desk.json` settings (approval policy, default AI model, active thread). Like a teammate dedicated to one domain, each desk accumulates context over time in `AGENT.md`.

## Use it from Telegram

Send `/wo` to open the interactive Work Orders panel:

- **➕ New desk** walks you through creating a specialist desk step by step:
  1. **Name** — Free text is fine: `"Yorum Masası"` becomes `yorum-masasi`.
  2. **Instructions** — Role, rules, and output conventions written into `AGENT.md`.
  3. **Approval** — Choose whether orders run automatically (`⚡ Auto`) or wait for your confirmation in Telegram (`🔒 Approve`).
- **✉️ New order:** Pick a desk, then send the job as a message (multi-line text is supported).
- **🗂 Desks:** Open any desk to:
  - Send a new order (`✉️ Send order`)
  - Edit its `AGENT.md` instructions (`✏️ Edit instructions`)
  - Toggle approval mode (`⚡ Auto` / `🔒 Approve`)
  - Pick the desk's default AI model (`🤖 Model` — presets or custom model name, or reset to app default)
  - Read its latest result (`📄 Last result`) or archive the desk (`🗄 Archive` moves it safely to `archive/`, nothing is deleted)
- **📊 Status:** View orders waiting for approval, queued, or currently running, plus recent completed/failed results.

### Quick Shortcuts

- `/wo <desk> <order text>` — Send an order in a single message.
- `/wo <desk> --model "Gemini 3.8 Flash (Low)" <order text>` — Override the AI model for just this order.
- `/wo_stop` — Abort currently running work order(s) and stop agent generation.
- `/cancel` — Exit any multi-step `/wo` creation prompt.

When an order finishes, the result is delivered directly to Telegram. If a desk is set to `telegram` approval, **Approve / Reject** buttons appear first.

## Backends & Setup (`standalone` vs `ide`)

Work Orders is enabled by default and creates `<PROJECTS_DIR>/.agts-work-orders/` on first start (dot-prefixed so `/workspace` keeps your normal project list clean).

It supports two execution backends via `WORK_ORDERS_BACKEND` (when unset, it automatically follows `ANTIGRAVITY_PREFERRED_APP`: `ide` if `ANTIGRAVITY_PREFERRED_APP=ide`, otherwise `standalone`):

1. **`standalone` (Single-Window Sequential — default when `ANTIGRAVITY_PREFERRED_APP=agent`)**
   - Runs on the **Antigravity Standalone App** (`AGENT_CDP_PORT`, default `9333`).
   - **Non-collision guard:** Waits until your active Standalone session has been idle for `WORK_ORDERS_IDLE_SEC` (default `60`s) before starting an order, queues incoming user Telegram messages while the order runs, and **restores both your previous chat thread and your original AI model** as soon as the queue drains.
2. **`ide` (Parallel Multi-Window — default when `ANTIGRAVITY_PREFERRED_APP=ide`)**
   - Runs on **Antigravity IDE 2.6+** (`IDE_CDP_PORT`, default `9334`).
   - Opens each desk in its own isolated IDE window (up to `WORK_ORDERS_MAX_WINDOWS` concurrent windows), allowing **multiple different desks to execute in parallel**.
   - **Zero chat blocking:** Your normal Telegram chat (for example on Standalone port `9333` or another IDE window) stays completely unblocked while IDE work orders run in the background.
   - **Auto-close idle windows:** Once a desk finishes and has no queued orders waiting for it, its IDE window automatically closes after `WORK_ORDERS_IDLE_CLOSE_MIN` minutes (default `3`; set `0` to close immediately after completion).

```env
# WORK_ORDERS_ENABLED=false        # on by default; set false to turn it off
# WORK_ORDERS_BACKEND=             # auto from ANTIGRAVITY_PREFERRED_APP ('ide' | 'standalone'), or set explicitly
# WORK_ORDERS_DIR=~/Projects/.agts-work-orders
# WORK_ORDERS_DEFAULT_MODEL=       # optional global fallback model for work orders
# WORK_ORDERS_IDLE_SEC=60          # standalone: seconds of user inactivity required before starting
# WORK_ORDERS_MAX_WINDOWS=3        # ide: max desk windows open at once (~1–1.5 GB RAM each)
# WORK_ORDERS_IDLE_CLOSE_MIN=3     # ide: close idle desk windows after N min (0 = immediate)
# WORK_ORDERS_TIMEOUT_MIN=60       # default per-order timeout in minutes
```

## AI Model Selection (3-Tier Priority)

Different desks benefit from different models (for example a fast, low-cost Flash model for triage/formatting vs. Claude Opus or Gemini Pro High for deep code review). For every order, the target model is resolved in this priority order:

1. **Per-order override:** `model:` in the order's YAML frontmatter, or `--model "..."` in `/wo <desk> --model "..." <text>`.
2. **Per-desk default:** `model` saved in `desks/wo-<desk>/desk.json` (set via `/wo` → **🗂 Desks** → `<desk>` → **🤖 Model**).
3. **Global fallback:** `WORK_ORDERS_DEFAULT_MODEL` in `.env` (if unset, the app's currently active model is kept).

## How an Order Runs

1. **Queued in `inbox/`:** The order markdown file is created in `inbox/` and moved to `running/` (if `approval: telegram`, it waits for your button press before execution).
2. **Desk session & model prepared:**
   - In **`ide`** mode, the bot opens (or reuses) the desk's dedicated IDE window, switches to the target model if configured, and injects the prompt with `[AGTS Work Order <id>]`.
   - In **`standalone`** mode, once user chat is idle, the bot snapshots your current workspace/thread and active model, switches to the desk workspace (`wo-<desk>`), reuses or creates the desk's thread, selects the target model, and injects the prompt.
3. **Agent writes result file:** The agent executes the task and writes `results/<id>.md` starting with `STATUS: done` or `STATUS: failed`.
4. **Delivery & cleanup:** Once `results/<id>.md` (and any `expects:` artifact) stabilizes, the result is sent to Telegram, the order moves to `done/` or `failed/`, and Standalone restores your prior session/model (or IDE schedules idle window close).

### Scheduling Rules

- **One order per desk at a time:** Orders targeting the same desk run FIFO. In `ide` mode, orders targeting *different* desks run concurrently up to `WORK_ORDERS_MAX_WINDOWS`.
- **Window eviction & queued-order protection (`ide` mode):** When `WORK_ORDERS_MAX_WINDOWS` is reached, the longest-idle finished window without a queued order is closed to free a slot. Busy windows and windows with queued orders are never evicted.
- **Crash/restart safety:** If the bot restarts while an order is in `running/`, that order is marked `failed` (`bot_restarted`) rather than blindly re-executing side effects.

## Orders from Scripts & External Orchestrators

External agents (such as Claude Code acting as a manager), cron jobs, or webhooks can dispatch jobs without touching Telegram APIs by dropping a `.md` file into `<WORK_ORDERS_DIR>/inbox/`. Write to a temporary filename first (e.g. `.tmp-<id>.md` outside or hidden) and atomically rename into `inbox/<id>.md` so the watcher never reads a partial file:

```markdown
---
desk: comments                        # required
model: Gemini 3.8 Flash (Low)         # optional: overrides desk & global model
approval: auto                        # optional: auto | telegram (default: desk setting)
timeout: 30                           # optional, minutes
mode: plain                           # optional: plain | goal | plan
expects: out/replies.json             # optional: wait for this file too (relative to desk)
---
New user comments were exported to /home/me/exports/comments.json.
Draft a helpful reply for each item and write the JSON array to out/replies.json.
```

## Folder Layout

```text
.agts-work-orders/
  inbox/                     drop new .md orders here
  running/                   currently executing or awaiting Telegram approval
  done/  failed/             archived order specs after completion
  results/                   agent output (<order-id>.md with STATUS: done|failed)
  desks/wo-<desk>/AGENT.md   desk role, instructions, and persistent Project Memory
  desks/wo-<desk>/desk.json  desk settings (approval, model, threadId)
  archive/                   archived desks
  history.json  state.json
```
