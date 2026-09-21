const assert = require('assert');
const { startCaffeinate, stopCaffeinate, isCaffeinateActive, getCaffeinatePid, initCaffeinate, PLATFORM } = require('../src/platform');

console.log('🧪 Testing Caffeinate module...');

if (PLATFORM === 'darwin') {
    // Test initial state
    assert.strictEqual(typeof isCaffeinateActive(), 'boolean');

    // Test starting caffeinate
    const started = startCaffeinate();
    assert.strictEqual(started, true, 'startCaffeinate should return true on macOS');
    assert.strictEqual(isCaffeinateActive(), true, 'isCaffeinateActive should be true after start');
    const pid = getCaffeinatePid();
    assert.ok(typeof pid === 'number' && pid > 0, 'getCaffeinatePid should return a positive number');

    // Test starting again (idempotent)
    const startedAgain = startCaffeinate();
    assert.strictEqual(startedAgain, true, 'startCaffeinate should be idempotent');
    assert.strictEqual(getCaffeinatePid(), pid, 'PID should remain unchanged when already running');

    // Test stopping caffeinate
    const stopped = stopCaffeinate();
    assert.strictEqual(stopped, true, 'stopCaffeinate should return true when active process stopped');
    assert.strictEqual(isCaffeinateActive(), false, 'isCaffeinateActive should be false after stop');
    assert.strictEqual(getCaffeinatePid(), null, 'getCaffeinatePid should be null after stop');

    // Test stopping again (idempotent)
    const stoppedAgain = stopCaffeinate();
    assert.strictEqual(stoppedAgain, false, 'stopCaffeinate should return false when already stopped');

    // Test initCaffeinate with env var
    process.env.ENABLE_CAFFEINATE = 'true';
    const inited = initCaffeinate();
    assert.strictEqual(inited, true, 'initCaffeinate should start caffeinate when ENABLE_CAFFEINATE=true');
    assert.strictEqual(isCaffeinateActive(), true);

    // Clean up
    stopCaffeinate();
    assert.strictEqual(isCaffeinateActive(), false);

    console.log('✅ macOS Caffeinate tests passed!');
} else {
    // On non-macOS, starting caffeinate should return false gracefully
    const started = startCaffeinate();
    assert.strictEqual(started, false, 'startCaffeinate should return false on non-macOS');
    assert.strictEqual(isCaffeinateActive(), false);
    console.log('✅ Non-macOS graceful fallback tests passed!');
}
