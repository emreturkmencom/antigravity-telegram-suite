const http = require('http');
const { cleanLockFile, killIDE, launchIDE } = require('./platform');

function wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function isConnectionRefusedError(err) {
    const text = `${err && err.code ? err.code : ''} ${err && err.message ? err.message : ''}`;
    return text.includes('ECONNREFUSED') || text.includes('actively refused');
}

function isCdpReachable(port, timeoutMs = 2000) {
    return new Promise(resolve => {
        const req = http.get(`http://127.0.0.1:${port}/json`, res => {
            res.resume();
            resolve(res.statusCode >= 200 && res.statusCode < 500);
        });
        req.setTimeout(timeoutMs, () => {
            req.destroy();
            resolve(false);
        });
        req.on('error', () => resolve(false));
    });
}

async function restartAppWithCdp(app, port) {
    await killIDE(app);
    cleanLockFile(app);
    await launchIDE(null, port, app);
}

async function ensureCdpReady(options = {}) {
    const port = options.port || 9333;
    const app = options.app || 'agent';
    const isReachable = options.isReachable || isCdpReachable;
    const restartApp = options.restartApp || restartAppWithCdp;
    const waitMs = options.waitMs === undefined ? 1000 : options.waitMs;
    const attempts = options.attempts || 20;

    if (await isReachable(port)) {
        return true;
    }

    await restartApp(app, port);

    for (let i = 0; i < attempts; i++) {
        if (await isReachable(port)) {
            return true;
        }
        if (waitMs > 0) {
            await wait(waitMs);
        }
    }

    throw new Error(`CDP port ${port} is not reachable after restarting ${app}`);
}

module.exports = {
    ensureCdpReady,
    isCdpReachable,
    isConnectionRefusedError
};
