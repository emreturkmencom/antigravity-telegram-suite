const fs = require('fs');
const path = require('path');
const os = require('os');

const VOICE_SETTINGS_FILE = path.join(os.homedir(), '.gemini', 'antigravity', 'voice_mode.json');

const VOICE_MODES = {
    TEXT: 'text',     // Transcribe locally via Whisper ONNX -> plain text prompt
    DIRECT: 'direct', // Send raw audio file directly to Antigravity IDE (multimodal view_file)
    ASK: 'ask'        // Ask user on every voice message
};

let cachedSettings = null;

function ensureDirExists(filePath) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
        try {
            fs.mkdirSync(dir, { recursive: true });
        } catch (e) {}
    }
}

function loadVoiceSettings() {
    if (cachedSettings) return cachedSettings;
    try {
        if (fs.existsSync(VOICE_SETTINGS_FILE)) {
            const raw = fs.readFileSync(VOICE_SETTINGS_FILE, 'utf8');
            cachedSettings = JSON.parse(raw);
            return cachedSettings;
        }
    } catch (e) {
        console.warn('[voice_settings] Error reading settings file:', e.message);
    }
    cachedSettings = {};
    return cachedSettings;
}

function saveVoiceSettings(settings) {
    cachedSettings = settings;
    try {
        ensureDirExists(VOICE_SETTINGS_FILE);
        fs.writeFileSync(VOICE_SETTINGS_FILE, JSON.stringify(settings, null, 2), 'utf8');
    } catch (e) {
        console.error('[voice_settings] Error saving settings file:', e.message);
    }
}

/**
 * Gets the configured voice mode for a specific user / chat ID.
 * Returns 'text' | 'direct' | 'ask' | null (if unset).
 */
function getVoiceMode(userId) {
    // Check environment override first if provided
    if (process.env.DEFAULT_VOICE_MODE && Object.values(VOICE_MODES).includes(process.env.DEFAULT_VOICE_MODE.toLowerCase())) {
        const envMode = process.env.DEFAULT_VOICE_MODE.toLowerCase();
        // If user has specific preference, use user preference; otherwise fallback to env
        const settings = loadVoiceSettings();
        if (userId && settings[userId]) return settings[userId];
        return envMode;
    }

    const settings = loadVoiceSettings();
    if (userId && settings[userId]) {
        return settings[userId];
    }
    if (settings['default']) {
        return settings['default'];
    }
    return null; // Unset -> Prompt user
}

/**
 * Sets and persists the voice mode for a user or global default.
 */
function setVoiceMode(userId, mode) {
    if (!Object.values(VOICE_MODES).includes(mode)) {
        throw new Error(`Invalid voice mode: ${mode}. Expected one of: ${Object.values(VOICE_MODES).join(', ')}`);
    }
    const settings = loadVoiceSettings();
    const key = userId || 'default';
    settings[key] = mode;
    saveVoiceSettings(settings);
    return mode;
}

module.exports = {
    VOICE_MODES,
    getVoiceMode,
    setVoiceMode,
    loadVoiceSettings
};
