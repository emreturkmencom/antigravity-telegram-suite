function enqueueByKey(queues, key, task) {
    const previous = queues.get(key) || Promise.resolve();
    const run = previous.catch(() => {}).then(task);
    const queued = run.finally(() => {
        if (queues.get(key) === queued) {
            queues.delete(key);
        }
    });
    queues.set(key, queued);
    return queued;
}

module.exports = { enqueueByKey };
