const fs = require('fs');
const path = require('path');
const os = require('os');
const { t } = require('./i18n');

const TTS_SETTINGS_FILE = path.join(os.homedir(), '.gemini', (process.env.ANTIGRAVITY_PREFERRED_APP === 'ide' ? 'antigravity-ide' : 'antigravity'), 'tts_settings.json');
const defaultTtsSettings = {
    enabled: false,
    speed: '1.25x',
    maxChars: 500
};
let ttsSettings = { ...defaultTtsSettings };

function loadTtsSettings() {
    try {
        const dir = path.dirname(TTS_SETTINGS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        if (fs.existsSync(TTS_SETTINGS_FILE)) {
            ttsSettings = { ...defaultTtsSettings, ...JSON.parse(fs.readFileSync(TTS_SETTINGS_FILE, 'utf-8')) };
        }
    } catch (err) { console.error('Failed to load ttsSettings:', err.message); }
}

function saveTtsSettings() {
    try {
        const dir = path.dirname(TTS_SETTINGS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(TTS_SETTINGS_FILE, JSON.stringify(ttsSettings));
    } catch (err) { console.error('Failed to save ttsSettings:', err.message); }
}

loadTtsSettings();

const ttsOptions = [
    { speed: '1x', rate: 0, maxChars: 600, label: '1.0x (Max 600 chars / ~60s)' },
    { speed: '1.25x', rate: 2, maxChars: 500, label: '1.25x (Max 500 chars / ~45s)' },
    { speed: '1.4x', rate: 3, maxChars: 400, label: '1.4x (Max 400 chars / ~35s)' },
    { speed: '1.5x', rate: 4, maxChars: 300, label: '1.5x (Max 300 chars / ~30s)' },
    { speed: '1.75x', rate: 6, maxChars: 250, label: '1.75x (Max 250 chars / ~25s)' },
    { speed: '2x', rate: 8, maxChars: 200, label: '2.0x (Max 200 chars / ~20s)' }
];

let cachedTtsInstance = null;

// Helper: Convert text to WAV using high-quality offline TinyTTS
async function speakToWav(text, outputFile, speedSetting = '1.25x') {
    const TinyTTS = require('tiny-tts');
    if (!cachedTtsInstance) {
        cachedTtsInstance = new TinyTTS();
    }
    
    const numericSpeed = parseFloat(speedSetting) || 1.0;
    await cachedTtsInstance.speak(text, {
        output: outputFile,
        speed: numericSpeed,
        speaker: 'MALE'
    });

    // Downsample the WAV file by 50% in-place (down to 22.05 kHz)
    try {
        const buffer = fs.readFileSync(outputFile);
        if (buffer.toString('ascii', 0, 4) === 'RIFF') {
            const channels = buffer.readUInt16LE(22);
            const originalSampleRate = buffer.readUInt32LE(24);
            const bitsPerSample = buffer.readUInt16LE(34);
            
            const sampleSize = (bitsPerSample / 8) * channels;
            const headerSize = 44;
            const originalData = buffer.subarray(headerSize);
            
            const newLength = Math.floor(originalData.length / (sampleSize * 2)) * sampleSize;
            const newData = Buffer.alloc(newLength);
            
            let destOffset = 0;
            for (let srcOffset = 0; srcOffset < originalData.length; srcOffset += sampleSize * 2) {
                if (destOffset + sampleSize <= newLength) {
                    originalData.copy(newData, destOffset, srcOffset, srcOffset + sampleSize);
                    destOffset += sampleSize;
                }
            }
            
            const newHeader = Buffer.alloc(headerSize);
            buffer.copy(newHeader, 0, 0, headerSize);
            newHeader.writeUInt32LE(headerSize + newLength - 8, 4);
            
            const newSampleRate = Math.round(originalSampleRate / 2);
            newHeader.writeUInt32LE(newSampleRate, 24);
            
            const newByteRate = newSampleRate * channels * (bitsPerSample / 8);
            newHeader.writeUInt32LE(newByteRate, 28);
            newHeader.writeUInt32LE(newLength, 40);
            
            fs.writeFileSync(outputFile, Buffer.concat([newHeader, newData]));
        }
    } catch (compressErr) {
        console.error('[TTS] Audio compression failed:', compressErr.message);
    }

    return outputFile;
}

function appendTtsInstruction(query) {
    if (!ttsSettings.enabled) return query;
    return query + "\n\n" + t('tts.prompt_instruction');
}

/**
 * Extracts the summary text from response if present, and returns the cleaned text without the summary section, along with the extracted summary text.
 */
function extractAndCleanText(text) {
    if (!ttsSettings.enabled) {
        return { text, summary: null };
    }
    
    let summaryText = '';
    const summaryRegex = /\[SUMMARY\]|Summary:|SUMMARY:/i;
    const match = text.match(summaryRegex);
    if (match) {
        const index = match.index;
        summaryText = text.substring(index + match[0].length).trim();
        text = text.substring(0, index).trim();
    } else if (text.length > 200) {
        // Fallback: Use the first 2 sentences if response is long and no summary marker is present
        const sentences = text
            .replace(/<[^>]*>/g, '') // Strip HTML tags
            .split(/(?<=[.!?])\s+/)
            .filter(s => s.trim().length > 0);
        summaryText = sentences.slice(0, 2).join(' ');
    }
    
    return { text, summary: summaryText };
}

/**
 * Generates and sends the audio summary to Telegram.
 */
async function speakAndSend(ctx, summaryText, replyToMsgId) {
    if (!ttsSettings.enabled || !summaryText) return;

    let tempFile = null;
    try {
        // Clean up the text for speech synthesis
        let cleanSummary = summaryText
            .replace(/<[^>]*>/g, '')
            .replace(/[*_`#~|]/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/["']/g, '')
            .replace(/\s+/g, ' ')
            .trim();
            
        // Truncate to limit speech based on user settings
        const charLimit = ttsSettings.maxChars || 500;
        if (cleanSummary.length > charLimit) {
            cleanSummary = cleanSummary.substring(0, charLimit) + '...';
        }
        
        if (cleanSummary) {
            tempFile = path.join(os.tmpdir(), `summary_${Date.now()}.wav`);
            await speakToWav(cleanSummary, tempFile, ttsSettings.speed);
            
            // Send the wav audio to Telegram
            await ctx.replyWithAudio({ 
                source: tempFile, 
                filename: `${Date.now()}.wav` 
            }, {
                caption: `🔊 Summary (${ttsSettings.speed})`,
                reply_parameters: { message_id: replyToMsgId, allow_sending_without_reply: true }
            });
        }
    } catch (err) {
        console.error('[TTS] Failed to generate/send speech:', err.message);
    } finally {
        if (tempFile) {
            try {
                fs.unlinkSync(tempFile);
            } catch (_) {}
        }
    }
}

function buildTtsKeyboard() {
    const activeSpeed = ttsSettings.speed || '1.25x';
    const isEnabled = !!ttsSettings.enabled;
    
    const inline_keyboard = [];
    
    // Toggle button as the first row
    const toggleLabel = isEnabled ? t('tts.toggle_on') : t('tts.toggle_off');
    inline_keyboard.push([{ text: toggleLabel, callback_data: 'tts_toggle' }]);
    
    // Speed options
    ttsOptions.forEach(opt => {
        const text = (opt.speed === activeSpeed ? '✅ ' : '') + opt.label;
        inline_keyboard.push([{ text, callback_data: `tts_speed_${opt.speed}` }]);
    });
    
    return { inline_keyboard };
}

function registerTtsHandlers(bot) {
    const toggleTts = async (ctx) => {
        ttsSettings.enabled = !ttsSettings.enabled;
        saveTtsSettings();
        const statusMsg = ttsSettings.enabled ? t('tts.status_enabled') : t('tts.status_disabled');
        await ctx.reply(statusMsg);
    };

    bot.command('audio', toggleTts);

    bot.command('tts', async (ctx) => {
        await ctx.reply(t('tts.menu_title'), {
            parse_mode: 'HTML',
            reply_markup: buildTtsKeyboard()
        });
    });
    
    bot.action('tts_toggle', async (ctx) => {
        ttsSettings.enabled = !ttsSettings.enabled;
        saveTtsSettings();
        
        await ctx.editMessageReplyMarkup(buildTtsKeyboard()).catch(() => {});
        const statusMsg = ttsSettings.enabled ? t('tts.status_enabled') : t('tts.status_disabled');
        await ctx.answerCbQuery(statusMsg);
    });
    
    bot.action(/^tts_speed_(.+)$/, async (ctx) => {
        const selectedSpeed = ctx.match[1];
        const opt = ttsOptions.find(o => o.speed === selectedSpeed);
        if (opt) {
            ttsSettings.speed = opt.speed;
            ttsSettings.maxChars = opt.maxChars;
            saveTtsSettings();
            
            await ctx.editMessageReplyMarkup(buildTtsKeyboard()).catch(() => {});
            await ctx.answerCbQuery(t('tts.toast_speed_set', { speed: opt.speed, chars: opt.maxChars }));
        } else {
            await ctx.answerCbQuery(t('tts.toast_invalid'));
        }
    });
}

module.exports = {
    appendTtsInstruction,
    extractAndCleanText,
    speakAndSend,
    registerTtsHandlers,
    isTtsEnabled: () => ttsSettings.enabled
};
