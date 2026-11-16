const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WorkOrders, parseOrder, DEFAULTS } = require('../src/work_orders/core');

function makeEnv({ agent, options } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agts-wo-'));
    let clock = 1000;
    const windows = [];
    const sent = [];
    const notes = [];
    const closed = [];
    const deps = {
        now: () => clock,
        sleep: async (ms) => { clock += ms; await new Promise(r => setImmediate(r)); },
        listDeskWindows: async () => windows.slice(),
        openDeskWindow: async (desk) => {
            let w = windows.find(x => x.desk === desk);
            if (!w) { w = { desk, targetId: `t-${desk}` }; windows.push(w); }
            return w;
        },
        closeWindow: async (w) => {
            const i = windows.findIndex(x => x.desk === w.desk);
            if (i !== -1) windows.splice(i, 1);
            closed.push(w.desk);
        },
        sendToWindow: async (w, text) => {
            sent.push({ desk: w.desk, text });
            const m = text.match(/write your final answer to this file: `([^`]+)`/);
            if (agent && m) agent(m[1], w, text);
        },
        notify: (msg) => notes.push(msg),
    };
    const wo = new WorkOrders({ dir, deps, options: { resultSettleMs: 1000, ...options } });
    const drop = (name, text) => fs.writeFileSync(path.join(dir, 'inbox', name), text);
    const settle = async () => { await Promise.all([...wo.running]); };
    return { dir, wo, windows, sent, notes, closed, drop, settle, advance: (ms) => { clock += ms; } };
}

const doneAgent = (resultFile) => fs.writeFileSync(resultFile, 'STATUS: done\nall good');

async function run() {
    // parseOrder
    const p = parseOrder('---\ndesk: yz-yorumlar\napproval: telegram\ntimeout: 30 # min\n---\nDo it.');
    assert.deepStrictEqual([p.desk, p.approval, p.timeoutMin, p.body], ['yz-yorumlar', 'telegram', 30, 'Do it.']);
    assert.throws(() => parseOrder('no frontmatter'), /desk/);
    assert.throws(() => parseOrder('---\ndesk: x\napproval: maybe\n---\nbody'), /approval/);
    assert.throws(() => parseOrder('---\ndesk: ../evil\n---\nbody'), /desk/);
    assert.throws(() => parseOrder('---\ndesk: ok\n---\n'), /empty/);

    // Auto order: seeds desk, sends prompt with result path, finishes as done.
    {
        const e = makeEnv({ agent: doneAgent });
        e.drop('o1.md', '---\ndesk: qa\n---\nCheck the frames.');
        await e.wo.tick();
        await e.settle();
        assert.strictEqual(e.sent.length, 1);
        assert(e.sent[0].text.startsWith('[AGTS Work Order o1]'));
        assert(e.sent[0].text.includes('Check the frames.'));
        const deskMd = fs.readFileSync(path.join(e.dir, 'desks', 'wo-qa', 'AGENT.md'), 'utf8');
        assert(deskMd.includes('AGTS Work Orders desk'));
        assert(fs.existsSync(path.join(e.dir, 'done', 'o1.md')), 'order archived in done/');
        assert(e.notes.some(n => n.text.includes('done') && n.text.includes('all good')));
        assert.strictEqual(e.wo.orders.get('o1').status, 'done');
    }

    // Telegram approval: waits, then runs on approve; reject fails it.
    {
        const e = makeEnv({ agent: doneAgent });
        e.drop('a1.md', '---\ndesk: code\napproval: telegram\n---\nChange code.');
        e.drop('a2.md', '---\ndesk: code2\napproval: telegram\n---\nChange more.');
        await e.wo.tick();
        assert.strictEqual(e.sent.length, 0, 'nothing sent before approval');
        const ask = e.notes.find(n => n.buttons && n.text.includes('a1'));
        assert(ask, 'approval message with buttons');
        const shortId = ask.buttons[0].data.split(':')[2];
        assert(e.wo.approve(shortId, true));
        const ask2 = e.notes.find(n => n.buttons && n.text.includes('a2'));
        e.wo.approve(ask2.buttons[1].data.split(':')[2], false);
        await e.wo.tick();
        await e.settle();
        assert.strictEqual(e.wo.orders.get('a1').status, 'done');
        assert.strictEqual(e.wo.orders.get('a2').status, 'failed');
        assert.strictEqual(e.sent.length, 1, 'rejected order never sent');
        assert.strictEqual(e.wo.approve(shortId, true), null, 'second click is a no-op');
    }

    // Window budget: with 1 window, the second desk waits, then the idle first desk is closed.
    {
        let release;
        const gate = new Promise(r => { release = r; });
        const e = makeEnv({
            options: { maxWindows: 1 },
            agent: (file, w) => {
                if (w.desk === 'one') gate.then(() => fs.writeFileSync(file, 'STATUS: done\n1'));
                else fs.writeFileSync(file, 'STATUS: done\n2');
            },
        });
        e.drop('b1.md', '---\ndesk: one\n---\nfirst');
        e.drop('b2.md', '---\ndesk: two\n---\nsecond');
        await e.wo.tick();
        assert.deepStrictEqual(e.sent.map(s => s.desk), ['one'], 'desk two waits for a window');
        release();
        await e.settle();
        await e.wo.dispatch();
        await e.settle();
        assert.deepStrictEqual(e.closed, ['one'], 'idle desk window closed to make room');
        assert.strictEqual(e.wo.orders.get('b2').status, 'done');
    }

    // Timeout and agent-reported failure.
    {
        const e = makeEnv({ agent: (file, w, text) => { if (text.includes('fail me')) fs.writeFileSync(file, 'STATUS: failed\nmissing input'); } });
        e.drop('t1.md', '---\ndesk: slow\ntimeout: 1\n---\nnever answers');
        e.drop('t2.md', '---\ndesk: other\n---\nfail me');
        await e.wo.tick();
        await e.settle();
        assert.strictEqual(e.wo.orders.get('t1').status, 'failed');
        assert(/no result file/.test(e.wo.orders.get('t1').reason));
        assert.strictEqual(e.wo.orders.get('t2').status, 'failed');
        assert(e.notes.some(n => n.text.includes('missing input')));
    }

    // No approval in the order: the desk's default (desk.json) decides.
    {
        const e = makeEnv({ agent: doneAgent });
        require('../src/work_orders/desks').ensureDesk(e.dir, 'careful', { approval: 'telegram' });
        e.drop('d1.md', '---\ndesk: careful\n---\nTouch prod.');
        e.drop('d2.md', '---\ndesk: careful\napproval: auto\n---\nOverride.');
        await e.wo.tick();
        assert.strictEqual(e.wo.orders.get('d1').status, 'awaiting_approval');
        assert.notStrictEqual(e.wo.orders.get('d2').status, 'awaiting_approval', 'explicit approval wins');
        await e.settle();
        const h = require('../src/work_orders/desks').readHistory(e.dir);
        assert(h.some(x => x.id === 'd2' && x.status === 'done'), 'finished orders go to history');
    }

    // A stalled agent (stopped without a result) fails early with its last message.
    {
        const e = makeEnv({ options: { stallGraceMs: 60000, stallIdleMs: 120000 } });
        e.wo.deps.checkAgent = async () => ({ working: false, lastText: 'Agent execution terminated due to error.' });
        e.drop('s1.md', '---\ndesk: broken\ntimeout: 60\n---\nanything');
        await e.wo.tick();
        await e.settle();
        const o = e.wo.orders.get('s1');
        assert.strictEqual(o.status, 'failed');
        assert(/stopped without writing/.test(o.reason));
        assert(e.notes.some(n => n.text.includes('Agent execution terminated')), 'last agent message reported');
        assert(o.finishedAt - o.startedAt < 10 * 60000, 'fails in minutes, not after the 60 min timeout');
    }

    // A working agent is not treated as stalled.
    {
        let calls = 0;
        const e = makeEnv({ options: { stallGraceMs: 60000, stallIdleMs: 120000 } });
        e.wo.deps.checkAgent = async () => { calls += 1; return { working: true }; };
        e.drop('w1.md', '---\ndesk: busy\ntimeout: 5\n---\nlong task');
        await e.wo.tick();
        await e.settle();
        assert(calls > 0);
        assert(/no result file/.test(e.wo.orders.get('w1').reason), 'only the timeout ends a busy agent');
    }

    // Invalid order is rejected and moved to failed/.
    {
        const e = makeEnv();
        e.drop('bad.md', 'no desk here');
        await e.wo.tick();
        assert(fs.existsSync(path.join(e.dir, 'failed', 'bad.md')));
        assert(e.notes.some(n => n.text.includes('rejected')));
    }

    // Restart while running: the order is failed, never re-sent blindly.
    {
        const e = makeEnv();
        e.drop('r1.md', '---\ndesk: d\ntimeout: 1\n---\nlong job');
        e.wo.scanInbox();
        e.wo.orders.get('r1').status = 'running';
        e.wo._saveState();
        const notes = [];
        const again = new WorkOrders({ dir: e.dir, deps: { ...e.wo.deps, notify: (m) => notes.push(m) } });
        assert.strictEqual(again.orders.get('r1').status, 'failed');
        assert(fs.existsSync(path.join(e.dir, 'failed', 'r1.md')));
    }

    // Idle close after idleCloseMin (default 3 min), skipped when queued orders remain, immediate on 0.
    assert.strictEqual(DEFAULTS.idleCloseMin, 3, 'default idleCloseMin should be 3 minutes');
    {
        const e = makeEnv({ agent: doneAgent }); // uses default idleCloseMin = 3
        e.drop('i1.md', '---\ndesk: idle\n---\nquick');
        await e.wo.tick();
        await e.settle();
        await e.wo.closeIdleWindows();
        assert.deepStrictEqual(e.closed, [], 'not closed right away');
        e.advance(2 * 60000);
        await e.wo.closeIdleWindows();
        assert.deepStrictEqual(e.closed, [], 'still warm at 2 min');
        // If a new order is queued for this desk, closeIdleWindows must keep the window open!
        e.drop('i2.md', '---\ndesk: idle\n---\nqueued next');
        e.wo.scanInbox();
        e.advance(2 * 60000);
        await e.wo.closeIdleWindows();
        assert.deepStrictEqual(e.closed, [], 'must not close while a queued order waits for this desk');
        await e.wo.dispatch();
        await e.settle();
        e.advance(3 * 60000 + 1000);
        await e.wo.closeIdleWindows();
        assert.deepStrictEqual(e.closed, ['idle'], 'closed after 3 idle minutes with empty queue');
    }

    // Immediate close when idleCloseMin === 0 (unless another order is queued for that desk).
    {
        const e = makeEnv({ agent: doneAgent, options: { idleCloseMin: 0 } });
        e.drop('z1.md', '---\ndesk: zero\n---\none shot');
        await e.wo.tick();
        await e.settle();
        assert.deepStrictEqual(e.closed, ['zero'], 'closed immediately when idleCloseMin is 0');
    }

    // 3-tier model selection precedence: order frontmatter > desk.json > defaultModel.
    {
        const selectedModels = [];
        const e = makeEnv({ agent: doneAgent, options: { defaultModel: 'Gemini 3.8 Flash (Low)' } });
        e.wo.deps.selectModel = async (win, model) => { selectedModels.push({ desk: win.desk, model }); };
        const desksMod = require('../src/work_orders/desks');
        desksMod.ensureDesk(e.dir, 'pro-desk', { model: 'Claude Sonnet 5.5 (High)' });

        e.drop('m1.md', '---\ndesk: fallback-desk\n---\nuses global default');
        e.drop('m2.md', '---\ndesk: pro-desk\n---\nuses desk default');
        e.drop('m3.md', '---\ndesk: pro-desk\nmodel: "Claude Opus 5.5 (High)"\n---\norder override wins');
        await e.wo.tick();
        await e.settle();
        await e.wo.tick(); // dispatch m3 on pro-desk after m2 finishes
        await e.settle();

        assert.deepStrictEqual(selectedModels, [
            { desk: 'fallback-desk', model: 'Gemini 3.8 Flash (Low)' },
            { desk: 'pro-desk', model: 'Claude Sonnet 5.5 (High)' },
            { desk: 'pro-desk', model: 'Claude Opus 5.5 (High)' },
        ]);
        assert(e.notes.some(n => n.text.includes('Claude Opus 5.5 (High)')));
    }

    console.log('✅ work_orders tests passed!');
}

run().catch((err) => { console.error(err); process.exit(1); });
