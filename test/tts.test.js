const assert = require('assert');
const tts = require('../src/tts');

function runTests() {
    console.log('🧪 Running TTS tests...');

    // Disabled test
    tts._setTtsEnabled(false);
    const originalText = "This is a response.\n[SUMMARY] This is the summary.";
    const result1 = tts.extractAndCleanText(originalText);
    assert.strictEqual(result1.text, originalText);
    assert.strictEqual(result1.summary, null);

    // Enabled tests
    tts._setTtsEnabled(true);

    // Test extraction with [SUMMARY] tag
    const result2 = tts.extractAndCleanText("Here is the main content.\n\n[SUMMARY]\nThis is the audio summary text.");
    assert.strictEqual(result2.text, "Here is the main content.");
    assert.strictEqual(result2.summary, "This is the audio summary text.");

    // Test extraction with case-insensitive tags
    const result3 = tts.extractAndCleanText("Main response content.\nSummary: First point summary.");
    assert.strictEqual(result3.text, "Main response content.");
    assert.strictEqual(result3.summary, "First point summary.");

    // Test fallback (first 2 sentences) on a text longer than 200 characters
    const longText = "Sentence one. Sentence two! Sentence three. Sentence four. " + 
        "Adding extra text to make it longer than two hundred characters. " + 
        "This is necessary because the bot only generates a fallback summary for long responses to avoid spamming audio for short answers. " +
        "Here is some more filler text just to ensure we safely exceed the length limit.";
    const result4 = tts.extractAndCleanText(longText);
    assert.strictEqual(result4.summary, "Sentence one. Sentence two!");

    // Test Turkish sentence boundary fallback on long text
    const trText = "Bu birinci cümle. Bu ikinci cümle! Bu üçüncü cümle. " +
        "Bu botun sesli özet özelliğini test etmek için eklenmiş uzun bir metindir. " +
        "İki yüz karakter sınırını aşmak için bu şekilde uzun bir dolgu metni ekliyoruz ki test başarıyla tamamlansın.";
    const trResult = tts.extractAndCleanText(trText);
    assert.strictEqual(trResult.summary, "Bu birinci cümle. Bu ikinci cümle!");

    // Test Chinese sentence boundary fallback on long text (> 200 characters)
    const zhText = "这是第一句话。这是第二句话！这是第三句话。这是用来测试语音摘要功能的中文长文本。" +
        "我们必须确保整个段落的字数超过两百个字符，以便触发自动的语句切割 and 摘要生成逻辑。这样单元测试才能正确匹配两句的限制。" +
        "这是第一句话。这是第二句话！这是第三句话。这是用来测试语音摘要功能的中文长文本。我们必须确保整个段落的字数超过两百个字符，" +
        "以便触发自动的语句切割和摘要生成逻辑。这样单元测试才能正确匹配两句的限制。这里再加上一整句话以彻底超越两百个字符的限制限制，确保测试一定会正常运行。";
    const zhResult = tts.extractAndCleanText(zhText);
    assert.strictEqual(zhResult.summary, "这是第一句话。 这是第二句话！");
}

try {
    runTests();
    console.log('✅ All TTS tests passed!');
    process.exit(0);
} catch (e) {
    console.error('❌ TTS tests failed:', e.stack);
    process.exit(1);
}
