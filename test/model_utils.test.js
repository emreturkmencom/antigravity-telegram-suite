const assert = require('assert');
const { UI_LOCATORS_SCRIPT } = require('../src/ui_locators');
const { PENDING_ACTION_TEXTS, SUBMIT_ACTION_TEXTS } = require('../src/cdp_controller');
const { findBestModelOption, normalizeModelText } = require('../src/model_utils');

function run() {
    assert(UI_LOCATORS_SCRIPT.includes('选择模型'), 'model selector should support Chinese aria labels');
    assert(UI_LOCATORS_SCRIPT.includes('当前'), 'model selector should support Chinese current-model labels');
    assert(SUBMIT_ACTION_TEXTS.includes('发送'), 'submit detection should support Chinese send buttons');
    assert(SUBMIT_ACTION_TEXTS.includes('提交'), 'submit detection should support Chinese submit buttons');
    assert(PENDING_ACTION_TEXTS.includes('运行'), 'pending action detection should support Chinese run buttons');
    assert(PENDING_ACTION_TEXTS.includes('接受'), 'pending action detection should support Chinese accept buttons');
    assert(PENDING_ACTION_TEXTS.includes('允许'), 'pending action detection should support Chinese allow buttons');
    assert(PENDING_ACTION_TEXTS.includes('继续'), 'pending action detection should support Chinese continue buttons');
    assert(PENDING_ACTION_TEXTS.includes('重试'), 'pending action detection should support Chinese retry buttons');

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
