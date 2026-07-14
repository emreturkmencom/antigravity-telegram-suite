const DIRECT_THREAD_ID_SOURCES = new Set(['url', 'dom']);

function matchesUndoThread(candidate = {}, activeThread = {}, options = {}) {
    const expectedId = String(candidate.threadId || '').trim();
    if (expectedId) {
        return DIRECT_THREAD_ID_SOURCES.has(activeThread?.idSource)
            && String(activeThread?.id || '').trim() === expectedId;
    }

    const expectedName = String(candidate.threadName || '').trim();
    const expectedWorkspace = String(candidate.workspace || '').trim();
    if (!expectedName || !expectedWorkspace || options.legacyNameIsUnique !== true) return false;
    return activeThread?.workspaceSource === 'dom'
        && String(activeThread?.name || '').trim() === expectedName
        && String(activeThread?.workspace || '').trim() === expectedWorkspace;
}

function hasUniqueUndoThreadName(candidate = {}, groups = []) {
    const expectedName = String(candidate.threadName || '').trim();
    if (!expectedName || !Array.isArray(groups)) return false;
    const expectedWorkspace = String(candidate.workspace || '').trim();
    if (!expectedWorkspace) return false;
    const matches = groups.flatMap(group => {
        if (expectedWorkspace && String(group?.workspace || '').trim() !== expectedWorkspace) return [];
        return Array.isArray(group?.threads)
            ? group.threads.filter(thread => String(thread?.name || '').trim() === expectedName)
            : [];
    });
    return matches.length === 1;
}

function filterUndoCandidatesByActiveThread(candidates, activeThread, groups = []) {
    if (!Array.isArray(candidates) || !activeThread) return [];
    return candidates.filter(candidate => matchesUndoThread(candidate, activeThread, {
        legacyNameIsUnique: candidate?.threadId
            ? false
            : hasUniqueUndoThreadName(candidate, groups)
    }));
}

module.exports = {
    matchesUndoThread,
    hasUniqueUndoThreadName,
    filterUndoCandidatesByActiveThread
};
