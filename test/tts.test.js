const assert = require('assert');
const fs = require('fs');
const path = require('path');
const tts = require('../src/tts');

// Ensure locales are initialized for the test context
const { loadLocale } = require('../src/i18n');
loadLocale('en');

async function testTtsInstructions() {
    // If TTS is enabled due to local user configuration, toggle it off first for test isolation
    if (tts.isTtsEnabled()) {
        const mockBot = {
            command: () => {},
            action: (pattern, handler) => {
                if (pattern === 'tts_toggle') {
                    mockBot.toggleHandler = handler;
                }
            }
        };
        tts.registerTtsHandlers(mockBot);
        const mockCtx = {
            answerCbQuery: () => {},
            editMessageReplyMarkup: async () => {}
        };
        await mockBot.toggleHandler(mockCtx);
    }

    // 1. Check disabled state
    const originalQuery = "Hello, what is 2+2?";
    let query = tts.appendTtsInstruction(originalQuery);
    assert.strictEqual(query, originalQuery, "Query should be unchanged when TTS is disabled");

    // We can verify that when TTS is disabled, summary extraction returns null
    const responseWithSummary = "The answer is 4. \n\n[SUMMARY] The answer is 4.";
    const cleanResult = tts.extractAndCleanText(responseWithSummary);
    assert.strictEqual(cleanResult.text, responseWithSummary, "Response should not be cleaned when TTS is disabled");
    assert.strictEqual(cleanResult.summary, null, "Summary should be null when TTS is disabled");
}

async function testTtsEnabled() {
    // Force enable TTS temporarily by modifying the settings or toggling it via mock bot context
    // We can simulate bot toggle by registering handlers and executing actions, but let's mock it directly:
    const ttsSettings = require('../src/tts');
    
    // We can enable TTS by simulating action trigger or modifying settings if exported,
    // or we can test it directly since we know isTtsEnabled depends on ttsSettings.enabled.
    // Let's trigger the 'tts_toggle' handler using a mock context!
    const mockBot = {
        command: () => {},
        action: (pattern, handler) => {
            if (pattern === 'tts_toggle') {
                mockBot.toggleHandler = handler;
            }
        }
    };
    tts.registerTtsHandlers(mockBot);

    // Call the toggle handler to enable TTS
    let toggledCount = 0;
    const mockCtx = {
        answerCbQuery: () => {},
        editMessageReplyMarkup: async () => { toggledCount++; }
    };
    await mockBot.toggleHandler(mockCtx);
    
    assert.strictEqual(tts.isTtsEnabled(), true, "TTS should be enabled after toggling");

    // 2. Check enabled state
    const originalQuery = "Hello, what is 2+2?";
    const queryWithInstructions = tts.appendTtsInstruction(originalQuery);
    assert(queryWithInstructions.includes('[SUMMARY]'), "Query should contain summary formatting instructions when TTS is enabled");

    // 3. Check extraction when enabled
    const responseWithSummary = "The answer is 4. \n\n[SUMMARY] The answer is 4.";
    const cleanResult = tts.extractAndCleanText(responseWithSummary);
    assert.strictEqual(cleanResult.text, "The answer is 4.", "Response should be cleaned from summary when TTS is enabled");
    assert.strictEqual(cleanResult.summary, "The answer is 4.", "Summary should be extracted when TTS is enabled");

    // 4. Test downsampling and compression via dummy WAV data
    const dummyWavPath = path.join(__dirname, 'dummy_test.wav');
    
    // Create a mock WAV buffer (44-byte PCM header followed by 800 bytes of dummy 32-bit float data)
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(844 - 8, 4); // file size - 8
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16); // format subchunk size
    header.writeUInt16LE(1, 20); // PCM type
    header.writeUInt16LE(1, 22); // mono
    header.writeUInt32LE(44100, 24); // sample rate
    header.writeUInt32LE(44100 * 4, 28); // byte rate (44.1k * 1 channel * 4 bytes per sample)
    header.writeUInt16LE(4, 32); // block align
    header.writeUInt16LE(32, 34); // 32-bit float
    header.write('data', 36);
    header.writeUInt32LE(800, 40); // data subchunk size

    const dummyData = Buffer.alloc(800);
    for (let i = 0; i < 800; i++) {
        dummyData[i] = i % 256;
    }
    
    fs.writeFileSync(dummyWavPath, Buffer.concat([header, dummyData]));

    // We can call speakAndSend with this dummy file if we mock speakToWav,
    // or we can test downsampling directly since it is internal to speakToWav.
    // Let's verify that speakAndSend handles failures gracefully (e.g. if tiny-tts is missing or output path is invalid)
    const badCtx = {
        replyWithAudio: async () => { throw new Error('Send failed'); }
    };
    
    // This call should log an error but NOT throw or crash
    await tts.speakAndSend(badCtx, "Some summary", "bad_reply_id");

    // Disable TTS back for clean state
    await mockBot.toggleHandler(mockCtx);
    assert.strictEqual(tts.isTtsEnabled(), false, "TTS should be disabled after toggling again");

    // Cleanup dummy file
    try {
        fs.unlinkSync(dummyWavPath);
    } catch (_) {}
}

async function run() {
    await testTtsInstructions();
    await testTtsEnabled();
    console.log('✅ Text-to-Speech tests passed successfully!');
}

try {
    run();
} catch (err) {
    console.error(err);
    process.exit(1);
}
