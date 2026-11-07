// AGTS Work Orders — child process, forked by work_orders/index.js.
// Backend:
// - 'standalone' (default): Runs work orders in the Antigravity Standalone App (CDP 9333).
//   One order runs at a time. Each desk is a workspace + single dedicated chat thread (threadId in desk.json).
//   Restores user chat after order finishes; queues user messages during order execution.
// - 'ide': Runs each desk as its own Antigravity IDE window (CDP 9334).

const CDP = require('chrome-remote-interface');
const {
    resolveTargets,
    sendViaCDP,
    getFullLatestResponse,
    isAgentWorking,
    getActiveThreadInfo,
    switchStandaloneWorkspace,
    switchAgentThread,
    triggerNewChat,
    dismissPopups,
    stopAgent,
} = require('../cdp_controller');
const { launchIDE } = require('../platform');
const { ensureMemoryConvention } = require('../memory_convention');
const { WorkOrders } = require('./core');
const { deskFolderName, defaultDir, readDeskConfig, writeDeskConfig } = require('./desks');
const { s } = require('./strings');

const BACKEND = (process.env.WORK_ORDERS_BACKEND || 'standalone').toLowerCase();
const isStandalone = BACKEND === 'standalone';

const port = isStandalone
    ? parseInt(process.env.AGENT_CDP_PORT || process.env.DEBUGGING_PORT || '9333', 10)
    : parseInt(process.env.IDE_CDP_PORT || '9334', 10);

const dir = defaultDir();
const num = (v, d) => (Number.isFinite(parseInt(v, 10)) && parseInt(v, 10) > 0 ? parseInt(v, 10) : d);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const notify = (msg) => { if (process.send) process.send({ type: 'notify', ...msg }); };

let lastUserMessageAt = 0;

function flattenForChat(text) {
    return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).join(' | ');
}

const AGENT_ERROR_RE = /terminated due to error|Agent terminated|Error ID:/i;

// ==================== IDE BACKEND ====================
async function listDeskWindows() {
    let targets = [];
    try { targets = await resolveTargets(port, false); } catch (_) { return []; }
    const out = [];
    for (const t of targets) {
        const m = (t.title || '').match(/(?:^|\s-\s)wo-([a-z0-9][a-z0-9._-]*)(?:\s-\s|$)/);
        if (m) out.push({ desk: m[1], targetId: t.id, ws: t.webSocketDebuggerUrl });
    }
    return out;
}

async function findPanel(win) {
    let raw;
    try { raw = JSON.parse(await (await fetch(`http://127.0.0.1:${port}/json`)).text()); } catch (_) { return null; }
    const parent = new Map(raw.map(t => [t.id, t.parentId]));
    for (const t of raw) {
        if (!/extensionView=true/.test(t.url || '')) continue;
        let p = parent.get(t.id);
        for (let hops = 0; p && hops < 5; hops++) {
            if (p === win.targetId) return t.id;
            p = parent.get(p);
        }
    }
    return null;
}

async function withPanel(win) {
    for (let i = 0; i < 40; i++) {
        const panelId = await findPanel(win);
        if (panelId) return { ...win, panelId };
        await sleep(1500);
    }
    throw new Error(`agent panel of desk "${win.desk}" did not load within 60 s (Antigravity IDE 2.6+ required)`);
}

async function openDeskWindow(desk, deskDir) {
    const existing = (await listDeskWindows()).find(w => w.desk === desk);
    if (existing) return withPanel(existing);
    await launchIDE(deskDir, port, 'ide');
    for (let i = 0; i < 40; i++) {
        await sleep(1500);
        const w = (await listDeskWindows()).find(x => x.desk === desk);
        if (w) {
            const ready = await withPanel(w);
            await sleep(4000); // let the panel finish rendering before typing
            return ready;
        }
    }
    throw new Error(`IDE window for desk "${desk}" (${deskFolderName(desk)}) did not appear within 60 s`);
}

async function sendToWindow(win, text) {
    await sendViaCDP(flattenForChat(text), port, win.panelId || win.targetId);
}

async function checkAgent(win) {
    const id = win.panelId || win.targetId;
    let lastText = '';
    try {
        const r = await getFullLatestResponse(port, id);
        lastText = typeof r === 'string' ? r : (r && r.text) || '';
    } catch (_) { return { working: true }; }
    return { working: !AGENT_ERROR_RE.test(lastText), lastText };
}

async function closeWindow(win) {
    try {
        const client = await CDP({ target: win.ws });
        await client.Runtime.evaluate({ expression: 'window.close()' });
        await client.close();
    } catch (e) {
        console.log(`[work-orders] close ${win.desk} failed: ${e.message}`);
    }
}

// ==================== STANDALONE BACKEND ====================
async function openStandaloneDesk(desk, deskDir) {
    // 1. Record current active thread and workspace before switching
    let originalThread = null;
    try {
        originalThread = await getActiveThreadInfo(port);
    } catch (e) {
        console.debug('[work-orders] failed to read active thread info before switch:', e.message);
    }

    // 2. Switch workspace to desk's folder
    const wsName = deskFolderName(desk);
    await switchStandaloneWorkspace(port, wsName, deskDir);
    await sleep(1500);

    // 3. Check desk.json for persistent threadId
    const cfg = readDeskConfig(dir, desk);
    let threadId = cfg.threadId || null;
    let switched = false;

    if (threadId) {
        try {
            const res = await switchAgentThread(port, null, wsName, threadId);
            if (res) {
                await sleep(1200);
                const info = await getActiveThreadInfo(port);
                if (info && info.id === threadId) {
                    switched = true;
                }
            }
        } catch (e) {
            console.debug('[work-orders] switch to desk thread failed:', e.message);
        }
    }

    if (!switched) {
        if (threadId) {
            notify({ text: s('thread_lost_new', { desk }) });
        }
        await triggerNewChat(port);
        await sleep(1500);
        threadId = null;
    }

    // 4. Dismiss popups
    await dismissPopups(port).catch(() => {});

    return {
        desk,
        deskDir,
        port,
        originalThread,
        threadId,
        isNewThread: !switched,
    };
}

async function sendToStandaloneWindow(win, text) {
    await dismissPopups(win.port).catch(() => {});
    await sendViaCDP(flattenForChat(text), win.port);

    // If new thread or threadId not yet saved in desk.json, capture it
    if (win.isNewThread || !win.threadId) {
        for (let i = 0; i < 8; i++) {
            await sleep(1000);
            try {
                const info = await getActiveThreadInfo(win.port);
                if (info && info.id) {
                    win.threadId = info.id;
                    win.isNewThread = false;
                    const cfg = readDeskConfig(dir, win.desk);
                    cfg.threadId = info.id;
                    writeDeskConfig(dir, win.desk, cfg);
                    break;
                }
            } catch (_) {}
        }
    }
}

async function checkStandaloneAgent(win) {
    let lastText = '';
    try {
        const r = await getFullLatestResponse(win.port);
        lastText = typeof r === 'string' ? r : (r && r.text) || '';
    } catch (_) { return { working: true }; }
    return { working: !AGENT_ERROR_RE.test(lastText), lastText };
}

async function afterStandaloneOrder(order, win) {
    if (!win || !win.originalThread) return;
    const { id, name, workspace } = win.originalThread;
    if (!id && !workspace) return;

    let restored = false;
    try {
        if (id) {
            const res = await switchAgentThread(win.port, name, workspace, id);
            if (res) {
                await sleep(1000);
                const info = await getActiveThreadInfo(win.port);
                if (info && info.id === id) {
                    restored = true;
                }
            }
        } else if (workspace) {
            await switchStandaloneWorkspace(win.port, workspace);
            restored = true;
        }
    } catch (e) {
        console.debug('[work-orders] failed to restore chat:', e.message);
    }

    if (!restored) {
        notify({ text: s('cant_return_chat') });
    }
}

async function canDispatchStandalone(order) {
    // Condition 1: Standalone'da agent çalışmıyor (isAgentWorking false)
    const working = await isAgentWorking(port).catch(() => false);
    if (working) return false;

    // Condition 2: the user sent no message to the agent via Telegram in the last
    // WORK_ORDERS_IDLE_SEC seconds (default 60), so an order never cuts into a live chat.
    const idleMs = num(process.env.WORK_ORDERS_IDLE_SEC, 60) * 1000;
    if (lastUserMessageAt > 0 && (Date.now() - lastUserMessageAt) < idleMs) {
        return false;
    }

    return true;
}

const deps = isStandalone ? {
    listDeskWindows: async () => [],
    openDeskWindow: (desk, deskDir) => openStandaloneDesk(desk, deskDir),
    sendToWindow: (win, text) => sendToStandaloneWindow(win, text),
    closeWindow: async () => {},
    checkAgent: (win) => checkStandaloneAgent(win),
    stopAgent: async () => { await stopAgent(port).catch(() => {}); },
    canDispatch: (order) => canDispatchStandalone(order),
    afterOrder: (order, win) => afterStandaloneOrder(order, win),
    onOrderStarted: (order) => {
        if (process.send) process.send({ type: 'order_started', order: { id: order.id, desk: order.desk } });
    },
    onOrderFinished: (order) => {
        if (process.send) process.send({ type: 'order_finished', order: { id: order.id, desk: order.desk, status: order.status } });
    },
    notify,
    sleep,
    ensureDeskMemory: (p) => ensureMemoryConvention(p, { force: true }),
} : {
    listDeskWindows,
    openDeskWindow,
    sendToWindow,
    closeWindow,
    checkAgent,
    stopAgent: async () => {},
    onOrderStarted: (order) => {
        if (process.send) process.send({ type: 'order_started', order: { id: order.id, desk: order.desk } });
    },
    onOrderFinished: (order) => {
        if (process.send) process.send({ type: 'order_finished', order: { id: order.id, desk: order.desk, status: order.status } });
    },
    notify,
    sleep,
    ensureDeskMemory: (p) => ensureMemoryConvention(p, { force: true }),
};

const wo = new WorkOrders({
    dir,
    deps,
    options: {
        maxConcurrent: isStandalone ? 1 : null,
        maxWindows: num(process.env.WORK_ORDERS_MAX_WINDOWS, 3),
        idleCloseMin: num(process.env.WORK_ORDERS_IDLE_CLOSE_MIN, 15),
        timeoutMin: num(process.env.WORK_ORDERS_TIMEOUT_MIN, 60),
    },
});

process.on('message', async (msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'approval') {
        const order = wo.approve(msg.shortId, msg.approved);
        if (process.send) process.send({ type: 'approval_result', requestId: msg.requestId, order: order ? { id: order.id, desk: order.desk, status: order.status } : null });
    } else if (msg.type === 'status') {
        if (process.send) process.send({ type: 'status_result', requestId: msg.requestId, text: wo.statusText() });
    } else if (msg.type === 'user_activity') {
        lastUserMessageAt = msg.timestamp || Date.now();
    } else if (msg.type === 'stop_order') {
        const stopped = wo.stopActiveOrder('stopped by user via /wo_stop');
        if (process.send) process.send({
            type: 'stop_order_result',
            requestId: msg.requestId,
            stopped: !!stopped,
            order: stopped ? { id: stopped.id, desk: stopped.desk } : null,
        });
    }
});

const exit = () => process.exit(0);
process.on('SIGTERM', exit);
process.on('SIGINT', exit);
process.on('disconnect', exit);

let ticking = false;
setInterval(async () => {
    if (ticking) return;
    ticking = true;
    try { await wo.tick(); } catch (e) { console.error('[work-orders] tick error:', e.message); }
    ticking = false;
}, num(process.env.WORK_ORDERS_POLL_SEC, 10) * 1000);

console.log(`[work-orders] runner started: backend=${BACKEND}, dir=${dir}, CDP port=${port}`);
