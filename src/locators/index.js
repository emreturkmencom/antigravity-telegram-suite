const { IDE_LOCATORS_SCRIPT } = require('./ide_locators');
const { STANDALONE_LOCATORS_SCRIPT } = require('./standalone_locators');

const HYBRID_IDE_LOCATORS_SCRIPT = `
    var AG_UI;
    if (typeof window !== 'undefined' && (/^https?:$/i.test(window.location.protocol || '') || /extensionView=true/i.test(window.location.search || ''))) {
        ${STANDALONE_LOCATORS_SCRIPT}
    } else {
        ${IDE_LOCATORS_SCRIPT}
    }
`;

/**
 * Returns the locator script specifically for the given app type.
 * Since Antigravity IDE 2.6+ (1.107+), the agent panel runs inside an extensionView=true
 * web iframe sharing the Standalone React/Lexical UI, while workbench pages remain vscode-file://.
 * @param {string} appType 'ide' or 'agent'
 * @returns {string} The javascript string to be evaluated via CDP.
 */
function getLocatorsScript(appType) {
    if (appType === 'ide') {
        return HYBRID_IDE_LOCATORS_SCRIPT;
    }
    return STANDALONE_LOCATORS_SCRIPT;
}

module.exports = {
    getLocatorsScript,
    IDE_LOCATORS_SCRIPT,
    STANDALONE_LOCATORS_SCRIPT,
    HYBRID_IDE_LOCATORS_SCRIPT
};
