function buildIDEObserverScript(buttonTexts, blockedCommands, allowedCommands) {
    return `
(function() {
    if (window.__AA_BOT_OBSERVER_ACTIVE) {
        if (window.__AA_BOT_OBSERVER_INSTANCE) {
            window.__AA_BOT_OBSERVER_INSTANCE.disconnect();
        }
    }
    window.__AA_BOT_OBSERVER_ACTIVE = true;

    function isAgentPanel() {
        return !!(
            document.querySelector('#conversation, #chat, #cascade, .interactive-session') ||
            document.querySelector('.antigravity-agent-side-panel') ||
            document.querySelector('[contenteditable="true"]') ||
            document.querySelector('textarea')
        );
    }

    var AMBIGUOUS_TEXTS = { 'run': true, 'accept': true, 'allow': true, 'retry': true, 'continue': true, 'çalıştır': true, 'kabul et': true, 'izin ver': true, 'yeniden dene': true, 'devam et': true };
    var SIDEBAR_SELECTORS = '[role="tree"], [role="treeitem"], [role="listbox"], [role="option"], .monaco-list, .conversation-list, .chat-list, .sidebar-list';
    var EXCLUDED_SELECTORS = '.settings-editor, .settings-body, .preferences-editor, .explorer-viewlet, .notifications-center, .menubar, .statusbar, .notes-editor, [class*="SettingsEditor"], [class*="settings-widget"], [role="tabpanel"][aria-label*="Settings"], [role="tabpanel"][aria-label*="Ayarlar"], .dialog-shadow, .quick-input-widget, pre, code, [class*="thought-"], details.thought, [data-testid*="question"], form, [class*="question-card"]';

    var NEVER_CLICK_TEXTS = { 'proceed': true, 'cancel': true, 'iptal': true, 'onayla': true, 'devam': true };
    function isArtifactFeedbackButton(btn, matchedText) {
        var btnText = (btn.textContent || '').trim().toLowerCase();
        if (NEVER_CLICK_TEXTS[btnText]) return true;
        var parent = btn;
        for (var i = 0; i < 6 && parent; i++) {
            var cls = (parent.className || '').toString().toLowerCase();
            var dt = (parent.getAttribute('data-testid') || '').toLowerCase();
            if (cls.indexOf('artifact') !== -1 || cls.indexOf('feedback') !== -1 ||
                dt.indexOf('artifact') !== -1 || dt.indexOf('feedback') !== -1 ||
                dt.indexOf('proceed') !== -1) {
                return true;
            }
            parent = parent.parentElement;
        }
        return false;
    }

    function isSidebarElement(el) {
        if (!el || !el.closest) return false;
        return !!el.closest(SIDEBAR_SELECTORS);
    }

    function isExcludedArea(el) {
        if (!el || !el.closest) return false;
        return !!el.closest(EXCLUDED_SELECTORS);
    }

    var BUTTON_TEXTS = ${JSON.stringify(buttonTexts)};
    var BLOCKED_COMMANDS = ${JSON.stringify(blockedCommands)};
    var ALLOWED_COMMANDS = ${JSON.stringify(allowedCommands)};
    var HAS_FILTERS = BLOCKED_COMMANDS.length > 0 || ALLOWED_COMMANDS.length > 0;

    window.__AA_BOT_CLICK_COUNT = window.__AA_BOT_CLICK_COUNT || 0;
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
        var fallback = null;
        while (el && el !== document.body) {
            var tag = (el.tagName || '').toLowerCase();
            if (tag === 'button' || tag === 'a' || tag.includes('button') || tag.includes('btn') ||
                el.getAttribute('role') === 'button' || el.getAttribute('role') === 'link' ||
                el.classList.contains('monaco-button') || el.classList.contains('monaco-text-button') ||
                el.getAttribute('data-action') === 'accept' || el.classList.contains('review-button')) {
                return el;
            }
            if (!fallback && (el.classList.contains('cursor-pointer') || el.onclick || el.getAttribute('tabindex') === '0')) {
                fallback = el;
            }
            el = el.parentElement;
        }
        return fallback || node;
    }

    var _wordBoundaryRegex = new RegExp('[a-z0-9_\\\\-\\\\.]', 'i');
    function isWordBoundary(str, keyLen) {
        if (str.length === keyLen) return true;
        return !_wordBoundaryRegex.test(str.charAt(keyLen));
    }

    var _shortcutSuffixRegex = new RegExp('^[\\\\s\\\\u00A0\\\\n\\\\r]*(alt|ctrl|shift|cmd|meta|\\\\u2318|\\\\u2325|\\\\u21E7|\\\\u2303|enter|return|\\\\u23CE|\\\\n)', 'i');

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
                if (isExcludedArea(wNode)) continue;
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
            var cleanNodeText = nodeText.replace(/^\\d+[\\s\\.\\)]*/, '');

            for (var t = 0; t < texts.length; t++) {
                if (best !== null && t >= best.priority) break;
                var text = texts[t];
                var isMatch = cleanNodeText === text ||
                    (text.length >= 3 && cleanNodeText.startsWith(text) && isWordBoundary(cleanNodeText, text.length) && cleanNodeText.length <= text.length * 5) ||
                    (cleanNodeText.startsWith(text + ' ') && cleanNodeText.length <= text.length * 5) ||
                    (text.length >= 3 && cleanNodeText.startsWith(text) && cleanNodeText.length <= text.length * 5 &&
                        _shortcutSuffixRegex.test(cleanNodeText.substring(text.length)));
                if (!isMatch) continue;

                var clickable = closestClickable(wNode);
                var tag2 = (clickable.tagName || '').toLowerCase();

                if (AMBIGUOUS_TEXTS[text] && isSidebarElement(clickable)) continue;
                if (isExcludedArea(clickable)) continue;

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
                var delimiters = ' \\\\t\\\\r\\\\n|;&/()[]{}"\\\\\\'$=<>,\\\\\\\\:';
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

    function getScanRoots() {
        var selector = '#conversation, #chat, #cascade, .interactive-session, .antigravity-agent-side-panel, .relative.flex.flex-col.gap-y-3, [role="dialog"], [role="alertdialog"], .monaco-dialog-box, .notification-toast, .notifications-toasts, [class*="permission"], [class*="tool-call"], .monaco-workbench .editor-group-container, .monaco-editor, .zone-widget, .inline-chat-widget, [class*="diff"], [class*="review"], .floating-click-widget';
        var nodes = document.querySelectorAll(selector);
        if (nodes.length === 0) return [document.body];
        return Array.from(nodes);
    }

    function scanAndClick() {
        window.__AA_BOT_LAST_SCAN = Date.now();
        if (window.__AA_BOT_PAUSED) return null;
        
        var roots = getScanRoots();
        if (roots.length === 0) return null;

        var now = Date.now(); var keys = Object.keys(clickCooldowns);
        for (var i = 0; i < keys.length; i++) { if (now - clickCooldowns[keys[i]] > COOLDOWN_MS * 2) delete clickCooldowns[keys[i]]; }

        // Check for permission radio groups (e.g. Allow reading URL / Allow domain / Allow running tool)
        for (var pr = 0; pr < roots.length; pr++) {
            var groups = Array.from(roots[pr].querySelectorAll('[role="radiogroup"], fieldset, div.flex-col'));
            for (var g = 0; g < groups.length; g++) {
                var grp = groups[g];
                var labels = Array.from(grp.querySelectorAll('label, [role="radio"]'));
                var priorityTexts = [
                    'yes, and always allow in this conversation',
                    'yes, and always allow',
                    'yes, always allow',
                    'her zaman izin ver',
                    'yes, allow this time',
                    'yes, allow',
                    'izin ver',
                    'bu seferlik izin ver'
                ];
                for (var pt = 0; pt < priorityTexts.length; pt++) {
                    var targetText = priorityTexts[pt];
                    var matchRadio = labels.find(function(l) { return (l.textContent || '').trim().toLowerCase().includes(targetText); });
                    if (matchRadio) {
                        var submitBtn = grp.closest('div.border, div.p-4, div.flex-col, form')?.querySelector('[data-testid="interaction-continue-button"], button.bg-primary') ||
                                        document.querySelector('[data-testid="interaction-continue-button"]');
                        if (submitBtn && !submitBtn.disabled) {
                            var formKey = _domPath(grp) + ':perm-radio:' + targetText;
                            if (!clickCooldowns[formKey] || (now - clickCooldowns[formKey] > COOLDOWN_MS)) {
                                clickCooldowns[formKey] = now;
                                matchRadio.click();
                                setTimeout(function() {
                                    if (submitBtn) submitBtn.click();
                                }, 80);
                                window.__AA_BOT_CLICK_COUNT = (window.__AA_BOT_CLICK_COUNT || 0) + 1;
                                window.__AA_BOT_CLICK_LOG.push({ text: 'PERMISSION:' + targetText, tag: (matchRadio.tagName || '').toLowerCase(), time: now });
                                if (window.__AA_BOT_CLICK_LOG.length > 20) window.__AA_BOT_CLICK_LOG.shift();
                                return 'clicked:permission_radio';
                            }
                        }
                    }
                }
            }
        }

        for (var scan = 0; scan < 5; scan++) {
            var match = null;
            for (var r = 0; r < roots.length; r++) {
                var res = findButton(roots[r], BUTTON_TEXTS);
                if (res && (match === null || res.priority < match.priority)) {
                    match = res;
                    if (match.priority === 0) break;
                }
            }
            if (!match) return null;

            var btn = match.node; var matchedText = match.matchedText;

            // SAFETY: Never auto-click artifact feedback buttons (Proceed/Cancel)
            if (isArtifactFeedbackButton(btn, matchedText)) {
                btn.setAttribute('data-aa-blocked', 'true');
                clickCooldowns[_domPath(btn) + ':artifact-feedback'] = Date.now() + 30000;
                window.__AA_BOT_CLICK_LOG.push({ text: 'SKIPPED_ARTIFACT:' + matchedText, tag: (btn.tagName || '').toLowerCase(), time: Date.now() });
                if (window.__AA_BOT_CLICK_LOG.length > 20) window.__AA_BOT_CLICK_LOG.shift();
                continue;
            }

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

            if (matchedText === 'retry' || matchedText === 'continue') {
                window.__AA_BOT_RECOVERY_TS = window.__AA_BOT_RECOVERY_TS || [];
                window.__AA_BOT_RECOVERY_TS = window.__AA_BOT_RECOVERY_TS.filter(function(ts) { return now - ts < 60000; });
                if (window.__AA_BOT_RECOVERY_TS.length >= 3) return 'blocked:circuit_breaker';
                window.__AA_BOT_RECOVERY_TS.push(now);
            } else { window.__AA_BOT_RECOVERY_TS = []; }

            var key = _domPath(btn) + ':' + (btn.textContent || '').trim().toLowerCase().substring(0, 30);
            
            clickCooldowns[key] = Date.now();

            var opts = { bubbles: true, cancelable: true, view: window, pointerId: 1, pointerType: 'mouse' };
            try { btn.dispatchEvent(new PointerEvent('pointerdown', opts)); } catch(e) {}
            try { btn.dispatchEvent(new MouseEvent('mousedown', opts)); } catch(e) {}
            try { btn.dispatchEvent(new PointerEvent('pointerup', opts)); } catch(e) {}
            try { btn.dispatchEvent(new MouseEvent('mouseup', opts)); } catch(e) {}
            try { btn.click(); } catch(e) {}

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
        }, 300);
    });
    window.__AA_BOT_OBSERVER_INSTANCE = observer;

    observer.observe(document.documentElement, {
        childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'hidden', 'aria-expanded', 'data-state']
    });

    if (window.__AA_BOT_FALLBACK_INTERVAL) clearInterval(window.__AA_BOT_FALLBACK_INTERVAL);
    window.__AA_BOT_FALLBACK_INTERVAL = setInterval(function() {
        if (window.__AA_BOT_PAUSED) return;
        setTimeout(function() { try { scanAndClick(); } catch(e) {} }, 0);
    }, 20000);

    window.__AA_BOT_OBSERVER = observer;
    return 'observer-installed';
})()
    `;
}

module.exports = { buildIDEObserverScript };
