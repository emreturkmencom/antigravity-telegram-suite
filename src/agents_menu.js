const { t } = require('./i18n');

const PROJECT_THREADS_PAGE_SIZE = 10;
const TOP_PINNED_LIMIT = 5;
const TOP_RECENT_LIMIT = 5;
const MAIN_WORKSPACES_LIMIT = 12;

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function isValidAgentThread(th) {
    return Boolean(
        th &&
        th.name &&
        !/^(Ran|Worked for|Explored)\b/i.test(th.name) &&
        !/^show\s+\d+\s+more/i.test(th.name)
    );
}

function findCachedThreadIndex(cachedAgentThreads, th, fallbackWs = null) {
    const list = Array.isArray(cachedAgentThreads) ? cachedAgentThreads : [];
    const wsName = th.workspace || fallbackWs;
    if (th.threadId) {
        const byId = list.findIndex(item => item.threadId === th.threadId);
        if (byId >= 0) return byId;
    }
    return list.findIndex(item => item.name === th.name && (!wsName || item.workspace === wsName));
}

function formatAgentThreadButtonLabel(th, { icon = '💬', showWorkspace = false, maxTitleLen = 26 } = {}) {
    let displayName = String(th.name || '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (displayName.length > maxTitleLen) {
        displayName = displayName.substring(0, Math.max(8, maxTitleLen - 1)) + '…';
    }
    let wsPart = '';
    if (showWorkspace && th.workspace && th.workspace !== 'Default') {
        const shortWs = th.workspace.length > 13 ? th.workspace.substring(0, 12) + '…' : th.workspace;
        wsPart = ` · ${shortWs}`;
    }
    const timePart = th.time ? ` (${th.time})` : '';
    return `${icon} ${displayName}${wsPart}${timePart}`;
}

function renderAgentsKeyboard(workspaces, activeInfo, cachedAgentThreads = [], { showAllWorkspaces = false } = {}) {
    const inline_keyboard = [];

    const allThreads = [];
    for (const ws of workspaces || []) {
        for (const th of ws.threads || []) {
            if (isValidAgentThread(th)) {
                allThreads.push({ ...th, workspace: ws.workspace });
            }
        }
    }
    allThreads.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    // 1. Top 5 Pinned Conversations (sorted newest-first, with project + relative time)
    const topPinned = allThreads.filter(th => th.pinned).slice(0, TOP_PINNED_LIMIT);
    const shownKeys = new Set();
    for (const th of topPinned) {
        const key = th.threadId || `${th.workspace}::${th.name}`;
        shownKeys.add(key);
        const thIdx = findCachedThreadIndex(cachedAgentThreads, th);
        const idx = thIdx >= 0 ? thIdx + 1 : 1;
        const label = formatAgentThreadButtonLabel(th, { icon: '📌', showWorkspace: true, maxTitleLen: 24 });
        inline_keyboard.push([{ text: label, callback_data: `ag_th:${idx}` }]);
    }

    // 2. Top 5 Truly Most Recent Conversations across all projects (excluding already-shown pinned items)
    const topRecent = allThreads
        .filter(th => !shownKeys.has(th.threadId || `${th.workspace}::${th.name}`))
        .slice(0, TOP_RECENT_LIMIT);
    for (const th of topRecent) {
        const thIdx = findCachedThreadIndex(cachedAgentThreads, th);
        const idx = thIdx >= 0 ? thIdx + 1 : 1;
        const label = formatAgentThreadButtonLabel(th, { icon: '💬', showWorkspace: true, maxTitleLen: 24 });
        inline_keyboard.push([{ text: label, callback_data: `ag_th:${idx}` }]);
    }

    // 3. Project Workspace Buttons (ordered by latest activity)
    const wsEntries = [];
    (workspaces || []).forEach((ws, wsIdx) => {
        const count = (ws.threads || []).filter(isValidAgentThread).length;
        if (count > 0) wsEntries.push({ ws, wsIdx, count });
    });

    if (wsEntries.length > 1 || (wsEntries.length === 1 && allThreads.length > TOP_RECENT_LIMIT)) {
        const visibleWs = showAllWorkspaces ? wsEntries : wsEntries.slice(0, MAIN_WORKSPACES_LIMIT);
        const wsRows = [];
        let currentRow = [];
        for (const { ws, wsIdx, count } of visibleWs) {
            const wsLabel = ws.workspace.length > 16 ? ws.workspace.substring(0, 14) + '…' : ws.workspace;
            currentRow.push({ text: `📁 ${wsLabel} (${count})`, callback_data: `ag_ws:${wsIdx}` });
            if (currentRow.length === 2) {
                wsRows.push(currentRow);
                currentRow = [];
            }
        }
        if (currentRow.length > 0) wsRows.push(currentRow);
        inline_keyboard.push(...wsRows);

        if (!showAllWorkspaces && wsEntries.length > MAIN_WORKSPACES_LIMIT) {
            inline_keyboard.push([
                { text: t('agents.show_all_projects_btn', { count: wsEntries.length }), callback_data: 'ag_ws_all' }
            ]);
        }
    }

    // 4. Rename Active Chat + Refresh / Close
    if (activeInfo && (activeInfo.threadId || activeInfo.id)) {
        inline_keyboard.push([
            { text: t('agents.rename_active_btn'), callback_data: 'ag_rn_active' }
        ]);
    }
    inline_keyboard.push([
        { text: t('agents.refresh_btn') || '🔄 Refresh', callback_data: 'ag_refresh' },
        { text: t('agents.close_btn') || '❌ Close', callback_data: 'ag_close' }
    ]);

    const activeChat = activeInfo?.name || '—';
    const activeProject = activeInfo?.workspace || 'Default';
    const text = t('agents.menu_title', {
        activeChat: escapeHtml(activeChat),
        activeProject: escapeHtml(activeProject)
    });

    return { text, reply_markup: { inline_keyboard } };
}

function renderProjectThreadsKeyboard(ws, wsIdx, cachedAgentThreads = [], page = 0, renameMode = false) {
    const inline_keyboard = [];
    const validThreads = (ws.threads || [])
        .filter(isValidAgentThread)
        .slice()
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    const totalPages = Math.max(1, Math.ceil(validThreads.length / PROJECT_THREADS_PAGE_SIZE));
    const safePage = Math.min(Math.max(0, page), totalPages - 1);
    const start = safePage * PROJECT_THREADS_PAGE_SIZE;
    const pageThreads = validThreads.slice(start, start + PROJECT_THREADS_PAGE_SIZE);
    const end = start + pageThreads.length;

    for (const th of pageThreads) {
        const thIdx = findCachedThreadIndex(cachedAgentThreads, th, ws.workspace);
        const idx = thIdx >= 0 ? thIdx + 1 : 1;
        const icon = renameMode ? '✏️' : (th.pinned ? '📌' : '💬');
        const label = formatAgentThreadButtonLabel(th, { icon, showWorkspace: false, maxTitleLen: 32 });
        const cb = renameMode ? `ag_rn:${idx}` : `ag_th:${idx}`;
        inline_keyboard.push([{ text: label, callback_data: cb }]);
    }

    if (totalPages > 1) {
        const navPrefix = renameMode ? 'ag_rnp' : 'ag_wsp';
        const navRow = [];
        if (safePage > 0) {
            navRow.push({ text: t('agents.prev_page_btn'), callback_data: `${navPrefix}:${wsIdx}:${safePage - 1}` });
        }
        navRow.push({ text: `${safePage + 1}/${totalPages}`, callback_data: 'ag_noop' });
        if (safePage < totalPages - 1) {
            navRow.push({ text: t('agents.next_page_btn'), callback_data: `${navPrefix}:${wsIdx}:${safePage + 1}` });
        }
        inline_keyboard.push(navRow);
    }

    if (validThreads.length > 0) {
        if (!renameMode) {
            inline_keyboard.push([
                { text: t('agents.rename_pick_btn'), callback_data: `ag_rnp:${wsIdx}:${safePage}` }
            ]);
        } else {
            inline_keyboard.push([
                { text: t('agents.back_to_project_btn'), callback_data: `ag_wsp:${wsIdx}:${safePage}` }
            ]);
        }
    }

    inline_keyboard.push([
        { text: t('agents.all_projects_btn') || '⬅️ All Projects', callback_data: 'ag_back' },
        { text: t('agents.close_btn') || '❌ Close', callback_data: 'ag_close' }
    ]);

    let text;
    if (renameMode) {
        text = t('agents.rename_pick_title', { workspace: escapeHtml(ws.workspace) });
    } else if (totalPages > 1) {
        text = t('agents.project_view_paged_title', {
            workspace: escapeHtml(ws.workspace),
            start: start + 1,
            end,
            count: validThreads.length,
        });
    } else {
        text = t('agents.project_view_title', {
            workspace: escapeHtml(ws.workspace),
            count: validThreads.length,
        });
    }

    return { text, reply_markup: { inline_keyboard } };
}

module.exports = {
    PROJECT_THREADS_PAGE_SIZE,
    TOP_PINNED_LIMIT,
    TOP_RECENT_LIMIT,
    MAIN_WORKSPACES_LIMIT,
    isValidAgentThread,
    findCachedThreadIndex,
    formatAgentThreadButtonLabel,
    renderAgentsKeyboard,
    renderProjectThreadsKeyboard,
};
