// AGTS Work Orders — child process, forked by work_orders/index.js. Talks to the
// parent only over IPC. Desks open as Antigravity IDE windows; since IDE 2.6 the
// agent panel inside each window is the same web UI as the standalone app,
// served in an iframe (http://127.0.0.1:<port>/?extensionView=true). The parent
// therefore forks this process with the standalone ('agent') UI driver, and
// orders are typed into that iframe, found through the target parentId chain.

const CDP = require('chrome-remote-interface');
const { resolveTargets, sendViaCDP, getFullLatestResponse } = require('../cdp_controller');
const { launchIDE } = require('../platform');
const { ensureMemoryConvention } = require('../memory_convention');
const { WorkOrders } = require('./core');
const { deskFolderName, defaultDir } = require('./desks');

const port = parseInt(process.env.IDE_CDP_PORT || '9334', 10);
const dir = defaultDir(); // parent passes WORK_ORDERS_DIR; default <PROJECTS_DIR>/.agts-work-orders
const num = (v, d) => (Number.isFinite(parseInt(v, 10)) && parseInt(v, 10) > 0 ? parseInt(v, 10) : d);

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const notify = (msg) => { if (process.send) process.send({ type: 'notify', ...msg }); };

// IDE window titles look like "<file> - <folder> - Antigravity"; desk folders are
// named wo-<desk>, so the folder segment identifies the desk.
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

// The agent panel iframe that belongs to this window: walk each iframe's
// parentId chain up to the window's page target.
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

// The chat input drops newlines (Input.insertText), which glued the result path
// to the next word ("<id>.mdFirst line"). Send one line with visible separators.
function flattenForChat(text) {
    return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).join(' | ');
}

async function sendToWindow(win, text) {
    await sendViaCDP(flattenForChat(text), port, win.panelId || win.targetId);
}

// Used by core to notice an agent that stopped without writing its result.
// isAgentWorking() is not reliable on the IDE 2.6 panel (it reported idle while
// the panel showed "Working"), so an order is only treated as stalled when the
// agent's last message is an explicit error; otherwise it runs to its timeout.
const AGENT_ERROR_RE = /terminated due to error|Agent terminated|Error ID:/i;

async function checkAgent(win) {
    const id = win.panelId || win.targetId;
    let lastText = '';
    try {
        const r = await getFullLatestResponse(port, id);
        lastText = typeof r === 'string' ? r : (r && r.text) || '';
    } catch (_) { return { working: true }; }
    return { working: !AGENT_ERROR_RE.test(lastText), lastText };
}

// window.close() lets Electron flush chat history to disk; same reasoning as
// cdp_controller.closeWindow, but aimed at one specific target.
async function closeWindow(win) {
    try {
        const client = await CDP({ target: win.ws });
        await client.Runtime.evaluate({ expression: 'window.close()' });
        await client.close();
    } catch (e) {
        console.log(`[work-orders] close ${win.desk} failed: ${e.message}`);
    }
}

const wo = new WorkOrders({
    dir,
    deps: {
        listDeskWindows,
        openDeskWindow,
        sendToWindow,
        closeWindow,
        checkAgent,
        notify,
        sleep,
        ensureDeskMemory: (p) => ensureMemoryConvention(p, { force: true }),
    },
    options: {
        maxWindows: num(process.env.WORK_ORDERS_MAX_WINDOWS, 3),
        idleCloseMin: num(process.env.WORK_ORDERS_IDLE_CLOSE_MIN, 15),
        timeoutMin: num(process.env.WORK_ORDERS_TIMEOUT_MIN, 60),
    },
});

process.on('message', (msg) => {
    if (!msg || typeof msg !== 'object') return;
    if (msg.type === 'approval') {
        const order = wo.approve(msg.shortId, msg.approved);
        if (process.send) process.send({ type: 'approval_result', requestId: msg.requestId, order: order ? { id: order.id, desk: order.desk, status: order.status } : null });
    } else if (msg.type === 'status') {
        if (process.send) process.send({ type: 'status_result', requestId: msg.requestId, text: wo.statusText() });
    }
});

// platform.js registers SIGTERM/SIGINT handlers that only clean up caffeinate and
// do not exit, so without these the runner would survive child.kill() and linger
// as an orphan after every bot restart. Also exit when the parent goes away.
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

console.log(`[work-orders] runner started: dir=${dir}, IDE port=${port}`);
