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
    verifyChatMessageSent,
    getFullLatestResponse,
    isAgentWorking,
    getActiveThreadInfo,
    switchStandaloneWorkspace,
    switchAgentThread,
    triggerNewChat,
    dismissPopups,
    stopAgent,
    selectModel,
    getCurrentModel,
} = require('../cdp_controller');
const { launchIDE } = require('../platform');
const { ensureIDETargetsObserver } = require('../autoaccept');
const { STANDALONE_LOCATORS_SCRIPT } = require('../locators/standalone_locators');
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
const numNonNeg = (v, d) => {
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : d;
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const notify = (msg) => { if (process.send) process.send({ type: 'notify', ...msg }); };

let lastUserMessageAt = 0;

function flattenForChat(text) {
    return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).join(' | ');
}

function extractVerificationSnippet(flattenedText) {
    const cleaned = String(flattenedText || '').replace(/^\/(goal|plan)\s+/i, '').trim();
    const headerMatch = cleaned.match(/^(\[AGTS Work Order [^\]]+\])/);
    if (headerMatch) return headerMatch[1];
    const firstSegment = cleaned.split(' | ')[0] || cleaned;
    return firstSegment.slice(0, 64).trim();
}

const AGENT_ERROR_RE = /terminated due to error|Agent terminated|Error ID:/i;

// ==================== IDE BACKEND ====================
async function listDeskWindows() {
    let targets = [];
    try { targets = await resolveTargets(port, false); } catch (_) { return []; }
    const out = [];
    for (const t of targets) {
        const wsFromUri = t.workspaceName || '';
        const candidateStr = `${wsFromUri} - ${t.title || ''}`;
        const m = candidateStr.match(/(?:^|\s-\s)wo-([a-z0-9][a-z0-9._-]*)(?:\s-\s|$)/);
        if (m && !out.some(x => x.targetId === t.id)) {
            out.push({ desk: m[1], targetId: t.id, ws: t.webSocketDebuggerUrl });
        }
    }
    return out;
}

async function findPanel(win) {
    let raw;
    try { raw = JSON.parse(await (await fetch(`http://127.0.0.1:${port}/json`)).text()); } catch (_) { return null; }
    const parent = new Map(raw.map(t => [t.id, t.parentId]));
    for (const t of raw) {
        const url = t.url || '';
        if (!/extensionView=true/.test(url)) continue;
        if (/\/(settings(?:-standalone)?|customizations)(?:[/?#]|$)/i.test(url)) continue;
        let p = parent.get(t.id);
        for (let hops = 0; p && hops < 5; hops++) {
            if (p === win.targetId) return { id: t.id, ws: t.webSocketDebuggerUrl };
            p = parent.get(p);
        }
    }
    return null;
}

async function isPanelComposerReady(wsUrl) {
    if (!wsUrl) return false;
    let client;
    try {
        client = await CDP({ target: wsUrl });
        await client.Runtime.enable();
        const r = await client.Runtime.evaluate({
            expression: `(() => {
                ${STANDALONE_LOCATORS_SCRIPT}
                try { AG_UI.dismissConsentModals && AG_UI.dismissConsentModals(); } catch (_) {}
                return !!AG_UI.getChatInput();
            })()`,
            returnByValue: true,
        });
        await client.close();
        return !!(r && r.result && r.result.value);
    } catch (_) {
        try { if (client) await client.close(); } catch (_) {}
        return false;
    }
}

async function withPanel(win) {
    for (let i = 0; i < 40; i++) {
        const panel = await findPanel(win);
        if (panel && await isPanelComposerReady(panel.ws)) {
            if (process.env.WORK_ORDERS_IDE_AUTOACCEPT !== 'false') {
                await ensureIDETargetsObserver(port, [win.ws, panel.ws]).catch(() => {});
            }
            return { ...win, panelId: panel.id, panelWs: panel.ws };
        }
        await sleep(1500);
    }
    throw new Error(`agent panel composer of desk "${win.desk}" did not become ready within 60 s (Antigravity IDE 2.6+ required)`);
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
            await sleep(500); // brief settle after Lexical composer mounts
            if (process.env.WORK_ORDERS_IDE_AUTOACCEPT !== 'false') {
                await ensureIDETargetsObserver(port, [ready.ws, ready.panelWs]).catch(() => {});
            }
            return ready;
        }
    }
    throw new Error(`IDE window for desk "${desk}" (${deskFolderName(desk)}) did not appear within 60 s`);
}

async function sendToWindow(win, text) {
    const targetId = win.panelId || win.targetId;
    const flattened = flattenForChat(text);
    const snippet = extractVerificationSnippet(flattened);

    await dismissPopups(port, targetId).catch(() => {});
    await sendViaCDP(flattened, port, targetId);

    if (snippet) {
        let verified = false;
        for (let i = 0; i < 8; i++) {
            await sleep(750);
            if (await verifyChatMessageSent(port, snippet, null, targetId).catch(() => false)) {
                verified = true;
                break;
            }
        }
        if (!verified) {
            // One retry if cold-opened extensionView swallowed focus on first attempt
            await dismissPopups(port, targetId).catch(() => {});
            await sendViaCDP(flattened, port, targetId);
            for (let i = 0; i < 8; i++) {
                await sleep(750);
                if (await verifyChatMessageSent(port, snippet, null, targetId).catch(() => false)) {
                    verified = true;
                    break;
                }
            }
        }
        if (!verified) {
            throw new Error(`work order message did not appear in IDE desk "${win.desk}" panel after sending`);
        }
    }
}

async function checkAgent(win) {
    const id = win.panelId || win.targetId;
    if (process.env.WORK_ORDERS_IDE_AUTOACCEPT !== 'false') {
        await ensureIDETargetsObserver(port, [win.ws, win.panelWs]).catch(() => {});
    }
    let lastText = '';
    try {
        const r = await getFullLatestResponse(port, id);
        lastText = typeof r === 'string' ? r : (r && r.text) || '';
    } catch (_) { return { working: true }; }
    if (AGENT_ERROR_RE.test(lastText)) return { working: false, lastText };
    const working = await isAgentWorking(port, id).catch(() => true);
    return { working: working || !lastText.trim(), lastText };
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

async function selectWindowModel(win, modelName) {
    if (!modelName) return;
    const targetId = (win && (win.panelId || win.targetId)) || null;
    try {
        const ok = await selectModel(port, modelName, targetId);
        if (!ok) console.warn(`[work-orders] selectModel("${modelName}") did not match on desk "${win && win.desk}"`);
    } catch (e) {
        console.warn(`[work-orders] selectModel("${modelName}") error: ${e.message}`);
    }
}

// ==================== STANDALONE BACKEND ====================
function createStandaloneHandlers({
    dir: baseDir = dir,
    port: cdpPort = port,
    getActiveThreadInfo: getThreadInfo = getActiveThreadInfo,
    switchStandaloneWorkspace: switchWorkspace = switchStandaloneWorkspace,
    switchAgentThread: switchThread = switchAgentThread,
    triggerNewChat: openNewChat = triggerNewChat,
    dismissPopups: clearPopups = dismissPopups,
    sendViaCDP: sendPrompt = sendViaCDP,
    verifyChatMessageSent: verifyMessage = verifyChatMessageSent,
    getFullLatestResponse: getLatestResponse = getFullLatestResponse,
    selectModel: chooseModel = selectModel,
    getCurrentModel: readModel = getCurrentModel,
    notify: notifyFn = notify,
    sleep: sleepFn = sleep,
    verifyAttempts = 12,
    verifyIntervalMs = 1000,
} = {}) {
    let lastOriginalThread = null;
    let lastOriginalModel = null;

    async function openStandaloneDesk(desk, deskDir) {
        // 1. Record current active thread and workspace before switching
        let originalThread = null;
        try {
            originalThread = await getThreadInfo(cdpPort);
        } catch (e) {
            console.debug('[work-orders] failed to read active thread info before switch:', e.message);
        }
        lastOriginalThread = originalThread;

        // 2. Switch workspace to desk's folder
        const wsName = deskFolderName(desk);
        await switchWorkspace(cdpPort, wsName, deskDir);
        await sleepFn(1500);

        // 3. Check desk.json for persistent threadId
        const cfg = readDeskConfig(baseDir, desk);
        const previousDeskThreadId = cfg.threadId || null;
        let threadId = previousDeskThreadId;
        let switched = false;

        if (threadId) {
            try {
                const res = await switchThread(cdpPort, null, wsName, threadId);
                if (res) {
                    await sleepFn(1200);
                    const info = await getThreadInfo(cdpPort);
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
                notifyFn({ text: s('thread_lost_new', { desk }) });
            }
            await openNewChat(cdpPort, wsName);
            await sleepFn(1500);

            // Verify we actually left any previous conversation before typing
            const staleIds = new Set([originalThread?.id, previousDeskThreadId].filter(Boolean));
            if (staleIds.size > 0) {
                let postNewInfo = null;
                try { postNewInfo = await getThreadInfo(cdpPort); } catch (_) {}
                if (postNewInfo && postNewInfo.id && staleIds.has(postNewInfo.id)) {
                    await switchWorkspace(cdpPort, wsName, deskDir);
                    await sleepFn(1000);
                    await openNewChat(cdpPort, wsName);
                    await sleepFn(1200);
                    try { postNewInfo = await getThreadInfo(cdpPort); } catch (_) {}
                    if (postNewInfo && postNewInfo.id && staleIds.has(postNewInfo.id)) {
                        throw new Error(`new chat could not be opened for desk "${desk}" (active thread remained ${postNewInfo.id})`);
                    }
                }
            }
            threadId = null;
        }

        // 4. Dismiss popups
        await clearPopups(cdpPort).catch(() => {});

        return {
            desk,
            deskDir,
            port: cdpPort,
            originalThread,
            previousDeskThreadId,
            threadId,
            isNewThread: !switched,
        };
    }

    async function sendToStandaloneWindow(win, text) {
        const targetPort = (win && win.port) || cdpPort;
        await clearPopups(targetPort).catch(() => {});
        const flattened = flattenForChat(text);
        const snippet = extractVerificationSnippet(flattened);
        await sendPrompt(flattened, targetPort);

        const staleIds = new Set([win.originalThread?.id, win.previousDeskThreadId].filter(Boolean));
        const expectNewThread = Boolean(win.isNewThread || !win.threadId);
        let verifiedThreadId = null;
        let verifiedMessage = false;
        let lastSeenThreadId = null;

        for (let i = 0; i < verifyAttempts; i++) {
            await sleepFn(verifyIntervalMs);
            try {
                const info = await getThreadInfo(targetPort);
                const currentId = info && info.id ? info.id : null;
                if (currentId) lastSeenThreadId = currentId;

                const threadOk = expectNewThread
                    ? Boolean(currentId && !staleIds.has(currentId))
                    : Boolean(currentId && currentId === win.threadId);

                if (!threadOk) continue;
                verifiedThreadId = currentId;

                const msgOk = await verifyMessage(targetPort, snippet, currentId);
                if (msgOk) {
                    verifiedMessage = true;
                    break;
                }
            } catch (_) {}
        }

        if (!verifiedThreadId) {
            const detail = lastSeenThreadId
                ? `active thread remained ${lastSeenThreadId}`
                : 'no new conversation ID was created';
            throw new Error(`chat thread verification failed on desk "${win.desk}": ${detail}`);
        }

        if (!verifiedMessage) {
            throw new Error(`sent work order message did not appear in chat ${verifiedThreadId} on desk "${win.desk}"`);
        }

        if (expectNewThread) {
            win.threadId = verifiedThreadId;
            win.isNewThread = false;
            const cfg = readDeskConfig(baseDir, win.desk);
            cfg.threadId = verifiedThreadId;
            writeDeskConfig(baseDir, win.desk, cfg);
        }
    }

    async function checkStandaloneAgent(win) {
        const targetPort = (win && win.port) || cdpPort;
        let lastText = '';
        try {
            const r = await getLatestResponse(targetPort);
            lastText = typeof r === 'string' ? r : (r && r.text) || '';
        } catch (_) { return { working: true }; }
        return { working: !AGENT_ERROR_RE.test(lastText), lastText };
    }

    async function selectStandaloneModel(win, modelName) {
        if (!modelName) return;
        const targetPort = (win && win.port) || cdpPort;
        try {
            const cur = await readModel(targetPort);
            if (cur) {
                lastOriginalModel = cur;
                if (win) win.originalModel = cur;
            }
        } catch (_) {}
        try {
            const ok = await chooseModel(targetPort, modelName);
            if (!ok) console.warn(`[work-orders] standalone selectModel("${modelName}") did not match`);
        } catch (e) {
            console.warn(`[work-orders] standalone selectModel("${modelName}") error: ${e.message}`);
        }
    }

    async function afterStandaloneOrder(order, win) {
        const orig = (win && win.originalThread) || lastOriginalThread;
        const origModel = (win && win.originalModel) || lastOriginalModel;
        lastOriginalThread = null;
        lastOriginalModel = null;
        const targetPort = (win && win.port) || cdpPort;

        if (orig && (orig.id || orig.workspace)) {
            const { id, name, workspace } = orig;
            let restored = false;
            try {
                if (id) {
                    const res = await switchThread(targetPort, name, workspace, id);
                    if (res) {
                        await sleepFn(1000);
                        const info = await getThreadInfo(targetPort);
                        if (info && info.id === id) {
                            restored = true;
                        }
                    }
                } else if (workspace) {
                    await switchWorkspace(targetPort, workspace);
                    restored = true;
                }
            } catch (e) {
                console.debug('[work-orders] failed to restore chat:', e.message);
            }

            if (!restored) {
                notifyFn({ text: s('cant_return_chat') });
            }
        }

        if (origModel && order && order.model && origModel.toLowerCase() !== order.model.toLowerCase()) {
            try {
                await chooseModel(targetPort, origModel);
            } catch (_) {}
        }
    }

    return {
        openStandaloneDesk,
        selectStandaloneModel,
        sendToStandaloneWindow,
        checkStandaloneAgent,
        afterStandaloneOrder,
    };
}

const standaloneHandlers = createStandaloneHandlers();
const {
    openStandaloneDesk,
    selectStandaloneModel,
    sendToStandaloneWindow,
    checkStandaloneAgent,
    afterStandaloneOrder,
} = standaloneHandlers;

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

if (require.main === module) {
    const deps = isStandalone ? {
        listDeskWindows: async () => [],
        openDeskWindow: (desk, deskDir) => openStandaloneDesk(desk, deskDir),
        selectModel: (win, modelName) => selectStandaloneModel(win, modelName),
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
        selectModel: selectWindowModel,
        sendToWindow,
        closeWindow,
        checkAgent,
        stopAgent: async (order) => {
            if (!order || !order.desk) return;
            const win = (await listDeskWindows()).find(w => w.desk === order.desk);
            if (!win) return;
            const panel = await findPanel(win);
            await stopAgent(port, (panel && panel.id) || win.targetId).catch(() => {});
        },
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
            idleCloseMin: numNonNeg(process.env.WORK_ORDERS_IDLE_CLOSE_MIN, 3),
            timeoutMin: num(process.env.WORK_ORDERS_TIMEOUT_MIN, 60),
            defaultModel: process.env.WORK_ORDERS_DEFAULT_MODEL || null,
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
}

module.exports = {
    createStandaloneHandlers,
    flattenForChat,
    extractVerificationSnippet,
};
