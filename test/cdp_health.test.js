const assert = require('assert');
const { ensureCdpReady, isConnectionRefusedError } = require('../src/cdp_health');

async function run() {
    assert.strictEqual(isConnectionRefusedError(new Error('connect ECONNREFUSED 127.0.0.1:9333')), true);
    assert.strictEqual(isConnectionRefusedError(new Error('other failure')), false);

    const events = [];
    let reachable = false;
    await ensureCdpReady({
        port: 9333,
        app: 'agent',
        isReachable: async () => reachable,
        restartApp: async (app, port) => {
            events.push(`restart:${app}:${port}`);
            reachable = true;
        },
        waitMs: 0
    });
    assert.deepStrictEqual(events, ['restart:agent:9333']);

    events.length = 0;
    await ensureCdpReady({
        port: 9333,
        app: 'agent',
        isReachable: async () => true,
        restartApp: async () => events.push('restart'),
        waitMs: 0
    });
    assert.deepStrictEqual(events, []);

    console.log('✅ CDP health tests passed!');
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
