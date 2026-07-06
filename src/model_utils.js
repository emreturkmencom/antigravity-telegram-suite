function normalizeModelText(text) {
    return (text || '')
        .toLowerCase()
        .replace(/选择模型/g, ' ')
        .replace(/select model/g, ' ')
        .replace(/current/g, ' ')
        .replace(/当前/g, ' ')
        .replace(/fla\s*h/g, 'flash')
        .replace(/fa\s*t/g, 'fast')
        .replace(/\bopus?\b/g, 'opus')
        .replace(/\bfast\b/g, ' ')
        .replace(/\bnew\b/g, ' ')
        .replace(/[^a-z0-9]+/g, '');
}

function findBestModelOption(options, targetModel) {
    const target = normalizeModelText(targetModel);
    if (!target) return null;

    const normalized = options.map(option => ({
        option,
        key: normalizeModelText(option)
    }));

    const exact = normalized.find(item => item.key === target);
    if (exact) return exact.option;

    const partial = normalized.find(item => item.key.includes(target) || target.includes(item.key));
    return partial ? partial.option : null;
}

module.exports = {
    findBestModelOption,
    normalizeModelText
};
