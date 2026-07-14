const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { isAgentWorking } = require('../src/cdp_controller');
const { isForegroundAgentWorking } = require('../src/agent_working_state');

const target = { id: 'undo-target', webSocketDebuggerUrl: 'ws://undo-target' };

async function run() {
    const controllerSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'cdp_controller.js'), 'utf8');
    assert(
        controllerSource.includes("editor.getAttribute('contenteditable') === 'false' || !!editor.disabled"),
        'the browser probe must coerce contenteditable DIV.disabled to a boolean CDP value'
    );

    assert.strictEqual(
        isForegroundAgentWorking({ isSpinning: true }),
        false,
        'a background Heartbeat or Timer spinner must not count as foreground generation'
    );
    assert.strictEqual(isForegroundAgentWorking({ isGenerating: true }), true);
    assert.strictEqual(isForegroundAgentWorking({ isInputDisabled: true, isModal: false }), true);
    assert.strictEqual(isForegroundAgentWorking({ isInputDisabled: true, isModal: true }), false);
    assert.strictEqual(isForegroundAgentWorking({ hasPendingButton: true }), true);

    await assert.rejects(
        () => isAgentWorking(9333, target.id, {
            strict: true,
            resolveTargets: async () => []
        }),
        /agent_working_state_unknown/,
        'a strict Undo probe must reject when no target can be inspected'
    );

    await assert.rejects(
        () => isAgentWorking(9333, target.id, {
            strict: true,
            resolveTargets: async () => [target],
            connect: async () => { throw new Error('CDP unavailable'); }
        }),
        /agent_working_state_unknown/,
        'a strict Undo probe must reject on CDP errors instead of reporting idle'
    );

    await assert.rejects(
        () => isAgentWorking(9333, target.id, {
            strict: true,
            resolveTargets: async () => [target],
            connect: async () => ({
                Runtime: {
                    enable: async () => {},
                    evaluate: async () => ({ result: { value: null } })
                },
                close: async () => {}
            }),
            withTimeout: async value => value
        }),
        /agent_working_state_unknown/,
        'a strict Undo probe must reject a non-boolean evaluation result'
    );

    let closed = false;
    const idle = await isAgentWorking(9333, target.id, {
        strict: true,
        resolveTargets: async () => [target],
        connect: async () => ({
                Runtime: {
                    enable: async () => {},
                    evaluate: async () => ({
                        result: {
                            value: {
                                isGenerating: false,
                                isInputDisabled: false,
                                isModal: false,
                                hasPendingButton: false,
                                isSpinning: true
                            }
                        }
                    })
                },
            close: async () => { closed = true; }
        }),
        withTimeout: async value => value
    });
    assert.strictEqual(idle, false, 'a background spinner must remain eligible for Undo');
    assert.strictEqual(closed, true, 'the strict probe must close its CDP client');

    console.log('Undo working-state tests passed');
}

run().catch(err => {
    console.error(err);
    process.exitCode = 1;
});
