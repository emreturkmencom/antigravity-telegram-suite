const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');
const LOCALES_DIR = path.join(__dirname, '..', 'locales');

// Get all JS files in src/
function getJsFiles(dir, files = []) {
    const items = fs.readdirSync(dir);
    for (const item of items) {
        const fullPath = path.join(dir, item);
        if (fs.statSync(fullPath).isDirectory()) {
            getJsFiles(fullPath, files);
        } else if (fullPath.endsWith('.js')) {
            files.push(fullPath);
        }
    }
    return files;
}

// Extract all t('key') usages
function extractTKeys() {
    const files = getJsFiles(SRC_DIR);
    const keys = new Set();
    const regex = /\bt\(['"`]([\w.]+)['"`]/g; // Matches t('some.key')

    for (const file of files) {
        let content = fs.readFileSync(file, 'utf-8');
        // Strip comments
        content = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, '');
        
        let match;
        while ((match = regex.exec(content)) !== null) {
            keys.add(match[1]);
        }
    }
    return Array.from(keys);
}

// Read all JSON files
function getLocales() {
    const locales = {};
    const files = fs.readdirSync(LOCALES_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
        const lang = file.replace('.json', '');
        locales[lang] = JSON.parse(fs.readFileSync(path.join(LOCALES_DIR, file), 'utf-8'));
    }
    return locales;
}

// Check if a dot-notated key exists in the object
function keyExists(obj, key) {
    const parts = key.split('.');
    let current = obj;
    for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
            current = current[part];
        } else {
            return false;
        }
    }
    return typeof current === 'string' && current.trim() !== '';
}

function runValidation() {
    console.log('🔍 Validating i18n keys across all locales...');
    
    const usedKeys = extractTKeys();
    const locales = getLocales();
    const langs = Object.keys(locales);
    
    let hasErrors = false;
    const errors = [];

    for (const key of usedKeys) {
        for (const lang of langs) {
            if (!keyExists(locales[lang], key)) {
                hasErrors = true;
                errors.push(`❌ Missing key [${key}] in locale: ${lang}.json`);
            }
        }
    }

    if (hasErrors) {
        console.error('\n🚨 i18n Validation Failed! The following translations are missing:\n');
        errors.forEach(e => console.error(e));
        console.error('\n🛑 Please add the missing translations before pushing to GitHub.');
        process.exit(1);
    } else {
        console.log(`✅ All ${usedKeys.length} keys are properly translated in ${langs.length} languages (${langs.join(', ')}).`);
        process.exit(0);
    }
}

runValidation();
