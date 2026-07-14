const assert = require('assert');
const { selectUndoMatch } = require('../src/undo_anchor');

function run() {
    const matches = [
        { scopeKey: 'data-message-id:first' },
        { scopeKey: 'data-message-id:second' }
    ];

    assert.deepStrictEqual(
        selectUndoMatch(matches, { text: 'same prompt', scopeKey: null, matchIndex: null }),
        { status: 'ambiguous' },
        'legacy/fallback text must refuse duplicate native Undo controls'
    );
    assert.deepStrictEqual(
        selectUndoMatch(matches, { text: 'same prompt', scopeKey: 'data-message-id:first', matchIndex: 0 }),
        { status: 'selected', index: 0 },
        'a captured stable scope and matching ordinal select only the captured control'
    );
    assert.deepStrictEqual(
        selectUndoMatch(matches, { text: 'same prompt', scopeKey: 'data-message-id:first', matchIndex: 1 }),
        { status: 'not_found' },
        'a shifted ordinal must fail closed instead of selecting the captured scope anyway'
    );
    assert.deepStrictEqual(
        selectUndoMatch(matches, { text: 'same prompt', scopeKey: 'data-message-id:missing', matchIndex: 0 }),
        { status: 'not_found' },
        'a missing captured scope must fail closed'
    );
    assert.deepStrictEqual(
        selectUndoMatch([{ scopeKey: null }], { text: 'unique prompt', scopeKey: null, matchIndex: null }),
        { status: 'selected', index: 0 },
        'fallback text may execute only when exactly one native control matches'
    );

    console.log('Undo anchor tests passed');
}

try {
    run();
} catch (err) {
    console.error(err);
    process.exit(1);
}
