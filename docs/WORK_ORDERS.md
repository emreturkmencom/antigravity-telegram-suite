# Work Orders

Give Antigravity jobs from scripts, cron or other tools, without typing them in Telegram,
and still see every result in Telegram.

A **work order** is a markdown file. A **desk** is a folder with its own `AGENT.md`, and it
opens in its own Antigravity IDE window. Each kind of recurring job gets its own desk,
for example `comments`, `video-qa` or `weekly-report`. That desk's agent keeps its rules
and what it has learned in its `AGENT.md`, the same way a person keeps one chat per topic.

Work Orders are off by default.

## Enable

```env
WORK_ORDERS_ENABLED=true
IDE_CDP_PORT=9334            # the Antigravity IDE must be installed
# WORK_ORDERS_DIR=~/agts-work-orders
# WORK_ORDERS_MAX_WINDOWS=3
# WORK_ORDERS_IDLE_CLOSE_MIN=15
# WORK_ORDERS_TIMEOUT_MIN=60
```

Restart the bot. Work Orders runs as a child process that uses the **IDE** driver.
Your normal Telegram chat keeps using `ANTIGRAVITY_PREFERRED_APP` as before.

## Write an order

Save a file such as `~/agts-work-orders/inbox/2026-11-06-comments.md`:

```markdown
---
desk: comments          # required: lowercase letters, digits, . _ -
approval: auto          # auto | telegram (Telegram shows Approve / Reject buttons)
timeout: 30             # minutes (default WORK_ORDERS_TIMEOUT_MIN)
mode: plain             # plain | goal | plan (goal/plan send as /goal or /plan)
expects: out/replies.json   # optional: also wait for this file (path relative to the desk)
---
The new comments are in /home/me/exports/comments.json.
Draft a reply for each one, following the rules in AGENT.md,
and write them to out/replies.json.
```

The file name without `.md` becomes the order id.

## What happens

1. **Pick-up.** The bot moves the order from `inbox/` to `running/`. If the order says `approval: telegram`, it waits for your button press.
2. **Desk set-up.** The desk folder `desks/wo-<desk>/` is created on first use. It gets a starter `AGENT.md` and the memory block, so the agent records what it learns there.
3. **Window.** The desk opens as its own IDE window, or the bot reuses that window if it is already open.
4. **Sending.** The bot sends the order with a header, `[AGTS Work Order <id>]`. It tells the agent to write its answer to `results/<id>.md`, and that file's first line must be `STATUS: done` or `STATUS: failed`.
5. **Finishing.** When that file appears and stops changing, the bot sends the result to Telegram and moves the order to `done/` or `failed/`.

Scheduling rules:

- **One desk, one order.** Each desk runs one order at a time. Different desks run in parallel.
- **Window limit.** At most `WORK_ORDERS_MAX_WINDOWS` desk windows stay open. When the limit is hit, the desk window that has been idle longest is closed to make room. A desk that is still working is never closed.
- **Idle close.** A desk window closes after `WORK_ORDERS_IDLE_CLOSE_MIN` idle minutes. Its `AGENT.md` and chat history stay on disk.
- **Bot restart.** If the bot restarts while an order is running, that order is marked failed and is not sent again. Nobody can know what the agent had already done, so you decide whether to re-run it.

`/wo` in Telegram shows what is waiting, queued and running.

## Folder layout

```
~/agts-work-orders/
  inbox/        drop orders here
  running/      orders being worked on (or waiting for approval)
  done/ failed/ archived orders
  results/      <id>.md written by the agent
  desks/wo-<desk>/AGENT.md   desk rules + memory
  state.json
```

## Tips

- Put the standing instructions of a desk in its `AGENT.md` under *Desk instructions*. Keep the order itself short.
- **Code changes.** An order that changes code in another project should say where that project is. The desk rules already tell the agent to read that project's `AGENT.md` first. Use `approval: telegram` for these orders.
- **Memory.** Every Antigravity IDE window uses about 1–1.5 GB of RAM. Keep `WORK_ORDERS_MAX_WINDOWS` low on laptops.
