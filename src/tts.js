const fs = require('fs');
const path = require('path');
const os = require('os');
const https = require('https');
const { t, getLang } = require('./i18n');

const TTS_SETTINGS_FILE = path.join(os.homedir(), '.gemini', 'antigravity', 'tts_settings.json');

let ttsSettings = {
    enabled: false
};

function loadTtsSettings() {
    try {
        if (fs.existsSync(TTS_SETTINGS_FILE)) {
            ttsSettings = JSON.parse(fs.readFileSync(TTS_SETTINGS_FILE, 'utf8'));
        }
    } catch (err) {
        console.error('Failed to load ttsSettings:', err.message);
    }
}

function saveTtsSettings() {
    try {
        const dir = path.dirname(TTS_SETTINGS_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(TTS_SETTINGS_FILE, JSON.stringify(ttsSettings));
    } catch (err) {
        console.error('Failed to save ttsSettings:', err.message);
    }
}

loadTtsSettings();

// Map i18n languages to Google Translate TTS languages
function getTtsLanguage(lang) {
    const map = {
        'en': 'en',
        'tr': 'tr',
        'zh': 'zh-CN',
        'ko': 'ko',
        'de': 'de',
        'es': 'es',
        'fr': 'fr'
    };
    return map[lang] || 'en';
}

// Download raw MP3 buffer from Google Translate
function downloadTtsChunk(text, lang) {
    return new Promise((resolve, reject) => {
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=${encodeURIComponent(lang)}&client=tw-ob&q=${encodeURIComponent(text)}`;
        const headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/100.0.0.0 Safari/537.36'
        };
        https.get(url, { headers }, (res) => {
            if (res.statusCode !== 200) {
                reject(new Error(`Failed to download TTS: Status ${res.statusCode}`));
                return;
            }
            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => resolve(Buffer.concat(chunks)));
            res.on('error', err => reject(err));
        }).on('error', err => reject(err));
    });
}

// Split text into chunks of <= 150 characters on sentence/punctuation boundaries
function splitTextIntoChunks(text, maxLen = 150) {
    const parts = text.split(/([.,!?，。！？、；;：:\s]+)/);
    const chunks = [];
    let current = '';

    for (const part of parts) {
        if (!part) continue;
        if ((current + part).length > maxLen) {
            if (current.trim()) {
                chunks.push(current.trim());
            }
            current = part;
        } else {
            current += part;
        }
    }
    if (current.trim()) {
        chunks.push(current.trim());
    }
    return chunks;
}

function appendTtsInstruction(query) {
    if (!ttsSettings.enabled) return query;
    return query + "\n\n" + t('tts.prompt_instruction');
}

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
        // Fallback: split by multi-language sentence boundaries and take first 2 sentences
        const sentences = text
            .replace(/<[^>]*>/g, '') // Strip HTML
            .split(/(?<=[.!?。！？])\s*/)
            .filter(s => s.trim().length > 0);
        summaryText = sentences.slice(0, 2).join(' ');
    }

    return { text, summary: summaryText };
}

async function speakAndSend(ctx, summaryText, replyToMsgId) {
    if (!ttsSettings.enabled || !summaryText) return;

    let tempFile = null;
    try {
        let cleanSummary = summaryText
            .replace(/<[^>]*>/g, '')
            .replace(/[*_`#~|]/g, '')
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            .replace(/["']/g, '')
            .replace(/\s+/g, ' ')
            .trim();

        // Safe truncation to avoid synthesizing too much text
        const charLimit = 400;
        if (cleanSummary.length > charLimit) {
            cleanSummary = cleanSummary.substring(0, charLimit);
            const lastPunc = Math.max(cleanSummary.lastIndexOf('.'), cleanSummary.lastIndexOf('。'), cleanSummary.lastIndexOf('?'), cleanSummary.lastIndexOf('？'));
            if (lastPunc > 50) {
                cleanSummary = cleanSummary.substring(0, lastPunc + 1);
            } else {
                cleanSummary = cleanSummary + '...';
            }
        }

        if (cleanSummary) {
            const langCode = getTtsLanguage(getLang());
            const textChunks = splitTextIntoChunks(cleanSummary, 150);
            
            const audioBuffers = [];
            for (const chunk of textChunks) {
                const buf = await downloadTtsChunk(chunk, langCode);
                audioBuffers.push(buf);
            }
            
            if (audioBuffers.length > 0) {
                const combinedBuffer = Buffer.concat(audioBuffers);
                tempFile = path.join(os.tmpdir(), `summary_${Date.now()}.mp3`);
                fs.writeFileSync(tempFile, combinedBuffer);

                await ctx.replyWithAudio({
                    source: tempFile,
                    filename: `summary_${Date.now()}.mp3`
                }, {
                    caption: `🔊 Summary`,
                    reply_parameters: { message_id: replyToMsgId, allow_sending_without_reply: true }
                });
            }
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
    const isEnabled = !!ttsSettings.enabled;
    const inline_keyboard = [];
    
    const toggleLabel = isEnabled ? t('tts.toggle_on') : t('tts.toggle_off');
    inline_keyboard.push([{ text: toggleLabel, callback_data: 'tts_toggle' }]);
    
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
}

module.exports = {
    appendTtsInstruction,
    extractAndCleanText,
    speakAndSend,
    registerTtsHandlers,
    isTtsEnabled: () => ttsSettings.enabled,
    _setTtsEnabled: (val) => { ttsSettings.enabled = val; }
};
