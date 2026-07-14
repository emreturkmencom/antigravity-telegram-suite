function isForegroundAgentWorking(state = {}) {
    return state.isGenerating === true
        || (state.isModal !== true && state.isInputDisabled === true)
        || state.hasPendingButton === true;
}

module.exports = { isForegroundAgentWorking };
