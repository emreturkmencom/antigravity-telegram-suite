const CDP = require('chrome-remote-interface');
const http = require('http');

// Store the previous full chat state to filter out old messages
let globalLastChatState = "";
// Store the last successful extracted agent message
let globalLastValidResponse = "";

function httpGet(url) {
    return new Promise((resolve, reject) => {
        http.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(data));
        }).on('error', err => reject(err));
    });
}

async function getLatestAgentResponse(port) {
    const raw = await httpGet(`http://127.0.0.1:${port}/json`);
    const targets = JSON.parse(raw);
    const candidates = targets.filter(t => (t.type === 'page' || t.type === 'iframe' || t.type === 'webview') &&
        t.webSocketDebuggerUrl &&
        !t.url.includes('devtools://'));

    candidates.sort((a, b) => {
        const aMatch = a.title.toLowerCase().includes('antigravity') ? 1 : 0;
        const bMatch = b.title.toLowerCase().includes('antigravity') ? 1 : 0;
        return bMatch - aMatch;
    });

    const logs = [];
    for (const target of candidates) {
        try {
            const client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Runtime } = client;
            await Runtime.enable();

            const boxResult = await Runtime.evaluate({
                expression: `
                    (function() {
                        let extractedText = "";
                        try {
                            const container = document.querySelector('.flex.w-full.grow.flex-col.overflow-hidden, #conversation, #chat, .interactive-session');
                            if (container) {
                                extractedText = container.innerText || container.textContent || "";
                            }

                            // Clean up specific OpenCode/Antigravity React UI clutter safely without wildcard swallows
                            extractedText = extractedText.replace(/Ask anything, @ to mention, \\/ for workflows/g, '');
                            extractedText = extractedText.replace(/0 Files With Changes/g, '');
                            extractedText = extractedText.replace(/Review Changes/g, '');
                            extractedText = extractedText.replace(/Gemini 3\\.1 Pro \\(High\\)/g, '');
                            extractedText = extractedText.replace(/Send\\s*mic/g, '');
                            
                            // Reformat "Files Modified" precisely without risking matching to end of string
                            extractedText = extractedText.replace(/Files Modified[\\s\\n]*(\\d+)[\\s\\n]*([a-zA-Z0-9_\\-\\.]+)[\\s\\n]*\\+([0-9]+)[\\s\\n]*\\-([0-9]+)/gi, "\\n[📦 Files Modified: $2 (+$3, -$4)]\\n");

                            // Strip icon names, times, and action texts
                            extractedText = extractedText.replace(/chevron_left/g, '');
                            extractedText = extractedText.replace(/chevron_right/g, '');
                            extractedText = extractedText.replace(/content_copy/g, '');
                            extractedText = extractedText.replace(/thumb_up/g, '');
                            extractedText = extractedText.replace(/thumb_down/g, '');
                            extractedText = extractedText.replace(/undo/g, '');
                            extractedText = extractedText.replace(/Worked for \\d+s/gi, '');
                            extractedText = extractedText.replace(/\\d{1,2}:\\d{2}\\s*(?:AM|PM)/ig, ''); // e.g. 4:24 PM
                            
                            // Strip typical system logs and agent thoughts
                            extractedText = extractedText.replace(/Thinking.../g, "").replace(/Gelişim App Dev/g, "");
                            extractedText = extractedText.replace(/Prioritizing Tool Usage.*?targeted actions\./gis, "");
                            extractedText = extractedText.trim();

                        } catch(e) {}
                        
                        return String(extractedText);
                    })()
                `,
                awaitPromise: true,
                returnByValue: true
            });
            const val = boxResult?.result?.value;
            await client.close();
            
            if (val && val.length > 0) {
                let fullStr = val;
                let diffStr = fullStr;
                
                // Compare with previous state to only return NEW messages
                if (globalLastChatState) {
                    if (fullStr.includes(globalLastChatState)) {
                        diffStr = fullStr.substring(fullStr.lastIndexOf(globalLastChatState) + globalLastChatState.length).trim();
                    } else {
                        let overlapFound = false;
                        // Try finding progressively smaller suffixes from the end of globalLastChatState
                        for (let size = Math.min(200, globalLastChatState.length); size >= 20; size -= 20) {
                            const suffix = globalLastChatState.slice(-size);
                            const lastIdx = fullStr.lastIndexOf(suffix);
                            if (lastIdx !== -1) {
                                diffStr = fullStr.substring(lastIdx + size).trim();
                                overlapFound = true;
                                break;
                            }
                        }
                    }
                }
                
                if (fullStr.length > 0) {
                    globalLastChatState = fullStr; // Save state for next call
                }
                
                if (diffStr && diffStr.trim() !== '') {
                    globalLastValidResponse = diffStr;
                }
                
                return diffStr || "[No new messages]";
            } else {
                logs.push(`${target.title}: empty`);
            }
        } catch(e) {
            logs.push(`${target.title}: ${e.message}`);
        }
    }
    throw new Error(`Failed to extract text. Details: ${logs.join(', ')}`);
}

/**
 * Get the full last agent response block (no diffing).
 * Used by /latest command so it always returns something useful.
 * Now it simply returns the cached last successful diff, avoiding grabbing user messages.
 */
async function getFullLatestResponse(port) {
    if (globalLastValidResponse) {
        return globalLastValidResponse;
    }
    return "[No previous message stored yet. Run a prompt first.]";
}

async function captureAgentScreenshot(port) {
    const raw = await httpGet(`http://127.0.0.1:${port}/json`);
    const targets = JSON.parse(raw);
    const candidates = targets.filter(t => (t.type === 'page' || t.type === 'iframe' || t.type === 'webview') &&
        t.webSocketDebuggerUrl &&
        !t.url.includes('devtools://'));

    candidates.sort((a, b) => {
        const aMatch = a.title.toLowerCase().includes('antigravity') ? 1 : 0;
        const bMatch = b.title.toLowerCase().includes('antigravity') ? 1 : 0;
        return bMatch - aMatch;
    });

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

    while (Date.now() - startTime < timeoutMs) {
        // Re-fetch targets on each iteration to avoid stale WebSocket connections
        let candidates;
        try {
            const raw = await httpGet(`http://127.0.0.1:${port}/json`);
            const targets = JSON.parse(raw);
            candidates = targets.filter(t => (t.type === 'page' || t.type === 'iframe' || t.type === 'webview') &&
                t.webSocketDebuggerUrl &&
                !t.url.includes('devtools://'));
            candidates.sort((a, b) => {
                const aMatch = a.title.toLowerCase().includes('antigravity') ? 1 : 0;
                const bMatch = b.title.toLowerCase().includes('antigravity') ? 1 : 0;
                return bMatch - aMatch;
            });
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
                        (function() {
                            const stopIcon = document.querySelector("svg.lucide-square, [data-tooltip-id*='cancel'], [aria-label*='Stop'], [title*='Stop'], [aria-label*='Cancel']");
                            const isGenerating = !!stopIcon;
                            const editor = document.querySelector('[contenteditable="true"], textarea');
                            const isInputDisabled = editor ? (editor.getAttribute('contenteditable') === 'false' || editor.disabled) : false;
                            const isIdle = !isGenerating && !isInputDisabled;
                            const hasChat = !!document.querySelector('#conversation, #chat, #cascade, .chat-input, .interactive-input-editor');
                            return { hasChat, isGenerating, isIdle };
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
            } catch(e) {}
        }
        
        if (foundChat) {
            if (isIdle && !isGenerating) {
                consecutiveIdleCount++;
                if (consecutiveIdleCount >= 4) return true;
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
    const raw = await httpGet(`http://127.0.0.1:${port}/json`);
    const targets = JSON.parse(raw);
    const candidates = targets.filter(t => (t.type === 'page' || t.type === 'iframe' || t.type === 'webview') &&
        t.webSocketDebuggerUrl &&
        !t.url.includes('devtools://'));

    // Sort: prefer pages with 'antigravity' in title (main IDE window)
    candidates.sort((a, b) => {
        const aMatch = a.title.toLowerCase().includes('antigravity') ? 1 : 0;
        const bMatch = b.title.toLowerCase().includes('antigravity') ? 1 : 0;
        return bMatch - aMatch;
    });

    const errors = [];
    for (const target of candidates) {
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
                            const editors = [...document.querySelectorAll('.interactive-input-editor textarea, #conversation textarea, #chat textarea, .chat-input textarea, [aria-label*="chat input" i] textarea, [contenteditable="true"]')]
                                .filter(el => el.offsetParent !== null && !el.className.includes('xterm'));
                            
                            const editor = editors.at(-1);
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

                            const submit = document.querySelector("svg.lucide-arrow-right, svg[class*='arrow-right'], svg[class*='send']")?.closest("button");
                            if (submit && !submit.disabled) {
                                submit.click();
                                return { found: true, method: 'button' };
                            }

                            ['keydown', 'keypress', 'keyup'].forEach(type => {
                                editor.dispatchEvent(new KeyboardEvent(type, { bubbles: true, key: "Enter", code: "Enter", keyCode: 13, which: 13 }));
                            });
                            return { found: true, method: 'keyboard' };
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
            errors.push(`${target.title?.substring(0, 25)}: ${e.message}`);
            try { if (client) await client.close(); } catch(_) {}
        }
    }
    console.log("sendViaCDP: Failed on all targets:", errors.join(' | '));
    throw new Error("No chat input found in the IDE. Please make sure a chat session is open in Antigravity.");
}

async function triggerNewChat(port) {
    const raw = await httpGet(`http://127.0.0.1:${port}/json`);
    const targets = JSON.parse(raw);
    const candidates = targets.filter(t => (t.type === 'page' || t.type === 'webview') && t.webSocketDebuggerUrl && !t.url.includes('devtools://'));

    for (const target of candidates) {
        try {
            const client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Runtime } = client;
            await Runtime.enable();
            const res = await Runtime.evaluate({
                expression: `
                    (() => {
                        const btn = document.querySelector('[aria-label*="New Chat" i], [title*="New Chat" i], [aria-label*="Yeni Sohbet" i], [class*="new-chat"]');
                        if (btn) { btn.click(); return true; }
                        
                        // Fallback to finding a plus button
                        const allBtns = Array.from(document.querySelectorAll('button'));
                        const plusBtn = allBtns.find(b => b.innerText.includes('+') || (b.querySelector('svg') && b.innerHTML.includes('plus')));
                        if (plusBtn) { plusBtn.click(); return true; }
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

async function triggerModelMenu(port) {
    const raw = await httpGet(`http://127.0.0.1:${port}/json`);
    const targets = JSON.parse(raw);
    const candidates = targets.filter(t => (t.type === 'page' || t.type === 'webview') && t.webSocketDebuggerUrl && !t.url.includes('devtools://'));

    for (const target of candidates) {
        try {
            const client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Runtime } = client;
            await Runtime.enable();
            const res = await Runtime.evaluate({
                expression: `
                    (() => {
                        const btn = document.querySelector('[aria-label*="Select model" i], [title*="Select model" i]');
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

module.exports = {
    getLatestAgentResponse,
    getFullLatestResponse,
    captureAgentScreenshot,
    captureFullIDEScreenshot,
    waitForAgentResponse,
    sendViaCDP,
    triggerNewChat,
    triggerModelMenu,
    getAvailableModels,
    selectModel,
    stopAgent
};

async function captureFullIDEScreenshot(port) {
    const raw = await httpGet(`http://127.0.0.1:${port}/json`);
    const targets = JSON.parse(raw);
    const candidates = targets.filter(t => (t.type === 'page' || t.type === 'iframe' || t.type === 'webview') &&
        t.webSocketDebuggerUrl &&
        !t.url.includes('devtools://'));

    candidates.sort((a, b) => {
        const aMatch = a.title.toLowerCase().includes('antigravity') ? 1 : 0;
        const bMatch = b.title.toLowerCase().includes('antigravity') ? 1 : 0;
        return bMatch - aMatch;
    });

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
    const raw = await httpGet(`http://127.0.0.1:${port}/json`);
    const targets = JSON.parse(raw);
    const candidates = targets.filter(t => (t.type === 'page' || t.type === 'webview') && t.webSocketDebuggerUrl && !t.url.includes('devtools://'));

    for (const target of candidates) {
        try {
            const client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Runtime } = client;
            await Runtime.enable();

            // Önce model menüsünü aç
            await Runtime.evaluate({
                expression: `
                    (() => {
                        const btn = document.querySelector('[aria-label*="Select model" i], [title*="Select model" i], [aria-label*="model" i]');
                        if (btn) { btn.click(); return true; }
                        // Fallback: model adı gösteren butonu bul
                        const allBtns = Array.from(document.querySelectorAll('button'));
                        const modelBtn = allBtns.find(b => b.textContent.match(/gemini|claude|gpt|flash|pro|opus|sonnet/i));
                        if (modelBtn) { modelBtn.click(); return true; }
                        return false;
                    })()
                `, returnByValue: true
            });

            // Dropdown'un açılmasını bekle
            await new Promise(r => setTimeout(r, 500));

            // Model listesini oku
            const res = await Runtime.evaluate({
                expression: `
                    (() => {
                        // Dropdown/listbox öğelerini bul
                        const items = document.querySelectorAll('[role="option"], [role="menuitem"], [role="listitem"], .model-item, [class*="model-option"], [class*="dropdown"] li, [class*="menu"] [class*="item"]');
                        const models = [];
                        items.forEach(el => {
                            const text = (el.textContent || '').trim();
                            if (text && text.length > 2 && text.length < 80 && !text.includes('\\n')) {
                                models.push(text);
                            }
                        });
                        if (models.length > 0) return models;
                        
                        // Fallback: tüm görünür liste öğelerini tara
                        const allLis = document.querySelectorAll('li, [role="option"]');
                        allLis.forEach(el => {
                            if (el.offsetParent && el.textContent.trim().length > 2) {
                                const t = el.textContent.trim().split('\\n')[0].trim();
                                if (t.length < 80) models.push(t);
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
    const raw = await httpGet(`http://127.0.0.1:${port}/json`);
    const targets = JSON.parse(raw);
    const candidates = targets.filter(t => (t.type === 'page' || t.type === 'webview') && t.webSocketDebuggerUrl && !t.url.includes('devtools://'));

    for (const target of candidates) {
        try {
            const client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Runtime } = client;
            await Runtime.enable();

            // Step 1: Check if dropdown is already open, if not click the model selector button
            const openRes = await Runtime.evaluate({
                expression: `
                    (() => {
                        // Check if model dropdown is already open by looking for model option buttons
                        const existingOptions = Array.from(document.querySelectorAll('button')).filter(b => 
                            b.className.includes('px-2 py-1') && 
                            b.className.includes('w-full') &&
                            b.className.includes('cursor-pointer')
                        );
                        if (existingOptions.length > 3) return { alreadyOpen: true };
                        
                        // Click the model selector button to open dropdown
                        const selectorBtn = document.querySelector('[aria-label*="Select model" i]');
                        if (selectorBtn) {
                            selectorBtn.click();
                            return { clicked: true };
                        }
                        
                        // Fallback: find button showing current model name
                        const allBtns = Array.from(document.querySelectorAll('button'));
                        const modelBtn = allBtns.find(b => {
                            const t = b.textContent.toLowerCase();
                            return (t.includes('gemini') || t.includes('claude') || t.includes('gpt')) && 
                                   b.className.includes('cursor-pointer') &&
                                   b.getAttribute('aria-label')?.includes('Select model');
                        });
                        if (modelBtn) {
                            modelBtn.click();
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
                    (() => {
                        const targetModel = ${JSON.stringify(modelName)}.toLowerCase();
                        const allBtns = Array.from(document.querySelectorAll('button'));
                        
                        // Find model option buttons in the dropdown
                        const modelOptions = allBtns.filter(b => 
                            b.className.includes('px-2') && 
                            b.className.includes('w-full') &&
                            b.className.includes('cursor-pointer') &&
                            b.className.includes('items-center')
                        );
                        
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
    const raw = await httpGet(`http://127.0.0.1:${port}/json`);
    const targets = JSON.parse(raw);
    const candidates = targets.filter(t => (t.type === 'page' || t.type === 'webview') && t.webSocketDebuggerUrl && !t.url.includes('devtools://'));

    for (const target of candidates) {
        try {
            const client = await CDP({ target: target.webSocketDebuggerUrl });
            const { Runtime } = client;
            await Runtime.enable();

            const res = await Runtime.evaluate({
                expression: `
                    (() => {
                        // Stop/Cancel butonunu bul
                        const stopIcon = document.querySelector("svg.lucide-square, [data-tooltip-id*='cancel'], [aria-label*='Stop'], [title*='Stop'], [aria-label*='Cancel']");
                        if (stopIcon) {
                            const btn = stopIcon.closest('button') || stopIcon;
                            btn.click();
                            return { stopped: true };
                        }
                        // Fallback: square icon olan butonu bul
                        const allBtns = Array.from(document.querySelectorAll('button'));
                        const stopBtn = allBtns.find(b => {
                            const svg = b.querySelector('svg');
                            return svg && (svg.classList.contains('lucide-square') || b.innerHTML.includes('square'));
                        });
                        if (stopBtn) {
                            stopBtn.click();
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
