// AGTS Work Orders — parent side, runs inside the main bot. On by default
// (WORK_ORDERS_ENABLED=false turns it off). Creates <PROJECTS_DIR>/.agts-work-orders,
// forks runner.js with the agent-panel UI driver (see runner.js), relays its notifications to Telegram and
// owns every Telegram interaction: /wo panel, flows, approve/reject buttons
// (only one process may poll a bot token, so all Telegram I/O stays here).

const path = require('path');
const { fork } = require('child_process');
const { Markup } = require('telegraf');
const desks = require('./desks');
const { registerWorkOrdersUI } = require('./telegram');
const { s } = require('./strings');

const DEFAULT_RESTART_RESET_MS = 10 * 60 * 1000;

function startWorkOrders(bot, chatIds, options = {}) {
    if (process.env.WORK_ORDERS_ENABLED === 'false') return null;

    const {
        forkFn = fork,
        now = Date.now,
        setTimeoutFn = setTimeout,
        restartResetMs = DEFAULT_RESTART_RESET_MS,
    } = options || {};

    const dir = desks.defaultDir();
    try {
        desks.ensureLayout(dir);
    } catch (e) {
        console.error(`[work-orders] cannot create ${dir}: ${e.message} — Work Orders disabled`);
        return null;
    }

    let child = null;
    let restarts = 0;
    let stopped = false;
    let reqSeq = 0;
    const pending = new Map(); // requestId -> resolve

    const activeOrders = new Map(); // orderId -> { id, desk }
    const queuedUserMessages = [];
    let userMessageProcessor = null;
    let lastUserActivityAt = 0;
    const getBackend = () => desks.resolveBackend(process.env);

    const send = async (msg) => {
        const extra = msg.buttons && msg.buttons.length
            ? Markup.inlineKeyboard(msg.buttons.map(b => Markup.button.callback(b.text, b.data)))
            : {};
        for (const chatId of chatIds) {
            await bot.telegram.sendMessage(chatId, msg.text.slice(0, 4000), extra).catch(e => console.error('[work-orders] notify failed:', e.message));
        }
    };

    const request = (msg) => new Promise((resolve) => {
        if (!child || !child.connected) return resolve(null);
        const requestId = ++reqSeq;
        pending.set(requestId, resolve);
        child.send({ ...msg, requestId });
        setTimeout(() => { if (pending.delete(requestId)) resolve(null); }, 10000);
    });

    const flushQueue = async () => {
        if (!userMessageProcessor) return;
        while (queuedUserMessages.length > 0) {
            const item = queuedUserMessages.shift();
            try {
                await userMessageProcessor(item);
            } catch (e) {
                console.error('[work-orders] failed to process queued user message:', e.message);
            }
        }
    };

    const spawn = () => {
        const backend = getBackend();
        const spawnedAt = now();
        child = forkFn(path.join(__dirname, 'runner.js'), [], {
            env: {
                ...process.env,
                ANTIGRAVITY_PREFERRED_APP: process.env.WORK_ORDERS_UI_DRIVER || (backend === 'ide' ? 'ide' : 'agent'),
                WORK_ORDERS_DIR: dir,
                WORK_ORDERS_BACKEND: backend,
                WORK_ORDERS_RUNNER: '1',
            },
        });
        if (lastUserActivityAt > 0) {
            child.send({ type: 'user_activity', timestamp: lastUserActivityAt });
        }
        child.on('message', (msg) => {
            if (!msg || typeof msg !== 'object') return;
            if (msg.type === 'notify') return send(msg);
            if (msg.type === 'order_started') {
                if (msg.order && msg.order.id) activeOrders.set(msg.order.id, msg.order);
                return;
            }
            if (msg.type === 'order_finished') {
                if (msg.order && msg.order.id) activeOrders.delete(msg.order.id);
                else activeOrders.clear();
                if (activeOrders.size === 0) flushQueue().catch(() => {});
                return;
            }
            const resolve = pending.get(msg.requestId);
            if (resolve) { pending.delete(msg.requestId); resolve(msg); }
        });
        child.on('exit', (code) => {
            child = null;
            activeOrders.clear();
            flushQueue().catch(() => {});
            if (stopped) return;
            if (now() - spawnedAt >= restartResetMs) {
                restarts = 0;
            }
            if (restarts >= 5) {
                send({ text: `❌ Work orders runner stopped (exit ${code}) after 5 restarts. Check the bot logs.` });
                return;
            }
            restarts += 1;
            setTimeoutFn(spawn, 5000 * restarts);
        });
    };
    spawn();

    bot.action(/^wo:(a|r):([0-9a-f]{10})$/, async (ctx) => {
        const approved = ctx.match[1] === 'a';
        const res = await request({ type: 'approval', shortId: ctx.match[2], approved });
        const order = res && res.order;
        await ctx.answerCbQuery(order ? (approved ? 'Approved' : 'Rejected') : 'Order not waiting for approval').catch(() => {});
        if (order) {
            await ctx.editMessageReplyMarkup(undefined).catch(() => {});
            await ctx.reply(`${approved ? '✅ Approved' : '❌ Rejected'}: ${order.id} (desk ${order.desk})`).catch(() => {});
        }
    });

    bot.command('wo_stop', async (ctx) => {
        if (activeOrders.size === 0) {
            return ctx.reply(s('no_running_order'));
        }
        await ctx.reply(s('wo_stopping'));
        const res = await request({ type: 'stop_order' });
        if (res && res.stopped) {
            await ctx.reply(s('wo_stopped'));
        } else {
            await ctx.reply(s('wo_stop_failed'));
        }
    });

    registerWorkOrdersUI(bot, { dir });

    return {
        dir,
        stop: () => { stopped = true; restarts = 99; if (child) child.kill(); },
        isOrderRunning: () => activeOrders.size > 0,
        shouldQueueUserChat: () => getBackend() === 'standalone' && activeOrders.size > 0,
        getActiveOrder: () => activeOrders.values().next().value || null,
        queueUserMessage: (msg) => { queuedUserMessages.push(msg); },
        recordUserActivity: () => {
            lastUserActivityAt = Date.now();
            if (child && child.connected) {
                child.send({ type: 'user_activity', timestamp: lastUserActivityAt });
            }
        },
        setMessageProcessor: (fn) => { userMessageProcessor = fn; },
        getQueuedCount: () => queuedUserMessages.length,
        stopActiveOrder: () => request({ type: 'stop_order' }),
    };
}

module.exports = { startWorkOrders };
