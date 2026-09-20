const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const voiceSettings = require('../src/voice_settings');

function printResult(name, passed, message) {
    if (passed) {
        console.log(`  ✅ ${name}`);
    } else {
        console.error(`  ❌ ${name}: ${message || 'FAILED'}`);
    }
}

async function runTests() {
    console.log('Testing Voice Settings Manager...');
    let passed = 0;
    let failed = 0;

    const testUser1 = 'user_12345';
    const testUser2 = 'user_67890';

    // Test 1: Set and get user voice mode
    try {
        voiceSettings.setVoiceMode(testUser1, voiceSettings.VOICE_MODES.TEXT);
        assert.strictEqual(voiceSettings.getVoiceMode(testUser1), 'text');
        
        voiceSettings.setVoiceMode(testUser2, voiceSettings.VOICE_MODES.DIRECT);
        assert.strictEqual(voiceSettings.getVoiceMode(testUser2), 'direct');

        voiceSettings.setVoiceMode(testUser1, voiceSettings.VOICE_MODES.ASK);
        assert.strictEqual(voiceSettings.getVoiceMode(testUser1), 'ask');

        printResult('setVoiceMode and getVoiceMode persist user preferences accurately', true);
        passed++;
    } catch (e) {
        printResult('setVoiceMode and getVoiceMode persist user preferences accurately', false, e.message);
        failed++;
    }

    // Test 2: Invalid voice mode rejection
    try {
        assert.throws(() => {
            voiceSettings.setVoiceMode(testUser1, 'invalid_mode');
        }, /Invalid voice mode/);
        printResult('setVoiceMode rejects invalid modes with descriptive error', true);
        passed++;
    } catch (e) {
        printResult('setVoiceMode rejects invalid modes with descriptive error', false, e.message);
        failed++;
    }

    // Test 3: Fallback behavior for unknown users
    try {
        const unknownUser = 'unknown_user_' + Date.now();
        const mode = voiceSettings.getVoiceMode(unknownUser);
        assert.strictEqual(mode === null || typeof mode === 'string', true);
        printResult('getVoiceMode handles unconfigured users gracefully', true);
        passed++;
    } catch (e) {
        printResult('getVoiceMode handles unconfigured users gracefully', false, e.message);
        failed++;
    }

    console.log(`\nTests finished: ${passed} passed, ${failed} failed.\n`);
    if (failed > 0) process.exit(1);
}

runTests();
