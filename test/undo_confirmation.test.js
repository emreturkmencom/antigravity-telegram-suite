const assert = require('assert');
const {
    buildUndoConfirmationExpression,
    confirmUndoDialog
} = require('../src/undo_confirmation');

const target = { id: 'target', webSocketDebuggerUrl: 'ws://target' };

function createClient(statuses, state = {}) {
    let index = 0;
    return {
        Runtime: {
            enable: async () => {},
            evaluate: async ({ expression }) => {
                state.expressions = [...(state.expressions || []), expression];
                const status = statuses[Math.min(index, statuses.length - 1)];
                index += 1;
                return { result: { value: { status } } };
            }
        },
        close: async () => { state.closed = true; }
    };
}

function optionsFor(statuses, state = {}, overrides = {}) {
    return {
        port: 9333,
        targetId: target.id,
        resolveTargets: async () => [target],
        connect: async () => createClient(statuses, state),
        timeout: async value => value,
        wait: async () => {},
        openAttempts: 2,
        closeAttempts: 2,
        pollMs: 0,
        ...overrides
    };
}

async function run() {
    const clickExpression = buildUndoConfirmationExpression('click');
    assert(clickExpression.includes("'confirm undo'"));
    assert(clickExpression.includes("'确认撤销'"));
    assert(clickExpression.includes("'confirm'"));
    assert(clickExpression.includes("'确认'"));
    assert(clickExpression.includes("'确定'"));
    assert(
        clickExpression.includes("document.querySelectorAll('h1, h2, h3, [role=\"heading\"], div, span')")
            && clickExpression.includes("!Array.from(element.querySelectorAll('*')).some(child =>")
            && clickExpression.includes('/^confirm(?:\\s|↵)*$/'),
        'the current GUI locator must select the innermost Confirm Undo title and accept the Confirm shortcut glyph'
    );
    const probeExpression = buildUndoConfirmationExpression('probe');
    assert(
        probeExpression.includes("if (mode === 'probe') return { status: 'ready' };")
            && probeExpression.indexOf("if (mode === 'probe')") < probeExpression.indexOf('let container = headings[0].parentElement;'),
        'close probing must track the dialog heading even when Confirm becomes disabled'
    );

    const successState = {};
    const result = await confirmUndoDialog(optionsFor(
        ['not_found', 'clicked', 'ready', 'not_found'],
        successState
    ));
    assert.deepStrictEqual(result, { status: 'confirmed' });
    assert.strictEqual(successState.closed, true, 'successful confirmation must close its CDP client');
    assert(successState.expressions[0].includes('const mode = "click"'));
    assert(successState.expressions.at(-1).includes('const mode = "probe"'));

    const defaultDelays = [];
    await confirmUndoDialog(optionsFor(
        ['not_found', 'clicked', 'not_found'],
        {},
        {
            pollMs: undefined,
            wait: async ms => defaultDelays.push(ms)
        }
    ));
    assert.deepStrictEqual(defaultDelays, [100], 'the default poll interval must leave time for React to render the dialog');

    await assert.rejects(
        () => confirmUndoDialog(optionsFor(['ambiguous'])),
        /undo_confirmation_ambiguous/
    );
    await assert.rejects(
        () => confirmUndoDialog(optionsFor(['not_found', 'not_found'])),
        /undo_confirmation_not_found/
    );
    await assert.rejects(
        () => confirmUndoDialog(optionsFor(['clicked', 'ready', 'ready'])),
        /undo_confirmation_not_closed/
    );

    console.log('Undo confirmation tests passed');
}

run().catch(err => {
    console.error(err);
    process.exitCode = 1;
});
