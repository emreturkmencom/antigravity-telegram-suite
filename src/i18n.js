const fs = require('fs');
const path = require('path');

let currentLocale = {};
let currentLang = 'en';

/**
 * Load a locale file by language code.
 * @param {string} lang - Language code ('en', 'tr', etc.)
 */
function loadLocale(lang) {
    const localePath = path.join(__dirname, '..', 'locales', `${lang}.json`);
    if (!fs.existsSync(localePath)) {
        console.warn(`[i18n] Locale file not found: ${localePath}, falling back to 'en'`);
        lang = 'en';
    }
    const fallbackPath = path.join(__dirname, '..', 'locales', `${lang}.json`);
    currentLocale = JSON.parse(fs.readFileSync(fallbackPath, 'utf-8'));
    currentLang = lang;
    console.log(`[i18n] Loaded locale: ${lang}`);
}

/**
 * Translate a key with optional variable interpolation.
 * Supports dot notation for nested keys: t('commands.help.title')
 * Supports {variable} placeholders: t('greeting', { name: 'John' })
 * 
 * @param {string} key - Dot-notated locale key
 * @param {Object} [vars] - Variables for interpolation
 * @returns {string} Translated string or the key itself if not found
 */
function t(key, vars = {}) {
    const parts = key.split('.');
    let value = currentLocale;

    for (const part of parts) {
        if (value && typeof value === 'object' && part in value) {
            value = value[part];
        } else {
            // Key not found — return the key itself as fallback
            return key;
        }
    }

    if (typeof value !== 'string') return key;

    // Replace {variable} placeholders
    return value.replace(/\{(\w+)\}/g, (match, varName) => {
        return vars[varName] !== undefined ? vars[varName] : match;
    });
}

/**
 * Get current language code
 * @returns {string}
 */
function getLang() {
    return currentLang;
}

module.exports = { loadLocale, t, getLang };
