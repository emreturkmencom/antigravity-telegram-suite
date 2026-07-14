const assert = require('assert');
const {
    matchesUndoThread,
    hasUniqueUndoThreadName,
    filterUndoCandidatesByActiveThread
} = require('../src/undo_thread');

function run() {
    assert.strictEqual(
        matchesUndoThread({ threadId: 'thread-a', threadName: 'Task A' }, { id: 'thread-a', idSource: 'url', name: 'Task B' }),
        true,
        'a thread ID directly proven by the active GUI URL is authoritative even if a title changes'
    );
    assert.strictEqual(
        matchesUndoThread({ threadId: 'thread-a', threadName: 'Task A' }, { id: 'thread-b', idSource: 'url', name: 'Task A' }),
        false,
        'a matching title cannot substitute for the wrong captured thread ID'
    );
    assert.strictEqual(
        matchesUndoThread({ threadId: 'thread-a', threadName: 'Task A' }, { id: 'thread-a', idSource: 'title_lookup', name: 'Task A' }),
        false,
        'an ID inferred from a title or filesystem must not prove the rendered GUI conversation'
    );
    assert.strictEqual(
        matchesUndoThread(
            { threadName: 'Legacy Task', workspace: 'Project A' },
            { id: null, name: 'Legacy Task', workspace: 'Project A', workspaceSource: 'dom' },
            { legacyNameIsUnique: true }
        ),
        true,
        'a legacy record may proceed only when title, directly-read workspace, and uniqueness are all proven'
    );
    assert.strictEqual(
        matchesUndoThread({ threadName: 'Legacy Task', workspace: 'Project A' }, { id: null, name: 'Legacy Task', workspace: 'Project A', workspaceSource: 'dom' }),
        false,
        'legacy title matching must fail closed when uniqueness is unknown'
    );
    assert.strictEqual(
        matchesUndoThread(
            { threadName: 'Legacy Task', workspace: 'Project A' },
            { id: null, name: 'legacy task', workspace: 'Project A', workspaceSource: 'dom' },
            { legacyNameIsUnique: true }
        ),
        false,
        'legacy title matching must remain exact and fail closed'
    );
    assert.strictEqual(
        matchesUndoThread(
            { threadName: 'Legacy Task', workspace: 'Project A' },
            { id: null, name: 'Legacy Task', workspace: 'Project B', workspaceSource: 'dom' },
            { legacyNameIsUnique: true }
        ),
        false,
        'a same-title conversation in another workspace must never satisfy a legacy Undo record'
    );
    assert.strictEqual(
        matchesUndoThread(
            { threadName: 'Legacy Task', workspace: 'Project A' },
            { id: null, name: 'Legacy Task', workspace: 'Project A', workspaceSource: 'document_title' },
            { legacyNameIsUnique: true }
        ),
        false,
        'a workspace inferred from a document title cannot prove the active legacy conversation'
    );
    assert.strictEqual(matchesUndoThread({}, { id: 'thread-a', name: 'Task A' }), false);
    const groups = [
        { workspace: 'Project A', threads: [{ name: 'Legacy Task' }] },
        { workspace: 'Project B', threads: [{ name: 'Legacy Task' }] }
    ];
    assert.strictEqual(
        hasUniqueUndoThreadName({ threadName: 'Legacy Task', workspace: 'Project A' }, groups),
        true,
        'a legacy title is safe only when it appears once inside its recorded workspace'
    );
    assert.strictEqual(
        hasUniqueUndoThreadName({ threadName: 'Legacy Task' }, groups),
        false,
        'an unscoped duplicate legacy title cannot prove the intended conversation'
    );
    assert.deepStrictEqual(
        filterUndoCandidatesByActiveThread([
            { id: 'current', threadId: 'thread-a', threadName: 'Task A' },
            { id: 'previous', threadId: 'thread-b', threadName: 'Task B' },
            { id: 'unscoped', threadName: null }
        ], { id: 'thread-a', idSource: 'url', name: 'Task A' }),
        [{ id: 'current', threadId: 'thread-a', threadName: 'Task A' }],
        'the Undo picker must retain only requests proven to belong to the active GUI conversation'
    );
    assert.deepStrictEqual(
        filterUndoCandidatesByActiveThread([
            { id: 'legacy', threadName: 'Legacy Task', workspace: 'Project A' },
            { id: 'other', threadName: 'Other Task', workspace: 'Project A' }
        ], {
            id: null,
            name: 'Legacy Task',
            workspace: 'Project A',
            workspaceSource: 'dom'
        }, groups),
        [{ id: 'legacy', threadName: 'Legacy Task', workspace: 'Project A' }],
        'legacy records may be listed only with the same fail-closed uniqueness proof used at execution time'
    );

    console.log('Undo thread tests passed');
}

try {
    run();
} catch (err) {
    console.error(err);
    process.exit(1);
}
