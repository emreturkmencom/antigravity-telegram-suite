const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { getSelectableSlashCommandForTarget } = require('../src/cdp_controller');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'cdp_controller.js'), 'utf8');

assert(
    source.includes('parseSelectableSlashCommand'),
    'CDP sender should detect selectable slash commands before filling the composer'
);
assert(
    source.includes("nativeTypeComposer('/')"),
    'CDP sender should open the slash command menu with native input'
);
assert(
    source.includes('slashOptionRect') && !source.includes('slashOption.click()'),
    'CDP sender should select slash commands with native mouse events, not DOM click'
);
assert(
    source.includes('nativeTextAfterSelect'),
    'CDP sender should type command arguments after selecting the slash command'
);

const originalPreferredApp = process.env.ANTIGRAVITY_PREFERRED_APP;
try {
    process.env.ANTIGRAVITY_PREFERRED_APP = 'agent';
    assert.deepStrictEqual(
        getSelectableSlashCommandForTarget('/goal ship the fix', {
            title: 'Standalone Chat',
            url: 'http://127.0.0.1:9333/c/example'
        }),
        { command: 'goal', args: 'ship the fix' },
        'Standalone GUI should use native slash selection for /goal'
    );

    assert.strictEqual(
        getSelectableSlashCommandForTarget('/quota', {
            title: 'Standalone Chat',
            url: 'http://127.0.0.1:9333/c/example'
        }),
        null,
        'Only /goal should use native slash selection'
    );

    process.env.ANTIGRAVITY_PREFERRED_APP = 'ide';
    assert.strictEqual(
        getSelectableSlashCommandForTarget('/goal keep IDE raw', {
            title: 'Classic IDE',
            url: 'vscode-webview://antigravity'
        }),
        null,
        'Classic IDE mode should keep the original raw send path'
    );
} finally {
    if (originalPreferredApp === undefined) {
        delete process.env.ANTIGRAVITY_PREFERRED_APP;
    } else {
        process.env.ANTIGRAVITY_PREFERRED_APP = originalPreferredApp;
    }
}

console.log('✅ CDP slash command tests passed!');
