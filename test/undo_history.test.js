const assert = require('assert');
const {
    listUndoCandidates,
    getUndoPage,
    createUndoSessionStore,
    formatUndoLabel
} = require('../src/undo_history');

function run() {
    const candidates = listUndoCandidates([
        { id: 'queued', chatId: 1, status: 'queued' },
        { id: 'sent', chatId: 1, status: 'completed', targetId: 'target', displayText: 'first' },
        { id: 'other', chatId: 2, status: 'completed', targetId: 'target', displayText: 'second' }
    ], 1);

    assert.deepStrictEqual(candidates.map(item => item.id), ['sent']);

    const retained = listUndoCandidates([
        { id: 'first', chatId: 1, status: 'sent_to_gui', targetId: 'target', threadName: 'Thread A', displayText: 'repeat' },
        { id: 'outbound', chatId: 1, status: 'completed', targetId: 'target', kind: 'outbound:manual', displayText: 'never undo this' },
        { id: 'closeout', chatId: 1, status: 'completed', targetId: 'target', reason: 'closeout_only', displayText: 'never undo this either' },
        { id: 'second', chatId: 1, status: 'completed', targetId: 'target', deliveredToGui: true, threadName: 'Thread A', displayText: 'repeat' },
        { id: 'anchored', chatId: 1, status: 'completed', targetId: 'target', deliveredToGui: true, threadName: 'Thread B', displayText: 'saved', undoAnchor: { text: 'saved', matchIndex: 4 } }
    ], 1);

    assert.deepStrictEqual(retained.map(item => item.id), ['anchored', 'second', 'first']);
    assert.deepStrictEqual(retained[1].undoAnchor, { text: 'repeat', matchIndex: null, scopeKey: null });
    assert.deepStrictEqual(retained[2].undoAnchor, { text: 'repeat', matchIndex: null, scopeKey: null });
    assert.deepStrictEqual(retained[0].undoAnchor, { text: 'saved', matchIndex: null, scopeKey: null });

    const captured = listUndoCandidates([
        {
            id: 'captured', chatId: 1, status: 'completed', targetId: 'target', deliveredToGui: true,
            undoAnchor: { text: 'repeat', scopeKey: 'data-message-id:target', matchIndex: 3 }
        }
    ], 1);
    assert.deepStrictEqual(
        captured[0].undoAnchor,
        { text: 'repeat', scopeKey: 'data-message-id:target', matchIndex: 3 },
        'only a CDP-captured stable scope may retain an ordinal'
    );

    const failedCandidates = listUndoCandidates([
        { id: 'failed-before-delivery', chatId: 1, status: 'failed', targetId: 'retained-target', displayText: 'never reached GUI' },
        { id: 'timeout-before-delivery', chatId: 1, status: 'timeout', targetId: 'retained-target', displayText: 'never reached GUI' },
        { id: 'interrupted-before-delivery', chatId: 1, status: 'interrupted', targetId: 'retained-target', displayText: 'never reached GUI' },
        { id: 'failed-after-delivery', chatId: 1, status: 'failed', targetId: 'delivered-target', deliveredToGui: true, displayText: 'reached GUI first' },
        { id: 'currently-delivered', chatId: 1, status: 'sent_to_gui', targetId: 'active-target', displayText: 'just delivered' }
    ], 1);
    assert.deepStrictEqual(
        failedCandidates.map(item => item.id),
        ['currently-delivered', 'failed-after-delivery']
    );

    const undone = listUndoCandidates([
        { id: 'done', chatId: 1, status: 'sent_to_gui', targetId: 't', displayText: 'x', undone: true },
        { id: 'live', chatId: 1, status: 'sent_to_gui', targetId: 't', displayText: 'y' }
    ], 1);
    assert.deepStrictEqual(undone.map(item => item.id), ['live']);

    const pageCandidates = ['newest', 'newer', 'middle', 'older', 'oldest'].map(id => ({ id }));
    const middlePage = getUndoPage(pageCandidates, 1, 2);
    assert.deepStrictEqual(middlePage.items.map(item => item.id), ['middle', 'older']);
    assert.deepStrictEqual(middlePage, {
        items: [pageCandidates[2], pageCandidates[3]],
        page: 1,
        pageSize: 2,
        total: 5,
        pageCount: 3,
        hasPrevious: true,
        hasNext: true
    });

    const finalPage = getUndoPage(pageCandidates, 8, 2);
    assert.strictEqual(finalPage.page, 2);
    assert.deepStrictEqual(finalPage.items.map(item => item.id), ['oldest']);
    assert.strictEqual(finalPage.hasNext, false);

    let now = 1000;
    let tokenNumber = 0;
    const sessions = createUndoSessionStore({
        now: () => now,
        ttlMs: 500,
        createToken: () => `token-${++tokenNumber}`
    });
    const selectedCandidate = {
        id: 'selected',
        chatId: 1,
        displayText: 'undo this',
        undoAnchor: { text: 'undo this', matchIndex: 0 }
    };
    const token = sessions.issue(selectedCandidate);
    assert.strictEqual(token, 'token-1');
    assert.deepStrictEqual(sessions.get(token, 1), selectedCandidate);
    assert.strictEqual(sessions.get(token, 2), null);

    const consumed = sessions.consume(token, 1);
    assert.deepStrictEqual(consumed, selectedCandidate);
    assert.strictEqual(sessions.get(token, 1), null);

    const expiringToken = sessions.issue(selectedCandidate);
    now += 501;
    assert.strictEqual(sessions.get(expiringToken, 1), null);

    assert.strictEqual(
        formatUndoLabel({ threadName: 'Thread A', displayText: '  first\n prompt  ' }, 0),
        '1. Thread A · first prompt'
    );
    assert.strictEqual(
        formatUndoLabel({ undoAnchor: { text: 'anchor fallback' } }, 1),
        '2. anchor fallback'
    );
    assert.strictEqual(
        Array.from(formatUndoLabel({ displayText: 'x'.repeat(100) }, 9)).length,
        64
    );
}

try {
    run();
    console.log('Undo history tests passed');
} catch (err) {
    console.error(err);
    process.exit(1);
}
