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
let sessionClicks = 0;
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

const { resolveTargets } = require('./cdp_controller');

// ─── Build DOM Observer Script ────────────────────────────────────────
function buildObserverScript() {
    const buttonTexts = [
        'run', 'accept all', 'accept changes', 'accept', 'always allow', 'allow this conversation',
        'allow', 'retry', 'continue',
        'çalıştır', 'tümünü kabul et', 'değişiklikleri kabul et', 'kabul et', 'her zaman izin ver', 'izin ver', 'yeniden dene', 'devam et'
    ];

    return `
(function() {
    if (window.__AA_BOT_OBSERVER_ACTIVE) return 'already-active';
    window.__AA_BOT_OBSERVER_ACTIVE = true;

    function isAgentPanel() {
        return !!(document.querySelector('.react-app-container') ||
            document.querySelector('[class*="agent"]') ||
            document.querySelector('[data-vscode-context]') ||
            document.querySelector('.monaco-workbench') ||
            document.querySelector('script[src*="agent" i]') ||
            window.location.href.includes('agent'));
    }

    var AMBIGUOUS_TEXTS = { 'run': true, 'accept': true, 'allow': true, 'retry': true, 'continue': true, 'çalıştır': true, 'kabul et': true, 'izin ver': true, 'yeniden dene': true, 'devam et': true };
    var SIDEBAR_SELECTORS = '[role="tree"], [role="treeitem"], [role="listbox"], [role="option"], .monaco-list, .conversation-list, .chat-list, .sidebar-list';

    function isSidebarElement(el) {
        if (!el || !el.closest) return false;
        return !!el.closest(SIDEBAR_SELECTORS);
    }

    var BUTTON_TEXTS = ${JSON.stringify(buttonTexts)};
    var BLOCKED_COMMANDS = ${JSON.stringify(blockedCommands)};
    var ALLOWED_COMMANDS = ${JSON.stringify(allowedCommands)};
    var HAS_FILTERS = BLOCKED_COMMANDS.length > 0 || ALLOWED_COMMANDS.length > 0;

    window.__AA_BOT_CLICK_COUNT = 0;
    window.__AA_BOT_CLICK_LOG = window.__AA_BOT_CLICK_LOG || [];
    window.__AA_BOT_PAUSED = false;
    window.__AA_BOT_LAST_SCAN = Date.now();

    var COOLDOWN_MS = 5000;
    var clickCooldowns = {};

    function _domPath(el) {
        var parts = []; var curr = el;
        for (var i = 0; i < 4 && curr && curr !== document.body; i++) {
            var idx = 0; var child = curr.parentElement ? curr.parentElement.firstElementChild : null;
            while (child) { if (child === curr) break; idx++; child = child.nextElementSibling; }
            parts.unshift((curr.tagName || '') + '[' + idx + ']'); curr = curr.parentElement;
        }
        return parts.join('/');
    }

    function closestClickable(node) {
        var el = node;
        while (el && el !== document.body) {
            var tag = (el.tagName || '').toLowerCase();
            if (tag === 'button' || tag === 'a' || tag.includes('button') || tag.includes('btn') ||
                el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link' ||
                el.classList.contains('cursor-pointer') ||
                el.onclick || el.getAttribute('tabindex') === '0') { return el; }
            el = el.parentElement;
        }
        return node;
    }

    var _wordBoundaryRegex = /[a-z0-9_\\\\-\\\\.]/i;
    function isWordBoundary(str, keyLen) {
        if (str.length === keyLen) return true;
        return !_wordBoundaryRegex.test(str.charAt(keyLen));
    }

    function findButton(root, texts) {
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
        var wNode; var best = null;
        while ((wNode = walker.nextNode())) {
            if (wNode.shadowRoot) {
                var result = findButton(wNode.shadowRoot, texts);
                if (result && (best === null || result.priority < best.priority)) {
                    best = result; if (best.priority === 0) return best;
                }
            }
            var testId = (wNode.getAttribute('data-testid') || wNode.getAttribute('data-action') || '').toLowerCase();
            if (testId.includes('alwaysallow') || testId.includes('always-allow') || testId.includes('allow')) {
                var tag1 = (wNode.tagName || '').toLowerCase();
                if (tag1 === 'button' || tag1.includes('button') || wNode.getAttribute('role') === 'button' || tag1.includes('btn')) {
                    var allowIdx = texts.indexOf('allow');
                    if (allowIdx === -1) allowIdx = texts.length;
                    if (best === null || allowIdx < best.priority) {
                        best = { node: wNode, matchedText: 'allow', priority: allowIdx };
                        if (best.priority === 0) return best;
                    }
                    continue;
                }
            }
            var nodeText = (wNode.textContent || '').trim().toLowerCase();
            if (nodeText.length > 50) continue;

            for (var t = 0; t < texts.length; t++) {
                if (best !== null && t >= best.priority) break;
                var text = texts[t];
                var isMatch = nodeText === text ||
                    (text.length >= 3 && nodeText.startsWith(text) && isWordBoundary(nodeText, text.length) && nodeText.length <= text.length * 5) ||
                    (nodeText.startsWith(text + ' ') && nodeText.length <= text.length * 5) ||
                    (text.length >= 3 && nodeText.startsWith(text) && nodeText.length <= text.length * 5 &&
                        /^[\\s\\u00A0\\n\\r]*(alt|ctrl|shift|cmd|meta|\\\\u2318|\\\\u2325|\\\\u21E7|\\\\u2303|enter|return|\\\\u23CE|\\\\n)/i.test(nodeText.substring(text.length)));
                if (!isMatch) continue;

                var clickable = closestClickable(wNode);
                var tag2 = (clickable.tagName || '').toLowerCase();

                if (AMBIGUOUS_TEXTS[text] && isSidebarElement(clickable)) continue;

                if (tag2 === 'button' || tag2 === 'a' || tag2.includes('button') || tag2.includes('btn') ||
                    clickable.getAttribute('role') === 'button' || clickable.getAttribute('role') === 'link' ||
                    clickable.classList.contains('cursor-pointer') ||
                    clickable.onclick || clickable.getAttribute('tabindex') === '0') {

                    if (clickable.disabled || clickable.getAttribute('aria-disabled') === 'true' ||
                        clickable.classList.contains('loading') || clickable.querySelector('.codicon-loading') ||
                        clickable.getAttribute('data-aa-blocked')) { continue; }

                    var btnKey = _domPath(clickable) + ':' + (clickable.textContent || '').trim().toLowerCase().substring(0, 30);
                    var lastClick = clickCooldowns[btnKey] || 0;
                    if (lastClick && (Date.now() - lastClick < COOLDOWN_MS)) continue;

                    best = { node: clickable, matchedText: text, priority: t };
                    if (t === 0) return best;
                    break;
                }
            }
        }
        return best;
    }

    function extractCommandText(btn) {
        try {
            var el = btn;
            for (var i = 0; i < 8 && el && el !== document.body; i++) {
                el = el.parentElement; if (!el) break;
                var codes = el.querySelectorAll('pre, code');
                if (codes.length > 0) {
                    var allText = '';
                    for (var j = 0; j < codes.length; j++) { allText += ' ' + (codes[j].textContent || '').trim(); }
                    return allText.trim();
                }
            }
        } catch (e) { } return null;
    }

    function isCommandAllowed(commandText) {
        if (!HAS_FILTERS) return true;
        if (!commandText) return false;
        var cmdLower = commandText.toLowerCase();

        function matchesPattern(cmd, pattern) {
            var patLower = pattern.toLowerCase(); var idx = cmd.indexOf(patLower);
            while (idx !== -1) {
                var delimiters = ' \\t\\r\\n|;&/()[]{}"\\'$=<>,\\\\:';
                var before = idx === 0 ? ' ' : cmd.charAt(idx - 1);
                var after = idx + patLower.length >= cmd.length ? ' ' : cmd.charAt(idx + patLower.length);
                if ((idx === 0 || delimiters.indexOf(before) !== -1) && (idx + patLower.length >= cmd.length || delimiters.indexOf(after) !== -1)) { return true; }
                idx = cmd.indexOf(patLower, idx + 1);
            }
            return false;
        }

        for (var b = 0; b < BLOCKED_COMMANDS.length; b++) { if (matchesPattern(cmdLower, BLOCKED_COMMANDS[b])) return false; }
        if (ALLOWED_COMMANDS.length > 0) {
            var allowed = false;
            for (var a = 0; a < ALLOWED_COMMANDS.length; a++) { if (matchesPattern(cmdLower, ALLOWED_COMMANDS[a])) { allowed = true; break; } }
            if (!allowed) return false;
        }
        return true;
    }

    function scanAndClick() {
        window.__AA_BOT_LAST_SCAN = Date.now();
        if (window.__AA_BOT_PAUSED) return null;
        if (!isAgentPanel()) return null;

        // Prune old cooldowns
        var now = Date.now(); var keys = Object.keys(clickCooldowns);
        for (var i = 0; i < keys.length; i++) { if (now - clickCooldowns[keys[i]] > COOLDOWN_MS * 2) delete clickCooldowns[keys[i]]; }

        for (var scan = 0; scan < 5; scan++) {
            var match = findButton(document.body, BUTTON_TEXTS);
            if (!match) return null;

            var btn = match.node; var matchedText = match.matchedText;

            // Command filtering for 'run' buttons
            if (HAS_FILTERS && (matchedText === 'run')) {
                var cmdText = extractCommandText(btn);
                if (cmdText !== null) {
                    if (!isCommandAllowed(cmdText)) {
                        btn.setAttribute('data-aa-blocked', 'true');
                        btn.style.cssText += ';background:#4a1c1c !important;opacity:0.6;cursor:not-allowed;';
                        var blockKey = _domPath(btn) + ':blocked';
                        clickCooldowns[blockKey] = Date.now() + 10000;
                        window.__AA_BOT_CLICK_LOG.push({ text: 'BLOCKED:' + matchedText, cmd: (cmdText || '').substring(0, 60), time: Date.now() });
                        if (window.__AA_BOT_CLICK_LOG.length > 20) window.__AA_BOT_CLICK_LOG.shift();
                        continue;
                    }
                }
            }

            // Circuit breaker for retry/continue
            if (matchedText === 'retry' || matchedText === 'continue') {
                window.__AA_BOT_RECOVERY_TS = window.__AA_BOT_RECOVERY_TS || [];
                window.__AA_BOT_RECOVERY_TS = window.__AA_BOT_RECOVERY_TS.filter(function(ts) { return now - ts < 60000; });
                if (window.__AA_BOT_RECOVERY_TS.length >= 3) return 'blocked:circuit_breaker';
                window.__AA_BOT_RECOVERY_TS.push(now);
            } else { window.__AA_BOT_RECOVERY_TS = []; }

            var key = _domPath(btn) + ':' + (btn.textContent || '').trim().toLowerCase().substring(0, 30);
            clickCooldowns[key] = Date.now();

            btn.click();
            window.__AA_BOT_CLICK_COUNT = (window.__AA_BOT_CLICK_COUNT || 0) + 1;
            window.__AA_BOT_CLICK_LOG.push({ text: matchedText, tag: (btn.tagName || '').toLowerCase(), time: Date.now() });
            if (window.__AA_BOT_CLICK_LOG.length > 20) window.__AA_BOT_CLICK_LOG.shift();
            return 'clicked:' + matchedText;
        }
        return null;
    }

    try { scanAndClick(); } catch(e) {}

    var __SCAN_QUEUED = false;
    var observer = new MutationObserver(function() {
        if (__SCAN_QUEUED || window.__AA_BOT_PAUSED) return;
        __SCAN_QUEUED = true;
        setTimeout(function() {
            try { scanAndClick(); } catch(e) {} finally { __SCAN_QUEUED = false; }
        }, 50);
    });

    observer.observe(document.documentElement, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-expanded', 'data-state']
    });

    // Fallback scan every 10s
    if (window.__AA_BOT_FALLBACK_INTERVAL) clearInterval(window.__AA_BOT_FALLBACK_INTERVAL);
    window.__AA_BOT_FALLBACK_INTERVAL = setInterval(function() {
        if (window.__AA_BOT_PAUSED) return;
        setTimeout(function() { try { scanAndClick(); } catch(e) {} }, 0);
    }, 10000);

    window.__AA_BOT_OBSERVER = observer;
    return 'observer-installed';
})()
`;
}

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
                        hasAgentPanel: !!(document.querySelector('.react-app-container') || document.querySelector('[class*="agent"]'))
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
                    if (health.clicks > sessionClicks) {
                        const delta = health.clicks - sessionClicks;
                        totalClicks += delta;
                        sessionClicks = health.clicks;
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
        sessionClicks = 0;
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
            if (health && health.clicks > sessionClicks) {
                const delta = health.clicks - sessionClicks;
                totalClicks += delta;
                sessionClicks = health.clicks;
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
        sessionClicks,
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
