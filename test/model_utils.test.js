const assert = require('assert');
const { UI_LOCATORS_SCRIPT } = require('../src/ui_locators');
const { findBestModelOption, normalizeModelText } = require('../src/model_utils');

function run() {
    assert(UI_LOCATORS_SCRIPT.includes('选择模型'), 'model selector should support Chinese aria labels');
    assert(UI_LOCATORS_SCRIPT.includes('当前'), 'model selector should support Chinese current-model labels');

    assert.strictEqual(
        normalizeModelText('Gemini 3.5 Fla h (Medium)Fa t'),
        normalizeModelText('Gemini 3.5 Flash (Medium)')
    );

    const options = [
        'Gemini 3.5 Fla h (High)Fa t',
        'Gemini 3.5 Fla h (Medium)Fa t',
        'Claude Opu  4.6 (Thinking)'
    ];

    assert.strictEqual(
        findBestModelOption(options, 'Gemini 3.5 Flash (Medium)'),
        'Gemini 3.5 Fla h (Medium)Fa t'
    );
    assert.strictEqual(
        findBestModelOption(options, 'Claude Opus 4.6 (Thinking)'),
        'Claude Opu  4.6 (Thinking)'
    );

    console.log('✅ Model utility tests passed!');
}

try {
    run();
} catch (err) {
    console.error(err);
    process.exit(1);
}
