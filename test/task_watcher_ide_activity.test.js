const assert = require('assert');
const TaskWatcher = require('../src/task_watcher');

function testTaskWatcherIdeActivityOption() {
    let notifications = [];
    const watcherDefault = new TaskWatcher({
        onNotification: (n) => notifications.push(n)
    });
    assert.strictEqual(watcherDefault.reportIdeActivity, false, 'Default reportIdeActivity should be false');

    const watcherEnabled = new TaskWatcher({
        reportIdeActivity: true,
        onNotification: (n) => notifications.push(n)
    });
    assert.strictEqual(watcherEnabled.reportIdeActivity, true, 'Custom reportIdeActivity should be true when passed');

    console.log('✅ TaskWatcher IDE activity option tests passed!');
}

try {
    testTaskWatcherIdeActivityOption();
} catch (err) {
    console.error('❌ TaskWatcher IDE activity test failed:', err);
    process.exit(1);
}
