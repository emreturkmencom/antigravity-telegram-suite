const assert = require('assert');
const { enqueueByKey } = require('../src/message_queue');

async function run() {
    const queues = new Map();
    const events = [];

    const first = enqueueByKey(queues, 'chat-a', async () => {
        events.push('a1:start');
        await new Promise(resolve => setTimeout(resolve, 30));
        events.push('a1:end');
        return 'first';
    });
    const second = enqueueByKey(queues, 'chat-a', async () => {
        events.push('a2:start');
        events.push('a2:end');
        return 'second';
    });

    assert.strictEqual(await first, 'first');
    assert.strictEqual(await second, 'second');
    assert.deepStrictEqual(events, ['a1:start', 'a1:end', 'a2:start', 'a2:end']);
    assert.strictEqual(queues.has('chat-a'), false);

    const parallelEvents = [];
    const slow = enqueueByKey(queues, 'chat-a', async () => {
        parallelEvents.push('a:start');
        await new Promise(resolve => setTimeout(resolve, 40));
        parallelEvents.push('a:end');
    });
    const fast = enqueueByKey(queues, 'chat-b', async () => {
        parallelEvents.push('b:start');
        parallelEvents.push('b:end');
    });
    await Promise.all([slow, fast]);
    assert.deepStrictEqual(parallelEvents, ['a:start', 'b:start', 'b:end', 'a:end']);

    await assert.rejects(
        enqueueByKey(queues, 'chat-a', async () => {
            throw new Error('boom');
        }),
        /boom/
    );
    const recovered = await enqueueByKey(queues, 'chat-a', async () => 'recovered');
    assert.strictEqual(recovered, 'recovered');

    console.log('✅ Message queue tests passed!');
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
