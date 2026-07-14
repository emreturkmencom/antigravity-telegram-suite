function selectUndoMatch(matches, anchor = {}) {
    if (!Array.isArray(matches) || matches.length === 0) return { status: 'not_found' };

    const scopeKey = typeof anchor.scopeKey === 'string' && anchor.scopeKey.trim()
        ? anchor.scopeKey
        : null;
    const matchIndex = Number.isInteger(anchor.matchIndex) && anchor.matchIndex >= 0
        ? anchor.matchIndex
        : null;

    if (scopeKey) {
        const scopedIndexes = matches
            .map((match, index) => ({ match, index }))
            .filter(entry => entry.match?.scopeKey === scopeKey)
            .map(entry => entry.index);
        if (scopedIndexes.length === 0) return { status: 'not_found' };
        if (scopedIndexes.length !== 1) return { status: 'ambiguous' };

        const index = scopedIndexes[0];
        if (matchIndex != null && index !== matchIndex) return { status: 'not_found' };
        return { status: 'selected', index };
    }

    if (matches.length !== 1) return { status: 'ambiguous' };
    return { status: 'selected', index: 0 };
}

module.exports = { selectUndoMatch };
