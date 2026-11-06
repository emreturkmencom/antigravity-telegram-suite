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

function startWorkOrders(bot, chatIds) {
    if (process.env.WORK_ORDERS_ENABLED === 'false') return null;

    const dir = desks.defaultDir();
    try {
        desks.ensureLayout(dir);
    } catch (e) {
        console.error(`[work-orders] cannot create ${dir}: ${e.message} — Work Orders disabled`);
        return null;
    }

    let child = null;
    let restarts = 0;
    let reqSeq = 0;
    const pending = new Map(); // requestId -> resolve

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

    const spawn = () => {
        child = fork(path.join(__dirname, 'runner.js'), [], {
            env: { ...process.env, ANTIGRAVITY_PREFERRED_APP: process.env.WORK_ORDERS_UI_DRIVER || 'agent', WORK_ORDERS_DIR: dir },
        });
        child.on('message', (msg) => {
            if (!msg || typeof msg !== 'object') return;
            if (msg.type === 'notify') return send(msg);
            const resolve = pending.get(msg.requestId);
            if (resolve) { pending.delete(msg.requestId); resolve(msg); }
        });
        child.on('exit', (code) => {
            child = null;
            if (restarts >= 5) {
                send({ text: `❌ Work orders runner stopped (exit ${code}) after 5 restarts. Check the bot logs.` });
                return;
            }
            restarts += 1;
            setTimeout(spawn, 5000 * restarts);
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

    registerWorkOrdersUI(bot, { dir });

    return { dir, stop: () => { restarts = 99; if (child) child.kill(); } };
}

module.exports = { startWorkOrders };
