# Work Orders

Give your Antigravity agents jobs from Telegram, then get the results back in Telegram.

A **desk** is one agent for one kind of job, for example `comments`, `video-qa` or
`weekly-report`. Each desk has its own folder and `AGENT.md` for rules and memory, and it
runs in its own Antigravity IDE window. Like a person who keeps one chat per topic, each
desk keeps its own context, and the agent records what it learns in its `AGENT.md`.

## Use it from Telegram

Send `/wo` to open the panel:

- **➕ New desk** walks you through it, step by step:
  1. **Name.** Free text is fine: "Yorum Masası" becomes `yorum-masasi`.
  2. **Instructions.** What this agent does and the rules it follows.
  3. **Approval.** Choose whether orders run automatically or wait for you to approve them in Telegram.
- **✉️ New order:** pick a desk, then send the job as a message. Several lines are fine.
- **🗂 Desks:** open a desk to send an order, edit its instructions, switch approval, see its last result, or archive it. Archiving moves the desk folder to `archive/`; nothing is deleted.
- **📊 Status:** what is waiting, queued or running, plus the last few results.

Shortcut: `/wo <desk> <order text>` sends an order in one message.

When an order finishes, the result arrives in the chat. If the desk asks for approval,
Approve / Reject buttons appear first. `/cancel` stops any step-by-step flow.

## Setup

Work Orders is on by default and needs the **Antigravity IDE** (`IDE_CDP_PORT`, default 9334).
On first start the bot creates `<PROJECTS_DIR>/.agts-work-orders/`. `/workspace` hides
folders whose names start with a dot, so this one stays out of your project list.

```env
# WORK_ORDERS_ENABLED=false        # turn it off
# WORK_ORDERS_DIR=~/Projects/.agts-work-orders
# WORK_ORDERS_MAX_WINDOWS=3        # desk windows open at once (~1–1.5 GB RAM each)
# WORK_ORDERS_IDLE_CLOSE_MIN=15    # close idle desk windows
# WORK_ORDERS_TIMEOUT_MIN=60       # default per-order timeout
```

Work Orders runs as a child process that uses the **IDE** driver. Your normal Telegram chat
keeps using `ANTIGRAVITY_PREFERRED_APP` as before.

## How an order runs

1. **The order is saved.** The order is written to `inbox/` and then moved to `running/`. If the desk asks for approval, it waits there for your button press.
2. **The desk window opens.** The desk window opens, or the bot reuses it if it is already open. The order is sent to its agent with the header `[AGTS Work Order <id>]`.
3. **The agent writes its answer.** The agent writes its answer to `results/<id>.md`. The first line is `STATUS: done` or `STATUS: failed`.
4. **The result is sent to you.** When that file stops changing, the result goes to Telegram and the order is moved to `done/` or `failed/`.

Scheduling rules:

- **One order per desk.** A desk runs one order at a time. Different desks run in parallel.
- **Window limit.** At most `WORK_ORDERS_MAX_WINDOWS` desk windows are open at once. When the limit is hit, the desk window that has been idle longest is closed. A desk that is still working is never closed.
- **Idle windows close.** Idle desk windows close after `WORK_ORDERS_IDLE_CLOSE_MIN` minutes. A desk's `AGENT.md` and chat history stay on disk.
- **Restarts.** If the bot restarts while an order is running, that order is marked failed and is not sent again.

## Orders from scripts

Scripts and cron jobs can send orders too. Drop a markdown file into `inbox/`. Write it to a temporary name first, then rename it, so the bot never reads a half-written file:

```markdown
---
desk: comments          # required
approval: auto          # optional: auto | telegram (default: the desk's setting)
timeout: 30             # optional, minutes
mode: plain             # optional: plain | goal | plan
expects: out/replies.json   # optional: also wait for this file (relative to the desk)
---
The new comments are in /home/me/exports/comments.json.
Draft a reply for each one and write them to out/replies.json.
```

## Folder layout

```
.agts-work-orders/
  inbox/  running/  done/  failed/  results/
  desks/wo-<desk>/AGENT.md   desk rules, instructions and memory
  desks/wo-<desk>/desk.json  desk settings (approval)
  archive/                   archived desks
  history.json  state.json
```
