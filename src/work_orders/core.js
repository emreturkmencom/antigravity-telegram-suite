// AGTS Work Orders — core scheduler (no CDP / Telegram here; everything external
// is injected so the logic can be tested with fakes).
//
// Flow: a markdown file dropped into <dir>/inbox/ becomes an order. Each order
// names a "desk" (a folder under <dir>/desks/ with its own AGENT.md). The desk is
// opened as its own IDE window, the order is sent to that window's agent, and the
// order is done when the agent writes the result file named in the prompt.
// One order runs per desk at a time; at most `maxWindows` desk windows stay open;
// idle desk windows are closed (AGENT.md + chat history stay on disk).

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const desks = require('./desks');

const DEFAULTS = {
    maxWindows: 3,
    idleCloseMin: 15,
    timeoutMin: 60,
    pollSec: 10,
    resultSettleMs: 5000,
};

function parseOrder(text) {
    const meta = {};
    let body = text;
    const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
    if (m) {
        for (const line of m[1].split(/\r?\n/)) {
            const kv = line.match(/^\s*([A-Za-z_]+)\s*:\s*(.*?)\s*(#.*)?$/);
            if (kv) meta[kv[1].toLowerCase()] = kv[2].replace(/^["']|["']$/g, '');
        }
        body = text.slice(m[0].length);
    }
    body = body.trim();

    const desk = (meta.desk || '').toLowerCase();
    if (!desks.DESK_RE.test(desk)) throw new Error(`invalid or missing "desk" (got "${meta.desk || ''}"); use lowercase letters, digits, . _ -`);
    if (!body) throw new Error('empty order body');

    // null = not set in the order: the desk's own default (desk.json) decides.
    const approval = meta.approval ? meta.approval.toLowerCase() : null;
    if (approval && !['auto', 'telegram'].includes(approval)) throw new Error(`approval must be auto or telegram (got "${meta.approval}")`);

    const mode = (meta.mode || 'plain').toLowerCase();
    if (!['plain', 'goal', 'plan'].includes(mode)) throw new Error(`mode must be plain, goal or plan (got "${meta.mode}")`);

    const timeoutMin = meta.timeout ? parseInt(meta.timeout, 10) : null;
    if (meta.timeout && !(timeoutMin > 0)) throw new Error(`timeout must be minutes > 0 (got "${meta.timeout}")`);

    return { desk, approval, mode, timeoutMin, expects: meta.expects || null, body };
}

class WorkOrders {
    constructor({ dir, deps, options = {} }) {
        this.dir = dir;
        this.deps = deps; // { listDeskWindows, openDeskWindow, sendToWindow, closeWindow, notify, ensureDeskMemory, now }
        this.opt = { ...DEFAULTS, ...options };
        this.orders = new Map(); // id -> order record
        this.deskState = new Map(); // desk -> { busyWith, lastActive }
        this.running = new Set();
        desks.ensureLayout(dir);
        this.statePath = path.join(dir, 'state.json');
        this._loadState();
    }

    now() {
        return this.deps.now ? this.deps.now() : Date.now();
    }

    _loadState() {
        try {
            const st = JSON.parse(fs.readFileSync(this.statePath, 'utf8'));
            for (const o of st.orders || []) this.orders.set(o.id, o);
        } catch (_) { /* first run */ }
        // An order "running" when the runner died cannot be resumed safely: we do
        // not know what the agent did. Fail it loudly instead of re-sending.
        for (const o of this.orders.values()) {
            if (o.status === 'running') this._finish(o, 'failed', 'runner restarted while the order was running', false);
        }
    }

    _saveState() {
        const live = [...this.orders.values()].filter(o => ['awaiting_approval', 'queued', 'running'].includes(o.status));
        fs.writeFileSync(this.statePath, JSON.stringify({ orders: live }, null, 2));
    }

    deskPath(desk) {
        return desks.deskPath(this.dir, desk);
    }

    resultPath(id) {
        return path.join(this.dir, 'results', `${id}.md`);
    }

    ensureDesk(desk) {
        return desks.ensureDesk(this.dir, desk, { ensureMemory: this.deps.ensureDeskMemory });
    }

    // Pick up new files from inbox/.
    scanInbox() {
        const inbox = path.join(this.dir, 'inbox');
        const files = fs.readdirSync(inbox).filter(f => f.endsWith('.md')).sort();
        for (const f of files) {
            const id = f.slice(0, -3).replace(/[^A-Za-z0-9._-]/g, '_');
            if (this.orders.has(id) && this.orders.get(id).status !== 'done' && this.orders.get(id).status !== 'failed') continue;
            const src = path.join(inbox, f);
            let parsed;
            try {
                parsed = parseOrder(fs.readFileSync(src, 'utf8'));
            } catch (e) {
                fs.renameSync(src, path.join(this.dir, 'failed', `${id}.md`));
                this.deps.notify({ text: `❌ Work order ${id} rejected: ${e.message}` });
                continue;
            }
            if (!parsed.approval) parsed.approval = desks.readDeskConfig(this.dir, parsed.desk).approval || 'auto';
            const finalId = this.orders.has(id) ? `${id}-${this.now()}` : id;
            const runningFile = path.join(this.dir, 'running', `${finalId}.md`);
            fs.renameSync(src, runningFile);
            const order = {
                id: finalId,
                shortId: crypto.createHash('sha1').update(finalId).digest('hex').slice(0, 10),
                file: runningFile,
                ...parsed,
                status: parsed.approval === 'telegram' ? 'awaiting_approval' : 'queued',
                createdAt: this.now(),
            };
            this.orders.set(finalId, order);
            if (order.status === 'awaiting_approval') {
                const preview = order.body.length > 700 ? order.body.slice(0, 700) + '…' : order.body;
                this.deps.notify({
                    text: `📝 Work order ${order.id} → desk ${order.desk} needs approval:\n\n${preview}`,
                    buttons: [
                        { text: '✅ Approve', data: `wo:a:${order.shortId}` },
                        { text: '❌ Reject', data: `wo:r:${order.shortId}` },
                    ],
                });
            }
        }
        this._saveState();
    }

    approve(shortId, approved) {
        const order = [...this.orders.values()].find(o => o.shortId === shortId);
        if (!order || order.status !== 'awaiting_approval') return null;
        if (approved) {
            order.status = 'queued';
            this._saveState();
        } else {
            this._finish(order, 'failed', 'rejected on Telegram');
        }
        return order;
    }

    _desk(desk) {
        if (!this.deskState.has(desk)) this.deskState.set(desk, { busyWith: null, lastActive: 0 });
        return this.deskState.get(desk);
    }

    // Start every queued order whose desk is free and whose window fits the budget.
    async dispatch() {
        const queued = [...this.orders.values()].filter(o => o.status === 'queued').sort((a, b) => a.createdAt - b.createdAt);
        for (const order of queued) {
            const ds = this._desk(order.desk);
            if (ds.busyWith) continue;
            const open = await this.deps.listDeskWindows();
            const isOpen = open.some(w => w.desk === order.desk);
            if (!isOpen && open.length >= this.opt.maxWindows) {
                const victim = this._idleVictim(open);
                if (!victim) continue; // every open desk is busy — wait
                await this.deps.closeWindow(victim);
                this._desk(victim.desk).lastActive = 0;
            }
            ds.busyWith = order.id;
            order.status = 'running';
            order.startedAt = this.now();
            this._saveState();
            const p = this._runOrder(order).finally(() => this.running.delete(p));
            this.running.add(p);
        }
    }

    _idleVictim(open) {
        const idle = open.filter(w => !this._desk(w.desk).busyWith);
        idle.sort((a, b) => this._desk(a.desk).lastActive - this._desk(b.desk).lastActive);
        return idle[0] || null;
    }

    buildPrompt(order) {
        const resultFile = this.resultPath(order.id);
        const prefix = order.mode === 'goal' ? '/goal ' : order.mode === 'plan' ? '/plan ' : '';
        return `${prefix}[AGTS Work Order ${order.id}]
Read AGENT.md in this workspace first; it holds this desk's rules.

${order.body}

When you are done, write your final answer to: ${resultFile}
First line: "STATUS: done" or "STATUS: failed". Write it even if the order failed.`;
    }

    async _runOrder(order) {
        const ds = this._desk(order.desk);
        try {
            const deskDir = this.ensureDesk(order.desk);
            const win = await this.deps.openDeskWindow(order.desk, deskDir);
            await this.deps.sendToWindow(win, this.buildPrompt(order));
            this.deps.notify({ text: `▶️ Work order ${order.id} started on desk ${order.desk}.` });

            const timeoutMs = (order.timeoutMin || this.opt.timeoutMin) * 60000;
            const result = await this._waitForResult(order, timeoutMs);
            if (!result) {
                this._finish(order, 'failed', `no result file after ${Math.round(timeoutMs / 60000)} min`);
                return;
            }
            const failed = /^STATUS:\s*failed/i.test(result.trim());
            this._finish(order, failed ? 'failed' : 'done', null, true, result);
        } catch (e) {
            this._finish(order, 'failed', e.message);
        } finally {
            ds.busyWith = null;
            ds.lastActive = this.now();
        }
    }

    async _waitForResult(order, timeoutMs) {
        const deadline = this.now() + timeoutMs;
        const resultFile = this.resultPath(order.id);
        const expects = order.expects
            ? (path.isAbsolute(order.expects) ? order.expects : path.join(this.deskPath(order.desk), order.expects))
            : null;
        let lastSize = -1;
        while (this.now() < deadline) {
            if (fs.existsSync(resultFile) && (!expects || fs.existsSync(expects))) {
                const size = fs.statSync(resultFile).size;
                // The agent may still be writing: accept once the size stops changing.
                if (size > 0 && size === lastSize) return fs.readFileSync(resultFile, 'utf8');
                lastSize = size;
            }
            await this.deps.sleep(this.opt.resultSettleMs);
        }
        return null;
    }

    _finish(order, status, reason, notify = true, result = null) {
        order.status = status;
        order.finishedAt = this.now();
        order.reason = reason || null;
        const dest = path.join(this.dir, status === 'done' ? 'done' : 'failed', `${order.id}.md`);
        try {
            if (fs.existsSync(order.file)) fs.renameSync(order.file, dest);
            order.file = dest;
        } catch (_) { /* keep going: state is what matters */ }
        this._saveState();
        try {
            desks.appendHistory(this.dir, { id: order.id, desk: order.desk, status, reason: order.reason, finishedAt: new Date(order.finishedAt).toISOString() });
        } catch (_) { /* history is best-effort */ }
        if (!notify) return;
        if (status === 'done') {
            const text = (result || '').trim();
            const clipped = text.length > 3000 ? text.slice(0, 3000) + '\n…' : text;
            this.deps.notify({ text: `✅ Work order ${order.id} (desk ${order.desk}) done:\n\n${clipped}` });
        } else {
            const text = result ? `\n\n${result.trim().slice(0, 2000)}` : '';
            this.deps.notify({ text: `❌ Work order ${order.id} (desk ${order.desk}) failed: ${reason || 'agent reported failure'}${text}` });
        }
    }

    async closeIdleWindows() {
        const open = await this.deps.listDeskWindows();
        const limit = this.opt.idleCloseMin * 60000;
        for (const w of open) {
            const ds = this._desk(w.desk);
            if (ds.busyWith) continue;
            // lastActive 0 = a desk window we never used in this run (e.g. left open
            // before a restart): treat as idle since now, not as idle forever.
            if (!ds.lastActive) { ds.lastActive = this.now(); continue; }
            if (this.now() - ds.lastActive >= limit) {
                await this.deps.closeWindow(w);
                ds.lastActive = 0;
            }
        }
    }

    async tick() {
        this.scanInbox();
        await this.dispatch();
        await this.closeIdleWindows();
    }

    statusText() {
        const live = [...this.orders.values()].filter(o => ['awaiting_approval', 'queued', 'running'].includes(o.status));
        if (!live.length) return 'Work orders: nothing queued or running.';
        return 'Work orders:\n' + live.map(o => `• ${o.id} — ${o.desk} — ${o.status}`).join('\n');
    }
}

module.exports = { WorkOrders, parseOrder, DEFAULTS };
