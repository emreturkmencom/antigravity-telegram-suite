const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const desks = require('../src/work_orders/desks');
const { registerWorkOrdersUI } = require('../src/work_orders/telegram');
const { MARKER_START } = require('../src/memory_convention');

function fakeBot() {
    const commands = {};
    const actions = [];
    const middlewares = [];
    return {
        command: (name, fn) => { commands[name] = fn; },
        action: (re, fn) => actions.push([re, fn]),
        use: (fn) => middlewares.push(fn),
        commands, actions, middlewares,
    };
}

function makeCtx(replies, extra = {}) {
    return {
        chat: { id: 1 },
        reply: async (text, markup) => { replies.push({ text, markup }); },
        answerCbQuery: async () => {},
        ...extra,
    };
}

async function run() {
    // slugify + desk name rules
    assert.strictEqual(desks.slugifyDesk('Yorum Masası'), 'yorum-masasi');
    assert.strictEqual(desks.slugifyDesk('  Video QA!! '), 'video-qa');
    assert(!desks.DESK_RE.test(desks.slugifyDesk('???')));

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agts-wo-ui-'));
    desks.ensureLayout(dir);
    const bot = fakeBot();
    registerWorkOrdersUI(bot, { dir });
    const replies = [];

    const press = async (data) => {
        const hit = bot.actions.find(([re]) => re.test(data));
        assert(hit, `no action for ${data}`);
        await hit[1](makeCtx(replies, { match: data.match(hit[0]) }));
    };
    let passedThrough = 0;
    const say = async (text) => {
        const ctx = makeCtx(replies, { message: { text } });
        for (const mw of bot.middlewares) await mw(ctx, async () => { passedThrough += 1; });
    };
    const last = () => replies[replies.length - 1].text;

    // Panel
    await bot.commands.wo(makeCtx(replies, { message: { text: '/wo' } }));
    assert(/Work Orders|İş Emirleri/.test(last()));

    // Text with no flow active goes on to the normal handler (the agent).
    await say('hello agent');
    assert.strictEqual(passedThrough, 1);

    // New desk flow: name → instructions → approval button.
    await press('wom:nd');
    await say('???');
    assert(/doesn't work|olmuyor/.test(last()), 'bad name rejected');
    await say('Yorum Masası');
    assert(last().includes('yorum-masasi'));
    await say('Reply to comments politely.\nNever invent sources.');
    await say('free text instead of a button'); // re-asks, does not leak to the agent
    assert.strictEqual(passedThrough, 1);
    await press('wom:wa:telegram');
    assert(desks.deskExists(dir, 'yorum-masasi'));
    assert.strictEqual(desks.readDeskConfig(dir, 'yorum-masasi').approval, 'telegram');
    assert(desks.getInstructions(dir, 'yorum-masasi').includes('Never invent sources.'));
    const agentMd = fs.readFileSync(path.join(desks.deskPath(dir, 'yorum-masasi'), 'AGENT.md'), 'utf8');
    assert(agentMd.includes(MARKER_START), 'desk gets the memory block');

    // Duplicate name is refused.
    await press('wom:nd');
    await say('yorum masasi');
    assert(/already exists|zaten var/.test(last()));
    await say('/cancel');
    assert(/Cancelled|İptal/.test(last()));

    // New order flow writes an inbox file that parses back to the same desk.
    await press('wom:o:yorum-masasi');
    await say('Draft replies for today.\nLine two.');
    const inbox = fs.readdirSync(path.join(dir, 'inbox')).filter(f => f.endsWith('.md'));
    assert.strictEqual(inbox.length, 1);
    const { parseOrder } = require('../src/work_orders/core');
    const parsed = parseOrder(fs.readFileSync(path.join(dir, 'inbox', inbox[0]), 'utf8'));
    assert.strictEqual(parsed.desk, 'yorum-masasi');
    assert(parsed.body.includes('Line two.'));
    assert(/approval|onay/i.test(last()), 'told that approval will be asked');

    // Shortcut /wo <desk> <text>
    await bot.commands.wo(makeCtx(replies, { message: { text: '/wo yorum-masasi quick job' } }));
    assert.strictEqual(fs.readdirSync(path.join(dir, 'inbox')).filter(f => f.endsWith('.md')).length, 2);
    await bot.commands.wo(makeCtx(replies, { message: { text: '/wo nope do it' } }));
    assert(/not found|yok/.test(last()));

    // Edit instructions keeps the rules header and the memory block.
    await press('wom:i:yorum-masasi');
    await say('New rules only.');
    const md2 = fs.readFileSync(path.join(desks.deskPath(dir, 'yorum-masasi'), 'AGENT.md'), 'utf8');
    assert.strictEqual(desks.getInstructions(dir, 'yorum-masasi'), 'New rules only.');
    assert(md2.includes('## Rules for every order') && md2.includes(MARKER_START));

    // Approval toggle, model picker (preset + custom + inline --model), desk view, status, last result (none yet).
    await press('wom:ap:yorum-masasi');
    assert.strictEqual(desks.readDeskConfig(dir, 'yorum-masasi').approval, 'auto');
    await press('wom:m:yorum-masasi');
    assert(/Model/.test(last()));
    await press('wom:ms:yorum-masasi:2'); // Gemini 3.8 Flash (High)
    assert.strictEqual(desks.readDeskConfig(dir, 'yorum-masasi').model, 'Gemini 3.8 Flash (High)');
    await press('wom:mc:yorum-masasi');
    await say('Claude Opus 5.5 (High)');
    assert.strictEqual(desks.readDeskConfig(dir, 'yorum-masasi').model, 'Claude Opus 5.5 (High)');
    await press('wom:mc:yorum-masasi');
    await say('-');
    assert.strictEqual(desks.readDeskConfig(dir, 'yorum-masasi').model, undefined, 'dash resets desk model to default');
    const beforeInbox = new Set(fs.readdirSync(path.join(dir, 'inbox')));
    await bot.commands.wo(makeCtx(replies, { message: { text: '/wo yorum-masasi --model "Gemini 3.8 Flash (Low)" fast check' } }));
    const newInboxFile = fs.readdirSync(path.join(dir, 'inbox')).find(f => f.endsWith('.md') && !beforeInbox.has(f));
    assert(newInboxFile, 'new order file created');
    const lastOrderParsed = parseOrder(fs.readFileSync(path.join(dir, 'inbox', newInboxFile), 'utf8'));
    assert.strictEqual(lastOrderParsed.model, 'Gemini 3.8 Flash (Low)');
    assert.strictEqual(lastOrderParsed.body, 'fast check');
    await press('wom:d:yorum-masasi');
    assert(last().includes('yorum-masasi'));
    await press('wom:st');
    await press('wom:r:yorum-masasi');
    assert(/No finished|henüz biten/.test(last()));

    // Another command ends a flow and passes through.
    await press('wom:o:yorum-masasi');
    await say('/status');
    assert.strictEqual(passedThrough, 2);

    // Archive moves the desk, never deletes it.
    await press('wom:x:yorum-masasi');
    await press('wom:xy:yorum-masasi');
    assert(!desks.deskExists(dir, 'yorum-masasi'));
    assert.strictEqual(fs.readdirSync(path.join(dir, 'archive')).filter(f => f.startsWith('wo-yorum-masasi-')).length, 1);

    fs.rmSync(dir, { recursive: true, force: true });
    console.log('✅ work_orders UI tests passed!');
}

run().catch((err) => { console.error(err); process.exit(1); });
