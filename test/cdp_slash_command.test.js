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
    source.includes("Slash") && source.includes("dispatchKeyEvent"),
    'CDP sender should open the slash command menu with native input events'
);

const originalPreferredApp = process.env.ANTIGRAVITY_PREFERRED_APP;
try {
    process.env.ANTIGRAVITY_PREFERRED_APP = 'agent';
    assert.deepStrictEqual(
        getSelectableSlashCommandForTarget('/goal ship the fix', {
            title: 'Standalone Chat',
            url: 'http://127.0.0.1:9333/c/example'
        }),
        {
            commands: [{ command: 'goal', rawCommand: 'goal' }],
            command: 'goal',
            rawCommand: 'goal',
            args: 'ship the fix'
        },
        'Standalone GUI should use native slash selection for /goal'
    );

    assert.deepStrictEqual(
        getSelectableSlashCommandForTarget('/autoresearch /goal quantum computing', {
            title: 'Standalone Chat',
            url: 'http://127.0.0.1:9333/c/example'
        }),
        {
            commands: [
                { command: 'autoresearch', rawCommand: 'autoresearch' },
                { command: 'goal', rawCommand: 'goal' }
            ],
            command: 'autoresearch',
            rawCommand: 'autoresearch',
            args: 'quantum computing'
        },
        'Standalone GUI should support multiple consecutive slash commands like /autoresearch /goal'
    );

    assert.deepStrictEqual(
        getSelectableSlashCommandForTarget('/autoresearch/goal quantum computing', {
            title: 'Standalone Chat',
            url: 'http://127.0.0.1:9333/c/example'
        }),
        {
            commands: [
                { command: 'autoresearch', rawCommand: 'autoresearch' },
                { command: 'goal', rawCommand: 'goal' }
            ],
            command: 'autoresearch',
            rawCommand: 'autoresearch',
            args: 'quantum computing'
        },
        'Standalone GUI should support attached slash commands without spaces like /autoresearch/goal'
    );

    assert.deepStrictEqual(
        getSelectableSlashCommandForTarget('/absolute_mode deep analysis', {
            title: 'Standalone Chat',
            url: 'http://127.0.0.1:9333/c/example'
        }),
        {
            commands: [
                { command: 'absolute-mode', rawCommand: 'absolute-mode' }
            ],
            command: 'absolute-mode',
            rawCommand: 'absolute-mode',
            args: 'deep analysis'
        },
        'Standalone GUI should normalize telegram underscores to hyphens for skills'
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
