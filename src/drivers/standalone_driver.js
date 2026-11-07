const BaseDriver = require('./base_driver');
const { getLocatorsScript } = require('../locators');

class StandaloneDriver extends BaseDriver {
    constructor() {
        super('agent', 'antigravity', 9333);
    }

    getLocatorsScript() {
        return getLocatorsScript('agent');
    }

    getActiveThreadInfoScript() {
        return `(async () => {
            let name = document.title || null;
            let nameSource = document.title ? 'document-title' : 'none';
            let threadIdVal = null;
            
            try {
                const url = window.location.href;
                const urlMatch = url.match(/\\/c\\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
                if (urlMatch) threadIdVal = urlMatch[1];
            } catch (e) {}

            let workspace = null;

            // Fast path: Standalone 2.23+ titlebar breadcrumbs
            const crumbs = Array.from(document.querySelectorAll('[data-testid="breadcrumb-segment"]'));
            if (crumbs.length >= 2) {
                workspace = crumbs[0].textContent.trim();
                name = crumbs[1].textContent.trim();
                nameSource = 'breadcrumb';
            } else if (crumbs.length === 1) {
                const seg = crumbs[0].textContent.trim();
                if (seg && seg.toLowerCase() !== 'antigravity') {
                    workspace = seg;
                }
            }

            // Secondary fast path: match ?project=<id> or ?section=<id> to sidebar project header
            if (!workspace) {
                try {
                    const params = new URLSearchParams(window.location.search);
                    const sectionId = params.get('project') || params.get('section');
                    if (sectionId) {
                        const secLink = document.querySelector('a[href*="project=' + sectionId + '"], a[href*="section=' + sectionId + '"]');
                        if (secLink) {
                            const wrapper = secLink.closest('.group\\\\/header') || secLink.parentElement?.parentElement;
                            const h = wrapper ? wrapper.querySelector('button[data-testid="project-header"], button[class*="headerbtn"]') : null;
                            if (h) {
                                workspace = (h.getAttribute('data-project-label') || h.textContent || '').trim().replace(/\\s+\\d+$/, '');
                            }
                        }
                    }
                } catch (e) {}
            }

            if (!workspace && threadIdVal) {
                const scrollEl = document.querySelector(".relative.w-full.h-full.overflow-y-auto.overscroll-none.px-2") ||
                                 Array.from(document.querySelectorAll("*")).find(el => {
                                     const s = window.getComputedStyle(el);
                                     return (s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight;
                                 });

                const origScroll = scrollEl ? scrollEl.scrollTop : 0;
                let activeLink = document.querySelector('a[href*="' + threadIdVal + '"]');

                if (!activeLink && scrollEl) {
                    for (let pos = 0; pos <= scrollEl.scrollHeight + 350; pos += 350) {
                        scrollEl.scrollTop = pos;
                        await new Promise(r => setTimeout(r, 25));
                        activeLink = document.querySelector('a[href*="' + threadIdVal + '"]');
                        if (activeLink) break;
                    }
                }

                if (activeLink) {
                    const headers = Array.from(document.querySelectorAll("button")).filter(b => (b.className || "").includes("headerbtn"));
                    let matchingHeader = null;
                    for (const h of headers) {
                        if (h.compareDocumentPosition(activeLink) & Node.DOCUMENT_POSITION_FOLLOWING) {
                            matchingHeader = h;
                        }
                    }
                    if (matchingHeader) {
                        workspace = (matchingHeader.getAttribute('data-project-label') || matchingHeader.textContent || '').trim().replace(/\\s+\\d+$/, '');
                    }
                }

                if (scrollEl) scrollEl.scrollTop = origScroll;
            }

            // Fallback for older standalone versions
            if (!workspace) {
                const panel = document.querySelector(".antigravity-agent-side-panel");
                const wsEl2 = panel ? panel.querySelector("div.text-lg.font-medium") : null;
                if (wsEl2) workspace = wsEl2.textContent.trim();
            }

            if (name && nameSource !== 'breadcrumb') {
                name = name.replace(/\\s+-\\s+Antigravity$/i, '').replace(/^Antigravity$/i, '').trim();
                if (workspace && name.toLowerCase().endsWith(' - ' + workspace.toLowerCase())) {
                    name = name.slice(0, -(' - ' + workspace).length).trim();
                }
                if (workspace && name.toLowerCase() === workspace.toLowerCase()) {
                    name = null;
                }
                if (!threadIdVal || !name) {
                    name = null;
                }
            }

            return { name, workspace, threadId: threadIdVal, nameSource };
        })()`;
    }

    getSwitchThreadScript(threadNameStr, targetWsNameStr) {
        return `(async () => {
            const targetThread = ${threadNameStr};
            const targetWs = ${targetWsNameStr};
            const normalize = s => (s || '').toLowerCase().replace(/[^\\p{L}\\p{N}]/gu, '');

            if (normalize(document.title) === normalize(targetThread)) {
                return 'already-active';
            }

            const scrollEl = document.querySelector(".relative.w-full.h-full.overflow-y-auto.overscroll-none.px-2") ||
                             Array.from(document.querySelectorAll("*")).find(el => {
                                 const s = window.getComputedStyle(el);
                                 return (s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight;
                             });

            const totalHeight = scrollEl ? scrollEl.scrollHeight : 0;
            const step = 250;
            let targetLink = null;

            if (scrollEl) {
                scrollEl.scrollTop = 0;
                await new Promise(r => setTimeout(r, 80));
            }

            // Search directly in DOM or scroll virtualized list
            for (let pos = 0; pos <= totalHeight + step; pos += step) {
                if (scrollEl && pos > 0) {
                    scrollEl.scrollTop = pos;
                    await new Promise(r => setTimeout(r, 70));
                }

                const allLinks = Array.from(document.querySelectorAll('a[href*="/c/"]'));
                targetLink = allLinks.find(a => {
                    const aria = a.getAttribute('aria-label') || '';
                    const text = a.textContent.trim();
                    return normalize(aria) === normalize(targetThread) || normalize(text) === normalize(targetThread);
                });

                if (!targetLink && targetThread.length > 5) {
                    const targetNorm = normalize(targetThread);
                    targetLink = allLinks.find(a => {
                        const aria = normalize(a.getAttribute('aria-label') || '');
                        const text = normalize(a.textContent.trim());
                        return (aria && (aria.includes(targetNorm) || targetNorm.includes(aria))) ||
                               (text && (text.includes(targetNorm) || targetNorm.includes(text)));
                    });
                }

                if (targetLink) break;
            }

            if (!targetLink) {
                // Fallback for legacy workspace cards
                const cards = Array.from(document.querySelectorAll('[data-project-card="true"], [data-workspace-card="true"]'));
                for (const card of cards) {
                    const threadRows = Array.from(card.querySelectorAll('a, [role="button"]'));
                    for (const row of threadRows) {
                        const title = row.getAttribute('aria-label') || row.textContent.trim();
                        if (normalize(title) === normalize(targetThread)) {
                            targetLink = row;
                            break;
                        }
                    }
                    if (targetLink) break;
                }
            }

            if (!targetLink) return 'not-found';

            // Click target link with full pointer & mouse events
            targetLink.focus();
            const rect = targetLink.getBoundingClientRect();
            const clientX = rect.left + rect.width / 2;
            const clientY = rect.top + rect.height / 2;

            try {
                targetLink.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX, clientY, pointerId: 1, pointerType: 'mouse' }));
                targetLink.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientX, clientY }));
                targetLink.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX, clientY, pointerId: 1, pointerType: 'mouse' }));
                targetLink.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, clientX, clientY }));
                targetLink.click();
            } catch (e) {
                targetLink.click();
            }

            await new Promise(r => setTimeout(r, 500));
            return 'clicked';
        })()`;
    }

    getListAgentThreadsScript() {
        return `(async () => {
            const header = document.querySelector('button[data-testid="project-header"], button[class*="headerbtn"], a[href*="/c/"]');
            if (header) {
                const scrollEl = document.querySelector(".relative.w-full.h-full.overflow-y-auto.overscroll-none.px-2") ||
                                 Array.from(document.querySelectorAll("*")).find(el => {
                                     const s = window.getComputedStyle(el);
                                     return (s.overflowY === "auto" || s.overflowY === "scroll") && el.scrollHeight > el.clientHeight;
                                 });

                const origScroll = scrollEl ? scrollEl.scrollTop : 0;
                const totalHeight = scrollEl ? scrollEl.scrollHeight : 0;
                // 2.29 groups conversations under Projects: the sidebar can be
                // ~18 000 px tall, and 250 px steps overran the 12 s CDP evaluate
                // timeout -> empty list ("no recent threads"). Step a viewport at
                // a time and stop after a time budget.
                const step = Math.max(250, Math.floor((scrollEl ? scrollEl.clientHeight : 0) * 0.9));
                const scanStart = performance.now();

                if (scrollEl) {
                    scrollEl.scrollTop = 0;
                    await new Promise(r => setTimeout(r, 100));
                }

                const foundWorkspaces = new Map();
                let lastKnownWs = "Default";

                for (let pos = 0; pos <= totalHeight + step; pos += step) {
                    if (performance.now() - scanStart > 9000) break;
                    if (scrollEl && pos > 0) {
                        scrollEl.scrollTop = pos;
                        await new Promise(r => setTimeout(r, 70));
                    }

                    const headers = Array.from(document.querySelectorAll('button[data-testid="project-header"], button[class*="headerbtn"]'));
                    const links = Array.from(document.querySelectorAll("a[href*=\x27/c/\x27]"));

                    for (const link of links) {
                        const title = link.getAttribute("aria-label") || link.textContent.trim();
                        if (!title || /^(Projects|Conversations|Settings|New Conversation|See all)/i.test(title)) continue;

                        let matchingHeader = null;
                        for (const h of headers) {
                            if (h.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING) {
                                matchingHeader = h;
                            }
                        }

                        const headerWs = matchingHeader
                            ? (matchingHeader.getAttribute("data-project-label") || matchingHeader.textContent || "").trim().replace(/\\s+\\d+$/, "")
                            : null;
                        if (headerWs) lastKnownWs = headerWs;

                        let rowWs = null;
                        const row = link.closest("div") || link.parentElement;
                        if (row && row.innerText) {
                            const rowLines = row.innerText.split("\\n").map(s => s.trim()).filter(Boolean);
                            if (rowLines.length >= 2 && rowLines[0] === title && !/^[0-9]+[smhd]$|^[0-9]+:[0-9]+|^[0-9]+\\s*(min|hour|day|sec|mo|wk|yr)/i.test(rowLines[1])) {
                                rowWs = rowLines[1];
                            }
                        }

                        const wsName = rowWs || headerWs || lastKnownWs;

                        if (!foundWorkspaces.has(wsName)) {
                            foundWorkspaces.set(wsName, { workspace: wsName, threads: new Map() });
                        }

                        const wsObj = foundWorkspaces.get(wsName);
                        if (!wsObj.threads.has(title)) {
                            let time = "";
                            if (row) {
                                const timeSpan = Array.from(row.querySelectorAll("span, p, div")).find(s => 
                                    s.textContent.trim() !== title && 
                                    /^[0-9]+[smhd]|^[0-9]+:[0-9]+|^[0-9]+\\s*(min|hour|day|sec|mo|wk|yr)/i.test(s.textContent.trim())
                                );
                                if (timeSpan) time = timeSpan.textContent.trim();
                            }
                            wsObj.threads.set(title, { name: title, time, href: link.getAttribute("href") });
                        }
                    }
                }

                if (scrollEl) scrollEl.scrollTop = origScroll;

                const results = Array.from(foundWorkspaces.values()).map(w => ({
                    workspace: w.workspace,
                    threads: Array.from(w.threads.values())
                }));

                if (results.length > 0 && results.some(w => w.threads.length > 0)) {
                    return JSON.stringify(results);
                }
            }

            // Fallback for older standalone versions
            const panel = document.querySelector(".antigravity-agent-side-panel");
            if (panel) {
                const wsEl = panel.querySelector("div.text-lg.font-medium");
                const currentWsName = wsEl ? wsEl.textContent.trim() : "Default";
                
                const workspacesMap = {};
                const btns = Array.from(panel.querySelectorAll("button.group.cursor-pointer, a.group, a[href*='/c/']"));
                
                for (const item of btns) {
                    const nameEl = item.querySelector("div.truncate, span.truncate") || item;
                    const timeEl = item.querySelector("p.text-muted-foreground, span.text-xs");
                    const name = item.getAttribute('aria-label') || (nameEl ? nameEl.textContent.trim() : "");
                    const time = timeEl ? timeEl.textContent.trim() : "";
                    if (name && !/^(Projects|Conversations|Settings|New Conversation|See all)/i.test(name)) {
                        if (!workspacesMap[currentWsName]) workspacesMap[currentWsName] = { workspace: currentWsName, threads: [] };
                        if (!workspacesMap[currentWsName].threads.find(t => t.name === name)) {
                            workspacesMap[currentWsName].threads.push({ name, time });
                        }
                    }
                }
                return JSON.stringify(Object.values(workspacesMap));
            }

            // General fallback: collect all a[href*="/c/"] links
            const allLinks = Array.from(document.querySelectorAll('a[href*="/c/"]'));
            if (allLinks.length > 0) {
                const threads = allLinks.map(a => ({
                    name: a.getAttribute('aria-label') || a.textContent.trim(),
                    time: '',
                    href: a.getAttribute('href')
                })).filter(t => t.name && !/^(Projects|Conversations|Settings|New Conversation|See all)/i.test(t.name));

                return JSON.stringify([{ workspace: 'Default', threads }]);
            }

            return JSON.stringify([]);
        })()`;
    }
}

module.exports = StandaloneDriver;
