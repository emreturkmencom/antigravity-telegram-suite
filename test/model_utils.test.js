const assert = require('assert');
const { IDE_LOCATORS_SCRIPT } = require('../src/locators');
const { PENDING_ACTION_TEXTS, SUBMIT_ACTION_TEXTS } = require('../src/cdp_controller');
const {
    findBestModelOption,
    normalizeModelText,
    normalizeEffortDisplayName,
    getEffortAliases,
    effortsMatch,
    getEffortEmoji,
    buildTierKeyboardRows,
    parseModelAndEffort,
    extractEffortOptionsFromConfigs,
} = require('../src/model_utils');

function run() {
    assert(IDE_LOCATORS_SCRIPT.includes('选择模型'), 'model selector should support Chinese aria labels');
    assert(IDE_LOCATORS_SCRIPT.includes('当前'), 'model selector should support Chinese current-model labels');
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
        findBestModelOption(options, 'Gemini 3.5 Flash (High)'),
        'Gemini 3.5 Fla h (High)Fa t'
    );
    assert.strictEqual(
        findBestModelOption(options, 'Claude Opus 4.6 (Thinking)'),
        'Claude Opu  4.6 (Thinking)'
    );
    assert.strictEqual(
        findBestModelOption(options, 'Claude Opus'),
        'Claude Opu  4.6 (Thinking)'
    );
    assert.strictEqual(
        findBestModelOption(options, 'Claude Opu'),
        'Claude Opu  4.6 (Thinking)'
    );

    // Dynamic effort tier normalization & aliases (Extra <-> XHigh + arbitrary future tiers)
    assert.strictEqual(normalizeEffortDisplayName('XHigh'), 'Extra');
    assert.strictEqual(normalizeEffortDisplayName('x-high'), 'Extra');
    assert.strictEqual(normalizeEffortDisplayName('ultra'), 'Ultra');
    assert.strictEqual(normalizeEffortDisplayName('Max'), 'Max');

    assert.ok(getEffortAliases('Extra').includes('xhigh'));
    assert.ok(getEffortAliases('XHigh').includes('extra'));
    assert.strictEqual(effortsMatch('Extra', 'xhigh', 'Extra'), true);
    assert.strictEqual(effortsMatch('Extra', 'xhigh', 'XHigh'), true);
    assert.strictEqual(effortsMatch('Quantum', 'quantum', 'quantum'), true);
    assert.strictEqual(effortsMatch('High', 'high', 'Extra'), false);

    // Dynamic effort emojis
    assert.strictEqual(getEffortEmoji('Low'), '🟢');
    assert.strictEqual(getEffortEmoji('Medium'), '🟡');
    assert.strictEqual(getEffortEmoji('High'), '🔴');
    assert.strictEqual(getEffortEmoji('Extra', 'xhigh'), '🔥');
    assert.strictEqual(getEffortEmoji('Ultra'), '🔥');
    assert.strictEqual(getEffortEmoji('Quantum'), '⚡');

    // Dynamic Telegram keyboard layout (<=4 tiers on 1 row, 5+ wraps to rows of 3, >64B uses md_seli_)
    const rows4 = buildTierKeyboardRows(0, [
        { id: 'low', label: 'Low' },
        { id: 'medium', label: 'Medium' },
        { id: 'high', label: 'High' },
        { id: 'xhigh', label: 'Extra' },
    ], 'Extra');
    assert.strictEqual(rows4.length, 1);
    assert.strictEqual(rows4[0].length, 4);
    assert.strictEqual(rows4[0][3].text, '🔥 Extra ✓');
    assert.strictEqual(rows4[0][3].callback_data, 'md_sel_0_Extra');

    const rows6 = buildTierKeyboardRows(1, ['Minimal', 'Low', 'Medium', 'High', 'Extra', 'Ultra'], 'Ultra');
    assert.strictEqual(rows6.length, 2);
    assert.strictEqual(rows6[0].length, 3);
    assert.strictEqual(rows6[1].length, 3);
    assert.strictEqual(rows6[1][2].text, '🔥 Ultra ✓');

    const longTierLabel = 'SuperExtremelyLongFutureThinkingEffortNameThatExceedsTelegram64ByteLimit';
    const rowsLong = buildTierKeyboardRows(2, ['Low', longTierLabel]);
    assert.strictEqual(rowsLong[0][1].callback_data, 'md_seli_2_1');
    assert.ok(Buffer.byteLength(rowsLong[0][1].callback_data, 'utf8') <= 64);

    // parseModelAndEffort: supports Extra, XHigh, arbitrary future tiers, and preserves direct models
    const directs = ['Orchestrator (Neon)', 'Orchestrator (Argon)', 'GPT-OSS 120B (Medium)'];
    const bases = ['Gemini 4 Neon', 'Gemini 4 Argon', 'Gemini 4 Hydrogen'];

    assert.deepStrictEqual(
        parseModelAndEffort('Gemini 4 Neon (Extra)', directs, bases),
        { baseName: 'Gemini 4 Neon', effort: 'Extra', isDirect: false }
    );
    assert.deepStrictEqual(
        parseModelAndEffort('Gemini 4 Neon (XHigh)', directs, bases),
        { baseName: 'Gemini 4 Neon', effort: 'XHigh', isDirect: false }
    );
    assert.deepStrictEqual(
        parseModelAndEffort('Gemini 4 Neon Extra', directs, bases),
        { baseName: 'Gemini 4 Neon', effort: 'Extra', isDirect: false }
    );
    assert.deepStrictEqual(
        parseModelAndEffort('Gemini 4 Neon (Quantum)', directs, bases),
        { baseName: 'Gemini 4 Neon', effort: 'Quantum', isDirect: false }
    );
    assert.deepStrictEqual(
        parseModelAndEffort('Orchestrator (Neon)', directs, bases),
        { baseName: 'Orchestrator (Neon)', effort: null, isDirect: true }
    );
    assert.deepStrictEqual(
        parseModelAndEffort('GPT-OSS 120B (Medium)', directs, bases),
        { baseName: 'GPT-OSS 120B (Medium)', effort: null, isDirect: true }
    );

    // Redux fallback extraction: sorts Low -> Medium -> High -> Extra -> Ultra, skips disabled
    const extracted = extractEffortOptionsFromConfigs('Gemini 4 Neon', [
        { label: 'Gemini 4 Neon (High)', disabled: false },
        { label: 'Gemini 4 Neon (XHigh)', disabled: false },
        { label: 'Gemini 4 Neon (Medium)', disabled: false },
        { label: 'Gemini 4 Neon (Low)', disabled: false },
        { label: 'Gemini 4 Neon (Ultra)', disabled: false },
        { label: 'Gemini 4 Neon (Deprecated)', disabled: true },
        { label: 'Gemini 4 Argon (High)', disabled: false },
    ]);
    assert.deepStrictEqual(extracted.map(o => o.label), ['Low', 'Medium', 'High', 'Extra', 'Ultra']);

    console.log('✅ Model utility tests passed!');
}

try {
    run();
} catch (err) {
    console.error(err);
    process.exit(1);
}
