const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createUndoStore } = require('../src/undo_store');

function run() {
    const filePath = path.join(os.tmpdir(), `undo-store-test-${Date.now()}.json`);
    try {
        const store = createUndoStore({ filePath, maxItems: 3 });
        const first = store.add({
            chatId: 1,
            targetId: 't1',
            displayText: 'hello',
            threadId: 'thread-1',
            threadName: 'Task'
        });
        assert.ok(first.id);
        assert.strictEqual(store.list().length, 1);

        store.add({ chatId: 1, targetId: 't1', displayText: 'two', threadId: 'thread-1' });
        store.add({ chatId: 1, targetId: 't1', displayText: 'three', threadId: 'thread-1' });
        store.add({ chatId: 1, targetId: 't1', displayText: 'four', threadId: 'thread-1' });
        assert.strictEqual(store.list().length, 3, 'store must cap retained items');
        assert.strictEqual(store.list()[0].displayText, 'two');

        store.markUndone(store.list()[0].id);
        assert.strictEqual(store.list()[0].undone, true);

        const reloaded = createUndoStore({ filePath, maxItems: 3 });
        assert.strictEqual(reloaded.list().length, 3);
        assert.strictEqual(reloaded.list()[0].undone, true);
    } finally {
        try { fs.unlinkSync(filePath); } catch (_) {}
    }
    console.log('Undo store tests passed');
}

try {
    run();
} catch (err) {
    console.error(err);
    process.exit(1);
}
