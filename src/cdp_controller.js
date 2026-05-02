const CDP = require('chrome-remote-interface');
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Store the previous full chat state to filter out old messages
let globalLastChatState = "";
// Store the last successful extracted agent message
let globalLastValidResponse = "";


// ===== MULTI-WINDOW SUPPORT =====
let preferredTargetId = null;
let windowCache = [];

/**
 * Shared target resolver — fetches CDP targets, filters, and sorts.
 * If a preferred window is set, that window is prioritised.
 * @param {number} port - CDP debugging port
 * @param {boolean} includeIframe - whether to include iframe/webview types
 * @returns {Promise<Array>} sorted array of CDP target objects
 */
const { UI_LOCATORS_SCRIPT } = require('./ui_locators');

// Cache for the active workspace name, refreshed on each resolveTargets call
let activeWorkspaceName = null;

async function resolveTargets(port, includeIframe = true) {
    const raw = await httpGet(`http://127.0.0.1:${port}/json`);
    const targets = JSON.parse(raw);
    const typeFilter = includeIframe
        ? t => (t.type === 'page' || t.type === 'iframe' || t.type === 'webview')
        : t => (t.type === 'page' || t.type === 'webview');
    const candidates = targets.filter(t => typeFilter(t) &&
        t.webSocketDebuggerUrl &&
        !t.url.includes('devtools://') &&
        !(t.title && t.title.includes('Launchpad')));

    // Query the Manager target's top bar for the active workspace name.
    // The Manager renders a breadcrumb like "workspace-name / Thread Title"
    // in the header bar, making it trivial to extract the active workspace.
    try {
        const manager = candidates.find(t => t.title === 'Manager');
        if (manager) {
            const client = await CDP({ target: manager.webSocketDebuggerUrl });
            const { Runtime } = client;
            await Runtime.enable();
            const res = await Runtime.evaluate({
                expression: `
                    (() => {
                        // Find top-bar elements (y < 40px, narrow height, wide)
                        const topEls = Array.from(document.querySelectorAll('div')).filter(el => {
                            const r = el.getBoundingClientRect();
                            return r.y >= 0 && r.y < 40 && r.height < 50 && r.height > 20 && r.width > 200;
                        });
                        for (const el of topEls) {
                            const text = el.innerText.replace(/\\n/g, ' ').trim();
                            // Match the breadcrumb format: "... workspace-name / Thread Title ..."
                            // Strip leading icon text (arrow_back, arrow_forward, dock_to_right)
                            const cleaned = text.replace(/^(arrow_back|arrow_forward|dock_to_right|\\s)+/g, '').trim();
                            const slashIdx = cleaned.indexOf(' / ');
                            if (slashIdx > 0) {
                                return cleaned.substring(0, slashIdx).trim();
                            }
                        }
                        return null;
                    })()
                `,
                returnByValue: true
            });
            await client.close();
            if (res.result?.value) {
                activeWorkspaceName = res.result.value.toLowerCase();
            }
        }
    } catch (_) {
        // Non-critical — if we can't query the Manager, we just keep the last cached value
    }

    candidates.sort((a, b) => {
        // Preferred target by ID always wins (set via /window command)
        if (preferredTargetId) {
            if (a.id === preferredTargetId) return -1;
            if (b.id === preferredTargetId) return 1;
        }
        // Dynamic fallback: prefer the target matching the active workspace
        if (activeWorkspaceName) {
            const aMatch = a.title.toLowerCase().includes(activeWorkspaceName) ? 1 : 0;
            const bMatch = b.title.toLowerCase().includes(activeWorkspaceName) ? 1 : 0;
            if (aMatch !== bMatch) return bMatch - aMatch;
        }
        return 0;
    });

    return candidates;
}

/**
 * Sort candidates so the Manager target comes first.
 * Manager holds the active conversation state, so it's the most reliable
 * target for model selection, chat input, and status checks.
 */
function prioritizeManager(candidates) {
    return [...candidates].sort((a, b) => {
        if (a.title === 'Manager') return -1;
        if (b.title === 'Manager') return 1;
        return 0;
    });
}

/**
 * List all available IDE windows for the /window command.
 */
async function listWindows(port) {
    const targets = await resolveTargets(port, false);
    windowCache = targets.map(t => ({
        id: t.id,
        title: t.title || 'Untitled',
        url: t.url,
        isPreferred: preferredTargetId ? t.id === preferredTargetId : false
    }));
    return windowCache;
}

function setPreferredWindow(id) {
    preferredTargetId = id;
}

function getPreferredWindow() {
    if (!preferredTargetId) return null;
    const match = windowCache.find(w => w.id === preferredTargetId);
    return match ? match.title : preferredTargetId;
}

function getCachedWindows() {
    return windowCache;
}


const CHAT_EXTRACT_EXPR = `
    ${UI_LOCATORS_SCRIPT}
    (function() {
        let extractedText = "";
        try {
            // Use the centralized locator to find the active conversation
            const container = AG_UI.getVisibleChatContainer();
            
            function cleanText(text) {
                if (!text) return "";
                text = text.replace(/Ask anything.*?for workflows/gi, '');
                text = text.replace(/0 Files With Changes/g, '');
                text = text.replace(/Review Changes/g, '');
                text = text.replace(/Gemini[\\s\\d\\.]+Pro[\\s]*\\([^)]*\\)/gi, '');
                text = text.replace(/Claude[\\s\\w\\.]+\\([^)]*\\)/gi, '');
                text = text.replace(/GPT[\\s\\w\\.]+\\([^)]*\\)/gi, '');
                text = text.replace(/\\bSend\\b\\s*\\b(mic)?\\b/gi, '');
                text = text.replace(/\\bmic\\b/gi, '');
                text = text.replace(/Worked for \\d+s/gi, '');
                text = text.replace(/\\b\\d{1,2}:\\d{2}(?:\\s*(?:AM|PM))?\\b/ig, '');
                text = text.replace(/Thinking.../g, "").replace(/Gelişim App Dev/g, "");

                text = text.replace(/^\\s*(Plan|Execute|Review|Task|Walkthrough|Implementation Plan)\\s*$/gm, '');
                text = text.replace(/undo/g, '');
                text = text.replace(/chevron_right/g, '');
                text = text.replace(/chevron_left/g, '');
                text = text.replace(/content_copy/g, '');
                text = text.replace(/thumb_up/g, '');
                text = text.replace(/thumb_down/g, '');
                text = text.replace(/Files Modified[\\s\\n]*(\\d+)[\\s\\n]*([a-zA-Z0-9_\\-\\.]+)[\\s\\n]*\\+([0-9]+)[\\s\\n]*\\-([0-9]+)/gi, "\\n[📦 Files Modified: $2 (+$3, -$4)]\\n");
                text = text.replace(/\\n{3,}/g, '\\n\\n');
                return text.trim();
            }

            if (container) {
                const list = container.querySelector('.relative.flex.flex-col.gap-y-3.px-4, .monaco-list-rows');
                if (list) {
                    const msgs = [];
                    for (let child of list.children) {
                        let isUser = !!child.querySelector('.bg-input');
                        let clone = child.cloneNode(true);
                        
                        Array.from(clone.querySelectorAll('style, .material-icons, [class*="icon"]')).forEach(el => el.remove());
                        
                        // Use centralized logic to remove Thought blocks
                        AG_UI.removeThoughtBlocks(clone);
                        
                        Array.from(clone.querySelectorAll('button')).forEach(el => el.remove());
                        
                        if (isUser) {
                            const userInput = clone.querySelector('.bg-input');
                            let uText = userInput ? userInput.innerText : "";
                            if (userInput) userInput.remove();
                            
                            uText = cleanText(uText);
                            if (uText) msgs.push("👤 User:\\n" + uText);
                            
                            let aText = cleanText(clone.innerText);
                            if (aText) msgs.push("🤖 Agent:\\n" + aText);
                        } else {
                            let aText = cleanText(clone.innerText);
                            if (aText) msgs.push("🤖 Agent:\\n" + aText);
                        }
                    }
                    extractedText = msgs.join('\\n\\n');
                } else {
                    extractedText = cleanText(container.innerText || container.textContent || "");
                }
            }
        } catch(e) {}
        return String(extractedText);
    })()
`;

function httpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', err => reject(err));
    });
}

/**
 * Snapshot the current chat state so subsequent getLatestAgentResponse
 * calls only return text that appeared AFTER this snapshot.
 */
// Track the last seen file size for file-based diffing
let lastSnapshotFileSize = 0;

/**
 * Snapshot the current chat state for diff tracking.
 * Records the file size of the active thread's log file.
 */
async function snapshotChatState(port) {
    try {
        const activeId = await getActiveThreadId(port);
        if (!activeId) return;
        const logPath = path.join(os.homedir(), '.gemini', 'antigravity', 'brain', activeId, '.system_generated', 'logs', 'overview.txt');
        if (!fs.existsSync(logPath)) return;
        
        const stats = fs.statSync(logPath);
        const readSize = Math.min(stats.size, 5000);
        const fd = fs.openSync(logPath, 'r');
        const buf = Buffer.alloc(readSize);
        fs.readSync(fd, buf, 0, readSize, stats.size - readSize);
        fs.closeSync(fd);
        const tail = buf.toString('utf8');
        const lines = tail.split('\n').filter(l => l.trim());
        
        lastSnapshotFileSize = stats.size;
        console.log(`[snapshot] Anchored at file size ${lastSnapshotFileSize}`);
        return;
    } catch (e) {
        console.log('[snapshot] File-based snapshot failed:', e.message);
    }
    
    // DOM fallback for legacy behavior
    const candidates = await resolveTargets(port);
    for (const target of candidates) {
        try {
            const client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Runtime } = client;
            await Runtime.enable();
            const boxResult = await Runtime.evaluate({ expression: CHAT_EXTRACT_EXPR, awaitPromise: true, returnByValue: true });
            const val = boxResult?.result?.value;
            await client.close();
            if (val && val.length > 0) {
                globalLastChatState = val;
                console.log(`[snapshot] DOM fallback anchored (${val.length} chars)`);
                return;
            }
        } catch (_) {}
    }
}

/**
 * Get the latest agent response since the last snapshot.
 * 
 * Primary strategy: Read new entries from the active thread's overview.txt
 * since the last snapshotted step_index. This avoids stale DOM issues and
 * timestamp bleed from the DOM extraction.
 * 
 * Falls back to DOM extraction if the file doesn't exist.
 */

/**
 * Get the full last agent response block (no diffing).
 * Used by /latest command.
 * 
 * Strategy: Read from the file system instead of the DOM, because the IDE's
 * workspace DOM often retains stale content from previously-viewed threads.
 * 
 * 1. Get the active thread ID from the Manager sidebar (reliable)
 * 2. Read the thread's overview.txt log file from disk
 * 3. Parse the last user message + model response from the log
 * 4. Fall back to DOM extraction only if the file doesn't exist
 */
async function getFullLatestResponse(port) {
    // --- Primary: file-system extraction from the active thread's log ---
    try {
        const activeId = await getActiveThreadId(port);
        if (activeId) {
            const logPath = path.join(os.homedir(), '.gemini', 'antigravity', 'brain', activeId, '.system_generated', 'logs', 'overview.txt');
            if (fs.existsSync(logPath)) {
                // Read the last ~20KB of the file (enough for recent messages)
                const stats = fs.statSync(logPath);
                const readSize = Math.min(stats.size, 20000);
                const fd = fs.openSync(logPath, 'r');
                const buf = Buffer.alloc(readSize);
                fs.readSync(fd, buf, 0, readSize, stats.size - readSize);
                fs.closeSync(fd);
                const tail = buf.toString('utf8');
                
                // Parse JSON lines to find the last user message + model content response
                const lines = tail.split('\n').filter(l => l.trim());
                let lastUserMsg = null;
                let lastModelMsg = null;
                
                for (let i = lines.length - 1; i >= 0; i--) {
                    try {
                        const entry = JSON.parse(lines[i]);
                        if (!lastModelMsg && entry.source === 'MODEL' && entry.content && entry.content.trim()) {
                            lastModelMsg = entry.content;
                        }
                        if (lastModelMsg && !lastUserMsg && entry.source === 'USER_EXPLICIT' && entry.content) {
                            // Extract just the user request from the XML wrapper
                            const reqMatch = entry.content.match(/<USER_REQUEST>\n?([\s\S]*?)\n?<\/USER_REQUEST>/);
                            lastUserMsg = reqMatch ? reqMatch[1].trim() : entry.content.substring(0, 200);
                        }
                        if (lastUserMsg && lastModelMsg) break;
                    } catch (_) {}
                }
                
                if (lastModelMsg) {
                    const parts = [];
                    if (lastUserMsg) parts.push('👤 User:\n' + lastUserMsg);
                    // Truncate very long model responses for Telegram
                    const truncated = lastModelMsg.length > 3000 ? lastModelMsg.substring(0, 3000) + '\n\n[...truncated]' : lastModelMsg;
                    parts.push('🤖 Agent:\n' + truncated);
                    return parts.join('\n\n');
                }
            }
        }
    } catch (e) {
        console.log('[getFullLatestResponse] File-system extraction failed:', e.message);
    }
    
    // --- Fallback: DOM extraction (may be stale if threads were switched) ---
    const candidates = await resolveTargets(port);
    for (const target of candidates) {
        try {
            const client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Runtime } = client;
            await Runtime.enable();
            
            const expr = CHAT_EXTRACT_EXPR.replace(
                "extractedText = msgs.join('\\n\\n');",
                "extractedText = msgs.slice(-2).join('\\n\\n');"
            );
            
            const res = await Runtime.evaluate({
                expression: expr,
                returnByValue: true
            });
            await client.close();
            
            if (res.result?.value && res.result.value.trim() !== '') {
                return res.result.value;
            }
        } catch(e) {}
    }
    
    // Fallback to cache if everything failed
    if (globalLastValidResponse) {
        return globalLastValidResponse;
    }
    
    return "[No previous message stored yet. Run a prompt first.]";
}

async function captureAgentScreenshot(port) {
    const candidates = await resolveTargets(port);

    for (const target of candidates) {
        try {
            const client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Page, Runtime } = client;
            await Page.enable();
            await Runtime.enable();

            const boxResult = await Runtime.evaluate({
                expression: `
                    (function() {
                        const selectors = [
                            '#conversation', '#chat', '#cascade', 
                            '.chat-container', '.messages-container', 
                            '[class*="message-list"]', '[class*="Conversation"]',
                            '.chat-input', '[contenteditable="true"]'
                        ];
                        let targetEl = null;
                        for (const s of selectors) {
                            targetEl = document.querySelector(s);
                            if (targetEl && targetEl.offsetParent !== null) {
                                if (s === '.chat-input' || s === '[contenteditable="true"]') {
                                     const container = targetEl.closest('#conversation, #chat, #cascade, [class*="Conversation"], [class*="chat-container"]');
                                     if (container) targetEl = container;
                                }
                                break;
                            }
                        }
                        if (!targetEl) targetEl = document.body;
                        if (targetEl.offsetHeight < 200) {
                            const scrollers = Array.from(document.querySelectorAll('div'))
                                .filter(d => d.offsetHeight > 400 && d.offsetParent !== null)
                                .sort((a, b) => b.offsetHeight - a.offsetHeight);
                            if (scrollers.length > 0) targetEl = scrollers[0];
                        }
                        const rect = targetEl.getBoundingClientRect();
                        return { x: rect.x, y: rect.y, width: rect.width || document.documentElement.clientWidth, height: rect.height || document.documentElement.clientHeight };
                    })()
                `,
                awaitPromise: true,
                returnByValue: true
            });

            const res = boxResult?.result?.value;
            if (res) {
                let screenshotResult = null;
                try {
                    screenshotResult = await Page.captureScreenshot({
                        format: 'jpeg',
                        quality: 85,
                        clip: {
                            x: Math.max(0, res.x || 0),
                            y: Math.max(0, res.y || 0),
                            width: Math.min(2500, Math.max(10, res.width || 800)),
                            height: Math.min(2500, Math.max(10, res.height || 600)),
                            scale: 1
                        }
                    });
                } catch(e) {
                    screenshotResult = await Page.captureScreenshot({ format: 'jpeg', quality: 70 });
                }
                await client.close();
                if (screenshotResult && screenshotResult.data) {
                    return Buffer.from(screenshotResult.data, 'base64');
                }
            }
        } catch(e) {}
    }
    throw new Error("Could not capture screenshot on any target");
}

async function waitForAgentResponse(port, timeoutMs = 450000, onProgress = null) {
    const startTime = Date.now();
    let consecutiveIdleCount = 0;
    let lastProgressTime = 0;
    const GRACE_PERIOD_MS = 6000; // Wait at least 6s before accepting idle — gives IDE time to start generating

    while (Date.now() - startTime < timeoutMs) {
        // Re-fetch targets on each iteration to avoid stale WebSocket connections
        let candidates;
        try {
            const raw = await resolveTargets(port);
            // Manager has the active conversation — check it first
            candidates = prioritizeManager(raw);
        } catch(e) {
            await new Promise(r => setTimeout(r, 3000));
            continue;
        }

        let foundChat = false;
        let isIdle = false;
        let isGenerating = false;

        for (const target of candidates) {
            try {
                const client = await CDP({ target: target.webSocketDebuggerUrl });
                const { Runtime } = client;
                await Runtime.enable();
                const check = await Runtime.evaluate({
                    expression: `
                        ${UI_LOCATORS_SCRIPT}
                        (function() {
                            const isGenerating = !!AG_UI.getStopButton();
                            const editor = AG_UI.getChatInput();
                            const isInputDisabled = editor ? (editor.getAttribute('contenteditable') === 'false' || editor.disabled) : false;
                            const isSpinning = AG_UI.isLoading();
                            
                            // Check if AutoAccept is active and there is a button waiting to be clicked
                            const aaActive = !!window.__AA_BOT_OBSERVER_ACTIVE && !window.__AA_BOT_PAUSED;
                            let hasPendingButton = false;
                            if (aaActive) {
                                const texts = ['run', 'accept', 'allow', 'continue', 'retry', 'çalıştır', 'kabul et', 'izin ver', 'devam et', 'yeniden dene'];
                                const btns = Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null);
                                hasPendingButton = btns.some(b => {
                                    const t = (b.textContent||'').trim().toLowerCase();
                                    return texts.some(x => t === x || t.startsWith(x + ' ') || (t.startsWith(x) && t.length <= x.length + 8));
                                });
                            }
                            
                            const isIdle = !isGenerating && !isInputDisabled && !isSpinning && !hasPendingButton;
                            const hasChat = !!AG_UI.getVisibleChatContainer();
                            return { hasChat, isGenerating, isIdle, isSpinning, hasPendingButton };
                        })()
                    `,
                    returnByValue: true
                });
                const val = check?.result?.value;
                await client.close();

                if (val && val.hasChat) {
                    foundChat = true;
                    if (val.isGenerating) isGenerating = true;
                    if (val.isIdle && !val.isGenerating) isIdle = true;
                    break;
                }
            } catch(e) { console.debug(`[waitForAgent] target ${target.title}: ${e.message}`); }
        }
        
        if (foundChat) {
            const elapsed = Date.now() - startTime;
            if (isIdle && !isGenerating) {
                // Only count idle after grace period — prevents false "done" before IDE starts
                if (elapsed > GRACE_PERIOD_MS) {
                    consecutiveIdleCount++;
                    if (consecutiveIdleCount >= 4) return true;
                }
            } else {
                consecutiveIdleCount = 0;
            }
        }

        // Send typing action every 4 seconds to keep Telegram UI active
        const elapsed = Date.now() - startTime;
        if (onProgress && elapsed - lastProgressTime >= 4000) {
            lastProgressTime = elapsed;
            onProgress('typing');
        }

        await new Promise(r => setTimeout(r, 2000));
    }
    return false;
}

async function sendViaCDP(text, port) {
    const candidates = await resolveTargets(port);
    
    // Prioritize the Manager target — its #antigravity input always belongs
    // to the active conversation. Workspace targets' side-panel inputs may
    // be stale from previously-viewed threads.
    const sortedCandidates = prioritizeManager(candidates);

    const errors = [];
    for (const target of sortedCandidates) {
        let client;
        try {
            client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Runtime, Input } = client;
            await Runtime.enable();

            const focusResult = await Runtime.evaluate({
                expression: `
                    (async function() {
                        try {
                            const escapedText = ${JSON.stringify(text)};
                            
                            // Find the input inside #antigravity (the main agent panel input box).
                            // This is the primary active conversation input in the Manager target.
                            const agPanel = document.querySelector('#antigravity [contenteditable="true"]');
                            
                            // Fallback: any contenteditable not in xterm
                            const allEditors = [...document.querySelectorAll('[contenteditable="true"]')]
                                .filter(el => !el.className.includes('xterm'));
                            
                            const editor = agPanel || allEditors.at(-1);
                            
                            if (!editor) return { found: false, reason: "no_editor", editorCount: 0 };

                            editor.focus();
                            try {
                                document.execCommand("selectAll", false, null);
                                document.execCommand("delete", false, null);
                            } catch(e) {}

                            let inserted = false;
                            try { inserted = !!document.execCommand("insertText", false, escapedText); } catch(e) {}
                            
                            if (!inserted) {
                                if (editor.tagName === 'TEXTAREA') {
                                    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
                                    if (setter) setter.call(editor, escapedText);
                                    else editor.value = escapedText;
                                } else {
                                    editor.textContent = escapedText;
                                }
                                editor.dispatchEvent(new InputEvent("beforeinput", { bubbles: true, inputType: "insertText", data: escapedText }));
                                editor.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: escapedText }));
                                editor.dispatchEvent(new Event("change", { bubbles: true }));
                            }

                            // Use setTimeout instead of requestAnimationFrame so it doesn't hang when minimized!
                            await new Promise(r => setTimeout(r, 150));

                            // Find the submit button near the editor (within same panel)
                            const panelContainer = editor.closest('#antigravity') || editor.closest('#conversation') || document;
                            const submit = panelContainer.querySelector("svg.lucide-arrow-right, svg[class*='arrow-right'], svg[class*='send']")?.closest("button");
                            if (submit && !submit.disabled) {
                                setTimeout(() => submit.click(), 10);
                                return { found: true, method: 'button', target: '${target.title?.substring(0, 30) || 'unknown'}' };
                            }

                            setTimeout(() => {
                                ['keydown', 'keypress', 'keyup'].forEach(type => {
                                    editor.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));
                                });
                            }, 10);
                            return { found: true, method: 'keyboard', target: '${target.title?.substring(0, 30) || 'unknown'}' };
                        } catch(err) {
                            return { found: false, reason: err.message };
                        }
                    })()
                `,
                awaitPromise: true,
                returnByValue: true
            });
            const val = focusResult?.result?.value;
            console.log(`sendViaCDP [${target.title?.substring(0, 30)}]: result =`, JSON.stringify(val));
            
            if (val && val.found) {
                await new Promise(r => setTimeout(r, 50));
                try {
                    await Input.dispatchKeyEvent({ type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
                    await Input.dispatchKeyEvent({ type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
                } catch(e) {}
                await client.close();
                console.log(`sendViaCDP: Successfully sent via ${val.method} on "${target.title?.substring(0, 40)}"`);
                return;
            }
            
            if (val) errors.push(`${target.title?.substring(0, 25)}: ${val.reason || 'no_editor'}`);
            await client.close();
        } catch(e) {
            if (e.message.includes('Promise was collected')) {
                console.log(`[sendViaCDP] Ignoring Promise was collected for ${target.title}, assuming success!`);
                try { if (client) await client.close(); } catch(_) {}
                return;
            }
            errors.push(`${target.title?.substring(0, 25)}: ${e.message}`);
            try { if (client) await client.close(); } catch(_) {}
        }
    }
    console.log("sendViaCDP: Failed on all targets:", errors.join(' | '));
    throw new Error("no_chat_input");
}

async function triggerNewChat(port) {
    const candidates = await resolveTargets(port, false);

    for (const target of candidates) {
        try {
            const client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Runtime } = client;
            await Runtime.enable();
            const res = await Runtime.evaluate({
                expression: `
                    ${UI_LOCATORS_SCRIPT}
                    (() => {
                        const btn = AG_UI.getNewChatButton();
                        if (btn && typeof btn.click === 'function') {
                            btn.click();
                            return { clicked: true, tag: btn.tagName };
                        }
                        return { clicked: false };
                    })()
                `, returnByValue: true
            });
            await client.close();
            const val = res.result?.value;
            if (val) {
                console.log('[triggerNewChat] Result:', JSON.stringify(val));
                if (val.clicked) return true;
            }
        } catch(e) {
            console.log('[triggerNewChat] Error on target:', e.message);
        }
    }
    return false;
}



async function triggerModelMenu(port) {
    const raw = await resolveTargets(port, false);
    // Manager has the active conversation's model selector
    const candidates = prioritizeManager(raw);

    for (const target of candidates) {
        try {
            const client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Runtime } = client;
            await Runtime.enable();
            const res = await Runtime.evaluate({
                expression: `
                    ${UI_LOCATORS_SCRIPT}
                    (() => {
                        const btn = AG_UI.getModelSelectorButton();
                        if (btn) { btn.click(); return true; }
                        return false;
                    })()
                `, returnByValue: true
            });
            await client.close();
            if (res.result?.value) return true;
        } catch(e) {}
    }
    return false;
}

async function listAgentThreads(port) {
    const candidates = await resolveTargets(port, false);
    for (const target of candidates) {
        try {
            const client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Runtime } = client;
            await Runtime.enable();

            // Step 1: Click the history icon to open the conversation picker
            const clickRes = await Runtime.evaluate({
                expression: `(() => {
                    const icon = document.querySelector("svg.lucide-history");
                    if (!icon) return false;
                    const btn = icon.closest("button") || icon.parentElement;
                    btn.click();
                    return true;
                })()`
            });
            if (!clickRes.result?.value) {
                await client.close();
                continue;
            }

            // Step 2: Wait for the popup, then parse section headers + items
            await new Promise(r => setTimeout(r, 800));
            const res = await Runtime.evaluate({
                expression: `
                    (() => {
                        const input = document.querySelector('input[placeholder="Select a conversation"]');
                        if (!input) return JSON.stringify([]);
                        let container = input;
                        for (let i = 0; i < 15; i++) { if (container.parentElement) container = container.parentElement; }
                        const allDivs = Array.from(container.querySelectorAll('div'));
                        const sectionHeaders = allDivs.filter(d =>
                            d.className.includes('opacity-50') &&
                            d.className.includes('px-2.5') &&
                            d.className.includes('pt-4') &&
                            d.childNodes.length === 1 &&
                            d.childNodes[0].nodeType === 3
                        );
                        const rows = allDivs.filter(d =>
                            d.className.includes('px-2.5') &&
                            d.className.includes('cursor-pointer') &&
                            d.querySelector('span')
                        );
                        const workspaces = [];
                        for (const row of rows) {
                            const nameEl = row.querySelector('span.truncate, span.text-sm span');
                            const timeEl = row.querySelector('span.text-xs.opacity-50.ml-4');
                            const wsEl = row.querySelector('span.text-xs.min-w-0.opacity-50.truncate');
                            const name = nameEl ? nameEl.textContent.trim() : '';
                            const time = timeEl ? timeEl.textContent.trim() : '';
                            if (!name || /^show\\s+\\d+\\s+more/i.test(name)) continue;
                            let section = '';
                            for (const h of sectionHeaders) {
                                if (row.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_PRECEDING) {
                                    section = h.textContent.trim();
                                }
                            }
                            let wsName;
                            if (section.startsWith('Recent in ')) {
                                wsName = section.replace('Recent in ', '');
                            } else if (section === 'Other Conversations' && wsEl) {
                                wsName = wsEl.textContent.trim();
                            } else if (section === 'Current') {
                                const recentHeader = sectionHeaders.find(h => h.textContent.trim().startsWith('Recent in '));
                                wsName = recentHeader ? recentHeader.textContent.trim().replace('Recent in ', '') : 'Current';
                            } else {
                                wsName = 'IDE';
                            }
                            let group = workspaces.find(w => w.workspace === wsName);
                            if (!group) { group = { workspace: wsName, threads: [] }; workspaces.push(group); }
                            group.threads.push({ name, time });
                        }
                        return JSON.stringify(workspaces);
                    })()
                `,
                returnByValue: true
            });

            // Step 3: Close the popup by toggling the history icon
            await Runtime.evaluate({
                expression: `(() => {
                    const icon = document.querySelector("svg.lucide-history");
                    if (icon) {
                        const btn = icon.closest("button") || icon.parentElement;
                        btn.click();
                    }
                })()`
            });

            await client.close();
            const workspaces = JSON.parse(res.result?.value || '[]');
            if (workspaces.length > 0) return workspaces;
        } catch(e) { console.debug(`[listAgentThreads] target error: ${e.message}`); }
    }
    return [];
}

function setActiveWorkspace(name) {
    activeWorkspaceName = name ? name.toLowerCase() : null;
}

async function switchAgentThread(port, threadName, workspaceName) {
    const candidates = await resolveTargets(port, false);
    for (const target of candidates) {
        try {
            const client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Runtime } = client;
            await Runtime.enable();

            // Step 1: Ensure the history popup is open
            // Check if it's already open first; if not, click the icon
            const openRes = await Runtime.evaluate({
                expression: `(() => {
                    const existing = document.querySelector('input[placeholder="Select a conversation"]');
                    if (existing) return "already-open";
                    const icon = document.querySelector("svg.lucide-history");
                    if (!icon) return "no-icon";
                    const btn = icon.closest("button") || icon.parentElement;
                    btn.click();
                    return "opened";
                })()`
            });
            if (openRes.result?.value === 'no-icon') { await client.close(); continue; }

            // Step 2: Wait for popup to render (skip if already open)
            if (openRes.result?.value === 'opened') {
                await new Promise(r => setTimeout(r, 800));
            } else {
                await new Promise(r => setTimeout(r, 200));
            }

            // Step 3: Find and click the matching conversation row
            const threadNameStr = JSON.stringify(threadName);
            const res = await Runtime.evaluate({
                expression: `(() => {
                    const input = document.querySelector('input[placeholder="Select a conversation"]');
                    if (!input) return false;
                    let container = input;
                    for (let i = 0; i < 15; i++) { if (container.parentElement) container = container.parentElement; }
                    const rows = Array.from(container.querySelectorAll('div.cursor-pointer')).filter(r => r.className.includes('px-2.5'));
                    const target = rows.find(row => {
                        const nameEl = row.querySelector('span.truncate, span.text-sm span');
                        const name = nameEl ? nameEl.textContent.trim() : '';
                        return name === ${threadNameStr};
                    });
                    if (target) { target.click(); return true; }
                    return false;
                })()`,
                returnByValue: true
            });
            await client.close();
            if (res.result?.value) {
                // Update active workspace so sendViaCDP targets the right window
                if (workspaceName) {
                    activeWorkspaceName = workspaceName.toLowerCase();
                }
                return true;
            }
        } catch(e) { console.debug(`[switchAgentThread] target error: ${e.message}`); }
    }
    return false;
}

async function getActiveThreadId(port) {
    // 1. Try DOM approach first (works for some IDE versions)
    const candidates = await resolveTargets(port, false);
    for (const target of candidates) {
        try {
            const client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Runtime } = client;
            await Runtime.enable();
            const res = await Runtime.evaluate({
                expression: `
                    (() => {
                        const all = document.querySelectorAll('[data-testid^="convo-pill-"]');
                        for (let el of all) {
                            const row = el.closest('[role="button"]');
                            if (row && row.classList.contains('bg-list-hover')) {
                                return el.getAttribute('data-testid').replace('convo-pill-', '');
                            }
                        }
                        return null;
                    })()
                `,
                returnByValue: true
            });
            await client.close();
            if (res.result?.value) return res.result.value;
        } catch(e) { console.debug(`[getActiveThreadId] target error: ${e.message}`); }
    }

    // 2. Fallback to file system: find most recently modified overview.txt
    try {
        const brainPath = path.join(os.homedir(), '.gemini', 'antigravity', 'brain');
        if (fs.existsSync(brainPath)) {
            const dirs = fs.readdirSync(brainPath, { withFileTypes: true });
            let latestTime = 0;
            let latestId = null;
            
            for (const dir of dirs) {
                if (!dir.isDirectory()) continue;
                const logPath = path.join(brainPath, dir.name, '.system_generated', 'logs', 'overview.txt');
                if (fs.existsSync(logPath)) {
                    const stats = fs.statSync(logPath);
                    if (stats.mtimeMs > latestTime) {
                        latestTime = stats.mtimeMs;
                        latestId = dir.name;
                    }
                }
            }
            if (latestId) return latestId;
        }
    } catch(e) { console.debug(`[getActiveThreadId] fallback error: ${e.message}`); }

    return null;
}
async function isAgentWorking(port) {
    const raw = await resolveTargets(port, false);
    // Manager has the active conversation — check it first
    const candidates = prioritizeManager(raw);
    for (const target of candidates) {
        try {
            const client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Runtime } = client;
            await Runtime.enable();
            const check = await Runtime.evaluate({
                expression: `
                    ${UI_LOCATORS_SCRIPT}
                    (function() {
                        const isGenerating = !!AG_UI.getStopButton();
                        const editor = AG_UI.getChatInput();
                        const isInputDisabled = editor ? (editor.getAttribute('contenteditable') === 'false' || editor.disabled) : false;
                        const isSpinning = AG_UI.isLoading();
                        
                        const aaActive = !!window.__AA_BOT_OBSERVER_ACTIVE && !window.__AA_BOT_PAUSED;
                        let hasPendingButton = false;
                        if (aaActive) {
                            const texts = ['run', 'accept', 'allow', 'continue', 'retry', 'çalıştır', 'kabul et', 'izin ver', 'devam et', 'yeniden dene'];
                            const btns = Array.from(document.querySelectorAll('button')).filter(b => b.offsetParent !== null);
                            hasPendingButton = btns.some(b => {
                                const t = (b.textContent||'').trim().toLowerCase();
                                return texts.some(x => t === x || t.startsWith(x + ' ') || (t.startsWith(x) && t.length <= x.length + 8));
                            });
                        }
                        
                        return isGenerating || isInputDisabled || isSpinning || hasPendingButton;
                    })()
                `,
                returnByValue: true
            });
            await client.close();
            if (check && check.result && check.result.value !== undefined) {
                return check.result.value;
            }
        } catch(e) { console.debug(`[isAgentWorking] target error: ${e.message}`); }
    }
    return false;
}

async function getCurrentModel(port) {
    const candidates = await resolveTargets(port, false);
    for (const target of candidates) {
        try {
            const client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Runtime } = client;
            await Runtime.enable();
            const check = await Runtime.evaluate({
                expression: `
                    ${UI_LOCATORS_SCRIPT}
                    (function() {
                        const btn = AG_UI.getModelSelectorButton();
                        if (btn) {
                            return btn.textContent.trim();
                        }
                        return null;
                    })()
                `, returnByValue: true
            });
            await client.close();
            if (check?.result?.value) return check.result.value;
        } catch(e) {}
    }
    return null;
}

module.exports = {
    isAgentWorking,
    getFullLatestResponse,
    snapshotChatState,
    captureAgentScreenshot,
    captureFullIDEScreenshot,
    waitForAgentResponse,
    sendViaCDP,
    triggerNewChat,
    triggerModelMenu,
    getAvailableModels,
    selectModel,
    getCurrentModel,
    stopAgent,
    getQuota,
    resolveTargets,
    listWindows,
    setPreferredWindow,
    getPreferredWindow,
    getCachedWindows,
    closeWindow,
    listAgentThreads,
    switchAgentThread,
    getActiveThreadId,
    setActiveWorkspace
};

async function captureFullIDEScreenshot(port) {
    const candidates = await resolveTargets(port);

    for (const target of candidates) {
        try {
            const client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Page } = client;
            await Page.enable();

            const screenshotResult = await Page.captureScreenshot({
                format: 'jpeg',
                quality: 80
            });
            await client.close();
            if (screenshotResult && screenshotResult.data) {
                return Buffer.from(screenshotResult.data, 'base64');
            }
        } catch(e) {}
    }
    throw new Error("Could not capture full screenshot via CDP");
}

async function getAvailableModels(port) {
    const raw = await resolveTargets(port, false);
    // Manager has the active conversation's model selector
    const candidates = prioritizeManager(raw);

    for (const target of candidates) {
        try {
            const client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Runtime } = client;
            await Runtime.enable();

            // Önce model menüsünü aç
            await Runtime.evaluate({
                expression: `
                    ${UI_LOCATORS_SCRIPT}
                    (() => {
                        const btn = AG_UI.getModelSelectorButton();
                        if (btn) { btn.click(); return true; }
                        return false;
                    })()
                `, returnByValue: true
            });

            // Dropdown'un açılmasını bekle
            await new Promise(r => setTimeout(r, 500));

            // Model listesini oku
            const res = await Runtime.evaluate({
                expression: `
                    ${UI_LOCATORS_SCRIPT}
                    (() => {
                        const models = [];
                        const items = AG_UI.getModelOptions();
                        items.forEach(el => {
                            if (el.offsetParent) {
                                const t = el.textContent.trim().split('\\n')[0].trim();
                                if (t.length > 2 && t.length < 80) models.push(t);
                            }
                        });
                        return models;
                    })()
                `, returnByValue: true
            });

            await client.close();
            return res.result?.value || [];
        } catch(e) {}
    }
    return [];
}

async function selectModel(port, modelName) {
    const raw = await resolveTargets(port, false);
    // Manager has the active conversation's model selector
    const candidates = prioritizeManager(raw);

    for (const target of candidates) {
        try {
            const client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Runtime } = client;
            await Runtime.enable();

            // Step 1: Check if dropdown is already open, if not click the model selector button
            const openRes = await Runtime.evaluate({
                expression: `
                    ${UI_LOCATORS_SCRIPT}
                    (() => {
                        // Check if model dropdown is already open by looking for model option buttons
                        const existingOptions = AG_UI.getModelOptions().filter(el => el.offsetParent !== null);
                        if (existingOptions.length > 3) return { alreadyOpen: true };
                        
                        // Click the model selector button to open dropdown
                        const selectorBtn = AG_UI.getModelSelectorButton();
                        if (selectorBtn) {
                            selectorBtn.click();
                            return { clicked: true };
                        }
                        return { clicked: false };
                    })()
                `, returnByValue: true
            });

            const openVal = openRes.result?.value;
            if (!openVal || (!openVal.clicked && !openVal.alreadyOpen)) {
                await client.close();
                continue;
            }

            // Step 2: Wait for dropdown to render
            await new Promise(r => setTimeout(r, 600));

            // Step 3: Find and click the matching model in the dropdown
            const selectRes = await Runtime.evaluate({
                expression: `
                    ${UI_LOCATORS_SCRIPT}
                    (() => {
                        const targetModel = ${JSON.stringify(modelName)}.toLowerCase();
                        const modelOptions = AG_UI.getModelOptions().filter(el => el.offsetParent !== null);
                        
                        // Try exact match first
                        let match = modelOptions.find(b => {
                            const text = b.textContent.replace(/New$/i, '').trim().toLowerCase();
                            return text === targetModel;
                        });
                        
                        // Try partial/includes match
                        if (!match) {
                            match = modelOptions.find(b => {
                                const text = b.textContent.replace(/New$/i, '').trim().toLowerCase();
                                return text.includes(targetModel) || targetModel.includes(text);
                            });
                        }
                        
                        if (match) {
                            // Check if already selected (has bg-gray-500/20 without hover)
                            const isAlreadySelected = match.className.includes('bg-gray-500/20') && !match.className.includes('hover:bg-gray-500/20');
                            match.click();
                            return { 
                                selected: true, 
                                modelText: match.textContent.trim(),
                                wasAlreadySelected: isAlreadySelected
                            };
                        }
                        
                        // Return available models for debugging
                        const available = modelOptions.map(b => b.textContent.replace(/New$/i, '').trim());
                        return { selected: false, available };
                    })()
                `, returnByValue: true
            });

            await client.close();
            const selectVal = selectRes.result?.value;
            if (selectVal?.selected) return true;
        } catch(e) {}
    }
    return false;
}

async function stopAgent(port) {
    const candidates = await resolveTargets(port, false);

    for (const target of candidates) {
        try {
            const client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Runtime } = client;
            await Runtime.enable();

            const res = await Runtime.evaluate({
                expression: `
                    ${UI_LOCATORS_SCRIPT}
                    (() => {
                        const btn = AG_UI.getStopButton();
                        if (btn) {
                            btn.click();
                            return { stopped: true };
                        }
                        return { stopped: false };
                    })()
                `, returnByValue: true
            });

            await client.close();
            return res.result?.value?.stopped || false;
        } catch(e) {}
    }
    return false;
}

async function getQuota(_port, t) {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const https = require('https');
    const execAsync = promisify(exec);

    try {
        // 1. Detect Antigravity language server process and extract csrf_token + ports
        const { stdout } = await execAsync('ps aux');
        const psLines = stdout.split('\n');
        let csrfToken = null;
        let lsPid = null;

        for (const line of psLines) {
            if (!line.toLowerCase().includes('antigravity')) continue;
            if (!line.includes('language_server') && !line.includes('--csrf_token')) continue;
            if (line.includes('grep')) continue;
            const csrfMatch = line.match(/--csrf_token\s+([^\s]+)/);
            if (csrfMatch) csrfToken = csrfMatch[1];
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 2) lsPid = parseInt(parts[1], 10);
            if (csrfToken) break;
        }

        if (!csrfToken || !lsPid) {
            console.log('[Quota] Language server bulunamadı');
            return null;
        }
        console.log(`[Quota] LS bulundu: PID=${lsPid}, token=${csrfToken.substring(0, 8)}...`);

        // 2. Discover ports the language server is listening on
        let ports = [];
        try {
            const { stdout: ssOut } = await execAsync(`ss -tlnp | grep "pid=${lsPid},"`);
            for (const l of ssOut.split('\n')) {
                const m = l.match(/:(\d+)\s/);
                if (m) { const p = parseInt(m[1], 10); if (!isNaN(p) && !ports.includes(p)) ports.push(p); }
            }
        } catch(e) {
            try {
                const { stdout: lsofOut } = await execAsync(`lsof -nP -iTCP -sTCP:LISTEN -a -p ${lsPid}`);
                for (const l of lsofOut.split('\n')) {
                    const m = l.match(/:(\d+)\s+\(LISTEN\)/);
                    if (m) { const p = parseInt(m[1], 10); if (!isNaN(p) && !ports.includes(p)) ports.push(p); }
                }
            } catch(e2) {}
        }

        if (ports.length === 0) { console.log('[Quota] LS port bulunamadı'); return null; }
        console.log(`[Quota] Portlar: ${ports.join(', ')}`);

        // 3. Probe ports with Connect RPC GetUserStatus
        const RPC_PATH = '/exa.language_server_pb.LanguageServerService/GetUserStatus';
        const body = JSON.stringify({ metadata: { ideName: 'antigravity', extensionName: 'antigravity', locale: 'en' } });

        function probePort(p, protocol) {
            return new Promise((resolve) => {
                const mod = protocol === 'https' ? https : http;
                const req = mod.request({
                    hostname: '127.0.0.1', port: p, path: RPC_PATH, method: 'POST',
                    timeout: 3000, rejectUnauthorized: false,
                    headers: { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1', 'X-Codeium-Csrf-Token': csrfToken }
                }, (res) => {
                    let d = '';
                    res.on('data', c => d += c);
                    res.on('end', () => {
                        if (res.statusCode >= 200 && res.statusCode < 300) {
                            try { resolve(JSON.parse(d)); } catch(e) { resolve(null); }
                        } else { resolve(null); }
                    });
                });
                req.on('error', () => resolve(null));
                req.on('timeout', () => { req.destroy(); resolve(null); });
                req.write(body);
                req.end();
            });
        }

        let apiData = null;
        for (const p of ports) {
            apiData = await probePort(p, 'https');
            if (apiData) break;
            apiData = await probePort(p, 'http');
            if (apiData) break;
        }

        if (!apiData) { console.log('[Quota] Connect RPC yanıt yok'); return null; }
        console.log('[Quota] API yanıtı alındı');

        // 4. Format the response
        const userStatus = apiData.userStatus || apiData;
        const result = [];

        result.push(t ? t('quota.header') : '📊 Hesap ve Kota Bilgisi\n');
        if (userStatus.email) result.push(`👤 ${userStatus.email}`);

        // AI Credits from userTier.availableCredits
        const userTier = userStatus.userTier;
        if (userTier) {
            if (userTier.name) result.push(t ? t('quota.plan', { plan: userTier.name }) : `📋 Plan: ${userTier.name}`);
            const credits = userTier.availableCredits;
            if (Array.isArray(credits) && credits.length > 0) {
                const c = credits[0];
                const amount = parseInt(c.creditAmount, 10);
                if (!isNaN(amount)) {
                    result.push(`💰 AI Credits: ${amount.toLocaleString()}`);
                }
            }
        }

        // Prompt Credits
        const planStatus = userStatus.planStatus;
        if (planStatus && typeof planStatus.availablePromptCredits === 'number') {
            const availStr = planStatus.availablePromptCredits.toLocaleString();
            const monthlyStr = planStatus.planInfo?.monthlyPromptCredits ? ` / ${planStatus.planInfo.monthlyPromptCredits.toLocaleString()}` : '';
            result.push(t ? t('quota.prompt_credits', { available: availStr, monthly: monthlyStr }) : `📊 Prompt Credits: ${availStr}${monthlyStr}`);
        }

        const configs = userStatus.cascadeModelConfigData?.clientModelConfigs;
        if (Array.isArray(configs) && configs.length > 0) {
            result.push('');
            result.push(t ? t('quota.model_quota') : '⏱️ Model Kota Durumu:');

            // Sort models: Gemini > Claude > others, so best representative is picked per group
            const priority = (label) => {
                if (label.includes('Gemini')) return 0;
                if (label.includes('Claude')) return 1;
                return 2;
            };
            const sorted = [...configs].sort((a, b) => priority(a.label || '') - priority(b.label || ''));

            // Group models by same quota (remainingFraction + resetTime) to avoid duplicates
            const seen = new Map();
            for (const m of sorted) {
                const modelId = m.modelOrAlias?.model || 'unknown';
                const label = m.label || modelId;
                // Skip autocomplete models and GPT-OSS
                if (modelId.includes('gemini-2.5') || label.includes('Gemini 2.5')) continue;
                if (modelId.includes('GPT_OSS') || label.includes('GPT-OSS') || label.includes('GPT OSS')) continue;

                const rem = m.quotaInfo?.remainingFraction;
                const resetTime = m.quotaInfo?.resetTime || '';
                const key = `${rem}|${resetTime}`;

                if (seen.has(key)) continue;
                seen.set(key, label);

                let line = `🤖 ${label}`;
                if (m.quotaInfo) {
                    if (typeof rem === 'number') {
                        const remPct = Math.round(rem * 100);
                        const filled = Math.round(rem * 8);
                        const empty = 8 - filled;
                        const bar = '█'.repeat(filled) + '░'.repeat(empty);
                        const icon = rem > 0.5 ? '🟢' : rem > 0.2 ? '🟡' : '🔴';
                        const remText = t ? t('quota.remaining', { pct: remPct }) : ` %${remPct} kalan`;
                        line += ` ${icon} ${bar}${remText}`;
                    }
                    if (resetTime) {
                        try {
                            const diff = new Date(resetTime).getTime() - Date.now();
                            if (diff > 0) {
                                const hours = Math.floor(diff / 3600000);
                                const mins = Math.floor((diff % 3600000) / 60000);
                                // Since 'sa' and 'dk' are universal enough we can keep them or use a simplified approach
                                // However, keeping ⏳ Xh Ym or ⏳ Xsa Ydk
                                line += t && t('lang.current') ? ` ⏳ ${hours}h ${mins}m` : ` ⏳ ${hours}sa ${mins}dk`;
                            }
                        } catch(e) {}
                    }
                    if (rem === 0) line += t ? t('quota.empty') : ' ⛔ TÜKENDİ';
                }
                result.push(line);
            }
        }

        return result.length > 0 ? result.join('\n') : null;
    } catch(e) {
        console.error('[Quota] Hata:', e.message);
        return null;
    }
}

async function closeWindow(port) {
    const candidates = await resolveTargets(port, false);
    if (candidates.length === 0) return false;

    const target = candidates[0]; // first candidate is the preferred window if set
    try {
        const client = await CDP({ port });
        const { Target } = client;
        await Target.closeTarget({ targetId: target.id });
        await client.close();
        
        if (preferredTargetId === target.id) {
            preferredTargetId = null;
        }
        return true;
    } catch(e) {
        try {
            const client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Runtime } = client;
            await Runtime.enable();
            await Runtime.evaluate({ expression: 'window.close()' });
            await client.close();
            
            if (preferredTargetId === target.id) {
                preferredTargetId = null;
            }
            return true;
        } catch(e2) {
            return false;
        }
    }
}
