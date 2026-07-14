function positiveInteger(value, fallback) {
    const number = Number(value);
    return Number.isInteger(number) && number > 0 ? number : fallback;
}

function createUndoConfirmationError(code) {
    const error = new Error(code);
    error.code = code;
    return error;
}

function buildUndoConfirmationExpression(mode) {
    return `
        (() => {
            const mode = ${JSON.stringify(mode)};
            const normalize = value => String(value || '').replace(/\\s+/g, ' ').trim().toLowerCase();
            const isVisible = element => {
                if (!element || element.disabled || element.getAttribute('aria-disabled') === 'true') return false;
                const style = window.getComputedStyle(element);
                return element.offsetParent !== null
                    && style.display !== 'none'
                    && style.visibility !== 'hidden'
                    && element.getClientRects().length > 0;
            };
            const labelsFor = element => [
                element.textContent,
                element.value,
                element.getAttribute('aria-label'),
                element.getAttribute('title')
            ].map(normalize).filter(Boolean);
            const isUndoHeading = element => {
                const text = normalize(element.textContent);
                const isTitle = text === 'confirm undo' || text === '确认撤销';
                return isTitle && !Array.from(element.querySelectorAll('*')).some(child => {
                    const childText = normalize(child.textContent);
                    return childText === 'confirm undo' || childText === '确认撤销';
                });
            };
            const headings = Array.from(document.querySelectorAll('h1, h2, h3, [role="heading"], div, span'))
                .filter(isVisible)
                .filter(isUndoHeading);
            if (headings.length === 0) return { status: 'not_found' };
            if (headings.length !== 1) return { status: 'ambiguous' };
            if (mode === 'probe') return { status: 'ready' };

            let container = headings[0].parentElement;
            while (container) {
                const buttons = Array.from(container.querySelectorAll('button, [role="button"], input[type="button"], input[type="submit"]'))
                    .filter(isVisible);
                const confirmButtons = buttons.filter(button => labelsFor(button).some(label => (
                    label === 'confirm' || /^confirm(?:\\s|↵)*$/.test(label) || label === '确认' || label === '确定'
                )));
                const cancelButtons = buttons.filter(button => labelsFor(button).some(label => (
                    label === 'cancel' || label === '取消'
                )));
                if (confirmButtons.length > 0 || cancelButtons.length > 0) {
                    if (confirmButtons.length !== 1) return { status: 'ambiguous' };
                    if (mode === 'click') {
                        confirmButtons[0].click();
                        return { status: 'clicked' };
                    }
                    return { status: 'ready' };
                }
                container = container.parentElement;
            }
            return { status: 'not_found' };
        })()
    `;
}

async function confirmUndoDialog(options = {}) {
    const {
        port,
        targetId,
        resolveTargets,
        connect,
        timeout,
        wait = ms => new Promise(resolve => setTimeout(resolve, ms))
    } = options;
    const openAttempts = positiveInteger(options.openAttempts, 30);
    const closeAttempts = positiveInteger(options.closeAttempts, 30);
    const configuredPollMs = Number(options.pollMs);
    const pollMs = Number.isFinite(configuredPollMs) && configuredPollMs >= 0
        ? configuredPollMs
        : 100;

    const targets = await resolveTargets(port, false);
    const target = targets.find(candidate => candidate.id === targetId);
    if (!target) throw createUndoConfirmationError('undo_confirmation_not_found');

    let client = null;
    let closeLateClient = false;
    const pendingClient = Promise.resolve(connect({ target: target.webSocketDebuggerUrl }));
    pendingClient.then(lateClient => {
        if (closeLateClient && lateClient !== client) return lateClient.close().catch(() => {});
        return null;
    }).catch(() => {});

    try {
        client = await timeout(pendingClient, 3000, 'CDP undo confirmation timeout');
        const { Runtime } = client;
        await Runtime.enable();

        async function probe(mode) {
            const result = await timeout(Runtime.evaluate({
                expression: buildUndoConfirmationExpression(mode),
                returnByValue: true
            }), 3000, 'CDP undo confirmation evaluate timeout');
            return result?.result?.value?.status || 'not_found';
        }

        let clicked = false;
        for (let attempt = 0; attempt < openAttempts; attempt += 1) {
            const status = await probe('click');
            if (status === 'ambiguous') throw createUndoConfirmationError('undo_confirmation_ambiguous');
            if (status === 'clicked') {
                clicked = true;
                break;
            }
            if (attempt + 1 < openAttempts) await wait(pollMs);
        }
        if (!clicked) throw createUndoConfirmationError('undo_confirmation_not_found');

        for (let attempt = 0; attempt < closeAttempts; attempt += 1) {
            const status = await probe('probe');
            if (status === 'not_found') return { status: 'confirmed' };
            if (status === 'ambiguous') throw createUndoConfirmationError('undo_confirmation_ambiguous');
            if (attempt + 1 < closeAttempts) await wait(pollMs);
        }
        throw createUndoConfirmationError('undo_confirmation_not_closed');
    } finally {
        closeLateClient = true;
        if (client) await client.close().catch(() => {});
    }
}

module.exports = {
    buildUndoConfirmationExpression,
    confirmUndoDialog
};
