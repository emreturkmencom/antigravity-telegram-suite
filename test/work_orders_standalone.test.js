const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { WorkOrders } = require('../src/work_orders/core');
const desks = require('../src/work_orders/desks');
const { s } = require('../src/work_orders/strings');

function makeStandaloneEnv({ agentWorking = false, lastUserMsgAge = 10 * 60 * 1000, options = {} } = {}) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agts-wo-standalone-'));
    let clock = 1000000;
    let agentIsWorking = agentWorking;
    let lastUserMessageAt = clock - lastUserMsgAge;
    const sent = [];
    const notes = [];
    const threadSwitches = [];
    const workspaceSwitches = [];
    let newChatCount = 0;
    let currentThread = { id: 'user-chat-orig', name: 'My Chat', workspace: 'user-workspace' };

    const deps = {
        now: () => clock,
        sleep: async (ms) => { clock += ms; await new Promise(r => setImmediate(r)); },
        listDeskWindows: async () => [],
        openDeskWindow: async (desk, deskDir) => {
            const originalThread = { ...currentThread };
            const wsName = desks.deskFolderName(desk);
            workspaceSwitches.push(wsName);

            const cfg = desks.readDeskConfig(dir, desk);
            let threadId = cfg.threadId || null;
            let switched = false;

            if (threadId) {
                if (threadId === 'valid-thread-id') {
                    switched = true;
                    currentThread = { id: threadId, name: desk, workspace: wsName };
                    threadSwitches.push(threadId);
                }
            }

            if (!switched) {
                if (threadId) {
                    deps.notify({ text: s('thread_lost_new', { desk }) });
                }
                newChatCount++;
                threadId = null;
                currentThread = null; // simulate on new chat
            }

            return { desk, deskDir, originalThread, threadId, isNewThread: !switched };
        },
        sendToWindow: async (win, text) => {
            sent.push({ desk: win.desk, text });
            if (win.isNewThread || !win.threadId) {
                // simulate standalone assigning thread id on first prompt
                win.threadId = `conv-${win.desk}-new`;
                win.isNewThread = false;
                currentThread = { id: win.threadId, name: win.desk, workspace: desks.deskFolderName(win.desk) };
                const cfg = desks.readDeskConfig(dir, win.desk);
                cfg.threadId = win.threadId;
                desks.writeDeskConfig(dir, win.desk, cfg);
            }
            const m = text.match(/write your final answer to this file: `([^`]+)`/);
            if (m && !text.includes('FAIL_MANUALLY')) {
                fs.writeFileSync(m[1], 'STATUS: done\nFinished successfully');
            }
        },
        closeWindow: async () => {},
        checkAgent: async () => ({ working: !agentIsWorking }),
        stopAgent: async () => { agentIsWorking = false; },
        canDispatch: async () => {
            if (agentIsWorking) return false;
            const idleMs = 5 * 60 * 1000;
            if (lastUserMessageAt > 0 && (clock - lastUserMessageAt) < idleMs) return false;
            return true;
        },
        afterOrder: async (order, win) => {
            if (!win || !win.originalThread) return;
            const { id, name, workspace } = win.originalThread;
            if (deps.failRestore) {
                deps.notify({ text: s('cant_return_chat') });
                return;
            }
            if (id) {
                threadSwitches.push(id);
                currentThread = { id, name, workspace };
            } else if (workspace) {
                workspaceSwitches.push(workspace);
            }
        },
        notify: (msg) => notes.push(msg),
    };

    const wo = new WorkOrders({
        dir,
        deps,
        options: {
            maxConcurrent: 1,
            resultSettleMs: 100,
            ...options,
        },
    });

    const drop = (name, text) => fs.writeFileSync(path.join(dir, 'inbox', name), text);
    const settle = async () => { await Promise.all([...wo.running]); };

    return {
        dir,
        wo,
        deps,
        sent,
        notes,
        threadSwitches,
        workspaceSwitches,
        getCurrentThread: () => currentThread,
        getNewChatCount: () => newChatCount,
        setAgentWorking: (v) => { agentIsWorking = v; },
        setUserMessageAge: (ageMs) => { lastUserMessageAt = clock - ageMs; },
        advanceClock: (ms) => { clock += ms; },
        drop,
        settle,
    };
}

async function runTests() {
    console.log('🧪 Running Work Orders Standalone backend tests...');

    // 1. Non-collision: Agent busy prevents dispatch
    {
        const env = makeStandaloneEnv({ agentWorking: true });
        env.drop('busy1.md', '---\ndesk: test-desk\n---\nDo work');
        await env.wo.tick();
        assert.strictEqual(env.sent.length, 0, 'Order must not start when agent is working');
        assert.strictEqual(env.wo.orders.get('busy1').status, 'queued');

        // Once agent becomes idle, dispatch starts
        env.setAgentWorking(false);
        await env.wo.dispatch();
        await env.settle();
        assert.strictEqual(env.sent.length, 1, 'Order starts once agent is idle');
        assert.strictEqual(env.wo.orders.get('busy1').status, 'done');
        console.log('  ✅ Non-collision: agent busy check passed');
    }

    // 2. Non-collision: User activity within 5 minutes prevents dispatch
    {
        const env = makeStandaloneEnv({ lastUserMsgAge: 2 * 60 * 1000 }); // user sent message 2 mins ago
        env.drop('user_active.md', '---\ndesk: test-desk\n---\nDo work');
        await env.wo.tick();
        assert.strictEqual(env.sent.length, 0, 'Order must not start if user messaged within 5 min');
        assert.strictEqual(env.wo.orders.get('user_active').status, 'queued');

        // Advance time by 4 minutes (now 6 minutes since user message)
        env.advanceClock(4 * 60 * 1000);
        await env.wo.dispatch();
        await env.settle();
        assert.strictEqual(env.sent.length, 1, 'Order starts after 5 minutes of user inactivity');
        assert.strictEqual(env.wo.orders.get('user_active').status, 'done');
        console.log('  ✅ Non-collision: 5-minute idle rule passed');
    }

    // 3. Non-collision: Single concurrent order in standalone mode (maxConcurrent = 1)
    {
        let releaseOrder1;
        const gate = new Promise(r => { releaseOrder1 = r; });
        const env = makeStandaloneEnv({
            options: { maxConcurrent: 1 },
        });

        // Override sendToWindow for slow execution
        const origSend = env.deps.sendToWindow;
        env.deps.sendToWindow = async (win, text) => {
            await origSend(win, text);
            if (win.desk === 'desk-one') {
                await gate;
            }
        };

        env.drop('c1.md', '---\ndesk: desk-one\n---\nOrder 1');
        env.drop('c2.md', '---\ndesk: desk-two\n---\nOrder 2');

        await env.wo.tick();
        assert.strictEqual(env.wo.running.size, 1, 'Only one order may run at a time');
        assert.strictEqual(env.wo.orders.get('c1').status, 'running');
        assert.strictEqual(env.wo.orders.get('c2').status, 'queued');

        // Release order 1 and dispatch again
        releaseOrder1();
        await env.settle();
        assert.strictEqual(env.wo.orders.get('c1').status, 'done');

        await env.wo.dispatch();
        await env.settle();
        assert.strictEqual(env.wo.orders.get('c2').status, 'done');
        console.log('  ✅ Non-collision: single concurrent order limit passed');
    }

    // 4. Chat restoration: Restores original thread after order finishes
    {
        const env = makeStandaloneEnv();
        assert.strictEqual(env.getCurrentThread().id, 'user-chat-orig');

        env.drop('restore1.md', '---\ndesk: qa-desk\n---\nRun QA');
        await env.wo.tick();
        await env.settle();

        assert.strictEqual(env.wo.orders.get('restore1').status, 'done');
        assert.strictEqual(env.getCurrentThread().id, 'user-chat-orig', 'Must restore original user thread after completion');
        assert(env.threadSwitches.includes('user-chat-orig'), 'thread switch called with original thread ID');
        console.log('  ✅ Chat restoration: returned to original chat passed');
    }

    // 5. Chat restoration failure warning
    {
        const env = makeStandaloneEnv();
        env.deps.failRestore = true;

        env.drop('restore_fail.md', '---\ndesk: qa-desk\n---\nRun QA');
        await env.wo.tick();
        await env.settle();

        const warn = env.notes.find(n => n.text.includes(s('cant_return_chat')));
        assert(warn, 'Warning notification sent when returning to chat fails');
        console.log('  ✅ Chat restoration: warning on failure passed');
    }

    // 6. Lost chat: Thread ID missing or invalid -> triggers new chat and updates desk.json
    {
        const env = makeStandaloneEnv();
        // Seed desk with invalid/lost thread ID
        desks.ensureDesk(env.dir, 'lost-desk');
        desks.writeDeskConfig(env.dir, 'lost-desk', { approval: 'auto', threadId: 'deleted-conv-uuid' });

        env.drop('lost1.md', '---\ndesk: lost-desk\n---\nFind something');
        await env.wo.tick();
        await env.settle();

        // 1. Notified user about lost chat
        const lostNote = env.notes.find(n => n.text.includes('lost-desk') && (n.text.includes('bulunamadı') || n.text.includes('not found')));
        assert(lostNote, 'User notified about lost chat');

        // 2. Triggered new chat
        assert(env.getNewChatCount() > 0, 'New chat triggered');

        // 3. Updated desk.json with new thread ID
        const updatedCfg = desks.readDeskConfig(env.dir, 'lost-desk');
        assert.strictEqual(updatedCfg.threadId, 'conv-lost-desk-new', 'desk.json updated with newly generated threadId');
        assert.strictEqual(env.wo.orders.get('lost1').status, 'done');
        console.log('  ✅ Lost chat: fallback to new chat and desk.json update passed');
    }

    // 7. Message Queue & /wo_stop
    {
        const env = makeStandaloneEnv();
        let stopCalled = false;
        env.deps.stopAgent = async () => { stopCalled = true; };

        // Override sendToWindow to simulate a long task
        let waitAgent;
        const gate = new Promise(r => { waitAgent = r; });
        env.deps.sendToWindow = async (win, text) => {
            await waitAgent;
        };

        env.drop('stop1.md', '---\ndesk: long-job\ntimeout: 30\n---\nFAIL_MANUALLY');
        await env.wo.tick();

        assert.strictEqual(env.wo.orders.get('stop1').status, 'running');

        // /wo_stop called
        const stopped = env.wo.stopActiveOrder('stopped by user via /wo_stop');
        assert(stopped, 'stopActiveOrder returns the stopped order');
        assert.strictEqual(stopped.id, 'stop1');
        assert(stopCalled, 'stopAgent dependency called');

        waitAgent();
        await env.settle();

        const order = env.wo.orders.get('stop1');
        assert.strictEqual(order.status, 'failed');
        assert.strictEqual(order.reason, 'stopped by user via /wo_stop');
        assert.strictEqual(env.getCurrentThread().id, 'user-chat-orig', 'Chat restored after /wo_stop');
        console.log('  ✅ User control: /wo_stop stops order, fails cleanly, and restores chat passed');
    }

    // 8. User message queue logic in index.js manager
    {
        const mockBot = {
            command: (name, fn) => { mockBot.commands[name] = fn; },
            action: () => {},
            use: () => {},
            telegram: { sendMessage: async () => {} },
            commands: {},
        };
        const chatIds = [123];

        // Test startWorkOrders returns manager with message queue methods
        const { startWorkOrders } = require('../src/work_orders');
        const prevEnv = process.env.WORK_ORDERS_BACKEND;
        process.env.WORK_ORDERS_BACKEND = 'standalone';

        const manager = startWorkOrders(mockBot, chatIds);
        assert(manager, 'startWorkOrders must return manager');
        assert.strictEqual(typeof manager.isOrderRunning, 'function');
        assert.strictEqual(typeof manager.queueUserMessage, 'function');
        assert.strictEqual(typeof manager.recordUserActivity, 'function');
        assert.strictEqual(typeof manager.setMessageProcessor, 'function');

        // Queue user message when order is running
        assert.strictEqual(manager.isOrderRunning(), false);
        assert.strictEqual(manager.getQueuedCount(), 0);

        const processed = [];
        manager.setMessageProcessor(async (item) => {
            processed.push(item.query);
        });

        // Simulate incoming message while order is running
        // Force active order state for test
        const childMsgHandler = (msg) => {}; // child mocked
        manager.queueUserMessage({ query: 'Hello agent 1' });
        manager.queueUserMessage({ query: 'Hello agent 2' });
        assert.strictEqual(manager.getQueuedCount(), 2);

        // When /wo_stop command is invoked without active order
        const replies = [];
        const fakeCtx = { reply: async (t) => { replies.push(t); } };
        await mockBot.commands.wo_stop(fakeCtx);
        assert.strictEqual(replies[0], s('no_running_order'));

        manager.stop();
        if (prevEnv !== undefined) process.env.WORK_ORDERS_BACKEND = prevEnv;
        else delete process.env.WORK_ORDERS_BACKEND;
        console.log('  ✅ Manager: user message queue and /wo_stop command passed');
    }

    console.log('✅ All Work Orders Standalone backend tests passed successfully!');
}

runTests().catch((err) => {
    console.error('❌ Test failed:', err);
    process.exit(1);
});
