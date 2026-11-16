// Telegram UI for Work Orders: /wo panel, desk management and guided flows
// (new desk, new order, edit instructions) — everything without touching the PC.
// All state lives in files (desks.js); the runner picks orders up from inbox/.

const { Markup } = require('telegraf');
const desks = require('./desks');
const { s } = require('./strings');

const FLOW_TTL_MS = 15 * 60 * 1000;
const MAX_MSG = 3800;

const clip = (text, n = MAX_MSG) => (text.length > n ? text.slice(0, n) + '\n…' : text);
const kb = (rows) => Markup.inlineKeyboard(rows.map(r => r.map(b => Markup.button.callback(b[0], b[1]))));
const approvalLabel = (mode) => s(mode === 'telegram' ? 'approval_telegram' : 'approval_auto');
const modelLabel = (m) => (m && String(m).trim() ? String(m).trim() : s('model_default_short'));
const shortModelLabel = (m) => {
    if (!m || !String(m).trim()) return s('model_default_short');
    return String(m).trim().replace(/^Gemini\s+/i, 'G').replace(/^Claude\s+/i, '').slice(0, 22);
};

function extractInlineModelArg(rawOrderText) {
    const str = String(rawOrderText || '');
    const m = str.match(/^(?:--model|-m)(?:=|\s+)(?:"([^"]+)"|'([^']+)'|(\S+))\s+([\s\S]+)$/i);
    if (!m) return { model: null, body: str };
    return { model: (m[1] || m[2] || m[3] || '').trim() || null, body: m[4] };
}

function registerWorkOrdersUI(bot, { dir }) {
    const flows = new Map(); // chatId -> { flow, step, desk, expires }

    const setFlow = (chatId, flow) => flows.set(chatId, { ...flow, expires: Date.now() + FLOW_TTL_MS });
    const getFlow = (chatId) => {
        const f = flows.get(chatId);
        if (f && f.expires < Date.now()) { flows.delete(chatId); return null; }
        return f || null;
    };

    // ---- views ----
    const panel = (ctx) => {
        const live = desks.readLiveOrders(dir);
        const count = (st) => live.filter(o => o.status === st).length;
        const text = `${s('panel_title')}\n\n${s('panel_body', {
            dir, desks: desks.listDesks(dir).length, queued: count('queued'), running: count('running'), awaiting: count('awaiting_approval'),
        })}`;
        return ctx.reply(text, kb([
            [[s('btn_new_desk'), 'wom:nd'], [s('btn_new_order'), 'wom:no']],
            [[s('btn_desks'), 'wom:dl'], [s('btn_status'), 'wom:st']],
            [[s('btn_help'), 'wom:h']],
        ]));
    };

    const deskList = (ctx, action = 'wom:d') => {
        const list = desks.listDesks(dir);
        if (!list.length) return ctx.reply(s('no_desks'), kb([[[s('btn_new_desk'), 'wom:nd']]]));
        const rows = list.map(d => [[`📁 ${d}`, `${action}:${d}`]]);
        rows.push([[s('btn_back'), 'wom:p']]);
        return ctx.reply(action === 'wom:d' ? s('btn_desks') : s('choose_desk'), kb(rows));
    };

    const deskView = (ctx, desk) => {
        if (!desks.deskExists(dir, desk)) return ctx.reply(s('desk_not_found', { desk }));
        const cfg = desks.readDeskConfig(dir, desk);
        const last = desks.lastResult(dir, desk);
        const instr = desks.getInstructions(dir, desk) || s('desk_none');
        const text = s('desk_view', {
            desk,
            approval: approvalLabel(cfg.approval),
            model: modelLabel(cfg.model),
            last: last ? `${last.id} — ${last.status}` : s('desk_none'),
            instructions: clip(instr, 1500),
        });
        return ctx.reply(text, kb([
            [[s('btn_new_order'), `wom:o:${desk}`], [s('btn_instructions'), `wom:i:${desk}`]],
            [[s('btn_approval', { mode: approvalLabel(cfg.approval) }), `wom:ap:${desk}`], [s('btn_model', { model: shortModelLabel(cfg.model) }), `wom:m:${desk}`]],
            [[s('btn_last_result'), `wom:r:${desk}`], [s('btn_archive'), `wom:x:${desk}`]],
            [[s('btn_back'), 'wom:dl']],
        ]));
    };

    const modelPickerView = (ctx, desk) => {
        if (!desks.deskExists(dir, desk)) return ctx.reply(s('desk_not_found', { desk }));
        const cfg = desks.readDeskConfig(dir, desk);
        const cur = cfg.model || null;
        const rows = desks.MODEL_PRESETS.map(p => {
            const baseText = p.value ? p.label : s('btn_model_default');
            const isSelected = (!cur && !p.value) || (cur && p.value && cur.toLowerCase() === p.value.toLowerCase());
            return [[isSelected ? `${baseText} ✅` : baseText, `wom:ms:${desk}:${p.key}`]];
        });
        rows.push([[s('btn_model_custom'), `wom:mc:${desk}`]]);
        rows.push([[s('btn_back'), `wom:d:${desk}`]]);
        return ctx.reply(s('choose_model', { desk, model: modelLabel(cur) }), kb(rows));
    };

    const statusView = (ctx) => {
        const live = desks.readLiveOrders(dir);
        const recent = desks.readHistory(dir).slice(-5).reverse();
        const parts = [];
        parts.push(live.length ? s('status_live', { live: live.map(o => `• ${o.id} — ${o.desk} — ${o.status}`).join('\n') }) : s('status_none'));
        if (recent.length) parts.push(s('status_recent', { recent: recent.map(o => `• ${o.id} — ${o.status}${o.reason ? ` (${o.reason})` : ''}`).join('\n') }));
        return ctx.reply(clip(parts.join('\n\n')), kb([[[s('btn_back'), 'wom:p']]]));
    };

    const queueOrder = (ctx, desk, rawBody) => {
        const cfg = desks.readDeskConfig(dir, desk);
        const { model, body } = extractInlineModelArg(rawBody);
        const id = desks.writeOrder(dir, { desk, body, model });
        return ctx.reply(s(cfg.approval === 'telegram' ? 'order_queued_approval' : 'order_queued', { id, desk }));
    };

    // ---- commands & buttons ----
    bot.command('wo', async (ctx) => {
        const rest = ctx.message.text.replace(/^\/wo(@\w+)?\s*/i, '');
        if (!rest) return panel(ctx);
        // Shortcut: /wo <desk> <order text>
        const m = rest.match(/^(\S+)\s+([\s\S]+)$/);
        const desk = m ? desks.slugifyDesk(m[1]) : desks.slugifyDesk(rest);
        if (!desks.deskExists(dir, desk)) return ctx.reply(s('desk_not_found', { desk }));
        if (!m) return deskView(ctx, desk);
        return queueOrder(ctx, desk, m[2]);
    });

    const act = (re, fn) => bot.action(re, async (ctx) => {
        await ctx.answerCbQuery().catch(() => {});
        return fn(ctx, ctx.match);
    });

    act(/^wom:p$/, (ctx) => panel(ctx));
    act(/^wom:h$/, (ctx) => ctx.reply(s('help', { dir })));
    act(/^wom:st$/, (ctx) => statusView(ctx));
    act(/^wom:dl$/, (ctx) => deskList(ctx));
    act(/^wom:d:(.+)$/, (ctx, m) => deskView(ctx, m[1]));
    act(/^wom:no$/, (ctx) => deskList(ctx, 'wom:o'));

    act(/^wom:nd$/, (ctx) => {
        setFlow(ctx.chat.id, { flow: 'desk', step: 'name' });
        return ctx.reply(s('ask_desk_name'));
    });

    act(/^wom:o:(.+)$/, (ctx, m) => {
        const desk = m[1];
        if (!desks.deskExists(dir, desk)) return ctx.reply(s('desk_not_found', { desk }));
        setFlow(ctx.chat.id, { flow: 'order', step: 'body', desk });
        return ctx.reply(s('ask_order', { desk }));
    });

    act(/^wom:i:(.+)$/, (ctx, m) => {
        const desk = m[1];
        if (!desks.deskExists(dir, desk)) return ctx.reply(s('desk_not_found', { desk }));
        setFlow(ctx.chat.id, { flow: 'instr', step: 'body', desk });
        return ctx.reply(clip(s('current_instructions', { desk, instructions: desks.getInstructions(dir, desk) || s('desk_none') })));
    });

    act(/^wom:ap:(.+)$/, (ctx, m) => {
        const desk = m[1];
        if (!desks.deskExists(dir, desk)) return ctx.reply(s('desk_not_found', { desk }));
        const cfg = desks.readDeskConfig(dir, desk);
        cfg.approval = cfg.approval === 'telegram' ? 'auto' : 'telegram';
        desks.writeDeskConfig(dir, desk, cfg);
        return ctx.reply(s('approval_set', { desk, mode: approvalLabel(cfg.approval) }));
    });

    act(/^wom:m:([a-z0-9][a-z0-9._-]{0,31})$/, (ctx, m) => modelPickerView(ctx, m[1]));

    act(/^wom:ms:([a-z0-9][a-z0-9._-]{0,31}):(\d+)$/, (ctx, m) => {
        const desk = m[1];
        const preset = desks.MODEL_PRESETS.find(p => p.key === m[2]);
        if (!desks.deskExists(dir, desk) || !preset) return ctx.reply(s('desk_not_found', { desk }));
        const cfg = desks.setDeskModel(dir, desk, preset.value);
        return ctx.reply(s('model_set', { desk, model: modelLabel(cfg.model) }), kb([
            [[s('btn_back'), `wom:d:${desk}`]],
        ]));
    });

    act(/^wom:mc:([a-z0-9][a-z0-9._-]{0,31})$/, (ctx, m) => {
        const desk = m[1];
        if (!desks.deskExists(dir, desk)) return ctx.reply(s('desk_not_found', { desk }));
        setFlow(ctx.chat.id, { flow: 'model', step: 'name', desk });
        return ctx.reply(s('ask_custom_model', { desk }));
    });

    act(/^wom:r:(.+)$/, (ctx, m) => {
        const last = desks.lastResult(dir, m[1]);
        if (!last) return ctx.reply(s('no_result', { desk: m[1] }));
        return ctx.reply(clip(s('last_result', { id: last.id, status: last.status, text: last.text || last.reason || '' })));
    });

    act(/^wom:x:(.+)$/, (ctx, m) => ctx.reply(s('archive_confirm', { desk: m[1] }), kb([
        [[s('btn_archive_confirm'), `wom:xy:${m[1]}`], [s('btn_cancel'), `wom:d:${m[1]}`]],
    ])));

    act(/^wom:xy:(.+)$/, (ctx, m) => {
        if (!desks.deskExists(dir, m[1])) return ctx.reply(s('desk_not_found', { desk: m[1] }));
        desks.archiveDesk(dir, m[1]);
        return ctx.reply(s('archived', { desk: m[1] }));
    });

    // Last step of the new-desk flow: approval mode chosen with a button.
    act(/^wom:wa:(auto|telegram)$/, (ctx, m) => {
        const f = getFlow(ctx.chat.id);
        if (!f || f.flow !== 'desk' || f.step !== 'approval') return null;
        flows.delete(ctx.chat.id);
        const p = desks.ensureDesk(dir, f.desk, { instructions: f.instructions, approval: m[1], ensureMemory: ensureDeskMemory });
        return ctx.reply(s('desk_created', { desk: f.desk, path: p }), kb([
            [[s('btn_first_order'), `wom:o:${f.desk}`], [s('btn_set_model'), `wom:m:${f.desk}`]],
            [[s('btn_desks'), 'wom:dl']],
        ]));
    });

    // ---- free-text steps of the flows ----
    // Registered before the bot's default text handler (which forwards text to the
    // agent), so while a flow is active the user's reply goes to the flow instead.
    bot.use(async (ctx, next) => {
        const text = ctx.message && ctx.message.text;
        const chatId = ctx.chat && ctx.chat.id;
        const f = chatId != null && text != null ? getFlow(chatId) : null;
        if (!f) return next();
        if (/^\/cancel\b/i.test(text)) { flows.delete(chatId); return ctx.reply(s('cancelled')); }
        if (text.startsWith('/')) { flows.delete(chatId); return next(); } // any other command ends the flow
        if (!text.trim()) return ctx.reply(s('empty_text'));

        if (f.flow === 'desk' && f.step === 'name') {
            const desk = desks.slugifyDesk(text);
            if (!desks.DESK_RE.test(desk)) return ctx.reply(s('bad_desk_name'));
            if (desks.deskExists(dir, desk)) return ctx.reply(s('desk_exists', { desk }));
            setFlow(chatId, { flow: 'desk', step: 'instructions', desk });
            return ctx.reply(s('ask_instructions', { desk }));
        }
        if (f.flow === 'desk' && f.step === 'instructions') {
            setFlow(chatId, { ...f, step: 'approval', instructions: text.trim() === '-' ? '' : text });
            return ctx.reply(s('ask_approval', { desk: f.desk }), kb([
                [[s('btn_auto'), 'wom:wa:auto'], [s('btn_ask'), 'wom:wa:telegram']],
            ]));
        }
        if (f.flow === 'desk' && f.step === 'approval') {
            return ctx.reply(s('ask_approval', { desk: f.desk }), kb([
                [[s('btn_auto'), 'wom:wa:auto'], [s('btn_ask'), 'wom:wa:telegram']],
            ]));
        }
        if (f.flow === 'order') {
            flows.delete(chatId);
            return queueOrder(ctx, f.desk, text);
        }
        if (f.flow === 'instr') {
            flows.delete(chatId);
            desks.setInstructions(dir, f.desk, text);
            return ctx.reply(s('instructions_saved', { desk: f.desk }));
        }
        if (f.flow === 'model') {
            flows.delete(chatId);
            const nextModel = text.trim() === '-' ? null : text.trim();
            const cfg = desks.setDeskModel(dir, f.desk, nextModel);
            return ctx.reply(s('model_set', { desk: f.desk, model: modelLabel(cfg.model) }), kb([
                [[s('btn_back'), `wom:d:${f.desk}`]],
            ]));
        }
        return next();
    });

    function ensureDeskMemory(p) {
        try { require('../memory_convention').ensureMemoryConvention(p, { force: true }); } catch (_) { /* optional */ }
    }

    return { flows };
}

module.exports = { registerWorkOrdersUI };
