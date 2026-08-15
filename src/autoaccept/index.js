/**
 * Auto-Accept Module for Antigravity Telegram Bot
 * 
 * Automatically clicks Run, Accept, Always Allow, and Continue buttons
 * in the Antigravity IDE agent panel via CDP (Chrome DevTools Protocol).
 * 
 * Injects a MutationObserver into the IDE's webview targets that watches
 * for button elements and clicks them automatically with safety guards.
 * 
 * DOM Observer pattern inspired by yazanbaker94/AntiGravity-AutoAccept
 * (https://github.com/yazanbaker94/AntiGravity-AutoAccept)
 */

const http = require('http');

// ─── State ────────────────────────────────────────────────────────────
let isEnabled = true;
let heartbeatTimer = null;
let injectedTargets = new Set();
let totalClicks = 0;
let sessionClicks = {};
let lastClickTime = 0;
let lastClickText = '';

// Default blocked commands (safety presets)
let blockedCommands = [
    'rm -rf /',
    'rm -rf /*',
    'rm -rf ~',
    'rm -rf .git',
    'git push --force',
    'git push -f',
    'git clean -fdx',
    'drop database',
    'drop table',
    'truncate table',
    'format c:',
    'dd if=/dev/zero',
    'dd if=/dev/urandom',
    'shutdown ',
    'reboot',
    'mkfs.',
    'wipefs',
    'shred '
];
let allowedCommands = [];

// ─── HTTP Helper ──────────────────────────────────────────────────────
function httpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', err => reject(err));
    });
}

const { resolveTargets } = require('../cdp_controller');
const { buildIDEObserverScript } = require('./ide_autoaccept');
const { buildStandaloneObserverScript } = require('./standalone_autoaccept');

const DriverFactory = require('../drivers');

// ─── Build DOM Observer Script ────────────────────────────────────────
function buildObserverScript() {
    const buttonTexts = [
        'yes, allow this time', 'yes, and always allow', 'yes, always allow', 'allow running this command',
        'allow url access', 'allow reading url', 'allow external link', 'allow external site', 'allow domain', 'allow access',
        'run', 'accept all', 'accept changes', 'accept all changes', 'accept', 'always allow', 'allow this conversation',
        'allow', 'retry', 'continue', 'grant', 'open link', 'open', 'confirm',
        'url erişimine izin ver', 'siteye erişime izin ver', 'erişime izin ver', 'alana izin ver', 'çalıştır',
        'tümünü kabul et', 'değişiklikleri kabul et', 'tüm değişiklikleri kabul et', 'kabul et', 'her zaman izin ver',
        'bu seferlik izin ver', 'izin ver', 'yeniden dene', 'devam et', 'onayla', 'bağlantıyı aç'
    ];

    if (DriverFactory.getDriver().appType === 'agent') {
        return buildStandaloneObserverScript(buttonTexts, blockedCommands, allowedCommands);
    }
    return buildIDEObserverScript(buttonTexts, blockedCommands, allowedCommands);
}

// Script generation moved to external modules

// ─── CDP Evaluation Helper ────────────────────────────────────────────
async function cdpEval(wsUrl, expression, timeoutMs = 5000) {
    const CDP = require('chrome-remote-interface');
    let client;
    try {
        client = await CDP({ target: wsUrl });
        const { Runtime } = client;
        await Runtime.enable();
        const result = await Promise.race([
            Runtime.evaluate({ expression, returnByValue: true, awaitPromise: false }),
            new Promise((_, rej) => setTimeout(() => rej(new Error('eval timeout')), timeoutMs))
        ]);
        await client.close();
        return result?.result?.value;
    } catch (e) {
        try { if (client) await client.close(); } catch (_) {}
        throw e;
    }
}

// ─── Check Observer Status ───────────────────────────────────────────
async function checkObserverStatus(port) {
    const targets = await resolveTargets(port, true);
    for (const target of targets) {
        try {
            const result = await cdpEval(target.webSocketDebuggerUrl, `
                (function() {
                    return {
                        active: !!window.__AA_BOT_OBSERVER_ACTIVE,
                        paused: !!window.__AA_BOT_PAUSED,
                        clicks: window.__AA_BOT_CLICK_COUNT || 0,
                        clickLog: (window.__AA_BOT_CLICK_LOG || []).slice(-5),
                        hasAgentPanel: !!(document.querySelector('#conversation, #chat, .interactive-session, .react-app-container') || document.querySelector('[class*="agent"]'))
                    };
                })()
            `);
            if (result && result.hasAgentPanel) return result;
        } catch (_) {}
    }
    return null;
}

// ─── Inject Observer ──────────────────────────────────────────────────
async function injectObserver(port) {
    const targets = await resolveTargets(port, true);
    const script = buildObserverScript();
    let injectedCount = 0;

    for (const target of targets) {
        if (injectedTargets.has(target.id)) continue;
        try {
            const result = await cdpEval(target.webSocketDebuggerUrl, script);
            if (result === 'observer-installed' || result === 'already-active') {
                injectedTargets.add(target.id);
                injectedCount++;
                console.log(`[autoaccept] Injected observer into ${target.id.substring(0, 6)} → ${result}`);
            }
        } catch (e) {
            console.log(`[autoaccept] Inject failed for ${target.id.substring(0, 6)}: ${e.message}`);
        }
    }
    return injectedCount;
}

// ─── Heartbeat ────────────────────────────────────────────────────────
async function heartbeat(port) {
    if (!isEnabled) return;

    try {
        const targets = await resolveTargets(port, true);
        const activeIds = new Set(targets.map(t => t.id));

        // Prune dead targets
        for (const tid of injectedTargets) {
            if (!activeIds.has(tid)) {
                injectedTargets.delete(tid);
            }
        }

        // Check health and harvest click counts
        for (const target of targets) {
            if (!injectedTargets.has(target.id)) continue;
            try {
                const health = await cdpEval(target.webSocketDebuggerUrl, `
                    (function() {
                        var alive = !!window.__AA_BOT_OBSERVER_ACTIVE && 
                                    (Date.now() - (window.__AA_BOT_LAST_SCAN || 0)) < 120000;
                        var clicks = window.__AA_BOT_CLICK_COUNT || 0;
                        var log = (window.__AA_BOT_CLICK_LOG || []).slice(-5);
                        window.__AA_BOT_CLICK_LOG = [];
                        return { alive: alive, clicks: clicks, log: log };
                    })()
                `);

                if (health) {
                    // Update click stats
                    const lastTargetClicks = sessionClicks[target.id] || 0;
                    if (health.clicks > lastTargetClicks) {
                        const delta = health.clicks - lastTargetClicks;
                        totalClicks += delta;
                        sessionClicks[target.id] = health.clicks;
                    } else if (health.clicks < lastTargetClicks) {
                        const delta = health.clicks;
                        totalClicks += delta;
                        sessionClicks[target.id] = health.clicks;
                    }

                    // Log recent clicks
                    if (health.log && health.log.length > 0) {
                        for (const cl of health.log) {
                            console.log(`[autoaccept] CLICK: ${cl.text} (${cl.tag})`);
                            lastClickText = cl.text;
                            lastClickTime = cl.time || Date.now();
                        }
                    }

                    // Re-inject if dead
                    if (!health.alive) {
                        console.log(`[autoaccept] Observer dead in ${target.id.substring(0, 6)}, re-injecting...`);
                        injectedTargets.delete(target.id);
                        const script = buildObserverScript();
                        const result = await cdpEval(target.webSocketDebuggerUrl, script);
                        if (result === 'observer-installed' || result === 'already-active') {
                            injectedTargets.add(target.id);
                            console.log(`[autoaccept] Re-injected successfully`);
                        }
                    }
                }
            } catch (e) {
                console.log(`[autoaccept] Heartbeat failed for ${target.id.substring(0, 6)}: ${e.message}`);
            }
        }

        // Inject into new targets that appeared
        for (const target of targets) {
            if (!injectedTargets.has(target.id)) {
                try {
                    const script = buildObserverScript();
                    const result = await cdpEval(target.webSocketDebuggerUrl, script);
                    if (result === 'observer-installed' || result === 'already-active') {
                        injectedTargets.add(target.id);
                        console.log(`[autoaccept] New target injected: ${target.id.substring(0, 6)}`);
                    }
                } catch (_) {}
            }
        }
    } catch (e) {
        if (!e.message.includes('ECONNREFUSED')) {
            console.log(`[autoaccept] Heartbeat error: ${e.message}`);
        }
    }
}

// ─── Start/Stop ───────────────────────────────────────────────────────

/**
 * Enable auto-accept.
 * @param {number} port - CDP debugging port
 * @returns {Promise<{success: boolean, injected: number}>}
 */
async function enable(port) {
    const wasEnabled = isEnabled;
    isEnabled = true;

    if (!wasEnabled) {
        sessionClicks = {};
    }

    // Clear stale target cache and inject fresh
    injectedTargets.clear();
    let injected = 0;
    try {
        injected = await injectObserver(port);
        console.log(`[autoaccept] Enabled — injected into ${injected} targets`);
    } catch (e) {
        if (!e.message.includes('ECONNREFUSED')) {
            console.log(`[autoaccept] Initial inject failed: ${e.message}`);
        }
    }

    // Start heartbeat (monitor health + inject new targets every 3s)
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    heartbeatTimer = setInterval(() => heartbeat(port), 3000);

    return { success: true, injected };
}

/**
 * Disable auto-accept.
 * @param {number} port - CDP debugging port
 * @returns {Promise<{success: boolean, totalClicks: number}>}
 */
async function disable(port) {
    if (!isEnabled) return { success: true, totalClicks };

    isEnabled = false;

    // Stop heartbeat
    if (heartbeatTimer) {
        clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }

    // Final click harvest — capture any clicks that occurred since the last heartbeat
    const targets = await resolveTargets(port, true).catch(() => []);
    for (const target of targets) {
        if (!injectedTargets.has(target.id)) continue;
        try {
            const health = await cdpEval(target.webSocketDebuggerUrl, `
                (function() {
                    return {
                        clicks: window.__AA_BOT_CLICK_COUNT || 0,
                        log: (window.__AA_BOT_CLICK_LOG || []).slice(-5)
                    };
                })()
            `);
            const lastTargetClicks = sessionClicks[target.id] || 0;
            if (health && health.clicks > lastTargetClicks) {
                const delta = health.clicks - lastTargetClicks;
                totalClicks += delta;
                sessionClicks[target.id] = health.clicks;
            }
            if (health && health.log) {
                for (const cl of health.log) {
                    console.log(`[autoaccept] CLICK (final harvest): ${cl.text} (${cl.tag})`);
                    lastClickText = cl.text;
                    lastClickTime = cl.time || Date.now();
                }
            }
        } catch (_) {}
    }

    // Kill our observer in all targets
    for (const target of targets) {
        try {
            await cdpEval(target.webSocketDebuggerUrl, `
                window.__AA_BOT_PAUSED = true;
                if (window.__AA_BOT_OBSERVER) {
                    window.__AA_BOT_OBSERVER.disconnect();
                    window.__AA_BOT_OBSERVER = null;
                }
                if (window.__AA_BOT_FALLBACK_INTERVAL) {
                    clearInterval(window.__AA_BOT_FALLBACK_INTERVAL);
                    window.__AA_BOT_FALLBACK_INTERVAL = null;
                }
                window.__AA_BOT_OBSERVER_ACTIVE = false;
                window.__AA_BOT_CLICK_COUNT = 0;
                'stopped'
            `);
        } catch (_) {}
    }

    injectedTargets.clear();
    console.log(`[autoaccept] Disabled — total clicks: ${totalClicks}`);
    return { success: true, totalClicks };
}

/**
 * Get current auto-accept status.
 * @param {number} port - CDP debugging port
 * @returns {Promise<object>}
 */
async function getStatus(port) {
    let status = null;
    try {
        status = await checkObserverStatus(port);
    } catch (_) {}

    const timeSince = lastClickTime ? Math.round((Date.now() - lastClickTime) / 1000) : null;

    return {
        enabled: isEnabled,
        active: !!(status && status.active),
        paused: !!(status && status.paused),
        clicks: status?.clicks || 0,
        totalClicks,
        sessionClicks: Object.values(sessionClicks).reduce((a, b) => a + b, 0),
        lastClickText,
        lastClickTimeSec: timeSince,
        injectedTargets: injectedTargets.size,
        blockedCommandsCount: blockedCommands.length,
        hasAgentPanel: !!(status && status.hasAgentPanel)
    };
}

/**
 * Update blocked commands list.
 * @param {string[]} commands 
 */
function setBlockedCommands(commands) {
    blockedCommands = commands || [];
}

/**
 * Get current blocked commands.
 * @returns {string[]}
 */
function getBlockedCommands() {
    return [...blockedCommands];
}

module.exports = { buildObserverScript,
    enable,
    disable,
    getStatus,
    setBlockedCommands,
    getBlockedCommands,
    get isEnabled() { return isEnabled; }
};
