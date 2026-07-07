require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const https = require('https');
const { exec } = require('child_process');
const { loadLocale, t, getLang } = require('./i18n');
const { config, isIDERunning, killIDE, cleanLockFile, launchIDE, trustWorkspaceViaCDP, PLATFORM } = require('./platform');
const { isAgentWorking, getFullLatestResponse, snapshotChatState, captureAgentScreenshot, captureFullIDEScreenshot, waitForAgentResponse, sendViaCDP, triggerNewChat, triggerModelMenu, getAvailableModels, selectModel, getCurrentModel, stopAgent, getQuota, listWindows, setPreferredWindow, getPreferredWindow, getPreferredTargetId, getCachedWindows, closeWindow, listAgentThreads, switchAgentThread, getActiveThreadId, getActiveThreadInfo, setActiveWorkspace, switchStandaloneWorkspace, getLastResolvedThreadId, setOnThreadResolved } = require('./cdp_controller');
const autoaccept = require('./autoaccept');
const updater = require('./updater');
const { runTurboOrchestration } = require('./turbo_orchestrator');
const TaskWatcher = require('./task_watcher');
const { extractLocalImageMarkdown } = require('./local_media');
const { ensureCdpReady, isConnectionRefusedError } = require('./cdp_health');
const accountManager = require('./account_manager');
const telegraphPublisher = require('./telegraph_publisher');
let scheduleClient = null;
try {
    scheduleClient = require('./schedule_client');
} catch (e) {
    console.log('[CronCrew] schedule_client.js not found — schedule features disabled.');
}

const TURBO_STATE_FILE = path.join(os.homedir(), '.gemini', 'antigravity', 'turbo_state.json');
const RESTART_FLAG_FILE = path.join(os.homedir(), '.gemini', 'antigravity', '.restart_pending');

function loadTurboState() {
    try {
        if (fs.existsSync(TURBO_STATE_FILE)) {
            return JSON.parse(fs.readFileSync(TURBO_STATE_FILE, 'utf-8'));
        }
    } catch (e) {}
    return { active: false, pinnedMsgId: null };
}

function saveTurboState() {
    try {
        fs.writeFileSync(TURBO_STATE_FILE, JSON.stringify({ active: isTurboMode, pinnedMsgId: turboPinnedMsgId }));
    } catch (e) {}
}

const initialTurboState = loadTurboState();
let isTurboMode = initialTurboState.active;
let turboPinnedMsgId = initialTurboState.pinnedMsgId;

let cachedAgentThreads = [];
let cachedArtifacts = [];

const MAP_FILE_PATH = path.join(os.homedir(), '.gemini', 'antigravity', 'message_target_map.json');
function loadMessageTargetMap() {
    try {
        if (fs.existsSync(MAP_FILE_PATH)) {
            return new Map(JSON.parse(fs.readFileSync(MAP_FILE_PATH, 'utf-8')));
        }
    } catch (err) { console.error('Failed to load messageTargetMap:', err.message); }
    return new Map();
}
function saveMessageTargetMap(map) {
    try {
        if (map.size > 2000) {
            const trimmed = Array.from(map.entries()).slice(-2000);
            map.clear();
            trimmed.forEach(([k, v]) => map.set(k, v));
        }
        fs.writeFileSync(MAP_FILE_PATH, JSON.stringify(Array.from(map.entries())));
    } catch (err) { console.error('Failed to save messageTargetMap:', err.message); }
}
const messageTargetMap = loadMessageTargetMap();

const LANG_STATE_FILE = path.join(os.homedir(), '.gemini', 'antigravity', 'lang.txt');

function loadSavedLang() {
    try {
        if (fs.existsSync(LANG_STATE_FILE)) {
            const saved = fs.readFileSync(LANG_STATE_FILE, 'utf-8').trim();
            if (saved) return saved;
        }
    } catch (e) {}
    return process.env.LANGUAGE || 'en';
}

function saveLangState(langCode) {
    try {
        fs.writeFileSync(LANG_STATE_FILE, langCode);
    } catch (e) {}
}

// Load configured language
const lang = loadSavedLang();
loadLocale(lang);

// ===== SECURITY: ALLOWED_CHAT_ID is mandatory =====
const ALLOWED_CHAT_IDS = process.env.ALLOWED_CHAT_ID ? process.env.ALLOWED_CHAT_ID.split(',').map(id => id.trim()).filter(id => id) : [];
if (ALLOWED_CHAT_IDS.length === 0) {
    if (process.env.SETUP_MODE === 'true') {
        console.warn('\n⚠️  SETUP MODE: Bot is running without ALLOWED_CHAT_ID.');
        console.warn('Send /start to your bot to discover your chat ID.\n');
    } else {
        console.error('\n❌ SECURITY ERROR: ALLOWED_CHAT_ID is required.\n');
        console.error('Set ALLOWED_CHAT_ID in your .env file to your Telegram chat ID. (You can use a comma-separated list of IDs)');
        console.error('Send /start to your bot to discover your chat ID.');
        console.error('Tip: Set SETUP_MODE=true in .env to run without ALLOWED_CHAT_ID during initial setup.\n');
        process.exit(1);
    }
}

const bot = new Telegraf(process.env.BOT_TOKEN, { handlerTimeout: 900000 }); // 15 minutes timeout to allow long /ask requests

const pendingLogins = new Map();
const lastSentMessageIdMap = new Map(); // conversationId -> { messageId, chatId, baseKeyboard }

function checkAuth(ctx, next) {
    const chatId = ctx.chat?.id;
    const text = ctx.message?.text || '';
    
    if (text.startsWith('/')) {
        accountManager.logInfo(`[auth] Incoming command "${text}" from chatId: ${chatId}`);
    }

    if (ALLOWED_CHAT_IDS.length === 0) {
        accountManager.logInfo(`[auth] Rejecting: ALLOWED_CHAT_IDS is empty. Detected chatId: ${chatId}`);
        console.log(`\n🔔 NEW CHAT ID DETECTED: ${ctx.chat.id}`);
        console.log(`Please add ALLOWED_CHAT_ID=${ctx.chat.id} to your .env file and restart.\n`);
        return ctx.reply(t('auth.setup_welcome', { chatId: ctx.chat.id })).catch(e => console.error('[checkAuth]', e.message));
    }
    if (!ALLOWED_CHAT_IDS.includes(ctx.chat.id.toString())) {
        accountManager.logInfo(`[auth] Rejecting unauthorized chatId: ${chatId} (Allowed: ${ALLOWED_CHAT_IDS.join(', ')})`);
        const from = ctx.from || ctx.chat;
        if (from && ALLOWED_CHAT_IDS.length > 0) {
            const username = from.username ? `@${from.username}` : 'N/A';
            const fullName = `${from.first_name || ''} ${from.last_name || ''}`.trim() || t('auth.anonymous');
            
            let actionDetails = t('auth.action', { type: ctx.updateType || t('auth.unknown') });
            if (ctx.message && ctx.message.text) actionDetails = t('auth.message', { text: ctx.message.text });
            else if (ctx.callbackQuery) actionDetails = t('auth.button', { data: ctx.callbackQuery.data });

            const alertMsg = t('auth.unauthorized_attempt', { name: fullName, username, id: from.id, details: actionDetails });
            ctx.telegram.sendMessage(ALLOWED_CHAT_IDS[0], alertMsg, { parse_mode: 'HTML' }).catch(e => console.error('[checkAuth Alert]', e.message));
        }
        // Silently ignore unauthorized access to prevent errors if the user blocked the bot
        return Promise.resolve();
    }
    
    // Suspend other bot updates/callbacks if Google login is in progress
    if (ctx.chat && pendingLogins.has(ctx.chat.id)) {
        const isLoginCallback = ctx.callbackQuery?.data?.startsWith('login_');
        const isTextMessage = ctx.message && ctx.message.text;
        
        if (!isLoginCallback && !isTextMessage) {
            // Block other non-text interactions (like photo uploads, other inline buttons) during login
            return ctx.reply(t('login.in_progress'), { parse_mode: 'HTML' });
        }
    }

    if (text.startsWith('/')) {
        accountManager.logInfo(`[auth] Authorized chatId: ${chatId} for command "${text}"`);
    }
    return next();
}

bot.use(checkAuth);

// ── Passive code detection (mobile fallback) ───────────────────────────────────
// If a user has a pending login and sends a message containing a Google auth
// code or a full redirect URL, we intercept it and complete the login.
bot.use(async (ctx, next) => {
    if (!ctx.message || !ctx.message.text) {
        return next();
    }
    const chatId = ctx.chat?.id;
    if (!chatId || !pendingLogins.has(chatId)) {
        return next();
    }

    const text = ctx.message.text.trim();
    
    // 1. Check if the user wants to cancel the login explicitly
    if (text.toLowerCase() === '/cancel') {
        const session = pendingLogins.get(chatId);
        pendingLogins.delete(chatId);
        try { await session.oauthServer.stop(); } catch { /* ignore */ }
        if (session && typeof session.reject === 'function') {
            session.reject(new Error('Login cancelled by user'));
        }
        await ctx.reply(t('login.cancelled'), { parse_mode: 'HTML' });
        return; // Consume message
    }

    // Skip check if it is explicitly the /logincode command itself without arguments (let command handler run)
    if (text.startsWith('/logincode') && text.split(' ').length === 1) {
        return next();
    }

    // 2. Extract code from text or /logincode command arguments
    let inputString = text;
    if (text.startsWith('/logincode ')) {
        inputString = text.substring(11).trim();
    }

    let code = null;
    if (inputString.includes('code=') || inputString.startsWith('4/')) {
        code = inputString;
        const match = inputString.match(/[?&]code=([^&\s]+)/);
        if (match) {
            code = match[1];
        }
    }

    const session = pendingLogins.get(chatId);

    // 3. Process the extracted code or handle invalid try count
    if (code) {
        const completed = await completePendingLogin(chatId, code);
        if (completed) {
            await ctx.reply(t('login.code_received'), { parse_mode: 'HTML' });
            return; // Consume message, do not pass to other handlers
        }
    } else {
        // Increment tries for invalid link/code
        session.tryCount = (session.tryCount || 0) + 1;
        accountManager.logInfo(`[bot] Invalid login input pasted by chatId ${chatId}. Attempt ${session.tryCount}/3.`);

        if (session.tryCount >= 3) {
            pendingLogins.delete(chatId);
            try { await session.oauthServer.stop(); } catch { /* ignore */ }
            if (session && typeof session.reject === 'function') {
                session.reject(new Error('Login cancelled: too many invalid attempts'));
            }

            await ctx.reply([
                '🚫 <b>' + t('login.cancelled').split('\n')[0].replace(/<[^>]+>/g, '').trim() + '</b>',
                '━'.repeat(22),
                t('login.failed_attempts'),
                '',
                t('login.cancelled').split('\n').pop(),
            ].join('\n'), { parse_mode: 'HTML' });
        } else {
            await ctx.reply(
                t('login.invalid_code') + t('login.invalid_code_attempt', { count: session.tryCount }),
                { parse_mode: 'HTML' }
            );
        }
        return; // Consume message, do not pass to other handlers
    }
    return next();
});

let isTurboRunning = false;

// Safe commands/buttons that can pass through during turbo execution
const TURBO_SAFE_COMMANDS = [
    '/turbo', '/stop', '/screenshot', '/latest', '/status',
    '/quota', '/help', '/version', '/panel', '/menu',
    '/file', '/cmd', '/autoaccept', '/lang', '/window',
    '/artifacts', '/restart',
    '/login', '/accounts', '/switchacc', '/getinfo', '/logincode', '/delacc'
];
const TURBO_SAFE_BUTTONS = [
    '📸', '💬', '📦', '📊', '🚀'
];

// Middleware to prevent project switching or concurrent tasks while Turbo Mode is executing
bot.use(async (ctx, next) => {
    if (isTurboRunning) {
        const text = ctx.message?.text || '';
        const cbData = ctx.callbackQuery?.data || '';
        
        if (text) {
            // Check exact match for /start to prevent bypassing with /start_ide and /start_ag
            if (text.trim() === '/start') {
                return next();
            }
            const isSafeCmd = TURBO_SAFE_COMMANDS.some(cmd => text.startsWith(cmd));
            const isSafeBtn = TURBO_SAFE_BUTTONS.some(btn => text.startsWith(btn));
            if (isSafeCmd || isSafeBtn) {
                return next();
            }
            return ctx.reply('⏳ Turbo Mode is currently running! Are you sure you want to stop it?', Markup.inlineKeyboard([
                [Markup.button.callback('🛑 Force Stop Turbo', 'turbo_force_stop')],
                [Markup.button.callback('❌ Cancel', 'turbo_cancel')]
            ]));
        } else if (cbData) {
            if (cbData.startsWith('file_') || cbData.startsWith('artifact_') || cbData.startsWith('turbo_')) {
                return next();
            }
            return ctx.answerCbQuery(t('turbo.is_running_short') || '⏳ Please wait', { show_alert: true }).catch(()=>{});
        } else if (ctx.message?.photo || ctx.message?.document) {
            // Block file/photo uploads during turbo as they trigger sendViaCDP paste
            return ctx.reply('⏳ Turbo Mode is currently running! Are you sure you want to stop it?', Markup.inlineKeyboard([
                [Markup.button.callback('🛑 Force Stop Turbo', 'turbo_force_stop')],
                [Markup.button.callback('❌ Cancel', 'turbo_cancel')]
            ]));
        }
    }
    return next();
});
function getCDPPort(app = process.env.ANTIGRAVITY_PREFERRED_APP || 'agent') {
    if (app === 'ide') {
        return parseInt(process.env.IDE_CDP_PORT || '9334', 10);
    }
    return parseInt(process.env.AGENT_CDP_PORT || process.env.DEBUGGING_PORT || '9333', 10);
}
let CDP_PORT = getCDPPort();

async function sendViaCDPWithRecovery(text, specificTargetId = null) {
    const app = config.preferredApp || 'agent';
    await ensureCdpReady({ port: CDP_PORT, app });
    try {
        return await sendViaCDP(text, CDP_PORT, specificTargetId);
    } catch (err) {
        if (!isConnectionRefusedError(err)) {
            throw err;
        }
        console.warn(`[cdp] Port ${CDP_PORT} refused connection; restarting ${app} with CDP and retrying once.`);
        await ensureCdpReady({ port: CDP_PORT, app });
        return sendViaCDP(text, CDP_PORT, null);
    }
}

function updateEnvFile(key, value) {
    const envPath = path.join(__dirname, '..', '.env');
    let content = '';
    try {
        if (fs.existsSync(envPath)) {
            content = fs.readFileSync(envPath, 'utf8');
        } else {
            const examplePath = path.join(__dirname, '..', '.env.example');
            if (fs.existsSync(examplePath)) {
                content = fs.readFileSync(examplePath, 'utf8');
            }
        }
    } catch (e) {
        console.error('Failed to read .env file:', e.message);
    }

    const lines = content.split(/\r?\n/);
    let keyUpdated = false;
    const newLines = lines.map(line => {
        if (line.trim().startsWith(`${key}=`)) {
            keyUpdated = true;
            return `${key}=${value}`;
        }
        return line;
    });

    if (!keyUpdated) {
        newLines.push(`${key}=${value}`);
    }

    try {
        fs.writeFileSync(envPath, newLines.join('\n'), 'utf8');
        process.env[key] = value;
        return true;
    } catch (e) {
        console.error('Failed to write .env file:', e.message);
        return false;
    }
}

/**
 * Auto-migrate missing env keys from .env.example to .env on startup.
 * Ensures existing users get new required keys (like GOOGLE_CLIENT_ID)
 * automatically after /update without manual .env editing.
 */
function migrateEnvFromExample() {
    const envPath = path.join(__dirname, '..', '.env');
    const examplePath = path.join(__dirname, '..', '.env.example');
    
    if (!fs.existsSync(envPath) || !fs.existsSync(examplePath)) return;
    
    try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const exampleContent = fs.readFileSync(examplePath, 'utf8');
        
        // Parse keys from both files
        const envKeys = new Set();
        envContent.split(/\r?\n/).forEach(line => {
            const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=/);
            if (match) envKeys.add(match[1]);
        });
        
        // Find keys in .env.example that are missing from .env
        const missing = [];
        let currentComment = '';
        exampleContent.split(/\r?\n/).forEach(line => {
            if (line.startsWith('#')) {
                currentComment = line;
                return;
            }
            const match = line.match(/^([A-Z_][A-Z0-9_]*)\s*=(.*)/);
            if (match && !envKeys.has(match[1])) {
                // Skip keys that should be user-specific (BOT_TOKEN, ALLOWED_CHAT_ID)
                const skipKeys = ['BOT_TOKEN', 'ALLOWED_CHAT_ID', 'SETUP_MODE'];
                if (skipKeys.includes(match[1])) return;
                
                if (currentComment && missing.length === 0) {
                    missing.push('');  // blank line separator
                }
                if (currentComment) {
                    missing.push(currentComment);
                    currentComment = '';
                }
                missing.push(line);
            } else {
                currentComment = '';
            }
        });
        
        if (missing.length > 0) {
            const additions = '\n' + missing.join('\n') + '\n';
            fs.appendFileSync(envPath, additions, 'utf8');
            
            // Also load them into process.env for current session
            missing.forEach(line => {
                const m = line.match(/^([A-Z_][A-Z0-9_]*)\s*=(.*)/);
                if (m) process.env[m[1]] = m[2];
            });
            
            console.log(`[env-migrate] Added ${missing.filter(l => l.match(/^[A-Z]/)).length} new key(s) from .env.example to .env`);
        }
    } catch (e) {
        console.error('[env-migrate] Migration failed:', e.message);
    }
}

// Run migration on startup
migrateEnvFromExample();

function markdownToTelegramHtml(text) {
    let html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    html = html.replace(/^(#{1,6})\s+(.+)$/gm, '<b>$2</b>');
    html = html.replace(/\*\*([^\*]+)\*\*/g, '<b>$1</b>');
    html = html.replace(/(?<![A-Za-z0-9])\*([^\*]+)\*(?![A-Za-z0-9])/g, '<i>$1</i>');
    html = html.replace(/(?<![A-Za-z0-9])_([^_]+)_(?![A-Za-z0-9])/g, '<i>$1</i>');
    html = html.replace(/```([a-z0-9]*)\n([\s\S]*?)```/g, (match, lang, code) => {
        if (lang) return `<pre><code class="language-${lang}">${code}</code></pre>`;
        return `<pre>${code}</pre>`;
    });
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    html = html.replace(/\[([^\]]+)\]\(file:\/\/\/[^)]+\)/gi, '<b>$1</b>');
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    html = html.replace(/\[x\]/ig, '✅');
    html = html.replace(/\[ \]/g, '⬜');
    html = html.replace(/\[\/\]/g, '🔄');
    return html;
}

function downloadLocalImageUrl(rawUrl) {
    return new Promise((resolve, reject) => {
        let parsed;
        try {
            parsed = new URL(rawUrl);
        } catch (err) {
            reject(err);
            return;
        }

        const client = parsed.protocol === 'https:' ? https : http;
        const onResponse = (res) => {
            if (res.statusCode < 200 || res.statusCode >= 300) {
                res.resume();
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }

            const chunks = [];
            res.on('data', chunk => chunks.push(chunk));
            res.on('end', () => {
                const filename = path.basename(parsed.pathname) || 'image';
                resolve({ buffer: Buffer.concat(chunks), filename });
            });
        };
        const req = parsed.protocol === 'https:'
            ? client.get(parsed, { rejectUnauthorized: false }, onResponse)
            : client.get(parsed, onResponse);

        req.setTimeout(15000, () => req.destroy(new Error('download timeout')));
        req.on('error', reject);
    });
}

async function sendExtractedImage(ctx, image, replyToMsgId = null) {
    const replyOptions = replyToMsgId
        ? { reply_parameters: { message_id: replyToMsgId, allow_sending_without_reply: true } }
        : undefined;

    if (image.type === 'url') {
        const downloaded = await downloadLocalImageUrl(image.path);
        await ctx.replyWithPhoto(
            { source: downloaded.buffer, filename: downloaded.filename },
            replyOptions
        );
        return;
    }

    if (!fs.existsSync(image.path)) {
        console.warn(`[local_media] Image not found: ${image.path}`);
        return;
    }

    await ctx.replyWithPhoto(
        { source: image.path },
        replyOptions
    );
}

// Helper: Send long messages safely within Telegram's 4096 char limit
async function sendLongMessage(ctx, text, prefix = '', buttons = null, replyToMsgId = null) {
    const MAX_LEN = 3500;
    
    // Extract file links: e.g. [task.md](file:///C:/Users/...)
    const fileLinkRegex = /\[([^\]]+)\]\((file:\/\/\/[^\)]+)\)/gi;
    let fileMatch;
    const fileButtons = [];
    
    fileLinkRegex.lastIndex = 0;
    while ((fileMatch = fileLinkRegex.exec(text)) !== null) {
        const label = fileMatch[1];
        const rawUrl = fileMatch[2];
        try {
            const rawPath = rawUrl.replace(/^file:\/\/\//i, '');
            const decodedPath = decodeURIComponent(rawPath);
            const normalizedPath = path.normalize(decodedPath);
            const pathId = getPathId(normalizedPath);
            
            const mapping = telegraphPublisher.getPageMapping(normalizedPath);
            if (mapping && mapping.url) {
                fileButtons.push([{ text: `🌐 Open ${label}`, url: mapping.url }]);
            }
        } catch (e) {
            console.error('[sendLongMessage] Failed to process file link:', e.message);
        }
    }

    const conversationId = getLastResolvedThreadId();
    const artifactButtons = getArtifactButtons(conversationId);
    
    let finalButtons = buttons;
    let inlineKeyboard = [];
    
    if (fileButtons.length > 0) {
        inlineKeyboard.push(...fileButtons);
    }
    if (artifactButtons.length > 0) {
        inlineKeyboard.push(...artifactButtons);
    }
    if (buttons) {
        if (Array.isArray(buttons)) {
            inlineKeyboard.push(...buttons);
        } else if (buttons.reply_markup && Array.isArray(buttons.reply_markup.inline_keyboard)) {
            inlineKeyboard.push(...buttons.reply_markup.inline_keyboard);
        }
    }
    
    if (inlineKeyboard.length > 0) {
        finalButtons = { reply_markup: { inline_keyboard: inlineKeyboard } };
    }

    const localMedia = extractLocalImageMarkdown(text);
    text = localMedia.text;

    for (const image of localMedia.images) {
        try {
            await sendExtractedImage(ctx, image, replyToMsgId);
        } catch (err) {
            console.warn(`[local_media] Failed to send image ${image.path}: ${err.message}`);
        }
    }
    
    // Parse text to HTML and preserve prefix formatting
    const htmlText = prefix ? `<b>${prefix}</b>\n\n${markdownToTelegramHtml(text)}` : markdownToTelegramHtml(text);
    
    async function replyWithRetry(content, isPlain = false, kbOpts = null, retries = 3, threadReplyId = null) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                const opts = {};
                if (!isPlain) opts.parse_mode = 'HTML';
                
                if (kbOpts) {
                    if (Array.isArray(kbOpts)) {
                        if (kbOpts.length > 0) opts.reply_markup = { inline_keyboard: kbOpts };
                    } else if (kbOpts.reply_markup) {
                        opts.reply_markup = kbOpts.reply_markup;
                    }
                }
                if (threadReplyId) {
                    opts.reply_parameters = { message_id: threadReplyId, allow_sending_without_reply: true };
                }
                return await ctx.reply(content, opts);
            } catch (err) {
                console.error(`sendLongMessage attempt ${attempt}/${retries} failed:`, err.message);
                if (attempt < retries && !err.message.includes("can't parse entities")) {
                    await new Promise(r => setTimeout(r, 2000 * attempt));
                } else if (err.message.includes("can't parse entities") && !isPlain) {
                    // Fallback to sending raw text if HTML parsing completely fails
                    const plain = content.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
                    return await replyWithRetry(plain.substring(0, 4000), true, kbOpts, 1, threadReplyId);
                } else {
                    throw err;
                }
            }
        }
    }

    try {
        const lines = htmlText.split('\n');
        let currentChunk = '';
        let inPre = false;
        let preLang = '';
        let currentReplyId = replyToMsgId;
        const sentMsgIds = [];

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i];
            
            // If a single line is absurdly long, force a split
            if (line.length > MAX_LEN) {
               line = line.substring(0, MAX_LEN) + '...';
            }

            const preMatch = line.match(/<pre>(?:<code class="language-([^"]+)">)?/);
            if (preMatch) {
                inPre = true;
                preLang = preMatch[1] || '';
            }
            if (line.includes('</pre>')) {
                inPre = false;
            }
            
            if (currentChunk.length + line.length > MAX_LEN) {
                if (inPre) {
                    currentChunk += preLang ? '</code></pre>' : '</pre>';
                }
                const sentMsg = await replyWithRetry(currentChunk, false, null, 3, currentReplyId);
                if (sentMsg) {
                    currentReplyId = sentMsg.message_id;
                    sentMsgIds.push(sentMsg.message_id);
                }
                currentChunk = inPre ? (preLang ? `<pre><code class="language-${preLang}">\n` : '<pre>\n') : '';
            }
            currentChunk += line + '\n';
        }
        if (currentChunk.trim().length > 0) {
            const sentMsg = await replyWithRetry(currentChunk, false, finalButtons, 3, currentReplyId);
            if (sentMsg) sentMsgIds.push(sentMsg.message_id);
        }
        if (sentMsgIds && sentMsgIds.length > 0) {
            const lastMsgId = sentMsgIds[sentMsgIds.length - 1];
            lastSentMessageIdMap.set(ctx.chat.id, {
                messageId: lastMsgId,
                chatId: ctx.chat.id,
                baseKeyboard: buttons
            });
        }
        console.log(`sendLongMessage: Sent successfully`);
        return sentMsgIds;
    } catch (err) {
        console.error('sendLongMessage final error:', err.message);
        return [];
    }
}

// Alias used by account/telegraph features (PR #21)
const sendBotMessage = sendLongMessage;

// Strip agent query echo from response text
function stripQueryFromResponse(text, query) {
    const queryTrimmed = query.trim();
    if (text.includes(queryTrimmed)) {
        text = text.substring(text.indexOf(queryTrimmed) + queryTrimmed.length).trim();
    } else if (queryTrimmed.length > 20 && text.startsWith(queryTrimmed.substring(0, 20))) {
        text = text.substring(queryTrimmed.length).trim();
    }
    return text;
}

/**
 * Set an emoji reaction on a message instead of sending a separate info message.
 * Falls back silently if reaction fails (e.g., old Telegram client or unsupported chat type).
 * 
 * Valid Telegram reaction emojis (not all Unicode emojis are allowed):
 * 👍 👎 ❤ 🔥 🎉 🤔 👀 ⚡ 👌 💯 🏆 😁 (and more, but NOT ✅ ❌)
 */
const REACTION = { THINKING: '🤔', SUCCESS: '👍', ERROR: '👎', LOOKING: '👀', FIRE: '🔥' };

async function setReaction(ctx, emoji, messageId = null) {
    try {
        const chatId = ctx.chat.id;
        const msgId = messageId || ctx.message?.message_id;
        if (!msgId) return;
        
        const reaction = emoji ? JSON.stringify([{ type: 'emoji', emoji }]) : '[]';
        await ctx.telegram.callApi('setMessageReaction', {
            chat_id: chatId,
            message_id: msgId,
            reaction
        });
    } catch (e) {
        // Silently fail — reactions may not be supported in all chat types
        console.debug(`[setReaction] Failed: ${e.message}`);
    }
}

// Typing-aware progress callback factory
function createProgressHandler(ctx) {
    return (msg) => {
        if (msg === 'typing') {
            ctx.sendChatAction('typing').catch(() => {});
        } else {
            ctx.reply(msg).catch(() => {});
        }
    };
}

// ===== COMMANDS =====

bot.start((ctx) => {
    ctx.reply(t('bot.started', { chatId: ctx.chat.id }));
});

async function cleanupAll() {
    console.log('[cleanup] Closing all Antigravity instances before exit...');
    try {
        await killIDE('agent');
    } catch (e) {
        console.error('[cleanup] Failed to kill agent:', e.message);
    }
    try {
        await killIDE('ide');
    } catch (e) {
        console.error('[cleanup] Failed to kill ide:', e.message);
    }
    console.log('[cleanup] All Antigravity instances killed.');
}

bot.command('restart', async (ctx) => {
    await ctx.reply(t('restart.closing'));
    // Write flag file so next boot knows to drop pending updates
    // (prevents the /restart command from being re-processed → infinite loop)
    try { fs.writeFileSync(RESTART_FLAG_FILE, Date.now().toString()); } catch (_) {}
    try {
        await Promise.race([
            bot.stop('SIGTERM'),
            new Promise(r => setTimeout(r, 2000))
        ]);
    } catch (_) {}
    process.exit(0);
});

bot.help((ctx) => {
    const helpMessage = `
${t('help.title')}

${t('help.messaging_title')}
${t('help.messaging_text')}

${t('help.agent_title')}
${t('help.agent_text')}

${t('help.status_title')}
${t('help.status_text')}

${t('help.ide_title')}
${t('help.ide_text')}

${t('help.chat_title')}
${t('help.chat_text')}

${t('help.account_title')}
${t('help.account_text')}
    `.trim();
    ctx.reply(helpMessage, { parse_mode: 'HTML' });
});

bot.command('start_ide', async (ctx) => {
    const app = 'ide';
    const running = await isIDERunning(app);
    if (running) {
        return ctx.reply(t('ide.already_running_short'));
    }
    cleanLockFile(app);
    let startingMsg = await ctx.reply(t('ide.starting')).catch(()=>{});
    try {
        const appPort = getCDPPort(app);
        await launchIDE(null, appPort, app);
        if (startingMsg && startingMsg.message_id) {
            ctx.deleteMessage(startingMsg.message_id).catch(()=>{});
        }
        ctx.reply(t('ide.started'));
        setTimeout(() => {
            if (autoaccept.isEnabled) autoaccept.enable(appPort).catch(()=>{});
            const defaultModel = process.env.DEFAULT_MODEL || 'Gemini 3.1 Pro (High)';
            selectModel(appPort, defaultModel).catch(()=>{});
        }, 3000);
    } catch (err) {
        if (err.message === 'IDE_NOT_INSTALLED') {
            ctx.reply(t('ide.not_installed'));
        } else {
            ctx.reply(t('ide.start_failed', { error: err.message }));
        }
    }
});

bot.command('start_ag', async (ctx) => {
    const app = 'agent';
    const running = await isIDERunning(app);
    if (running) {
        return ctx.reply(t('standalone.already_running'));
    }
    cleanLockFile(app);
    let startingMsg = await ctx.reply(t('standalone.starting')).catch(()=>{});
    try {
        const appPort = getCDPPort(app);
        await launchIDE(null, appPort, app);
        if (startingMsg && startingMsg.message_id) {
            ctx.deleteMessage(startingMsg.message_id).catch(()=>{});
        }
        ctx.reply(t('standalone.started'));
        setTimeout(() => {
            if (autoaccept.isEnabled) autoaccept.enable(appPort).catch(()=>{});
            const defaultModel = process.env.DEFAULT_MODEL || 'Gemini 3.1 Pro (High)';
            selectModel(appPort, defaultModel).catch(()=>{});
        }, 3000);
    } catch (err) {
        if (err.message === 'IDE_NOT_INSTALLED') {
            ctx.reply(t('standalone.not_installed'));
        } else {
            ctx.reply(t('ide.init_error', { error: err.message }));
        }
    }
});

bot.command('close_ide', async (ctx) => {
    const app = 'ide';
    const running = await isIDERunning(app);
    if (!running) {
        cleanLockFile(app);
        return ctx.reply(t('ide.already_closed'));
    }
    let closingMsg = await ctx.reply(t('ide.closing')).catch(()=>{});
    await killIDE(app);
    if (closingMsg && closingMsg.message_id) {
        ctx.deleteMessage(closingMsg.message_id).catch(()=>{});
    }
    ctx.reply(t('ide.closed'));
});

bot.command('close_ag', async (ctx) => {
    const app = 'agent';
    const running = await isIDERunning(app);
    if (!running) {
        cleanLockFile(app);
        return ctx.reply(t('standalone.already_closed'));
    }
    let closingMsg = await ctx.reply(t('standalone.closing')).catch(()=>{});
    await killIDE(app);
    if (closingMsg && closingMsg.message_id) {
        ctx.deleteMessage(closingMsg.message_id).catch(()=>{});
    }
    ctx.reply(t('standalone.closed'));
});

bot.command('close', async (ctx) => {
    ctx.reply(t('close.select_prompt'));
});

bot.command('close_window', async (ctx) => {
    let closingMsg = await ctx.reply(t('ide.closing_window') || '🪟 Closing window...').catch(()=>{});
    const success = await closeWindow(CDP_PORT);
    const resultMsg = success ? (t('ide.window_closed') || '✅ Window closed successfully.') : (t('ide.window_close_failed') || '❌ Failed to close window. Is there an open window?');
    if (closingMsg && closingMsg.message_id) {
        ctx.deleteMessage(closingMsg.message_id).catch(()=>{});
    }
    ctx.reply(resultMsg);
});

const handleStatus = async (ctx) => {
    let msg = t('status.report_title');
    
    const agentCheck = await isIDERunning('agent');
    const ideCheck = await isIDERunning('ide');
    
    const agentCheckStr = agentCheck ? t('status.running_status') : t('status.stopped_status');
    const ideCheckStr = ideCheck ? t('status.running_status') : t('status.stopped_status');
    msg += t('status.standalone_running', { status: agentCheckStr });
    msg += t('status.ide_running', { status: ideCheckStr });
    
    const activeApp = process.env.ANTIGRAVITY_PREFERRED_APP || 'agent';
    msg += t('status.preferred_app_status', { app: activeApp === 'agent' ? 'Standalone' : 'Classic IDE' });
    
    try {
        await getActiveThreadId(CDP_PORT);
        msg += t('status.cdp_active');
    } catch {
        msg += t('status.cdp_inactive');
    }
    
    msg += t('status.telegram_bot');
    
    try {
        const activeInfo = await getActiveThreadInfo(CDP_PORT);
        if (activeInfo) {
            msg += t('status.active_chat');
            msg += t('status.project_area', { workspace: activeInfo.workspace });
            msg += t('status.agent_title', { name: activeInfo.name });
            const currentModel = await getCurrentModel(CDP_PORT);
            if (currentModel) msg += t('status.selected_model', { model: currentModel });
            const isWorking = await isAgentWorking(CDP_PORT);
            const statusStr = isWorking ? t('status.agent_working') : t('status.agent_idle');
            msg += t('status.agent_status', { status: statusStr });
        }
    } catch (e) {
        // silently fail if we can't get chat info
    }

    msg += '\n🛡️ <b>Auto-Accept:</b> ' + (autoaccept.isEnabled ? t('status.autoaccept_on') : t('status.autoaccept_off')) + '\n';

    ctx.reply(msg, { parse_mode: 'HTML' });
};
bot.command('status', handleStatus);

/**
 * Appends thread info and agent status footer to response text.
 */
async function getChatHeader(targetId = null, fallback = '') {
    try {
        const activeInfo = await getActiveThreadInfo(CDP_PORT, targetId);
        if (activeInfo) {
            const wsName = activeInfo.workspace || 'Workspace';
            let thName = activeInfo.name || 'Agent';
            if (thName.length > 35) {
                const words = thName.split(' ');
                if (words.length > 5) {
                    thName = words.slice(0, 5).join(' ') + '...';
                } else {
                    thName = thName.substring(0, 35) + '...';
                }
            }
            return `📁 ${wsName}\n🤖 ${thName}\n${t('agent.swipe_to_reply')}`;
        }
    } catch (_) {}
    return fallback;
}

async function buildMainMenu(overrideThread = null, overrideWorkspace = null, targetId = null) {
    const preferredApp = process.env.ANTIGRAVITY_PREFERRED_APP || 'agent';
    const isIDE = preferredApp === 'ide';
    let wsName = overrideWorkspace || 'Projects';
    let threadName = overrideThread || null;
    if (!overrideThread && !overrideWorkspace) {
    try {
        const info = await getActiveThreadInfo(CDP_PORT, targetId);
        if (info && info.name) threadName = info.name;
        if (info && info.workspace) {
            wsName = info.workspace.split('/').pop() || info.workspace;
        } else if (typeof currentWorkspaceDir !== 'undefined' && currentWorkspaceDir && currentWorkspaceDir !== config.projectsDir) {
            wsName = require('path').basename(currentWorkspaceDir);
        }
    } catch(e) {
        if (typeof currentWorkspaceDir !== 'undefined' && currentWorkspaceDir && currentWorkspaceDir !== config.projectsDir) {
            wsName = require('path').basename(currentWorkspaceDir);
        }
    }
    } // end if (!overrideThread && !overrideWorkspace)
    let modelName = t('menu.model_not_selected');
    try {
        const m = await getCurrentModel(CDP_PORT);
        if (m) {
            // Kısalt: parantez içindekileri sil (örn. "Claude Opus 4.6 (Thinking)" -> "Claude Opus 4.6")
            modelName = m.replace(/\s*\([^)]*\)/g, '').trim();
        }
    } catch(e) {}

    // IDE aktifken: workspace adı göster (ör. "antigravity-bot")
    // Standalone aktifken: agent/thread adı göster (ör. "Validating Rules...")
    let displayTitle = 'Agent';
    if (isIDE) {
        // IDE mode: workspace name is primary
        if (wsName && wsName !== 'Projects') {
            displayTitle = wsName;
        } else if (threadName && threadName !== 'Launchpad') {
            displayTitle = threadName;
        }
    } else {
        // Standalone mode: thread/agent name is primary
        if (threadName && threadName !== 'Launchpad') {
            displayTitle = threadName;
        } else if (wsName && wsName !== 'Projects') {
            displayTitle = wsName;
        }
    }
    // Başlığı max 20 karaktere kısalt
    if (displayTitle.length > 20) displayTitle = displayTitle.substring(0, 18) + '...';

    return Markup.keyboard([
        [`🤖 ${displayTitle}`, `🧠 ${modelName}`],
        [
            t('menu.btn_screenshot'), 
            t('menu.btn_artifacts'), 
            isTurboMode ? t('turbo.btn_on') : t('turbo.btn_off'), 
            t('menu.btn_latest')
        ]
    ]).resize();
}

async function sendMainMenu(ctx, text = '🕹️ Kontrol Paneli:', overrideThread = null, overrideWorkspace = null, targetId = null, editMessageId = null) {
    const kb = await buildMainMenu(overrideThread, overrideWorkspace, targetId);
    
    if (editMessageId) {
        // We do NOT pass kb here because kb contains a ReplyKeyboardMarkup, which Telegram API 
        // rejects for editMessageText (it expects InlineKeyboardMarkup or none).
        return ctx.telegram.editMessageText(ctx.chat.id, editMessageId, undefined, text, { parse_mode: 'HTML' }).catch(e => {
            console.error('[sendMainMenu] editMessageText failed:', e.message);
            if (!e.message.includes('message is not modified')) {
                return ctx.reply(text, kb);
            }
        });
    }

    if (ctx.callbackQuery && ctx.callbackQuery.message) {
        return ctx.editMessageText(text, kb).catch(e => {
            if (!e.message.includes('message is not modified')) {
                return ctx.reply(text, kb);
            }
        });
    }
    return ctx.reply(text, kb);
}

async function pushMainMenuToUser(text, silent = false) {
    if (ALLOWED_CHAT_IDS.length === 0 || process.env.SETUP_MODE === 'true') return;
    const kb = await buildMainMenu();
    return Promise.all(ALLOWED_CHAT_IDS.map(id => bot.telegram.sendMessage(id, text, { ...kb, disable_notification: silent }).catch(() => {})));
}

bot.command('start', async (ctx) => {
    await sendMainMenu(ctx, t('menu.welcome'));
});

const handleLatest = async (ctx) => {
    try {
        // Use the preferred target (set by workspace switch or /window command)
        // instead of blindly picking candidates[0] which may be the wrong window
        const targetId = getPreferredTargetId() || null;
        let _latestRes = await getFullLatestResponse(CDP_PORT, targetId);
        let text = typeof _latestRes === 'string' ? _latestRes : _latestRes.text;
        let buttons = typeof _latestRes === 'string' ? null : _latestRes.buttons;
        
        const header = await getChatHeader(targetId, t('latest.title'));
        await sendBotMessage(ctx, text, header, buttons);
    } catch (err) {
        ctx.reply(t('latest.error', { error: err.message }));
    }
};

bot.command('latest', handleLatest);
bot.hears(/^💬/i, handleLatest);

const handleScreenshot = async (ctx) => {
    try {
        setReaction(ctx, REACTION.THINKING);
        const buffer = await captureFullIDEScreenshot(CDP_PORT);
        await ctx.replyWithPhoto({ source: buffer });
        setReaction(ctx, null);
    } catch (err) {
        setReaction(ctx, null);
        ctx.reply(t('screenshot.error', { error: err.message }));
    }
};
bot.command('screenshot', handleScreenshot);
bot.hears(/^📸/i, handleScreenshot);

bot.command('quota', async (ctx) => {
    try {
        setReaction(ctx, REACTION.THINKING);
        const quotaInfo = await getQuota(CDP_PORT, t);
        if (quotaInfo) {
            ctx.reply(quotaInfo);
        } else {
            ctx.reply(t('quota.not_found'));
        }
    } catch (err) {
        ctx.reply(t('quota.error', { error: err.message }));
    }
});

bot.command('ask', (ctx) => {
    const parts = ctx.message.text.split(' ');
    parts.shift();
    const query = parts.join(' ').trim();
    
    if (!query) return ctx.reply(t('ask.empty'));
    
    (async () => {
        try {
            const targetId = await sendViaCDP(query, CDP_PORT);
            setReaction(ctx, REACTION.THINKING);

            // Wait briefly for message to render in DOM before anchoring state
            await new Promise(r => setTimeout(r, 1500));
            await snapshotChatState(CDP_PORT, targetId).catch(() => {});
            
            if (global.__taskWatcher) global.__taskWatcher.setBusy(true);
            try {
                const isDone = await waitForAgentResponse(CDP_PORT, 450000, createProgressHandler(ctx));
                if (isDone) {
                    let _latestRes = await getFullLatestResponse(CDP_PORT);
                    let text = typeof _latestRes === 'string' ? _latestRes : _latestRes.text;
                    let buttons = typeof _latestRes === 'string' ? null : _latestRes.buttons;
                    
                    text = stripQueryFromResponse(text, query);
                    if (!text) text = t('ask.done_empty');
                    setReaction(ctx, null);
                    const header = await getChatHeader(null, t('ask.done'));
                    await sendBotMessage(ctx, text, header, buttons);
                } else {
                    await ctx.reply(t('ask.timeout'));
                }
            } finally {
                if (global.__taskWatcher) global.__taskWatcher.setBusy(false);
            }
        } catch (err) {
            setReaction(ctx, null);
            ctx.reply(t('ask.send_error', { error: err.message })).catch(() => {});
        }
    })();
});


bot.command('cmd', async (ctx) => {
    const cmdStr = ctx.message.text.split(' ').slice(1).join(' ');
    if (!cmdStr) {
        return ctx.reply(t('cmd.empty'));
    }
    
    ctx.reply(t('cmd.running', { cmdStr }), { parse_mode: 'MarkdownV2' });
    
    exec(cmdStr, { timeout: 60000, maxBuffer: 1024 * 1024 * 5 }, async (error, stdout, stderr) => {
        let output = "";
        if (stdout) output += `[STDOUT]\n${stdout}\n`;
        if (stderr) output += `[STDERR]\n${stderr}\n`;
        if (error) output += `[ERROR]\n${error.message}\n`;
        
        if (!output) output = t('cmd.no_output');
        
        await sendBotMessage(ctx, output, t('cmd.output_title'));
    });
});

bot.command('stop', async (ctx) => {
    try {
        setReaction(ctx, REACTION.THINKING);
        const stopped = await stopAgent(CDP_PORT);
        if (stopped) {
            ctx.reply(t('stop.stopped'));
        } else {
            ctx.reply(t('stop.already_stopped'));
        }
    } catch(e) {
        ctx.reply(t('stop.error', { error: e.message }));
    }
});

// ===== IDE NATIVE COMMANDS =====

bot.command('goal', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    parts.shift();
    const goalText = parts.join(' ').trim();
    
    if (!goalText) return ctx.reply(t('native_cmd.goal_empty'));
    
    setReaction(ctx, REACTION.THINKING);
    try {
        await sendViaCDP('/goal ' + goalText, CDP_PORT);
        setReaction(ctx, null);
        await ctx.reply(t('native_cmd.goal_started'));
    } catch (err) {
        setReaction(ctx, null);
        ctx.reply(t('native_cmd.error', { error: err.message }));
    }
});

bot.command('plan', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    parts.shift();
    const planText = parts.join(' ').trim();
    
    if (!planText) return ctx.reply(t('native_cmd.plan_empty'));
    
    setReaction(ctx, REACTION.THINKING);
    try {
        await sendViaCDP('/plan ' + planText, CDP_PORT);
        setReaction(ctx, null);
        await ctx.reply(t('native_cmd.plan_started'));
    } catch (err) {
        setReaction(ctx, null);
        ctx.reply(t('native_cmd.error', { error: err.message }));
    }
});

bot.command('schedule_task', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    parts.shift();
    const scheduleText = parts.join(' ').trim();
    
    if (!scheduleText) return ctx.reply(t('native_cmd.schedule_empty'));
    
    setReaction(ctx, REACTION.THINKING);
    try {
        // Send as /schedule to IDE — the IDE recognizes this native command
        await sendViaCDP('/schedule ' + scheduleText, CDP_PORT);
        setReaction(ctx, null);
        await ctx.reply(t('native_cmd.schedule_started'));
    } catch (err) {
        setReaction(ctx, null);
        ctx.reply(t('native_cmd.error', { error: err.message }));
    }
});

// ===== CRONCREW SCHEDULE MANAGEMENT =====

bot.command('schedule_setup', async (ctx) => {
    if (!scheduleClient) return ctx.reply(t('schedule.not_configured'), { parse_mode: 'HTML' });
    const parts = ctx.message.text.split(' ');
    parts.shift();
    if (parts.length < 2) return ctx.reply(t('schedule.setup_usage'), { parse_mode: 'HTML' });
    
    const serverUrl = parts[0];
    const licenseKey = parts.slice(1).join(' ').trim();
    
    setReaction(ctx, REACTION.THINKING);
    try {
        const result = await scheduleClient.setup(serverUrl, licenseKey);
        setReaction(ctx, REACTION.SUCCESS);
        ctx.reply(t('schedule.setup_success', { tier: result.tier, url: serverUrl }), { parse_mode: 'HTML' });
    } catch (err) {
        setReaction(ctx, null);
        ctx.reply(t('schedule.setup_error', { error: err.message }), { parse_mode: 'HTML' });
    }
});

bot.command('schedule_status', async (ctx) => {
    if (!scheduleClient || !scheduleClient.isConfigured()) return ctx.reply(t('schedule.not_configured'), { parse_mode: 'HTML' });
    
    setReaction(ctx, REACTION.THINKING);
    try {
        const [status, usage] = await Promise.all([
            scheduleClient.getStatus(),
            scheduleClient.getUsage()
        ]);
        
        let msg = t('schedule.status_title');
        msg += t('schedule.status_tier', { tier: status.tier });
        msg += t('schedule.status_license', { status: status.status });
        msg += t('schedule.status_usage', { today: usage.executionsToday });
        msg += t('schedule.status_schedules', { count: usage.activeSchedules });
        msg += t('schedule.status_changes', { used: status.changesUsed, max: status.changesMax });
        if (status.expiresAt) msg += t('schedule.status_expires', { date: status.expiresAt });
        
        setReaction(ctx, null);
        ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (err) {
        setReaction(ctx, null);
        ctx.reply(t('schedule.error', { error: err.message }), { parse_mode: 'HTML' });
    }
});

bot.command('schedule_list', async (ctx) => {
    if (!scheduleClient || !scheduleClient.isConfigured()) return ctx.reply(t('schedule.not_configured'), { parse_mode: 'HTML' });
    
    setReaction(ctx, REACTION.THINKING);
    try {
        const schedules = await scheduleClient.listSchedules();
        setReaction(ctx, null);
        
        if (!schedules || schedules.length === 0) {
            return ctx.reply(t('schedule.list_empty'), { parse_mode: 'HTML' });
        }
        
        let msg = t('schedule.list_title');
        const buttons = [];
        
        for (const s of schedules) {
            const icon = s.status === 'active' ? '🟢' : '⏸️';
            const lastResult = s.last_result || '—';
            msg += t('schedule.list_item', {
                icon, name: s.name, cron: s.cron_expression,
                workspace: s.workspace, runCount: s.run_count, lastResult
            });
            
            const row = [];
            if (s.status === 'active') {
                row.push(Markup.button.callback(t('schedule.btn_run'), `sch_run_${s.id}`));
                row.push(Markup.button.callback(t('schedule.btn_pause'), `sch_pause_${s.id}`));
            } else {
                row.push(Markup.button.callback(t('schedule.btn_resume'), `sch_resume_${s.id}`));
            }
            row.push(Markup.button.callback(t('schedule.btn_delete'), `sch_del_${s.id}`));
            buttons.push(row);
        }
        
        ctx.reply(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) });
    } catch (err) {
        setReaction(ctx, null);
        ctx.reply(t('schedule.error', { error: err.message }), { parse_mode: 'HTML' });
    }
});

bot.command('schedule_add', async (ctx) => {
    if (!scheduleClient || !scheduleClient.isConfigured()) return ctx.reply(t('schedule.not_configured'), { parse_mode: 'HTML' });
    
    const parts = ctx.message.text.split(' ');
    parts.shift();
    const raw = parts.join(' ').trim();
    
    if (!raw || !raw.includes('|')) return ctx.reply(t('schedule.add_usage'), { parse_mode: 'HTML' });
    
    const segments = raw.split('|').map(s => s.trim());
    if (segments.length < 4) return ctx.reply(t('schedule.add_usage'), { parse_mode: 'HTML' });
    
    const [name, cronExpr, workspace, ...promptParts] = segments;
    const prompt = promptParts.join('|').trim();
    
    setReaction(ctx, REACTION.THINKING);
    try {
        const schedule = await scheduleClient.createSchedule({
            name, cron_expression: cronExpr, workspace, prompt
        });
        setReaction(ctx, REACTION.SUCCESS);
        ctx.reply(t('schedule.add_success', {
            name: schedule.name, cron: schedule.cron_expression,
            workspace: schedule.workspace, model: schedule.model
        }), { parse_mode: 'HTML' });
    } catch (err) {
        setReaction(ctx, null);
        ctx.reply(t('schedule.add_error', { error: err.message }), { parse_mode: 'HTML' });
    }
});

bot.command('schedule_del', async (ctx) => {
    if (!scheduleClient || !scheduleClient.isConfigured()) return ctx.reply(t('schedule.not_configured'), { parse_mode: 'HTML' });
    
    const parts = ctx.message.text.split(' ');
    parts.shift();
    const scheduleId = parts.join(' ').trim();
    
    if (!scheduleId) return ctx.reply(t('schedule.delete_usage'), { parse_mode: 'HTML' });
    
    setReaction(ctx, REACTION.THINKING);
    try {
        await scheduleClient.deleteSchedule(scheduleId);
        setReaction(ctx, REACTION.SUCCESS);
        ctx.reply(t('schedule.delete_success'), { parse_mode: 'HTML' });
    } catch (err) {
        setReaction(ctx, null);
        ctx.reply(t('schedule.delete_error', { error: err.message }), { parse_mode: 'HTML' });
    }
});

// Schedule inline button actions
bot.action(/^sch_run_(.+)$/, async (ctx) => {
    if (!scheduleClient) return ctx.answerCbQuery('Schedule not available', { show_alert: true });
    const scheduleId = ctx.match[1];
    ctx.answerCbQuery('Running...');
    try {
        const result = await scheduleClient.executeSchedule(scheduleId);
        
        // Actually send the prompt to the IDE agent
        const targetId = getPreferredTargetId() || null;
        await sendViaCDP(result.prompt, CDP_PORT, targetId);
        
        ctx.reply(t('schedule.run_success', {
            workspace: result.workspace, model: result.model
        }), { parse_mode: 'HTML' });
    } catch (err) {
        ctx.reply(t('schedule.run_error', { error: err.message }), { parse_mode: 'HTML' });
    }
});

bot.action(/^sch_pause_(.+)$/, async (ctx) => {
    if (!scheduleClient) return ctx.answerCbQuery('Schedule not available', { show_alert: true });
    const scheduleId = ctx.match[1];
    ctx.answerCbQuery('Pausing...');
    try {
        const result = await scheduleClient.pauseSchedule(scheduleId);
        ctx.reply(t('schedule.pause_success', { name: result.name || scheduleId }), { parse_mode: 'HTML' });
    } catch (err) {
        ctx.reply(t('schedule.error', { error: err.message }), { parse_mode: 'HTML' });
    }
});

bot.action(/^sch_resume_(.+)$/, async (ctx) => {
    if (!scheduleClient) return ctx.answerCbQuery('Schedule not available', { show_alert: true });
    const scheduleId = ctx.match[1];
    ctx.answerCbQuery('Resuming...');
    try {
        const result = await scheduleClient.resumeSchedule(scheduleId);
        ctx.reply(t('schedule.resume_success', { name: result.name || scheduleId }), { parse_mode: 'HTML' });
    } catch (err) {
        ctx.reply(t('schedule.error', { error: err.message }), { parse_mode: 'HTML' });
    }
});

bot.action(/^sch_del_(.+)$/, async (ctx) => {
    if (!scheduleClient) return ctx.answerCbQuery('Schedule not available', { show_alert: true });
    const scheduleId = ctx.match[1];
    ctx.answerCbQuery('Deleting...');
    try {
        await scheduleClient.deleteSchedule(scheduleId);
        ctx.reply(t('schedule.delete_success'), { parse_mode: 'HTML' });
    } catch (err) {
        ctx.reply(t('schedule.error', { error: err.message }), { parse_mode: 'HTML' });
    }
});

bot.command('new', async (ctx) => {
    console.log('[/new] Command triggered');
    try {
        const success = await triggerNewChat(CDP_PORT);
        console.log('[/new] triggerNewChat result:', success);
        if (success) {
            ctx.reply(t('new_chat.opened'));
            setTimeout(() => {
                const defaultModel = process.env.DEFAULT_MODEL || 'Gemini 3.1 Pro (High)';
                selectModel(CDP_PORT, defaultModel).catch(()=>{});
            }, 1500);
        } else {
            ctx.reply(t('new_chat.not_found'));
        }
    } catch(e) {
        console.log('[/new] Error:', e.message);
        ctx.reply(t('new_chat.error', { error: e.message }));
    }
});

bot.command('agents', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    const num = parseInt(parts[1], 10);
    
    if (!isNaN(num)) {
        if (num > 0 && num <= cachedAgentThreads.length) {
            const thread = cachedAgentThreads[num - 1];
            const success = await switchAgentThread(CDP_PORT, thread.name);
            if (!success) {
                ctx.reply(t('agents.not_found') || '❌ Thread could not be selected.');
            } else {
                setPreferredWindow(null);
                if (thread.workspace) setActiveWorkspace(thread.workspace);
                // Update lastResolvedThreadId so /latest reads from this thread
                await snapshotChatState(CDP_PORT, success).catch(() => {});
                await sendMainMenu(ctx, t('agents.switched_plain', { name: thread.name }), thread.name, thread.workspace);
            }
        } else {
            ctx.reply(t('agents.invalid_number') || '❌ Invalid thread number.');
        }
        return;
    }
    
    try {
        const workspaces = await listAgentThreads(CDP_PORT);
        if (workspaces.length === 0) {
            return ctx.reply(t('agents.no_recent') || 'ℹ️ No recent active threads found.');
        }
        
        cachedAgentThreads = [];
        let msg = t('agents.list_title') || '📂 <b>Recent Chat Threads:</b>\\n\\n';
        let index = 1;
        
        for (const ws of workspaces) {
            const recentThreads = ws.threads.filter(th => {
                // Skip the "Show N more..." load-more button
                if (/^show\s+\d+\s+more/i.test(th.name)) return false;
                return true;
            });
            
            if (recentThreads.length > 0) {
                msg += `<b>📁 ${ws.workspace}</b>\n`;
                for (const th of recentThreads) {
                    cachedAgentThreads.push({ ...th, workspace: ws.workspace });
                    msg += `  /agents_${index} - ${th.name} <i>(${th.time})</i>\n`;
                    index++;
                }
                msg += '\n';
            }
        }
        
        if (cachedAgentThreads.length === 0) {
            return ctx.reply(t('agents.no_recent') || 'ℹ️ No recent active threads found.');
        }
        
        ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (e) {
        ctx.reply((t('agents.error') || '❌ Error: ') + e.message);
    }
});

bot.hears(/^\/agents_(\d+)$/, async (ctx) => {
    const num = parseInt(ctx.match[1], 10);
    if (num > 0 && num <= cachedAgentThreads.length) {
        const thread = cachedAgentThreads[num - 1];
        const targetId = await switchAgentThread(CDP_PORT, thread.name, thread.workspace);
        if (!targetId) {
            ctx.reply(t('agents.not_found') || '❌ Thread could not be selected.');
        } else {
            // Reset window preference and let it auto-detect the workspace
            setPreferredWindow(null);
            if (thread.workspace) {
                setActiveWorkspace(thread.workspace);
            }
            // Update lastResolvedThreadId so /latest reads from this thread
            await snapshotChatState(CDP_PORT, targetId, thread.name).catch(() => {});
            // Menüyü yenile — buton yeni ajan ismini göstersin
            await sendMainMenu(ctx, t('agents.switched_plain', { name: thread.name }), thread.name, thread.workspace);
        }
    } else {
        ctx.reply(t('agents.invalid_number') || '❌ Invalid thread number.');
    }
});

const lastUploadedMtimes = new Map();
let activeArtifactWatcher = null;
const artifactDebounceTimers = new Map();

function getArtifactButtons(conversationId) {
    if (!conversationId) return [];

    const appDataName = (process.env.ANTIGRAVITY_PREFERRED_APP || 'agent') === 'ide' ? 'antigravity-ide' : 'antigravity';
    const brainPath = path.join(os.homedir(), '.gemini', appDataName, 'brain');
    const conversationDir = path.join(brainPath, conversationId);

    if (!fs.existsSync(conversationDir)) return [];

    const files = [
        { name: 'task.md', label: '📋 Task' },
        { name: 'implementation_plan.md', label: '🗒️ Plan' },
        { name: 'walkthrough.md', label: '📖 Walkthrough' }
    ];

    const row = [];
    for (const f of files) {
        let filePath = path.join(conversationDir, f.name);
        if (!fs.existsSync(filePath)) {
            filePath = path.join(conversationDir, 'artifacts', f.name);
        }
        if (fs.existsSync(filePath)) {
            const mapping = telegraphPublisher.getPageMapping(filePath);
            if (mapping && mapping.url) {
                row.push({ text: f.label, url: mapping.url });
            }
        }
    }
    return row.length > 0 ? [row] : [];
}

function watchArtifacts(conversationId, retry = 0) {
    if (activeArtifactWatcher) {
        try { activeArtifactWatcher.close(); } catch (_) {}
        activeArtifactWatcher = null;
    }
    for (const timer of artifactDebounceTimers.values()) {
        clearTimeout(timer);
    }
    artifactDebounceTimers.clear();

    if (!conversationId) return;

    const appDataName = (process.env.ANTIGRAVITY_PREFERRED_APP || 'agent') === 'ide' ? 'antigravity-ide' : 'antigravity';
    const brainPath = path.join(os.homedir(), '.gemini', appDataName, 'brain');
    const conversationDir = path.join(brainPath, conversationId);

    if (!fs.existsSync(conversationDir)) {
        if (retry < 5) {
            setTimeout(() => watchArtifacts(conversationId, retry + 1), 2000);
        }
        return;
    }

    const filesToWatch = ['task.md', 'implementation_plan.md', 'walkthrough.md'];

    try {
        activeArtifactWatcher = fs.watch(conversationDir, { recursive: true }, (eventType, filename) => {
            if (!filename) return;
            const normalizedFilename = filename.split(/[/\\]/).pop();
            if (filesToWatch.includes(normalizedFilename)) {
                let filePath = path.join(conversationDir, filename);

                if (artifactDebounceTimers.has(filePath)) {
                    clearTimeout(artifactDebounceTimers.get(filePath));
                }

                const timer = setTimeout(async () => {
                    artifactDebounceTimers.delete(filePath);

                    // Resolve the real path — on Windows, fs.watch may report only the basename
                    // while the file actually lives in the artifacts/ subdirectory (or vice-versa)
                    let resolvedFilePath = filePath;
                    if (!fs.existsSync(resolvedFilePath)) {
                        const fallbackRoot = path.join(conversationDir, normalizedFilename);
                        const fallbackArtifacts = path.join(conversationDir, 'artifacts', normalizedFilename);
                        if (fs.existsSync(fallbackRoot)) {
                            resolvedFilePath = fallbackRoot;
                        } else if (fs.existsSync(fallbackArtifacts)) {
                            resolvedFilePath = fallbackArtifacts;
                        } else {
                            return;
                        }
                    }

                    try {
                        const stats = fs.statSync(resolvedFilePath);
                        const lastMtime = lastUploadedMtimes.get(resolvedFilePath) || 0;
                        if (stats.mtimeMs > lastMtime) {
                            console.log(`[Telegraph Watcher] Detected update for ${normalizedFilename}, uploading...`);
                            const titleMap = {
                                'task.md': 'Task Checklist',
                                'implementation_plan.md': 'Implementation Plan',
                                'walkthrough.md': 'Walkthrough'
                            };
                            const title = titleMap[normalizedFilename] || normalizedFilename;
                            const url = await telegraphPublisher.publishOrUpdateArtifact(resolvedFilePath, title);
                            lastUploadedMtimes.set(resolvedFilePath, stats.mtimeMs);

                            console.log(`[Telegraph Watcher] Published ${normalizedFilename} to ${url}`);
                            const lookupChatId = ALLOWED_CHAT_IDS.length > 0 ? Number(ALLOWED_CHAT_IDS[0]) : 'default';
                            const lastMsg = lastSentMessageIdMap.get(lookupChatId);
                            if (lastMsg) {
                                const artifactButtons = getArtifactButtons(conversationId);
                                let inlineKeyboard = [...artifactButtons];
                                if (lastMsg.baseKeyboard) {
                                    if (Array.isArray(lastMsg.baseKeyboard)) {
                                        inlineKeyboard.push(...lastMsg.baseKeyboard);
                                    } else if (lastMsg.baseKeyboard.reply_markup && Array.isArray(lastMsg.baseKeyboard.reply_markup.inline_keyboard)) {
                                        inlineKeyboard.push(...lastMsg.baseKeyboard.reply_markup.inline_keyboard);
                                    }
                                }
                                const res = await bot.telegram.editMessageReplyMarkup(lastMsg.chatId, lastMsg.messageId, null, {
                                    inline_keyboard: inlineKeyboard
                                }).catch(err => {
                                    console.log('[Telegraph Watcher] Failed to edit inline keyboard of last message:', err.message);
                                });
                                if (res && typeof res === 'object') {
                                    lastSentMessageIdMap.set(lookupChatId, { ...lastMsg, baseKeyboard: { ...lastMsg.baseKeyboard, reply_markup: { inline_keyboard: inlineKeyboard } } });
                                }
                            } else {
                                const msg = `📝 <b>${title} Updated!</b>\n\nRead on Telegraph:\n${url}`;
                                for (const chatId of ALLOWED_CHAT_IDS) {
                                    bot.telegram.sendMessage(chatId, msg, { 
                                        parse_mode: 'HTML',
                                        reply_markup: { inline_keyboard: [[{ text: '🌐 Open Artifact', url: url }]] }
                                    }).catch(err => {
                                        console.error(`[Telegraph Watcher] Failed to send message to ${chatId}:`, err.message);
                                    });
                                }
                            }
                        }
                    } catch (err) {
                        console.error(`[Telegraph Watcher] Error processing artifact ${normalizedFilename}:`, err.message);
                    }
                }, 3000);

                artifactDebounceTimers.set(filePath, timer);
            }
        });
        console.log(`[Telegraph Watcher] Watching artifacts for conversation: ${conversationId.substring(0, 8)}`);
    } catch (e) {
        console.error('[Telegraph Watcher] Failed to start watcher:', e.message);
    }
}



async function handleGetArtifactCommand(ctx, fileName, title) {
    try {
        const conversationId = getLastResolvedThreadId();
        if (!conversationId) {
            return ctx.reply(`⚠️ No active thread found. Please select a thread in the IDE first.`);
        }

        const appDataName = (process.env.ANTIGRAVITY_PREFERRED_APP || 'agent') === 'ide' ? 'antigravity-ide' : 'antigravity';
        const brainPath = path.join(os.homedir(), '.gemini', appDataName, 'brain');
        const conversationDir = path.join(brainPath, conversationId);

        let filePath = path.join(conversationDir, fileName);
        if (!fs.existsSync(filePath)) {
            filePath = path.join(conversationDir, 'artifacts', fileName);
        }

        if (!fs.existsSync(filePath)) {
            return ctx.reply(`⚠️ <b>${title}</b> is not available for this chat yet.`, { parse_mode: 'HTML' });
        }

        const pathId = getPathId(filePath);
        const buttons = [];
        const row = [];
        
        const mapping = telegraphPublisher.getPageMapping(filePath);
        if (mapping && mapping.url) {
            row.push({ text: `🌐 Open ${title}`, url: mapping.url });
        }
        row.push({ text: `📄 Get File`, callback_data: `ff_${pathId}` });
        buttons.push(row);

        ctx.reply(`📝 <b>${title}</b> for current chat:`, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: buttons }
        });
    } catch (e) {
        ctx.reply(`❌ Error getting ${title}: ` + e.message);
    }
}

bot.command('gettask', ctx => handleGetArtifactCommand(ctx, 'task.md', 'Task Checklist'));
bot.command('getplan', ctx => handleGetArtifactCommand(ctx, 'implementation_plan.md', 'Implementation Plan'));
bot.command('getwalk', ctx => handleGetArtifactCommand(ctx, 'walkthrough.md', 'Walkthrough'));

const handleArtifacts = async (ctx) => {
    try {
        const appDataName = (process.env.ANTIGRAVITY_PREFERRED_APP || 'agent') === 'ide' ? 'antigravity-ide' : 'antigravity';
        const brainPath = path.join(os.homedir(), '.gemini', appDataName, 'brain');
        
        // Helper to check if a file should be listed as an artifact
        const ARTIFACT_EXTENSIONS = ['.md', '.png', '.jpg', '.jpeg', '.webp', '.mp4', '.mov', '.gif', '.pdf', '.txt', '.json', '.csv', '.html'];
        const isArtifactFile = (name) => {
            if (name.includes('.metadata.json') || name.includes('.resolved') || name.startsWith('.sys') || name.startsWith('.')) return false;
            return ARTIFACT_EXTENSIONS.some(ext => name.endsWith(ext));
        };
        const getMtime = (filePath) => {
            try { return fs.statSync(filePath).mtimeMs; } catch (_) { return 0; }
        };

        // Try to get the active thread info for workspace filtering
        let threadInfo = null;
        try { threadInfo = await getActiveThreadInfo(CDP_PORT, getPreferredTargetId()); } catch (_) {}
        const workspaceName = threadInfo?.workspace?.split(' - ')?.[0]?.trim()?.toLowerCase() || null;
        
        // Strategy: Try known thread ID first, then scan all conversations
        let conversationId = getLastResolvedThreadId();
        let conversationDir = conversationId ? path.join(brainPath, conversationId) : null;
        
        // Quick check: does this conversation actually have RECENT artifacts?
        // We also verify the conversation is recent (active within last 2 hours)
        // to avoid showing stale artifacts from old conversations.
        let hasArtifacts = false;
        if (conversationDir && fs.existsSync(conversationDir)) {
            const items = fs.readdirSync(conversationDir, { withFileTypes: true });
            const hasFiles = items.some(i => !i.isDirectory() && isArtifactFile(i.name)) || 
                           fs.existsSync(path.join(conversationDir, 'artifacts'));
            
            if (hasFiles) {
                // Check if this conversation is still recent — avoid showing artifacts
                // from a weeks-old conversation just because lastResolvedThreadId points to it
                const tp = path.join(conversationDir, '.system_generated', 'logs', 'transcript.jsonl');
                let isRecent = false;
                try {
                    if (fs.existsSync(tp)) {
                        const mtime = fs.statSync(tp).mtimeMs;
                        isRecent = (Date.now() - mtime) < 2 * 60 * 60 * 1000; // 2 hours
                    }
                } catch (_) {}
                
                if (isRecent) {
                    hasArtifacts = true;
                } else {
                    console.log(`[handleArtifacts] lastResolvedThreadId ${conversationId?.substring(0, 8)} has artifacts but is stale — scanning brain...`);
                }
            }
        }
        
        // If no artifacts found via lastResolvedThreadId, scan ALL conversations
        // filtered by workspace name, sorted by most recently modified
        if (!hasArtifacts && fs.existsSync(brainPath)) {
            console.log(`[handleArtifacts] lastResolvedThreadId ${conversationId?.substring(0, 8) || 'null'} has no artifacts — scanning brain...`);
            const normalize = (s) => (s || '').toLowerCase().replace(/[-_]/g, ' ');
            const dirs = fs.readdirSync(brainPath, { withFileTypes: true })
                .filter(d => d.isDirectory())
                .map(d => {
                    const dir = path.join(brainPath, d.name);
                    const tp = path.join(dir, '.system_generated', 'logs', 'transcript.jsonl');
                    let mtime = 0;
                    try { if (fs.existsSync(tp)) mtime = fs.statSync(tp).mtimeMs; } catch (_) {}
                    return { name: d.name, dir, mtime };
                })
                .filter(d => d.mtime > 0)
                .sort((a, b) => b.mtime - a.mtime);
            
            for (const dir of dirs) {
                // Check if this conversation has artifacts
                const items = fs.readdirSync(dir.dir, { withFileTypes: true });
                const dirHasArtifacts = items.some(i => !i.isDirectory() && isArtifactFile(i.name)) ||
                                        fs.existsSync(path.join(dir.dir, 'artifacts'));
                if (!dirHasArtifacts) continue;
                
                // If we have a workspace filter, check that the transcript mentions this workspace
                if (workspaceName) {
                    const tp = path.join(dir.dir, '.system_generated', 'logs', 'transcript.jsonl');
                    try {
                        const head = fs.readFileSync(tp, 'utf8').substring(0, 5000);
                        if (!normalize(head).includes(normalize(workspaceName))) continue;
                    } catch (_) { continue; }
                }
                
                conversationId = dir.name;
                conversationDir = dir.dir;
                console.log(`[handleArtifacts] Found artifacts in conversation ${dir.name.substring(0, 8)} (workspace: ${workspaceName || 'any'})`);
                break;
            }
        }
        
        if (!conversationDir || !fs.existsSync(conversationDir)) {
            return ctx.reply(t('artifacts.no_active_thread') || '⚠️ No active thread found. Please select a thread in the IDE first.');
        }

        cachedArtifacts = [];

        // 1. Scan artifacts/ subdirectory
        const artifactsSubDir = path.join(conversationDir, 'artifacts');
        if (fs.existsSync(artifactsSubDir)) {
            const items = fs.readdirSync(artifactsSubDir, { withFileTypes: true });
            for (const item of items) {
                if (item.isDirectory()) continue;
                if (isArtifactFile(item.name)) {
                    const filePath = path.join(artifactsSubDir, item.name);
                    cachedArtifacts.push({ name: item.name, path: filePath, mtime: getMtime(filePath) });
                }
            }
        }

        // 2. Scan conversation root
        const rootItems = fs.readdirSync(conversationDir, { withFileTypes: true });
        for (const item of rootItems) {
            if (item.isDirectory()) continue;
            if (isArtifactFile(item.name)) {
                const filePath = path.join(conversationDir, item.name);
                cachedArtifacts.push({ name: item.name, path: filePath, mtime: getMtime(filePath) });
            }
        }

        // 3. Scan scratch/ subdirectory for temporary files
        const scratchDir = path.join(conversationDir, 'scratch');
        if (fs.existsSync(scratchDir)) {
            const scratchItems = fs.readdirSync(scratchDir, { withFileTypes: true });
            for (const item of scratchItems) {
                if (item.isDirectory()) continue;
                const filePath = path.join(scratchDir, item.name);
                cachedArtifacts.push({ name: `scratch/${item.name}`, path: filePath, mtime: getMtime(filePath) });
            }
        }

        // 4. Scan browser/ subdirectory for browser recordings
        const browserDir = path.join(conversationDir, 'browser');
        if (fs.existsSync(browserDir)) {
            const browserItems = fs.readdirSync(browserDir, { withFileTypes: true });
            for (const item of browserItems) {
                if (item.isDirectory()) continue;
                if (isArtifactFile(item.name)) {
                    const filePath = path.join(browserDir, item.name);
                    cachedArtifacts.push({ name: `🌐 ${item.name}`, path: filePath, mtime: getMtime(filePath) });
                }
            }
        }

        if (cachedArtifacts.length === 0) {
            return ctx.reply(t('artifacts.no_artifacts') || 'ℹ️ No artifacts found for the current thread.');
        }

        // Sort by modification time, newest first
        cachedArtifacts.sort((a, b) => b.mtime - a.mtime);

        let msg = t('artifacts.list_title') || '📎 <b>Artifacts for Current Thread:</b>\n\n';
        const msgs = [];
        for (let i = 0; i < cachedArtifacts.length; i++) {
            const filename = cachedArtifacts[i].name;
            let displayName = filename;
            if (filename.startsWith('media__')) {
                const match = filename.match(/media__(\d+)\.\w+/);
                if (match) {
                    const date = new Date(parseInt(match[1], 10));
                    const today = new Date();
                    const yesterday = new Date(today);
                    yesterday.setDate(yesterday.getDate() - 1);
                    
                    let dateStr = '';
                    if (date.toDateString() === today.toDateString()) dateStr = 'Today';
                    else if (date.toDateString() === yesterday.toDateString()) dateStr = 'Yesterday';
                    else dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                    
                    const timeStr = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
                    displayName = `Media (${dateStr} ${timeStr})`;
                }
            } else {
                displayName = filename.replace(/\.[^/.]+$/, "").replace(/_/g, ' ').split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            }
            const line = `/artifact_${i + 1} - ${displayName}\n`;
            if (msg.length + line.length > 4000) {
                msgs.push(msg);
                msg = line;
            } else {
                msg += line;
            }
        }
        if (msg) {
            msgs.push(msg);
        }
        
        for (const m of msgs) {
            await ctx.reply(m, { parse_mode: 'HTML' });
        }
    } catch (e) {
        ctx.reply((t('artifacts.error') || '❌ Error reading artifact: ') + e.message);
    }
};

bot.command('artifacts', handleArtifacts);
bot.hears(/^📦/i, handleArtifacts);

bot.hears(/^\/artifact_(\d+)$/, async (ctx) => {
    const num = parseInt(ctx.match[1], 10);
    if (num > 0 && num <= cachedArtifacts.length) {
        const artifact = cachedArtifacts[num - 1];
        ctx.reply((t('artifacts.sending', { name: artifact.name }) || `📤 Sending artifact: <b>${artifact.name}</b>...`), { parse_mode: 'HTML' });
        
        const ext = path.extname(artifact.name).toLowerCase();
        try {
            if (ext === '.png' || ext === '.jpg' || ext === '.jpeg' || ext === '.webp') {
                await ctx.replyWithPhoto({ source: artifact.path });
            } else if (ext === '.mp4' || ext === '.mov') {
                await ctx.replyWithVideo({ source: artifact.path });
            } else if (ext === '.md') {
                const content = fs.readFileSync(artifact.path, 'utf8');
                await sendBotMessage(ctx, content);
            } else {
                await ctx.replyWithDocument({ source: artifact.path });
            }
        } catch (e) {
            ctx.reply((t('artifacts.error') || '❌ Error: ') + e.message);
        }
    } else {
        ctx.reply(t('artifacts.invalid_number') || '❌ Invalid artifact number.');
    }
});

const handleModel = async (ctx) => {
    let modelName = '';
    if (ctx.message && ctx.message.text) {
        const parts = ctx.message.text.split(' ');
        if (parts[0].startsWith('/')) parts.shift();
        modelName = parts.join(' ').trim();
        // Clear if it's from the button text
        if (modelName.startsWith('🧠') || modelName.startsWith('🤖') || modelName.toLowerCase().startsWith('model:')) modelName = '';
    }
    
    if (modelName) {
        try {
            setReaction(ctx, REACTION.THINKING);
            const success = await selectModel(CDP_PORT, modelName);
            if (success) ctx.reply(t('model.changed', { model: modelName }));
            else ctx.reply(t('model.not_found'));
        } catch(e) {
            ctx.reply(t('stop.error', { error: e.message }));
        }
        return;
    }
    let models = [];
    try {
        models = await getAvailableModels(CDP_PORT);
    } catch (e) {
        console.error('Failed to get dynamic models:', e.message);
    }

    if (!models || models.length === 0) {
        models = [
            'Gemini 3.5 Flash (Medium)',
            'Gemini 3.5 Flash (High)',
            'Gemini 3.5 Flash (Low)',
            'Gemini 3.1 Pro (High)',
            'Gemini 3.1 Pro (Low)',
            'Claude Sonnet 4.6 (Thinking)',
            'Claude Opus 4.6 (Thinking)',
            'GPT-OSS 120B (Medium)'
        ];
    }
    
    const buttons = models.map(m => {
        const cbData = 'md_' + Buffer.from(m).toString('base64').slice(0, 58);
        return [{ text: `🤖 ${m}`, callback_data: cbData }];
    });
    
    ctx.reply(t('model.select_prompt'), {
        reply_markup: { inline_keyboard: buttons }
    });
};
bot.command('model', handleModel);

bot.action(/md_(.+)/, async (ctx) => {
    try {
        const modelName = Buffer.from(ctx.match[1], 'base64').toString('utf-8');
        ctx.answerCbQuery(modelName);
        const changingText = t('model.changing', { model: modelName });
        if (ctx.callbackQuery && ctx.callbackQuery.message) {
            await ctx.editMessageText(changingText).catch(()=>{});
        } else {
            await ctx.reply(changingText);
        }
        const success = await selectModel(CDP_PORT, modelName);
        if (success) await sendMainMenu(ctx, t('model.changed', { model: modelName }));
        else ctx.reply(t('model.select_failed'));
    } catch(e) {
        ctx.answerCbQuery(t('model.error'));
    }
});

// ===== AUTO-ACCEPT =====

const handleAutoAccept = async (ctx) => {
    const text = ctx.message.text || '';
    const parts = text.split(' ');
    parts.shift();
    const subCommand = parts.join(' ').trim().toLowerCase();

    try {
        if (subCommand === 'on' || (subCommand === '' && !autoaccept.isEnabled)) {
            // Enable auto-accept
            ctx.reply(t('autoaccept.enabling'));
            const result = await autoaccept.enable(CDP_PORT);
            let responseText = '';
            if (result.injected > 0) {
                responseText = t('autoaccept.enabled', { injected: result.injected });
            } else {
                responseText = t('autoaccept.enabled_none');
            }
            // If toggled via button click, refresh menu
            if (subCommand === '') await sendMainMenu(ctx, responseText);
            else ctx.reply(responseText);
        } else if (subCommand === 'off' || (subCommand === '' && autoaccept.isEnabled)) {
            // Disable auto-accept
            ctx.reply(t('autoaccept.disabling'));
            const result = await autoaccept.disable(CDP_PORT);
            const responseText = t('autoaccept.disabled', { clicks: result.totalClicks });
            // If toggled via button click, refresh menu
            if (subCommand === '') await sendMainMenu(ctx, responseText);
            else ctx.reply(responseText);
        } else if (subCommand === 'status') {
            // Show status
            const status = await autoaccept.getStatus(CDP_PORT);
            let msg = t('autoaccept.status_title');
            msg += (status.enabled ? t('autoaccept.status_enabled') : t('autoaccept.status_disabled')) + '\n';

            // Observer status
            if (status.active) {
                msg += t('autoaccept.status_active', { targets: status.injectedTargets }) + '\n';
            } else {
                msg += t('autoaccept.status_inactive') + '\n';
            }

            // Click stats
            msg += t('autoaccept.status_clicks', { total: status.totalClicks, session: status.sessionClicks }) + '\n';

            // Last click info
            if (status.lastClickText && status.lastClickTimeSec !== null) {
                msg += t('autoaccept.status_last_click', { text: status.lastClickText, sec: status.lastClickTimeSec }) + '\n';
            }

            // Blocked commands
            msg += t('autoaccept.status_blocked', { count: status.blockedCommandsCount }) + '\n';

            // Agent panel warning
            if (!status.hasAgentPanel) {
                msg += '\n' + t('autoaccept.status_no_panel');
            }

            ctx.reply(msg, { parse_mode: 'HTML' });
        } else {
            // Unknown subcommand — show inline buttons
            const buttons = [
                [{ text: '⚡ ' + (autoaccept.isEnabled ? t('menu.btn_off') : t('menu.btn_on')), callback_data: autoaccept.isEnabled ? 'aa_off' : 'aa_on' }],
                [{ text: t('menu.btn_status'), callback_data: 'aa_status' }]
            ];
            ctx.reply(t('autoaccept.status_title') + (autoaccept.isEnabled ? t('autoaccept.status_enabled') : t('autoaccept.status_disabled')), {
                parse_mode: 'HTML',
                reply_markup: { inline_keyboard: buttons }
            });
        }
    } catch (e) {
        ctx.reply(t('autoaccept.error', { error: e.message }));
    }
};

bot.command('autoaccept', handleAutoAccept);
bot.hears(/^(⚡|🔴)/i, handleAutoAccept);

bot.action('aa_on', async (ctx) => {
    try {
        ctx.answerCbQuery('Enabling...');
        const result = await autoaccept.enable(CDP_PORT);
        if (result.injected > 0) {
        }
        
        // Refresh the keyboard menu to update the button icon
        await sendMainMenu(ctx, t('autoaccept.enabled', { injected: result.injected }));
    } catch (e) {
        ctx.reply(t('autoaccept.error', { error: e.message }));
    }
});

bot.action('aa_off', async (ctx) => {
    try {
        ctx.answerCbQuery('Disabling...');
        const result = await autoaccept.disable(CDP_PORT);
        
        // Refresh the keyboard menu to update the button icon
        await sendMainMenu(ctx, t('autoaccept.disabled', { clicks: result.totalClicks }));
    } catch (e) {
        ctx.reply(t('autoaccept.error', { error: e.message }));
    }
});

bot.action('aa_status', async (ctx) => {
    try {
        ctx.answerCbQuery('Loading...');
        const status = await autoaccept.getStatus(CDP_PORT);
        let msg = t('autoaccept.status_title');
        msg += (status.enabled ? t('autoaccept.status_enabled') : t('autoaccept.status_disabled')) + '\n';
        if (status.active) msg += t('autoaccept.status_active', { targets: status.injectedTargets }) + '\n';
        else msg += t('autoaccept.status_inactive') + '\n';
        msg += t('autoaccept.status_clicks', { total: status.totalClicks, session: status.sessionClicks }) + '\n';
        if (status.lastClickText && status.lastClickTimeSec !== null) {
            msg += t('autoaccept.status_last_click', { text: status.lastClickText, sec: status.lastClickTimeSec }) + '\n';
        }
        
        if (ctx.callbackQuery && ctx.callbackQuery.message) {
            const kb = ctx.callbackQuery.message.reply_markup;
            ctx.editMessageText(msg, { parse_mode: 'HTML', reply_markup: kb }).catch(e => {
                if (!e.message.includes('message is not modified')) ctx.reply(msg, { parse_mode: 'HTML' });
            });
        } else {
            ctx.reply(msg, { parse_mode: 'HTML' });
        }
    } catch (e) {
        ctx.reply(t('autoaccept.error', { error: e.message }));
    }
});

// ===== WORKSPACE =====

async function doLaunchWorkspace(ctx, workspace) {
    let switchingMsg;
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
        try {
            await ctx.editMessageText(t('workspace.switching', { workspace })).catch(()=>{});
            switchingMsg = ctx.callbackQuery.message;
        } catch(e) {}
    } else {
        try {
            switchingMsg = await ctx.reply(t('workspace.switching', { workspace }));
        } catch(e) {}
    }

    try {
        const activeApp = process.env.ANTIGRAVITY_PREFERRED_APP || 'agent';
        const wsName = path.basename(workspace);
        
        // Standalone Agent 2.0 Hızlı Geçiş:
        // Eğer 'agent' aktifse ve çalışıyorsa, sol menüdeki proje kartına tıklayarak 1 saniyede geçiş yapar!
        if (activeApp === 'agent') {
            const running = await isIDERunning('agent');
            if (running) {
                try {
                    const success = await switchStandaloneWorkspace(CDP_PORT, wsName);
                    if (success) {
                        setActiveWorkspace(wsName);
                        setPreferredWindow(null);
                        if (autoaccept.isEnabled) {
                            autoaccept.enable(CDP_PORT).catch(() => {});
                        }
                        await triggerNewChat(CDP_PORT);
                        const successMsg = t('workspace.started', { workspace }) || '📁 Workspace switched successfully!';
                        if (switchingMsg && switchingMsg.message_id) {
                            ctx.deleteMessage(switchingMsg.message_id).catch(()=>{});
                        }
                        await sendMainMenu(ctx, successMsg);
                        return;
                    }
                } catch (e) {
                    console.debug('[doLaunchWorkspace] Standalone quick switch failed:', e.message);
                }
            } else {
                try {
                    await launchIDE(null, CDP_PORT, 'agent');
                    await new Promise(r => setTimeout(r, 4000));
                    const success = await switchStandaloneWorkspace(CDP_PORT, wsName);
                    if (success) {
                        setActiveWorkspace(wsName);
                        setPreferredWindow(null);
                        if (autoaccept.isEnabled) {
                            autoaccept.enable(CDP_PORT).catch(() => {});
                        }
                        await triggerNewChat(CDP_PORT);
                        const successMsg = t('workspace.started', { workspace }) || '📁 Workspace switched successfully!';
                        if (switchingMsg && switchingMsg.message_id) {
                            ctx.deleteMessage(switchingMsg.message_id).catch(()=>{});
                        }
                        await sendMainMenu(ctx, successMsg);
                        return;
                    }
                } catch (e) {
                    console.debug('[doLaunchWorkspace] Standalone launch and switch failed:', e.message);
                }
            }
            await sendMainMenu(ctx, t('workspace.not_found_standalone', { wsName }));
            return;
        }
        
        // Multi-window support: DO NOT kill existing IDE instances!
        // We just launch the new workspace.
        
        try {
            await launchIDE(workspace, CDP_PORT);
            if (workspace) {
                setActiveWorkspace(path.basename(workspace));
            }
            // Poll CDP until the new IDE is responsive (max 30 seconds)
            let cdpReady = false;
            for (let i = 0; i < 15; i++) {
                await new Promise(r => setTimeout(r, 2000));
                try {
                    const http = require('http');
                    const targets = await new Promise((resolve, reject) => {
                        http.get(`http://127.0.0.1:${CDP_PORT}/json`, (res) => {
                            let data = '';
                            res.on('data', chunk => data += chunk);
                            res.on('end', () => {
                                try { resolve(JSON.parse(data)); } catch(e) { reject(e); }
                            });
                        }).on('error', reject);
                    });
                    if (targets && targets.length > 0) {
                        const targetWsName = workspace ? path.basename(workspace).toLowerCase() : null;
                        const foundNew = targetWsName ? targets.some(t => t.title && t.title.toLowerCase().includes(targetWsName)) : true;
                        if (foundNew) {
                            cdpReady = true;
                            break;
                        }
                    }
                } catch (_) {
                    // CDP not ready yet, keep waiting
                }
            }
            if (cdpReady) {
                const successMsg = t('workspace.started', { workspace });
                if (switchingMsg && switchingMsg.message_id) {
                    ctx.deleteMessage(switchingMsg.message_id).catch(()=>{});
                }
                await sendMainMenu(ctx, successMsg);
                // trustWorkspaceViaCDP removed — CDP intervention during startup
                // interrupts Electron's init/sync and prevents state.vscdb from saving
                
                // Clear preferred window when workspace changes
                setPreferredWindow(null);
                
                // Re-inject autoaccept into the new window immediately
                if (autoaccept.isEnabled) {
                    autoaccept.enable(CDP_PORT).catch(() => {});
                }
            } else {
                ctx.reply(t('workspace.started', { workspace }) + t('workspace.cdp_warning'));
            }
        } catch (err) {
            console.error('doLaunchWorkspace error:', err);
            ctx.reply(t('workspace.start_failed', { error: err.message }));
        }
    } catch (e) {
        console.error('doLaunchWorkspace async wrap error:', e);
    }
}

const handleWorkspace = (ctx) => {
    let workspace = '';
    if (ctx.message && ctx.message.text) {
        let text = ctx.message.text.trim();
        if (text.startsWith('🤖')) {
            text = text.substring(2).trim();
        }
        const parts = text.split(' ');
        if (parts[0].startsWith('/')) parts.shift();
        workspace = parts.join(' ').trim();
        if (workspace.toLowerCase().startsWith('workspace:')) {
            workspace = workspace.substring(10).trim();
        }
    }
    
    let isValid = false;
    let wsPath = '';
    if (workspace) {
        wsPath = workspace.startsWith('/') || workspace.includes(':') ? workspace : path.join(config.projectsDir, workspace);
        try {
            isValid = fs.statSync(wsPath).isDirectory();
        } catch (e) {
            isValid = false;
        }
    }
    
    if (!workspace || !isValid) {
        const projectsDir = config.projectsDir;
        fs.readdir(projectsDir, { withFileTypes: true }, (err, files) => {
            if (err) return ctx.reply(t('workspace.read_error'));
            const dirs = files.filter(f => f.isDirectory() && !f.name.startsWith('.')).map(f => f.name);
            const buttons = dirs.map(d => [{ text: `📂 ${d}`, callback_data: `ws_${d}` }]);
            
            ctx.reply(t('workspace.select_prompt'), {
                reply_markup: { inline_keyboard: buttons }
            });
        });
        return;
    }
    
    currentWorkspaceDir = wsPath;
    doLaunchWorkspace(ctx, wsPath);
};
bot.command('workspace', handleWorkspace);

bot.action(/ws_(.+)/, (ctx) => {
    const project = ctx.match[1];
    const wsPath = path.join(config.projectsDir, project);
    currentWorkspaceDir = wsPath;
    ctx.answerCbQuery(t('workspace.selected', { project }));
    doLaunchWorkspace(ctx, wsPath);
});

// ===== LANGUAGE SWITCH =====

bot.command('lang', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    parts.shift();
    const newLang = parts.join(' ').trim().toLowerCase();
    
    const availableLangs = fs.readdirSync(path.join(__dirname, '..', 'locales'))
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));

    if (newLang && availableLangs.includes(newLang)) {
        loadLocale(newLang);
        saveLangState(newLang);
        await clearAllMenuScopes();
        await setMenuOnAllScopes();
        await sendMainMenu(ctx, t('lang.changed', { lang: newLang }));
        return;
    }
    
    const langMap = {
        'en': '🇬🇧 English',
        'zh': '🇨🇳 中文',
        'tr': '🇹🇷 Türkçe',
        'es': '🇪🇸 Español',
        'fr': '🇫🇷 Français',
        'de': '🇩🇪 Deutsch',
        'ko': '🇰🇷 한국어'
    };
    
    const buttons = availableLangs.map(l => {
        return [{ text: langMap[l] || l.toUpperCase(), callback_data: `lang_${l}` }];
    });
    
    ctx.reply(t('lang.select_prompt'), {
        reply_markup: { inline_keyboard: buttons }
    });
});

bot.action(/lang_(.+)/, async (ctx) => {
    const newLang = ctx.match[1];
    loadLocale(newLang);
    saveLangState(newLang);
    await clearAllMenuScopes();
    await setMenuOnAllScopes();
    ctx.answerCbQuery(t('lang.changed', { lang: newLang }));
    await sendMainMenu(ctx, t('lang.changed', { lang: newLang }));
});


// ===== DUAL APP SWITCHER =====

bot.command('app', async (ctx) => {
    const currentApp = process.env.ANTIGRAVITY_PREFERRED_APP || 'agent';
    const appName = currentApp === 'ide' ? '💻 Classic Monaco IDE' : '🤖 Standalone Agent (2.0)';
    const currentPort = CDP_PORT;
    
    const agentPort = getCDPPort('agent');
    const idePort = getCDPPort('ide');

    let msg = t('app.selection_title') || `🤖 <b>Antigravity App Selection</b>\n\n`;
    msg += t('app.preferred_app', { appName }) + '\n';
    msg += t('app.active_port', { port: currentPort }) + '\n\n';
    msg += t('app.select_prompt') + '\n';
    msg += `• <b>Standalone Agent:</b> CDP Port ${agentPort}\n`;
    msg += `• <b>Monaco IDE:</b> CDP Port ${idePort}\n\n`;
    msg += t('app.persistent_selection') || `⚡ <i>Your selection is permanently saved to the .env file and applied instantly without restarting the bot.</i>`;

    const buttons = [
        [{ text: `🤖 Standalone Agent (Port: ${agentPort})`, callback_data: 'pref_app_agent' }],
        [{ text: `💻 Classic Monaco IDE (Port: ${idePort})`, callback_data: 'pref_app_ide' }]
    ];

    ctx.reply(msg, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: buttons }
    });
});

bot.action(/pref_app_(.+)/, async (ctx) => {
    const selectedApp = ctx.match[1]; // 'agent' or 'ide'
    const success = updateEnvFile('ANTIGRAVITY_PREFERRED_APP', selectedApp);
    
    if (success) {
        // Recalculate port
        CDP_PORT = getCDPPort();
        ctx.answerCbQuery(t('app.updated_preference', { app: selectedApp }));
        
        const appName = selectedApp === 'ide' ? '💻 Classic Monaco IDE' : '🤖 Standalone Agent (2.0)';
        let msg = t('app.updated_title');
        msg += t('app.preferred_app', { appName });
        msg += t('app.new_port', { port: CDP_PORT });
        msg += t('app.redirect_info');
        
        ctx.reply(msg, { parse_mode: 'HTML' });
        
        // Seçilen uygulama açık değilse otomatik başlat
        try {
            const running = await isIDERunning(selectedApp);
            if (!running) {
                ctx.reply(t('app.auto_starting', { appName }));
                await launchIDE(null, CDP_PORT, selectedApp);
                // Uygulamanın açılması için biraz bekle
                await new Promise(r => setTimeout(r, 4000));
                ctx.reply(t('app.started', { appName }));
            }
        } catch (err) {
            console.error('[App Switch] Auto-start failed:', err.message);
        }
        
        // Autoaccept status reload for new port
        if (autoaccept.isEnabled) {
            autoaccept.enable(CDP_PORT).catch(() => {});
        }
        
        await sendMainMenu(ctx, t('app.control_panel', { app: selectedApp === 'ide' ? 'IDE' : 'Agent' }));
    } else {
        ctx.answerCbQuery(t('app.error_save'));
    }
});

// ===== SHORTCUTS FIXER =====

bot.command('fix_shortcuts', async (ctx) => {
    ctx.reply(t('shortcuts.scanning'));
    
    const platform = require('./platform').PLATFORM;
    const { getAppBinary } = require('./platform');
    const agentPort = getCDPPort('agent');
    const idePort = getCDPPort('ide');
    
    if (platform === 'linux') {
        // Linux: Update launcher scripts and .desktop files
        try {
            const localBin = path.join(os.homedir(), '.local', 'bin');
            const desktop = path.join(os.homedir(), 'Desktop');
            let fixedCount = 0;
            let status = t('shortcuts.updated_header');

            // Ensure directories exist
            if (!fs.existsSync(localBin)) fs.mkdirSync(localBin, { recursive: true });

            // --- 1. IDE Launcher ---
            const ideBinary = getAppBinary('ide');
            const ideLauncherPath = path.join(localBin, 'antigravity-ide-launcher.sh');
            const ideDesktopPath = path.join(desktop, 'Antigravity-IDE-CDP.desktop');
            
            if (fs.existsSync(ideBinary) || fs.existsSync(require('fs').realpathSync(ideBinary).replace(/\/[^/]+$/, ''))) {
                const ideLauncher = `#!/bin/bash\n# Antigravity IDE Launcher — Port ${idePort}\nPORT=${idePort}\nAPP_PATH="${ideBinary}"\n\n# Check if the IDE is already listening on the port\nLISTENING_PIDS=$(lsof -t -i :$PORT -s TCP:LISTEN 2>/dev/null || true)\n\nif [ -n "$LISTENING_PIDS" ]; then\n    echo "[launcher-ide] IDE already running. Opening a new window..."\n    $APP_PATH "$@"\n    exit 0\nfi\n\necho "[launcher-ide] Starting fresh IDE instance..."\n# Clean up stale locks just in case\nrm -f "$HOME/.config/Antigravity IDE/code.lock"\nrm -f "$HOME/.config/Antigravity-IDE/code.lock"\n\n$APP_PATH --remote-debugging-port=$PORT "$@" &\\nAG_PID=$!\\nwait $AG_PID\\n`;
                fs.writeFileSync(ideLauncherPath, ideLauncher, { mode: 0o755 });

                const ideDesktop = `[Desktop Entry]\nName=Antigravity IDE (CDP ${idePort})\nComment=Start Antigravity IDE with CDP ${idePort}\nExec=${ideLauncherPath} %F\nIcon=antigravity-ide\nType=Application\nTerminal=false\nStartupNotify=false\nStartupWMClass=antigravity-ide\nCategories=Development;IDE;\nMimeType=application/x-antigravity-workspace;\n`;
                fs.writeFileSync(ideDesktopPath, ideDesktop);
                exec(`chmod +x "${ideDesktopPath}"`);
                status += `• 💻 <b>Antigravity IDE</b> -> <code>--remote-debugging-port=${idePort}</code> ✅\n`;
                fixedCount++;
            } else {
                status += `• 💻 <i>Antigravity IDE</i> (${t('shortcuts.binary_not_found')})\n`;
            }

            // --- 2. Standalone Agent ---
            const agentBinary = getAppBinary('agent');
            const agentLauncherPath = path.join(localBin, 'antigravity-standalone-launcher.sh');
            const agentDesktopPath = path.join(desktop, 'Antigravity-Standalone-CDP.desktop');
            
            if (fs.existsSync(agentBinary)) {
                const agentLauncher = `#!/bin/bash\n# Antigravity Standalone Launcher — Port ${agentPort}\nPORT=${agentPort}\nAPP_PATH="${agentBinary}"\n\n# Check if the Standalone App is already listening on the port\nLISTENING_PIDS=$(lsof -t -i :$PORT -s TCP:LISTEN 2>/dev/null || true)\n\nif [ -n "$LISTENING_PIDS" ]; then\n    echo "[launcher-standalone] Standalone App already running. Opening a new window..."\n    $APP_PATH "$@"\n    exit 0\nfi\n\necho "[launcher-standalone] Starting fresh Standalone App instance..."\n# Clean up stale locks just in case\nrm -f "$HOME/.config/Antigravity/code.lock"\n\n$APP_PATH --remote-debugging-port=$PORT "$@" &\\nAG_PID=$!\\nwait $AG_PID\\n`;
                fs.writeFileSync(agentLauncherPath, agentLauncher, { mode: 0o755 });

                const agentDesktop = `[Desktop Entry]\nName=Antigravity Standalone (CDP ${agentPort})\nComment=Start Antigravity Standalone Agent with CDP ${agentPort}\nExec=${agentLauncherPath} %F\nIcon=antigravity-standalone\nType=Application\nTerminal=false\nStartupNotify=false\nStartupWMClass=antigravity\nCategories=Development;IDE;\nMimeType=application/x-antigravity-workspace;\n`;
                fs.writeFileSync(agentDesktopPath, agentDesktop);
                exec(`chmod +x "${agentDesktopPath}"`);
                status += `• 🤖 <b>Antigravity Standalone</b> -> <code>--remote-debugging-port=${agentPort}</code> ✅\n`;
                fixedCount++;
            } else {
                status += `• 🤖 <i>Antigravity Standalone</i> (${t('shortcuts.binary_not_found')})\n`;
            }

            status += t('shortcuts.success', { count: fixedCount });
            ctx.reply(status, { parse_mode: 'HTML' });
        } catch (e) {
            ctx.reply(t('shortcuts.start_error', { error: e.message }));
        }
    } else if (platform === 'win32') {
        // Windows: PowerShell approach
        const psScriptPath = path.join(os.tmpdir(), 'fix_shortcuts.ps1');
        const psScript = `
$sh = New-Object -ComObject WScript.Shell
$desktop = [System.IO.Path]::Combine($env:USERPROFILE, "Desktop")

# 1. Standalone Agent (Port ${agentPort})
$lnkAgent = Join-Path $desktop "Antigravity.lnk"
if (Test-Path $lnkAgent) {
    $lnk = $sh.CreateShortcut($lnkAgent)
    $lnk.Arguments = "--remote-debugging-port=${agentPort}"
    $lnk.Save()
    Write-Output "agent-fixed"
}

# 2. Classic IDE (Port ${idePort})
$lnkIDE = Join-Path $desktop "Antigravity IDE.lnk"
if (Test-Path $lnkIDE) {
    $lnk = $sh.CreateShortcut($lnkIDE)
    $lnk.Arguments = "--remote-debugging-port=${idePort}"
    $lnk.Save()
    Write-Output "ide-fixed"
}
`;

        try {
            fs.writeFileSync(psScriptPath, psScript, 'utf8');
            exec(`powershell -ExecutionPolicy Bypass -File "${psScriptPath}"`, (err, stdout, stderr) => {
                try { fs.unlinkSync(psScriptPath); } catch (_) {}
                
                if (err) {
                    console.error('[fix_shortcuts] Error:', err);
                    return ctx.reply(t('shortcuts.error', { error: err.message }), { parse_mode: 'HTML' });
                }
                
                let status = t('shortcuts.updated_header');
                const output = stdout.toLowerCase();
                let fixedCount = 0;
                if (output.includes('agent-fixed')) {
                    status += `\u2022 \ud83e\udd16 <b>Antigravity.lnk</b> -> <code>--remote-debugging-port=${agentPort}</code> \u2705\n`;
                    fixedCount++;
                } else {
                    status += '\u2022 \ud83e\udd16 <i>Antigravity.lnk</i> (' + t('shortcuts.not_found') + ')\n';
                }
                if (output.includes('ide-fixed')) {
                    status += `\u2022 \ud83d\udcbb <b>Antigravity IDE.lnk</b> -> <code>--remote-debugging-port=${idePort}</code> \u2705\n`;
                    fixedCount++;
                } else {
                    status += '\u2022 \ud83d\udcbb <i>Antigravity IDE.lnk</i> (' + t('shortcuts.not_found') + ')\n';
                }
                
                status += t('shortcuts.success', { count: fixedCount });
                ctx.reply(status, { parse_mode: 'HTML' });
            });
        } catch (e) {
            ctx.reply(t('shortcuts.start_error', { error: e.message }));
        }
    } else if (platform === 'darwin') {
        // macOS: osacompile kullanarak masaüstüne başlatıcı .app'ler oluşturur
        try {
            const { execSync } = require('child_process');
            const desktop = path.join(os.homedir(), 'Desktop');
            let fixedCount = 0;
            let status = t('shortcuts.updated');
            
            // 1. Standalone Agent (Port ${agentPort})
            const agentBinary = getAppBinary('agent'); // Uygulamanın .app dizinini döndürür
            if (fs.existsSync(agentBinary)) {
                const agentAppPath = path.join(desktop, 'Antigravity Agent (CDP).app');
                // open -a komutuyla uygulamayı debug portu ile başlatacak script
                const script = `do shell script "open -a \\"${agentBinary}\\" --args --remote-debugging-port=${agentPort}"`;
                execSync(`osacompile -e '${script}' -o "${agentAppPath}"`);
                status += `• 🤖 <b>Antigravity Agent (CDP).app</b> -> <code>Port ${agentPort}</code> ✅\n`;
                fixedCount++;
            }
            
            // 2. Classic IDE (Port ${idePort})
            const ideBinary = getAppBinary('ide');
            if (fs.existsSync(ideBinary)) {
                const ideAppPath = path.join(desktop, 'Antigravity IDE (CDP).app');
                const script = `do shell script "open -a \\"${ideBinary}\\" --args --remote-debugging-port=${idePort}"`;
                execSync(`osacompile -e '${script}' -o "${ideAppPath}"`);
                status += `• 💻 <b>Antigravity IDE (CDP).app</b> -> <code>Port ${idePort}</code> ✅\n`;
                fixedCount++;
            }
            
            status += t('shortcuts.success', { count: fixedCount });
            ctx.reply(status, { parse_mode: 'HTML' });
        } catch (e) {
            ctx.reply(t('shortcuts.start_error', { error: e.message }));
        }
    } else {
        ctx.reply(t('shortcuts.unsupported_platform') || '\u26a0\ufe0f Bu platform i\u00e7in k\u0131sayol d\u00fczeltme hen\u00fcz desteklenmiyor.');
    }
});


// ===== WINDOW SELECTION =====

bot.command('window', async (ctx) => {
    try {
        const windows = await listWindows(CDP_PORT);
        if (windows.length === 0) {
            return ctx.reply(t('window.not_found') || 'No IDE windows found. Send /start_ide first.');
        }
        
        const current = getPreferredWindow();
        let msg = t('window.title') || '<b>🔳 IDE Windows</b>\n';
        if (current) {
            const currentLabel = current.length > 40 ? current.substring(0, 40) + '...' : current;
            msg += (t('window.current', { current: currentLabel }) || `Current target: <i>${currentLabel}</i>`) + '\n';
        } else {
            msg += (t('window.auto') || 'Target: <i>auto (first available)</i>') + '\n';
        }
        msg += '\n' + (t('window.found', { count: windows.length }) || `Found ${windows.length} window(s). Tap to select:`);
        
        const buttons = windows.map((w, i) => {
            const icon = w.isPreferred ? '✅' : '🔳';
            // Extract meaningful part of title (usually "folder - Antigravity")
            const label = w.title.length > 40 ? w.title.substring(0, 40) + '...' : w.title;
            return [{ text: `${icon} ${label}`, callback_data: `wn_${w.id.substring(0,8)}` }];
        });
        
        // Add "auto" button to clear preference
        if (current) {
            buttons.push([{ text: t('window.clear_btn') || '🔄 Auto (clear preference)', callback_data: 'wn_auto' }]);
        }
        
        ctx.reply(msg, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: buttons }
        });
    } catch (e) {
        ctx.reply((t('window.error', { error: e.message }) || `Window list error: ${e.message}`));
    }
});

bot.action('wn_auto', (ctx) => {
    setPreferredWindow(null);
    ctx.answerCbQuery(t('window.cleared_toast') || 'Cleared — using auto-detect');
    const text = t('window.cleared_msg') || '🔄 Window preference cleared. Bot will auto-detect the active IDE window.';
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
        ctx.editMessageText(text).catch(e => {
            if (!e.message.includes('message is not modified')) ctx.reply(text);
        });
    } else {
        ctx.reply(text);
    }
});

bot.action(/wn_(.+)/, (ctx) => {
    const idPrefix = ctx.match[1];
    const windows = getCachedWindows();
    if (!windows || windows.length === 0) {
        return ctx.answerCbQuery(t('window.expired') || 'Window list expired. Send /window again.');
    }
    const selected = windows.find(w => w.id.startsWith(idPrefix));
    if (!selected) {
        return ctx.answerCbQuery(t('window.expired') || 'Window list expired. Send /window again.');
    }
    
    // Save preference by ID
    setPreferredWindow(selected.id);
    const shortTitle = selected.title.substring(0, 30);
    ctx.answerCbQuery(t('window.selected_toast', { title: shortTitle }) || `Selected: ${shortTitle}`);
    
    const text = t('window.selected_msg', { title: selected.title }) || `✅ Now targeting: <b>${selected.title}</b>\n\nAll commands will route to this window.`;
    if (ctx.callbackQuery && ctx.callbackQuery.message) {
        ctx.editMessageText(text, { parse_mode: 'HTML' }).catch(e => {
            if (!e.message.includes('message is not modified')) ctx.reply(text, { parse_mode: 'HTML' });
        });
    } else {
        ctx.reply(text, { parse_mode: 'HTML' });
    }
    
    // Auto-show latest agent response from the new window
    (async () => {
        try {
            await new Promise(r => setTimeout(r, 800));
            let _latestRes = await getFullLatestResponse(CDP_PORT);
            let text = typeof _latestRes === 'string' ? _latestRes : _latestRes.text;
            let buttons = typeof _latestRes === 'string' ? null : _latestRes.buttons;
            
            if (text && !text.startsWith('[No previous')) {
                const header = await getChatHeader(null, t('latest.last_agent_reply'));
                await sendBotMessage(ctx, text, header, buttons);
            }
        } catch(_) {}
    })();

    // Explicitly re-inject autoaccept into the selected window to ensure it tracks
    if (autoaccept.isEnabled) {
        autoaccept.enable(CDP_PORT).catch(() => {});
    }
});

bot.action(/focus_(.+)/, async (ctx) => {
    const idPrefix = ctx.match[1];
    const windows = await listWindows(CDP_PORT);
    const selected = windows.find(w => w.id.startsWith(idPrefix));
    if (!selected) {
        return ctx.answerCbQuery(t('agents.window_not_found'));
    }
    setPreferredWindow(selected.id);
    const shortTitle = selected.title.substring(0, 30);
    ctx.answerCbQuery(t('ask.focus_toast', { title: shortTitle }));
    ctx.reply(t('ask.focus_success', { title: selected.title }), { 
        parse_mode: 'HTML',
        reply_parameters: { message_id: ctx.callbackQuery.message.message_id, allow_sending_without_reply: true }
    });
});

// ===== FILE EXPLORER =====

let currentWorkspaceDir = config.projectsDir;

const pathCache = new Map();
let pathIdCounter = 0;
function getPathId(fullPath) {
    for (const [id, p] of pathCache.entries()) {
        if (p === fullPath) return id;
    }
    const id = (++pathIdCounter).toString(36);
    pathCache.set(id, fullPath);
    if (pathCache.size > 2000) {
        const firstKey = pathCache.keys().next().value;
        pathCache.delete(firstKey);
    }
    return id;
}

function listDirectory(ctx, dirPath, page = 0) {
    const PAGE_SIZE = 8;
    fs.readdir(dirPath, { withFileTypes: true }, (err, entries) => {
        if (err) return ctx.reply(t('file.dir_read_error', { error: err.message }));
        
        const filtered = entries
            .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules')
            .sort((a, b) => {
                if (a.isDirectory() && !b.isDirectory()) return -1;
                if (!a.isDirectory() && b.isDirectory()) return 1;
                return a.name.localeCompare(b.name);
            });
        
        const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
        const pageEntries = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
        
        if (pageEntries.length === 0) {
            return ctx.reply(t('file.empty_dir'));
        }
        
        const buttons = pageEntries.map(e => {
            const icon = e.isDirectory() ? '📂' : '📄';
            const fullPath = path.join(dirPath, e.name);
            const pathId = getPathId(fullPath);
            const action = e.isDirectory() ? 'fd_' : 'ff_';
            return [{ text: `${icon} ${e.name}`, callback_data: `${action}${pathId}` }];
        });
        
        const navRow = [];
        const parentDir = path.dirname(dirPath);
        if (parentDir !== dirPath && dirPath !== config.projectsDir) {
            const parentId = getPathId(parentDir);
            navRow.push({ text: t('file.parent_dir'), callback_data: `fd_${parentId}` });
        }
        
        const dirPathId = getPathId(dirPath);
        if (page > 0) {
            navRow.push({ text: t('file.prev_page'), callback_data: `fp_${dirPathId}|${page - 1}` });
        }
        if (page < totalPages - 1) {
            navRow.push({ text: t('file.next_page'), callback_data: `fp_${dirPathId}|${page + 1}` });
        }
        if (navRow.length > 0) buttons.push(navRow);
        
        const relativePath = dirPath.replace(config.home, '~');
        const dirInfo = t('file.dir_info', { count: filtered.length, page: page + 1, totalPages: totalPages || 1 });
        const text = `📂 <b>${relativePath}</b>\n${dirInfo}`;
        const extra = {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: buttons }
        };
        
        if (ctx.callbackQuery && ctx.callbackQuery.message) {
            ctx.editMessageText(text, extra).catch(e => {
                if (!e.message.includes('message is not modified')) {
                    ctx.reply(text, extra);
                }
            });
        } else {
            ctx.reply(text, extra);
        }
    });
}

bot.command('file', (ctx) => {
    const parts = ctx.message.text.split(' ');
    parts.shift();
    const filePath = parts.join(' ').trim();
    
    if (!filePath) {
        listDirectory(ctx, currentWorkspaceDir);
        return;
    }
    
    const fullPath = filePath.startsWith('/') || filePath.match(/^[A-Z]:\\/) 
        ? filePath 
        : path.join(currentWorkspaceDir, filePath);
    if (!fs.existsSync(fullPath)) {
        return ctx.reply(t('file.not_found', { path: fullPath }));
    }
    
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
        listDirectory(ctx, fullPath);
        return;
    }
    
    if (stat.size > 50 * 1024 * 1024) {
        return ctx.reply(t('file.too_large', { size: (stat.size / 1024 / 1024).toFixed(1) }));
    }
    
    ctx.replyWithDocument({ source: fullPath, filename: path.basename(fullPath) })
        .catch(e => ctx.reply(t('file.send_failed', { error: e.message })));
});

bot.action(/fd_(.+)/, (ctx) => {
    try {
        const pathId = ctx.match[1];
        const dirPath = pathCache.get(pathId);
        if (!dirPath) return ctx.answerCbQuery(t('file.expired'));
        ctx.answerCbQuery();
        listDirectory(ctx, dirPath);
    } catch(e) {
        ctx.answerCbQuery(t('model.error'));
    }
});

bot.action(/ff_(.+)/, (ctx) => {
    try {
        const pathId = ctx.match[1];
        const filePath = pathCache.get(pathId);
        if (!filePath) return ctx.answerCbQuery(t('file.expired'));
        
        ctx.answerCbQuery(t('file.sending', { filename: path.basename(filePath) }));
        
        const stat = fs.statSync(filePath);
        if (stat.size > 50 * 1024 * 1024) {
            return ctx.reply(t('file.too_large', { size: (stat.size / 1024 / 1024).toFixed(1) }));
        }
        
        ctx.replyWithDocument({ source: filePath, filename: path.basename(filePath) })
            .catch(e => ctx.reply(t('file.send_failed', { error: e.message })));
    } catch(e) {
        ctx.answerCbQuery(t('model.error'));
    }
});

bot.action(/fp_(.+)/, (ctx) => {
    try {
        const matchData = ctx.match[1];
        const [pathId, pageStr] = matchData.split('|');
        const dirPath = pathCache.get(pathId);
        if (!dirPath) return ctx.answerCbQuery(t('file.expired'));
        
        ctx.answerCbQuery();
        listDirectory(ctx, dirPath, parseInt(pageStr) || 0);
    } catch(e) {
        ctx.answerCbQuery(t('model.error'));
    }
});

// ===== MENU REGISTRATION =====

function getMenuCommands() {
    const cmds = [
        { command: 'help', description: t('menu.help_desc') },
        { command: 'latest', description: t('menu.latest_desc') },
        { command: 'screenshot', description: t('menu.screenshot_desc') },
        { command: 'status', description: t('menu.status_desc') },
        { command: 'start_ide', description: t('menu.start_ide_desc') || 'Start IDE' },
        { command: 'start_ag', description: t('menu.start_ag_desc') || 'Start Agent' },
        { command: 'close_ide', description: t('menu.close_ide_desc') || 'Close IDE' },
        { command: 'close_ag', description: t('menu.close_ag_desc') || 'Close Agent' },
        { command: 'new', description: t('menu.new_desc') },
        { command: 'agents', description: t('menu.agents_desc') },
        { command: 'artifacts', description: t('menu.artifacts_desc') },
        { command: 'model', description: t('menu.model_desc') },
        { command: 'workspace', description: t('menu.workspace_desc') },
        { command: 'window', description: t('menu.window_desc') || 'Select IDE window' },
        { command: 'close_window', description: t('menu.close_window_desc') || 'Close current window' },
        { command: 'lang', description: t('menu.lang_desc') },
        { command: 'cmd', description: t('menu.cmd_desc') },
        { command: 'file', description: t('menu.file_desc') },
        { command: 'stop', description: t('menu.stop_desc') },
        { command: 'autoaccept', description: t('menu.autoaccept_desc') },
        { command: 'quota', description: t('menu.quota_desc') },
        { command: 'update', description: t('menu.update_desc') || 'Check for updates' },
        { command: 'version', description: t('menu.version_desc') || 'Show current version' },
        { command: 'menu', description: t('menu.menu_desc') },
        { command: 'app', description: t('menu.app_desc') || 'Select active application' },
        { command: 'fix_shortcuts', description: t('menu.fix_shortcuts_desc') || 'Fix desktop shortcuts' },
        { command: 'restart', description: t('menu.restart_desc') || 'Restart the bot' },
        { command: 'goal', description: t('menu.goal_desc') || 'Set autonomous goal for agent' },
        { command: 'plan', description: t('menu.plan_desc') || 'Generate implementation plan' },
        { command: 'schedule_task', description: t('menu.schedule_task_desc') || 'Schedule a task in IDE' },
        { command: 'schedule_setup', description: t('schedule.menu_schedule_setup_desc') || 'Setup CronCrew connection' },
        { command: 'schedule_list', description: t('schedule.menu_schedule_list_desc') || 'List scheduled tasks' },
        { command: 'schedule_add', description: t('schedule.menu_schedule_add_desc') || 'Add a new schedule' },
        { command: 'schedule_status', description: t('schedule.menu_schedule_status_desc') || 'Show CronCrew status' },
        { command: 'login', description: t('menu.login_desc') || 'Sign in with Google' },
        { command: 'accounts', description: t('menu.accounts_desc') || 'List saved Google accounts' },
        { command: 'switchacc', description: t('menu.switchacc_desc') || 'Switch active Google account' },
        { command: 'getinfo', description: t('menu.getinfo_desc') || 'View account quota info' },
        { command: 'delacc', description: t('menu.delacc_desc') || 'Delete a saved Google account' },
        { command: 'gettask', description: t('menu.gettask_desc') || 'Get the latest Task Checklist' },
        { command: 'getplan', description: t('menu.getplan_desc') || 'Get the latest Implementation Plan' },
        { command: 'getwalk', description: t('menu.getwalk_desc') || 'Get the latest Walkthrough' }
    ];
    return cmds.sort((a, b) => a.command.localeCompare(b.command));
}

/**
 * Delete commands from ALL Telegram scopes and language codes
 * to prevent stale entries from overriding the default menu.
 */
async function clearAllMenuScopes() {
    const scopes = [
        { type: 'default' },
        { type: 'all_private_chats' },
        { type: 'all_group_chats' },
        { type: 'all_chat_administrators' }
    ];
    const langs = ['', 'en', 'tr'];
    
    for (const scope of scopes) {
        for (const lang of langs) {
            try {
                const params = { scope };
                if (lang) params.language_code = lang;
                await bot.telegram.callApi('deleteMyCommands', params);
            } catch (_) {}
        }
    }
    
    // Also clear chat-specific scope if ALLOWED_CHAT_IDS is set
    for (const chat_id of ALLOWED_CHAT_IDS) {
        for (const lang of langs) {
            try {
                const params = { scope: { type: 'chat', chat_id: parseInt(chat_id) } };
                if (lang) params.language_code = lang;
                await bot.telegram.callApi('deleteMyCommands', params);
            } catch (_) {}
        }
    }
}

/**
 * Set commands on all relevant scopes, utilizing Telegram's native localized menus.
 * We register menus for all available languages ('en', 'tr') plus the default.
 */
async function setMenuOnAllScopes() {
    const langs = fs.readdirSync(path.join(__dirname, '..', 'locales'))
        .filter(f => f.endsWith('.json'))
        .map(f => f.replace('.json', ''));
    const defaultLang = process.env.LANGUAGE || 'en';
    const originalLang = getLang(); // Save the user's active language

    // Helper to register commands for a specific language and scope
    const register = async (langCode) => {
        // Temporarily load this locale to generate translated commands
        loadLocale(langCode);
        const cmds = getMenuCommands();
        
        const paramsDefault = { commands: cmds };
        const paramsPrivate = { commands: cmds, scope: { type: 'all_private_chats' } };
        
        // If it's not the default fallback, specify the language_code so Telegram routes it natively
        if (langCode !== defaultLang) {
            paramsDefault.language_code = langCode;
            paramsPrivate.language_code = langCode;
        }

        await bot.telegram.callApi('setMyCommands', paramsDefault).catch(()=>{});
        await bot.telegram.callApi('setMyCommands', paramsPrivate).catch(()=>{});

        if (langCode === originalLang) {
            for (const chat_id of ALLOWED_CHAT_IDS) {
                const paramsChat = { 
                    commands: cmds, 
                    scope: { type: 'chat', chat_id: parseInt(chat_id) } 
                };
                await bot.telegram.callApi('setMyCommands', paramsChat).catch(()=>{});
            }
        }
    };

    // 1. Register the non-default languages (e.g. 'en')
    for (const l of langs) {
        if (l !== defaultLang) await register(l);
    }
    // 2. Register the default fallback language last (no language_code)
    await register(defaultLang);
    
    // 3. Restore the original active language
    loadLocale(originalLang);
}

bot.command('menu', async (ctx) => {
    await clearAllMenuScopes();
    await setMenuOnAllScopes();
    await sendMainMenu(ctx, t('menu.updated'));
});

// ===== UPDATE & VERSION =====

bot.command('version', async (ctx) => {
    const local = updater.getLocalVersion();
    ctx.reply(
        `📦 <b>Antigravity Telegram Suite</b>\n\n` +
        `Version: <code>v${local.version}</code>\n` +
        `Commit: <code>${local.commitHash}</code>`,
        { parse_mode: 'HTML' }
    );
});

bot.command('update', async (ctx) => {
    ctx.reply(t('update.checking'));
    try {
        const result = await updater.checkForUpdates();
        if (!result.available) {
            ctx.reply(
                t('update.up_to_date', { version: result.localVersion, commit: result.localCommit }),
                { parse_mode: 'HTML' }
            );
            return;
        }
        await ctx.reply(
            t('update.available') +
            t('update.current_version', { version: result.localVersion, commit: result.localCommit }) +
            t('update.new_version_info', { version: result.remoteVersion, commit: result.remoteCommit }) +
            (result.remoteCommitMessage ? t('update.changelog', { message: result.remoteCommitMessage }) : `\n`) +
            t('update.update_note') +
            t('update.updating'),
            { parse_mode: 'HTML' }
        );
        const updateResult = await updater.performUpdate();
        await ctx.reply(`ℹ️ ${updateResult.message}`);
    } catch(e) {
        ctx.reply(t('update.error', { error: e.message }));
    }
});

// ===== TURBO / COUNCIL MODE =====

async function handleTurbo(ctx) {
    isTurboMode = !isTurboMode; // Toggle
    
    if (!isTurboMode) {
        if (turboPinnedMsgId) {
            try {
                await ctx.telegram.unpinChatMessage(ctx.chat.id, turboPinnedMsgId);
            } catch (e) {}
            turboPinnedMsgId = null;
        }
        saveTurboState();
        await sendMainMenu(ctx, t('turbo.off'));
    } else {
        const msg = await ctx.reply(
            t('turbo.on_msg'), 
            { parse_mode: 'HTML' }
        );
        turboPinnedMsgId = msg.message_id;
        try {
            await ctx.telegram.pinChatMessage(ctx.chat.id, turboPinnedMsgId);
        } catch (e) {}
        saveTurboState();
        await sendMainMenu(ctx, t('turbo.on_toast') || '🚀 Turbo Mod devrede!');
    }
}

bot.command('turbo', handleTurbo);
bot.hears(/^🚀/i, handleTurbo);

bot.action('turbo_force_stop', async (ctx) => {
    isTurboRunning = false;
    isTurboMode = false;
    saveTurboState();
    try { stopAgent(CDP_PORT); } catch(e) {}
    await ctx.editMessageText('🛑 Turbo Mode has been force stopped. You can now send your message.').catch(() => {});
});

bot.action('turbo_cancel', async (ctx) => {
    await ctx.deleteMessage().catch(() => {});
});

// ===== TEXT MESSAGE HANDLER (Headless mode) =====

bot.command('panel', async (ctx) => {
    await sendMainMenu(ctx);
});

bot.hears(/^🤖/i, async (ctx) => {
    const preferredApp = process.env.ANTIGRAVITY_PREFERRED_APP || 'agent';
    const isIDE = preferredApp === 'ide';
    
    if (isIDE) {
        // ide modunda bu buton workspace adını gösteriyor, bu yüzden workspace menüsünü aç
        ctx.message.text = '/workspace';
        return handleWorkspace(ctx);
    }
    
    // 🤖 butonu aktif ajanı gösteriyor — tıklanınca /agents listesini tetikle
    try {
        const workspaces = await listAgentThreads(CDP_PORT);
        if (workspaces.length === 0) {
            return ctx.reply(t('agents.no_recent') || 'ℹ️ No recent active threads found.');
        }
        
        cachedAgentThreads = [];
        let msg = t('agents.list_title') || '📂 <b>Recent Chat Threads:</b>\n\n';
        let index = 1;
        
        for (const ws of workspaces) {
            const recentThreads = ws.threads.filter(th => {
                if (/^show\s+\d+\s+more/i.test(th.name)) return false;
                return true;
            });
            
            if (recentThreads.length > 0) {
                msg += `<b>📁 ${ws.workspace}</b>\n`;
                for (const th of recentThreads) {
                    cachedAgentThreads.push({ ...th, workspace: ws.workspace });
                    msg += `  /agents_${index} - ${th.name} <i>(${th.time})</i>\n`;
                    index++;
                }
                msg += '\n';
            }
        }
        
        if (cachedAgentThreads.length === 0) {
            return ctx.reply(t('agents.no_recent') || 'ℹ️ No recent active threads found.');
        }
        
        ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (e) {
        ctx.reply((t('agents.error') || '❌ Error: ') + e.message);
    }
});
bot.hears(/^🧠/i, handleModel);

function extractQuotedContext(ctx) {
    if (!ctx.message.reply_to_message) return "";
    const msg = ctx.message.reply_to_message;
    let quotedText = msg.text || msg.caption || "";
    if (!quotedText) return "";
    
    quotedText = quotedText.replace(/✅ Completed!/g, '');
    quotedText = quotedText.replace(/📁[^\n]+/g, '');
    quotedText = quotedText.replace(/🤖[^\n]+/g, '');
    const swipeText = t('agent.swipe_to_reply').replace(/<[^>]+>/g, '');
    if (swipeText) {
        quotedText = quotedText.replace(new RegExp(swipeText.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'gi'), '');
    }
    quotedText = quotedText.replace(/🤖 Agent:/g, '');
    quotedText = quotedText.trim();
    
    if (quotedText.length > 500) {
        quotedText = quotedText.substring(0, 500) + '...';
    }
    
    return quotedText ? `[Replying to Agent's message: "${quotedText}"]\n\n` : "";
}


// ===== INTERACTIVE MODAL ANSWER HANDLER =====
bot.action(/^ans_(.+)$/, async (ctx) => {
    const answer = ctx.match[1];
    await ctx.answerCbQuery(t('interactive_modal.answer_sent', { answer }));
    
    let targetId = getPreferredTargetId();
    let explicitThreadName = null;
    if (ctx.callbackQuery.message) {
        const val = messageTargetMap.get(ctx.callbackQuery.message.message_id);
        if (typeof val === 'string') targetId = val;
        else if (val) { targetId = val.targetId; explicitThreadName = val.threadName; }
    }
    
    // Fire-and-forget: don't block Telegraf's update loop
    (async () => {
        try {
            if (explicitThreadName) await switchAgentThread(CDP_PORT, explicitThreadName).catch(()=>{});
            setReaction(ctx, REACTION.THINKING, ctx.callbackQuery.message?.message_id);
            targetId = await sendViaCDP(answer, CDP_PORT, targetId);
            
            await new Promise(r => setTimeout(r, 1500));
            await snapshotChatState(CDP_PORT, targetId).catch(() => {});

            const isDone = await waitForAgentResponse(CDP_PORT, 450000, createProgressHandler(ctx), targetId);
            let text = "";
            let interactiveButtons = null;
            if (isDone) {
                let _latestRes = await getFullLatestResponse(CDP_PORT, targetId, explicitThreadName);
                text = typeof _latestRes === 'string' ? _latestRes : _latestRes.text;
                interactiveButtons = typeof _latestRes === 'string' ? null : _latestRes.buttons;
                text = stripQueryFromResponse(text, answer);
            } else {
                return await ctx.reply(t('ask.timeout'));
            }
            
            if (!text) text = t('ask.done_empty');
            const header = await getChatHeader(targetId, t('ask.done'));
            const buttons = interactiveButtons ? interactiveButtons : await buildMainMenu(null, null, targetId);

            const sentIds = await sendBotMessage(ctx, text, header, buttons, ctx.callbackQuery.message.message_id);
            if (sentIds && sentIds.length > 0 && targetId) {
                const activeInfo = await getActiveThreadInfo(CDP_PORT, targetId).catch(() => null);
                const currentThreadName = activeInfo ? activeInfo.name : null;
                sentIds.forEach(id => messageTargetMap.set(id, { targetId, threadName: currentThreadName }));
                saveMessageTargetMap(messageTargetMap);
            }
        } catch (e) {
            ctx.reply(t('error.general_error', { error: e.message })).catch(()=>{});
        }
    })();
});

let isAgentBusy = false;

bot.on('text', async (ctx, next) => {
    if (ctx.message.text.startsWith('/')) return next();
    let query = ctx.message.text;
    
    let explicitTargetId = null;
    let explicitThreadName = null;
    if (ctx.message.reply_to_message) {
        const val = messageTargetMap.get(ctx.message.reply_to_message.message_id);
        if (typeof val === 'string') explicitTargetId = val;
        else if (val) { explicitTargetId = val.targetId; explicitThreadName = val.threadName; }
        
        query = extractQuotedContext(ctx) + query;
    }
    if (!explicitTargetId && ctx.message.reply_to_message?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data?.startsWith('focus_')) {
        explicitTargetId = ctx.message.reply_to_message.reply_markup.inline_keyboard[0][0].callback_data.replace('focus_', '');
    }

    // If agent is already processing, just send the follow-up message without starting a new wait loop
    if (isAgentBusy && !isTurboMode) {
        try {
            if (explicitThreadName) await switchAgentThread(CDP_PORT, explicitThreadName).catch(()=>{});
            await sendViaCDPWithRecovery(query, explicitTargetId);
            setReaction(ctx, REACTION.THINKING);
        } catch (err) {
            ctx.reply(t('ask.headless_error', { error: err.message })).catch(() => {});
        }
        return;
    }

    // Fire-and-forget: don't block Telegraf's update loop so other commands remain responsive
    (async () => {
        try {
            if (explicitThreadName) await switchAgentThread(CDP_PORT, explicitThreadName).catch(()=>{});
            let targetId = explicitTargetId;
            let text = "";
            let interactiveButtons = null;

            if (isTurboMode) {
                isTurboRunning = true;
                try {
                    const turboTargetId = explicitTargetId || getPreferredTargetId() || null;
                    text = await runTurboOrchestration(query, CDP_PORT, turboTargetId, ctx, createProgressHandler, stripQueryFromResponse);
                    targetId = turboTargetId;
                } finally {
                    isTurboRunning = false;
                }
            } else {
                isAgentBusy = true;
                targetId = await sendViaCDPWithRecovery(query, explicitTargetId);
                setReaction(ctx, REACTION.THINKING);

                // Wait briefly for message to render in DOM before anchoring state
                await new Promise(r => setTimeout(r, 1500));
                await snapshotChatState(CDP_PORT, targetId).catch(() => {});
                
                // Mark TaskWatcher as busy during agent response wait
                if (global.__taskWatcher) global.__taskWatcher.setBusy(true);
                try {
                    const isDone = await waitForAgentResponse(CDP_PORT, 450000, createProgressHandler(ctx), targetId);
                    if (isDone) {
                        let _latestRes = await getFullLatestResponse(CDP_PORT, targetId, explicitThreadName);
                        text = typeof _latestRes === 'string' ? _latestRes : _latestRes.text;
                        interactiveButtons = typeof _latestRes === 'string' ? null : _latestRes.buttons;
                        
                        text = stripQueryFromResponse(text, query);
                    } else {
                        return await ctx.reply(t('ask.timeout'));
                    }
                } finally {
                    isAgentBusy = false;
                    if (global.__taskWatcher) global.__taskWatcher.setBusy(false);
                }
            }

            if (!text) text = t('ask.done_empty');
            const header = await getChatHeader(targetId, t('ask.done'));
            const buttons = interactiveButtons ? interactiveButtons : await buildMainMenu(null, null, targetId);
            
            const sentIds = await sendBotMessage(ctx, text, header, buttons, ctx.message.message_id);
            if (sentIds && sentIds.length > 0 && targetId) {
                const activeInfo = await getActiveThreadInfo(CDP_PORT, targetId).catch(() => null);
                const currentThreadName = activeInfo ? activeInfo.name : null;
                sentIds.forEach(id => messageTargetMap.set(id, { targetId, threadName: currentThreadName }));
                saveMessageTargetMap(messageTargetMap);
            }
        } catch(err) {
            isAgentBusy = false;
            const errorMsg = err.message === 'no_chat_input' ? t('ask.no_chat_input') : err.message;
            ctx.reply(t('ask.headless_error', { error: errorMsg })).catch(() => {});
        }
    })();
});

// ===== PHOTO & DOCUMENT HANDLER =====

const mediaGroupCache = new Map();

async function processAgentRequest(ctx, query, explicitTargetId, explicitThreadName, originalCaption) {
    setReaction(ctx, REACTION.THINKING);
    if (explicitThreadName) await switchAgentThread(CDP_PORT, explicitThreadName).catch(()=>{});
    const targetId = await sendViaCDP(query, CDP_PORT, explicitTargetId);
    
    if (targetId === "INVALID_MODAL_OPTION") {
        ctx.reply(t('error.modal_active'));
        return;
    }

    // Wait briefly for message to render in DOM before anchoring state
    await new Promise(r => setTimeout(r, 1500));
    await snapshotChatState(CDP_PORT, targetId).catch(() => {});
    
    const isDone = await waitForAgentResponse(CDP_PORT, 450000, createProgressHandler(ctx), targetId);
    if (isDone) {
        let _latestRes = await getFullLatestResponse(CDP_PORT, targetId);
        let text = typeof _latestRes === 'string' ? _latestRes : _latestRes.text;
        let interactiveButtons = typeof _latestRes === 'string' ? null : _latestRes.buttons;
        
        text = stripQueryFromResponse(text, query);
        if (originalCaption) {
            text = stripQueryFromResponse(text, originalCaption);
        }
        if (!text) text = t('ask.done_empty');
        const header = await getChatHeader(targetId, t('ask.done'));
        
        const buttons = interactiveButtons ? interactiveButtons : await buildMainMenu(null, null, targetId);
        
        const sentIds = await sendBotMessage(ctx, text, header, buttons, ctx.message.message_id);
        if (sentIds && sentIds.length > 0 && targetId) {
            const activeInfo = await getActiveThreadInfo(CDP_PORT, targetId).catch(() => null);
            const currentThreadName = activeInfo ? activeInfo.name : null;
            sentIds.forEach(id => messageTargetMap.set(id, { targetId, threadName: currentThreadName }));
            saveMessageTargetMap(messageTargetMap);
        }
    } else {
        await ctx.reply(t('ask.timeout'));
    }
}

async function processMediaGroup(group) {
    const ctx = group.ctx;
    const paths = group.files.map(p => `\`${p}\``).join(', ');
    const combinedCaption = group.captions.join('\n');
    
    const query = `[System: The user has uploaded ${group.files.length} files. You MUST use your \`view_file\` tool to examine ALL files at these absolute paths: ${paths} . Do not say you cannot see them. Use the tool!]${combinedCaption ? `\nUser's message: ${combinedCaption}` : ''}`;
    
    try {
        await processAgentRequest(ctx, query, group.explicitTargetId, group.explicitThreadName, combinedCaption);
    } catch(err) {
        const errorMsg = err.message === 'no_chat_input' ? t('ask.no_chat_input') : err.message;
        ctx.reply(t('photo.error', { error: errorMsg })).catch(() => {});
    }
}

bot.on(['photo', 'document'], (ctx) => {
    (async () => {
        try {
            let fileId;
            let fileName = "telegram_upload";
            
            if (ctx.message.photo) {
                const photos = ctx.message.photo;
                fileId = photos[photos.length - 1].file_id;
                fileName += ".jpg";
            } else if (ctx.message.document) {
                fileId = ctx.message.document.file_id;
                fileName = ctx.message.document.file_name || "telegram_upload.file";
            }
            
            const fileLink = await ctx.telegram.getFileLink(fileId);
            const https = require('https');
            const dest = path.join(config.tempDir, `tg_${Date.now()}_${fileName}`);
            
            await new Promise((resolve, reject) => {
                const file = fs.createWriteStream(dest);
                https.get(fileLink, function(response) {
                    response.pipe(file);
                    file.on('finish', function() {
                        file.close(resolve);
                    });
                }).on('error', function(err) {
                    fs.unlink(dest, () => {});
                    reject(err);
                });
            });
            
            let caption = ctx.message.caption ? ctx.message.caption : "";
            
            let explicitTargetId = null;
            let explicitThreadName = null;
            let quotedContext = "";
            if (ctx.message.reply_to_message) {
                const val = messageTargetMap.get(ctx.message.reply_to_message.message_id);
                if (typeof val === 'string') explicitTargetId = val;
                else if (val) { explicitTargetId = val.targetId; explicitThreadName = val.threadName; }
                
                quotedContext = extractQuotedContext(ctx);
            }
            if (!explicitTargetId && ctx.message.reply_to_message?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data?.startsWith('focus_')) {
                explicitTargetId = ctx.message.reply_to_message.reply_markup.inline_keyboard[0][0].callback_data.replace('focus_', '');
            }
            
            if (quotedContext) {
                caption = caption ? quotedContext + caption : quotedContext.trim();
            }
            
            const mediaGroupId = ctx.message.media_group_id;
            if (mediaGroupId) {
                if (!mediaGroupCache.has(mediaGroupId)) {
                    mediaGroupCache.set(mediaGroupId, {
                        files: [],
                        captions: [],
                        timer: null,
                        ctx: ctx,
                        explicitTargetId,
                        explicitThreadName
                    });
                }
                const group = mediaGroupCache.get(mediaGroupId);
                group.files.push(dest);
                if (caption) group.captions.push(caption);
                
                clearTimeout(group.timer);
                group.timer = setTimeout(() => {
                    mediaGroupCache.delete(mediaGroupId);
                    processMediaGroup(group);
                }, 1500);
                return;
            }
            
            const query = `[System: The user has uploaded an image or file. You MUST use your \`view_file\` tool to examine the file at this absolute path: ${dest} . Do not say you cannot see it. Use the tool!]${caption ? `\nUser's message: ${caption}` : ''}`;
            
            await processAgentRequest(ctx, query, explicitTargetId, explicitThreadName, caption);
            
        } catch(err) {
            const errorMsg = err.message === 'no_chat_input' ? t('ask.no_chat_input') : err.message;
            ctx.reply(t('photo.error', { error: errorMsg })).catch(() => {});
        }
    })();
});

// ===== LAUNCH =====

async function init() {
    console.log("Starting initialization...");
    try {
        await clearAllMenuScopes();
        await setMenuOnAllScopes();
        console.log("Menu commands set.");
    } catch(e) {
        console.error("Could not set commands", e.message);
    }
    
    // Auto-accept defaults to false, unless explicitly enabled by env
    if (process.env.AUTOACCEPT_DEFAULT === 'true') {
        console.log('[autoaccept] Auto-starting (AUTOACCEPT_DEFAULT=true)...');
        autoaccept.enable(CDP_PORT).then(r => {
            console.log(`[autoaccept] Auto-start result: injected=${r.injected}`);
        }).catch(e => {
            console.log(`[autoaccept] Auto-start failed: ${e.message} (will retry via heartbeat)`);
        });
    } else {
        console.log('[autoaccept] Disabled by default. Use /autoaccept on to enable.');
    }

    console.log(t('bot.polling'));
    
    bot.catch((err, ctx) => {
        console.error(`[Bot Error] for ${ctx.updateType}:`, err.message || err);
    });

    // Check if this boot is after an explicit /restart command.
    // If so, drop pending updates to prevent the /restart from being re-processed (infinite loop).
    let shouldDropPending = false;
    try {
        if (fs.existsSync(RESTART_FLAG_FILE)) {
            shouldDropPending = true;
            fs.unlinkSync(RESTART_FLAG_FILE);
            console.log('[init] Restart flag detected — dropping pending updates to prevent /restart loop');
        }
    } catch (_) {}

    const launchBot = () => {
        bot.launch({ dropPendingUpdates: shouldDropPending }).catch(err => {
            console.error("Bot launch failed:", err.message || err);
            console.log("Retrying in 30 seconds...");
            setTimeout(launchBot, 30000);
        });
    };
    launchBot();

    // Push the main menu keyboard to the user so it's active by default (wait 3s to let IDE/CDP initialize)
    setTimeout(() => {
        const updateFlagPath = path.join(__dirname, '..', '.update_flag');
        if (fs.existsSync(updateFlagPath)) {
            const startupMsg = t('update.bot_updated');
            pushMainMenuToUser(startupMsg).catch(console.error);
            try { fs.unlinkSync(updateFlagPath); } catch (e) {}
        } else {
            // Sadece sessizce menüyü güncelle
            pushMainMenuToUser(t('bot.restarted'), true).catch(console.error);
        }
    }, 3000);

    // Start periodic update checker (notifies via Telegram when update is available)
    updater.startUpdateChecker(bot, ALLOWED_CHAT_IDS);

    // Initialize Task Watcher — monitors agent's proactive notifications
    const preferredApp = (process.env.ANTIGRAVITY_PREFERRED_APP || 'ide').toLowerCase();
    const appDataName = preferredApp === 'agent' ? 'antigravity' : 'antigravity-ide';
    
    // Track last proactive notification message per chat for edit-in-place
    const proactiveMessageIds = new Map(); // chatId -> { messageId, timestamp }
    const PROACTIVE_RESET_MS = 5 * 60 * 1000; // Reset after 5 min of silence

    const taskWatcher = new TaskWatcher({
        appDataName,
        onNotification: async ({ conversationId, text, type }) => {
            console.log(`[TaskWatcher] 📬 Proactive notification (${type}, conv: ${conversationId?.substring(0, 8)}, ${text.length} chars)`);

            const header = '🔔 <b>' + t('task_watcher.proactive_msg') + '</b>\n\n';
            // Truncate for Telegram 4096 char limit
            const maxLen = 4096 - header.length - 10;
            const body = text.length > maxLen ? text.substring(0, maxLen) + '…' : text;
            const fullMsg = header + body;

            for (const chatId of ALLOWED_CHAT_IDS) {
                try {
                    const existing = proactiveMessageIds.get(chatId);
                    const now = Date.now();

                    // If we have a recent message, try to edit it
                    if (existing && (now - existing.timestamp) < PROACTIVE_RESET_MS) {
                        try {
                            await bot.telegram.editMessageText(
                                chatId, existing.messageId, null,
                                fullMsg, { parse_mode: 'HTML' }
                            );
                            existing.timestamp = now;
                            console.log(`[TaskWatcher] Edited existing notification msg ${existing.messageId}`);
                            continue;
                        } catch (editErr) {
                            // Edit failed (message too old, deleted, or content unchanged)
                            console.log(`[TaskWatcher] Edit failed, sending new: ${editErr.message}`);
                        }
                    }

                    // Send a new message
                    try {
                        const sent = await bot.telegram.sendMessage(chatId, fullMsg, { parse_mode: 'HTML' });
                        proactiveMessageIds.set(chatId, { messageId: sent.message_id, timestamp: now });
                        console.log(`[TaskWatcher] Sent new notification msg ${sent.message_id}`);
                    } catch (err) {
                        if (err.message.includes("parse entities")) {
                            const plain = fullMsg.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
                            const sent = await bot.telegram.sendMessage(chatId, plain);
                            proactiveMessageIds.set(chatId, { messageId: sent.message_id, timestamp: now });
                            console.log(`[TaskWatcher] Sent plain text fallback ${sent.message_id}`);
                        } else {
                            throw err;
                        }
                    }
                } catch (e) {
                    console.error('[TaskWatcher] Failed to send notification:', e.message);
                }
            }
        }
    });

    // Wire thread resolution events to TaskWatcher and Artifact Watcher
    setOnThreadResolved((threadId) => {
        taskWatcher.setActiveConversation(threadId);
        watchArtifacts(threadId);
    });

    // Expose taskWatcher globally so text handler can set busy/idle
    global.__taskWatcher = taskWatcher;

    // Start watching the current active/last resolved thread immediately upon bot startup
    const initialThreadId = getLastResolvedThreadId();
    if (initialThreadId) {
        watchArtifacts(initialThreadId);
    }
}

/**
 * Format quota data into a rich Telegram HTML card.
 *
 * Handles two model types returned by the quota API:
 * - Metered models: have `quotaInfo` with `remainingFraction` → shown as a progress bar.
 * - Unlimited models: no `quotaInfo` (pro/unlimited tier) → shown as ∞ Unlimited.
 *
 * @param {object} account - Saved account record.
 * @param {object} quotaData - Parsed quota response from fetchQuota().
 * @returns {string} Telegram HTML.
 */
function formatQuotaHtml(account, quotaData) {
    const L = [];

    // ── Header ──
    L.push(t('quota.info_title'));
    L.push('━'.repeat(22));
    L.push(t('quota.user', { name: account.name || account.email }));
    L.push(t('quota.email', { email: account.email }));
    L.push(t('quota.id', { id: account.numericId }));

    const tier = (quotaData.subscription_tier || quotaData._tier || '').replace(/_/g, ' ').trim();
    if (tier) {
        L.push(t('quota.tier', { tier }));
    }
    if (quotaData.ai_credits) {
        L.push(t('quota.credits', { credits: quotaData.ai_credits.credits.toLocaleString() }));
    }

    // ── Model Quota ──
    const models = quotaData.models || {};

    // Build the allowed-model filter from QUOTA_DISPLAY_MODELS env var.
    // Each entry is matched case-insensitively as a substring of displayName.
    // Empty / unset → show all models (no filter applied).
    const quotaFilterRaw = (process.env.QUOTA_DISPLAY_MODELS || '').trim();
    const quotaFilter = quotaFilterRaw
        ? quotaFilterRaw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
        : [];

    const matchesFilter = (modelId, info) => {
        if (quotaFilter.length === 0) {
            return true;
        }
        const displayName = (info.displayName || modelId).toLowerCase();
        return quotaFilter.some(term => displayName.includes(term));
    };

    const trackedModels = Object.entries(models)
        .filter(([name, info]) => /^(gemini|claude|gpt|image|imagen)/i.test(name) && matchesFilter(name, info))
        .sort(([a], [b]) => {
            // Recommended first, then alphabetical
            const aRec = models[a].recommended ? 0 : 1;
            const bRec = models[b].recommended ? 0 : 1;
            if (aRec !== bRec) {
                return aRec - bRec;
            }
            return a.localeCompare(b);
        });

    if (trackedModels.length > 0) {
        L.push('');
        L.push(t('quota.model_quota_title'));
        L.push('━'.repeat(22));

        for (const [modelId, info] of trackedModels) {
            const displayName = info.displayName || modelId;
            const star = info.recommended ? ' ⭐' : '';
            const isUnlimited = info.unlimited === true || info.quotaInfo === null;

            if (isUnlimited) {
                // Pro / unlimited tier — no quota cap, show infinity
                L.push(t('quota.unlimited'));
                L.push(t('quota.unlimited_model', { model: displayName, star }));
            } else {
                // Metered model — show progress bar
                const remaining = info.quotaInfo?.remainingFraction != null
                    ? info.quotaInfo.remainingFraction
                    : (info.percentage != null ? info.percentage / 100 : 0);
                const pct = Math.round(remaining * 100);

                // 8-segment bar: █ = filled, ░ = empty
                const filled = Math.round(remaining * 8);
                const bar = '█'.repeat(filled) + '░'.repeat(8 - filled);

                // Color-coded percentage label
                const pctLabel = pct >= 50
                    ? `<b>${pct}%</b>`
                    : (pct >= 20 ? `${pct}%` : `<i>${pct}%</i>`);

                L.push(`<code>${bar}</code>  ${pctLabel}`);
                L.push(`  ↳ ${displayName}${star}`);

                const resetTime = info.quotaInfo?.resetTime;
                if (resetTime) {
                    const reset = new Date(resetTime);
                    const resetStr = reset.toLocaleString('en-US', {
                        month: 'short', day: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                        timeZone: 'UTC', timeZoneName: 'short',
                    });
                    L.push(t('quota.reset_timestamp', { resetStr }));
                }
            }
        }
    } else if (quotaData._unlimited) {
        // Consumer/non-enterprise account — no per-model quota limits
        L.push('');
        L.push(t('quota.model_access_title'));
        L.push('━'.repeat(22));
        L.push(t('quota.unlimited'));
        L.push(t('quota.unlimited_desc'));
    } else {
        L.push('');
        L.push(t('quota.no_data'));
    }

    // ── Detailed Quota Groups ──
    const groups = quotaData.quota_groups || [];
    if (groups.length > 0) {
        // Helper to format ISO resetTime string to a relative string (e.g., '2d 9h' or '3h 8m')
        const formatRelativeTime = (isoString) => {
            if (!isoString) return '';
            const diffMs = new Date(isoString) - Date.now();
            if (diffMs <= 0) return 'now';

            const diffSecs = Math.floor(diffMs / 1000);
            const diffMins = Math.floor(diffSecs / 60);
            const diffHours = Math.floor(diffMins / 60);
            const diffDays = Math.floor(diffHours / 24);

            if (diffDays > 0) {
                const remainingHours = diffHours % 24;
                return `${diffDays}d ${remainingHours}h`;
            }
            if (diffHours > 0) {
                const remainingMins = diffMins % 60;
                return `${diffHours}h ${remainingMins}m`;
            }
            return `${diffMins}m`;
        };

        L.push('');
        L.push(t('quota.detailed_quota_title'));
        L.push('━'.repeat(22));

        for (const group of groups) {
            L.push(`<b>${group.display_name}</b>`);
            if (group.description) {
                L.push(`<i>${group.description}</i>`);
            }

            for (const bucket of group.buckets) {
                const pct = Math.round(bucket.remaining_fraction * 100);
                const resetStr = formatRelativeTime(bucket.reset_time);

                L.push(`  • <b>${bucket.display_name || bucket.bucket_id}</b>`);

                // 8-segment bar: █ = filled, ░ = empty
                const filled = Math.round(bucket.remaining_fraction * 8);
                const bar = '█'.repeat(filled) + '░'.repeat(8 - filled);

                L.push(`    <code>${bar}</code>  <b>${pct}%</b>`);
                if (resetStr) {
                    L.push(t('quota.reset_relative', { time: resetStr }));
                }
            }
        }
    }

    // ── Token status ──
    // Access tokens expire every ~60 min, but a refresh_token makes the account
    // effectively unlimited — ensureFreshToken() auto-refreshes before every operation.
    const hasRefreshToken = !!(account.token?.refresh_token);
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = account.token?.expiry_timestamp || 0;

    let tokenStatus;
    if (hasRefreshToken) {
        // Account is permanently active — access token auto-refreshes
        tokenStatus = t('quota.token_status_active');
    } else if (expiresAt === 0) {
        tokenStatus = t('quota.token_status_unknown');
    } else {
        // No refresh token; access token only — show countdown
        const minsLeft = Math.max(0, Math.round((expiresAt - now) / 60));
        tokenStatus = minsLeft > 30
            ? t('quota.token_status_valid', { mins: minsLeft })
            : (minsLeft > 5
                ? t('quota.token_status_expiring', { mins: minsLeft })
                : t('quota.token_status_expired'));
    }

    L.push('');
    L.push('━'.repeat(22));
    L.push(`🔑 ${tokenStatus}`);

    return L.join('\n');
}

/**
 * Complete a pending login flow with an authorization code.
 * Called either by the OAuth server (auto, same-machine) or by manual paste (mobile).
 */
async function completePendingLogin(chatId, code) {
    const session = pendingLogins.get(chatId);
    if (!session) {
        return false;
    }
    try {
        await session.oauthServer.stop();
    } catch { /* ignore */ }

    // Make sure we decode special symbols (like %2F -> /) properly
    let decodedCode = code;
    try {
        decodedCode = decodeURIComponent(code);
    } catch (_) {}

    // Directly trigger processing of the code asynchronously without blocking the event loop
    processAuthCode(chatId, decodedCode, session.redirectUri).catch(err => {
        console.error('[bot] processAuthCode async error:', err);
    });
    return true;
}

/**
 * Exchange auth code, retrieve user info, save account, fetch quota, and inject credentials.
 */
async function processAuthCode(chatId, authCode, redirectUri) {
    const processingMsg = await bot.telegram.sendMessage(chatId, t('login.authenticating'), { parse_mode: 'HTML' });

    try {
        // Exchange code for tokens
        accountManager.logInfo(`[bot] Exchanging code with redirect_uri: ${redirectUri}`);
        const tokenResp = await accountManager.exchangeCode(authCode, redirectUri);
        accountManager.logInfo(`[bot] Code exchanged successfully. Access token retrieved.`);

        // Get user info
        accountManager.logInfo(`[bot] Fetching user info...`);
        const userInfo = await accountManager.getUserInfo(tokenResp.access_token);
        accountManager.logInfo(`[bot] User info retrieved: email=${userInfo.email}`);

        // Save account
        const accounts = accountManager.loadAccounts();
        const existing = Object.values(accounts).find(
            a => a.email.toLowerCase() === userInfo.email.toLowerCase()
        );

        const now = Math.floor(Date.now() / 1000);
        const numericId = existing ? existing.numericId : accountManager.getNextNumericId(accounts);

        const account = {
            numericId,
            email: userInfo.email,
            name: userInfo.name || userInfo.email,
            addedAt: existing ? existing.addedAt : now,
            updatedAt: now,
            token: {
                access_token: tokenResp.access_token,
                refresh_token: tokenResp.refresh_token || (existing ? existing.token.refresh_token : ''),
                expires_in: tokenResp.expires_in || 3600,
                expiry_timestamp: now + (tokenResp.expires_in || 3600),
                token_type: tokenResp.token_type || 'Bearer',
            },
            quota: null,
        };

        accounts[String(numericId)] = account;
        accountManager.saveAccounts(accounts);
        accountManager.logInfo(`[bot] Saved account #${numericId} for ${userInfo.email}`);

        // Try to fetch initial quota (non-fatal if it fails)
        try {
            accountManager.logInfo(`[bot] Fetching initial quota for account #${numericId}...`);
            const quotaData = await accountManager.fetchQuota(tokenResp.access_token);
            accounts[String(numericId)].quota = quotaData;
            accountManager.saveAccounts(accounts);
            accountManager.logInfo(`[bot] Initial quota fetched and saved.`);
        } catch (e) {
            accountManager.logInfo(`[bot] Best-effort initial quota fetch failed: ${e.message}`);
        }

        // Try to inject credentials into IDE
        try {
            accountManager.logInfo(`[bot] Injecting credentials to IDE...`);
            await accountManager.injectTokenIntoIde(account, "ide");
            accountManager.logInfo(`[bot] Injected successfully to IDE`);
        } catch (e) {
            accountManager.logInfo(`[bot] IDE injection warning: ${e.message}`);
        }

        // Try to inject credentials into Agent
        try {
            accountManager.logInfo(`[bot] Injecting credentials to Agent...`);
            await accountManager.injectTokenIntoIde(account, "agent");
            accountManager.logInfo(`[bot] Injected successfully to Agent`);
        } catch (e) {
            accountManager.logInfo(`[bot] Agent injection warning: ${e.message}`);
        }

        pendingLogins.delete(chatId); 

        const action = existing ? 'updated' : 'added';
        accountManager.logInfo(`[bot] Sign-in complete for #${numericId}. Editing Telegram message.`);
        await bot.telegram.editMessageText(chatId, processingMsg.message_id, undefined,
            [
                t('login.success_title'),
                '━'.repeat(22),
                t('login.success_body', { name: userInfo.name || userInfo.email, email: userInfo.email, numericId, action }),
            ].join('\n'),
            { parse_mode: 'HTML' }
        );

    } catch (e) {
        pendingLogins.delete(chatId); 
        console.error('[processAuthCode] Unexpected error:', e.message, e.stack);
        await bot.telegram.editMessageText(chatId, processingMsg.message_id, undefined,
            [
                '❌ <b>' + (t('login.failed').split('\n')[0] || 'Authentication failed') + '</b>',
                '',
                `<code>${e.message}</code>`,
            ].join('\n'), { parse_mode: 'HTML' }).catch(() => {});
    }
}

// ── /login ────────────────────────────────────────────────────────────────────

bot.command('login', async (ctx) => {
    const chatId = ctx.chat.id;
    accountManager.logInfo(`[bot] /login command received from chatId: ${chatId}. Sending warning.`);

    const warningMsg = [
        '⚠️ <b>Google Login Notice</b>',
        '━'.repeat(22),
        'Starting the login flow will temporarily suspend other bot commands.',
        'The AI Agent will continue running in your IDE in the background.',
        '',
        'Do you want to proceed?',
    ].join('\n');

    const keyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback('👉 Yes, Continue', `login_confirm_${chatId}`),
            Markup.button.callback('✖ Cancel', `login_cancel_${chatId}`)
        ]
    ]);

    await ctx.reply(warningMsg, { parse_mode: 'HTML', ...keyboard });
});

bot.action(/^login_confirm_(\d+)$/, async (ctx) => {
    const chatId = parseInt(ctx.match[1]);
    accountManager.logInfo(`[bot] Login confirmed for chatId: ${chatId}. Initiating OAuth callback server...`);
    
    await ctx.answerCbQuery('Starting secure login...').catch(() => {});

    // Cancel any existing pending login for this chat
    if (pendingLogins.has(chatId)) {
        accountManager.logInfo(`[bot] Cancelling existing pending login session for chatId: ${chatId}`);
        const old = pendingLogins.get(chatId);
        pendingLogins.delete(chatId);
        try { await old.oauthServer.stop(); } catch { /* ignore */ }
    }

    let statusMsg;
    try {
        statusMsg = await ctx.editMessageText('🔄 <b>Starting secure login…</b>', { parse_mode: 'HTML' });
    } catch {
        statusMsg = await ctx.reply(t('login.starting'), { parse_mode: 'HTML' });
    }

    try {
        // 1. Start OAuth callback server
        accountManager.logInfo(`[bot] Starting OAuth server...`);
        let oauthServer;
        try {
            oauthServer = await accountManager.startOAuthServer(
                async (code) => {
                    accountManager.logInfo(`[bot] OAuth server captured code for chatId: ${chatId}`);
                    await completePendingLogin(chatId, code);
                },
                async (errMsg) => {
                    accountManager.logInfo(`[bot] OAuth server error callback for chatId: ${chatId}: ${errMsg}`);
                    const session = pendingLogins.get(chatId);
                    if (session) {
                        pendingLogins.delete(chatId);
                        await bot.telegram.sendMessage(chatId, t('login.server_error', { error: errMsg }), { parse_mode: 'HTML' }).catch(() => {});
                    }
                }
            );
        } catch (e) {
            accountManager.logInfo(`[bot] Failed to start OAuth server: ${e.message}`);
            await ctx.telegram.editMessageText(chatId, statusMsg.message_id, undefined,
                [
                    '❌ <b>Login server error</b>',
                    '',
                    `<code>${e.message}</code>`,
                ].join('\n'), { parse_mode: 'HTML' });
            return;
        }

        const redirectUri = `http://localhost:${oauthServer.port}/oauth-callback`;
        const authUrl = accountManager.buildAuthUrl(redirectUri);
        accountManager.logInfo(`[bot] Auth URL built: redirect_uri=${redirectUri}`);

        // Register the pending session (with a 10-minute timeout)
        pendingLogins.set(chatId, { oauthServer, redirectUri, tryCount: 0 });
        
        setTimeout(async () => {
            if (pendingLogins.has(chatId)) {
                pendingLogins.delete(chatId);
                try { await oauthServer.stop(); } catch { /* ignore */ }
                await bot.telegram.sendMessage(chatId, t('login.timeout'), { parse_mode: 'HTML' }).catch(() => {});
            }
        }, 10 * 60 * 1000);

        // Send the login link
        const loginMsg = [
            '🔐 <b>Sign in with Google</b>',
            '━'.repeat(22),
            'Tap the button below to sign in with your',
            'Google account and connect it to this bot.',
            '',
            '📱 <b>On mobile?</b>',
            'If your browser shows a connection error after',
            'signing in, just copy the <b>full URL</b> from',
            'the address bar and paste it here.',
            '',
            '⏱  Expires in <b>10 minutes</b>',
        ].join('\n');

        const keyboard = Markup.inlineKeyboard([
            [Markup.button.url('🔒 Sign in with Google', authUrl)],
            [Markup.button.callback('❌ Cancel Login', `login_cancel_${chatId}`)],
        ]);

        try {
            await ctx.telegram.editMessageText(chatId, statusMsg.message_id, undefined,
                loginMsg, { parse_mode: 'HTML', ...keyboard });
        } catch {
            await ctx.reply(loginMsg, { parse_mode: 'HTML', ...keyboard });
        }

    } catch (e) {
        console.error('[/login] Unexpected error:', e.message, e.stack);
        ctx.reply([
            '❌ <b>Something went wrong</b>',
            '',
            `<code>${e.message}</code>`,
        ].join('\n'), { parse_mode: 'HTML' }).catch(() => {});
    }
});

// Cancel login inline button
bot.action(/^login_cancel_(\d+)$/, async (ctx) => {
    const chatId = parseInt(ctx.match[1]);
    if (pendingLogins.has(chatId)) {
        const session = pendingLogins.get(chatId);
        pendingLogins.delete(chatId);
        try { await session.oauthServer.stop(); } catch { /* ignore */ }
    }
    await ctx.answerCbQuery('🚫 Cancelled');
    await ctx.editMessageText([
        '🚫 <b>Login cancelled</b>',
        '',
        'Send /login whenever you\'re ready to try again.',
    ].join('\n'), { parse_mode: 'HTML' }).catch(() => {});
});

// ── /logincode ────────────────────────────────────────────────────────────────
// Explicit code submission for mobile users who cannot reach localhost.

bot.command('logincode', async (ctx) => {
    const chatId = ctx.chat.id;
    const rawInput = ctx.message.text.split(' ').slice(1).join(' ').trim();

    if (!rawInput) {
        return ctx.reply(t('login.code_usage'), { parse_mode: 'HTML' });
    }

    // Extract code from full URL or bare code
    let code = rawInput;
    const match = rawInput.match(/[?&]code=([^&\s]+)/);
    if (match) {
        code = match[1];
    }

    if (!pendingLogins.has(chatId)) {
        return ctx.reply(t('login.no_active_session'), { parse_mode: 'HTML' });
    }

    const completed = await completePendingLogin(chatId, code);
    if (!completed) {
        return ctx.reply(t('login.no_active_session_short'), { parse_mode: 'HTML' });
    }
    await ctx.reply(t('login.code_received'), { parse_mode: 'HTML' });
});

// ── /accounts ─────────────────────────────────────────────────────────────────

bot.command('accounts', async (ctx) => {
    const accounts = accountManager.loadAccounts();
    const entries = Object.values(accounts).sort((a, b) => a.numericId - b.numericId);

    if (entries.length === 0) {
        return ctx.reply(
            [
                '📭 <b>No accounts saved yet</b>',
                '',
                'Use /login to add a Google account.',
            ].join('\n'),
            { parse_mode: 'HTML' }
        );
    }

    const now = Math.floor(Date.now() / 1000);
    const L = [
        `🔐 <b>Saved Accounts</b>  (${entries.length})`,
        '━'.repeat(22),
    ];

    for (const acc of entries) {
        const addedDate = new Date(acc.addedAt * 1000).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric',
        });
        const isExpired = acc.token.expiry_timestamp < now;
        const dot = isExpired ? '🔴' : '🟢';
        const expiredNote = isExpired ? '  <i>(expired — /login)</i>' : '';
        L.push(`${dot} <b>#${acc.numericId}</b>  —  ${acc.email}${expiredNote}`);
        L.push(`   📅 Added ${addedDate}`);
    }

    L.push('');
    L.push('<i>Commands</i>');
    L.push(`• <code>/switchacc &lt;id&gt;</code>  —  switch account`);
    L.push(`• <code>/getinfo &lt;id&gt;</code>  —  view quota`);
    L.push(`• <code>/login</code>  —  add another account`);

    await ctx.reply(L.join('\n'), { parse_mode: 'HTML' });
});

// ── /switchacc ────────────────────────────────────────────────────────────────

/**
 * Build the message text for the /switchacc live progress card.
 * Keeps the header constant so Telegram can edit it smoothly.
 */
function buildSwitchStatus(account, steps) {
    return [
        t('switchacc.title', { id: account.numericId }),
        t('switchacc.email', { email: account.email }),
        '━'.repeat(22),
        ...steps,
    ].join('\n');
}

/**
 * Wait for the specified Antigravity app to fully exit.
 * Polls isIDERunning() at 500ms intervals for up to timeoutMs (default 8s).
 * Mirrors AntigravityManager's _waitForProcessExit() in handler.ts.
 *
 * @param {string} app - 'agent' or 'ide'
 * @param {number} [timeoutMs=8000]
 * @returns {Promise<boolean>} true if the process exited, false if timeout
 */
async function waitForProcessDead(app, timeoutMs = 8000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const running = await isIDERunning(app);
        if (!running) {
            return true;
        }
        await new Promise(r => setTimeout(r, 500));
    }
    // Timeout — process may still be alive, but we proceed anyway
    return false;
}

bot.command('switchacc', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    const idArg = parts[1] ? parts[1].replace(/^#/, '').trim() : null;

    if (!idArg || isNaN(Number(idArg))) {
        return ctx.reply(t('switchacc.usage'), { parse_mode: 'HTML' });
    }

    const accounts = accountManager.loadAccounts();
    const account = accountManager.findAccount(accounts, idArg);

    if (!account) {
        return ctx.reply(t('switchacc.not_found', { id: idArg }), { parse_mode: 'HTML' });
    }

    // The preferred app to kill and restart; defaults to 'ide' since the user
    // has ANTIGRAVITY_PREFERRED_APP=ide — but credential injection targets both.
    const app = process.env.ANTIGRAVITY_PREFERRED_APP || 'ide';

    const statusMsg = await ctx.reply(
        [
            t('switchacc.title', { id: account.numericId }),
            t('switchacc.email', { email: account.email }),
            '━'.repeat(22),
        ].join('\n'),
        { parse_mode: 'HTML' }
    );

    const steps = [];
    const editStatus = async (text) => {
        try {
            await ctx.telegram.editMessageText(
                ctx.chat.id, statusMsg.message_id, undefined,
                text, { parse_mode: 'HTML' }
            );
        } catch { /* ignore edit failures */ }
    };

    try {
        // Step 1 — Refresh token if needed
        // Mirrors AntigravityManager's pre-switch token refresh in switchCloudAccount()
        steps.push(t('switchacc.step_refreshing'));
        await editStatus(buildSwitchStatus(account, steps));

        const { account: freshAccount, refreshed } = await accountManager.ensureFreshToken(account);
        if (refreshed) {
            // Always persist refreshed tokens by the accounts-map key (idArg),
            // not just by numericId, to avoid stale token on next use.
            accounts[String(idArg)] = freshAccount;
            accountManager.saveAccounts(accounts);
            steps[steps.length - 1] = t('switchacc.step_refreshed');
        } else {
            steps[steps.length - 1] = t('switchacc.step_valid');
        }
        await editStatus(buildSwitchStatus(account, steps));

        // Step 2 — Kill Antigravity (preferred app only)
        // Mirrors AntigravityManager's closeAntigravity(appTarget) call
        steps.push(t('switchacc.step_stopping', { app }));
        await editStatus(buildSwitchStatus(account, steps));

        const wasRunning = await isIDERunning(app);
        if (wasRunning) {
            await killIDE(app);
            // Wait for the process to fully exit before injecting credentials
            // Mirrors AntigravityManager's _waitForProcessExit(10_000ms, 100ms)
            const exited = await waitForProcessDead(app, 8000);
            steps[steps.length - 1] = exited
                ? t('switchacc.step_stopped', { app })
                : t('switchacc.step_still_closing', { app });
        } else {
            steps[steps.length - 1] = t('switchacc.step_not_running', { app });
        }
        await editStatus(buildSwitchStatus(account, steps));

        // Step 3 — Inject credentials into the preferred app's state.vscdb
        // Per config: targets only the preferred app (ANTIGRAVITY_PREFERRED_APP).
        // Falls back to OS credential store if SQLite injection fails.
        steps.push(t('switchacc.step_writing'));
        await editStatus(buildSwitchStatus(account, steps));

        try {
            await accountManager.injectTokenIntoIde(freshAccount, app);
            steps[steps.length - 1] = t('switchacc.step_written', { app });
        } catch (injErr) {
            // SQLite injection failed — fall back to OS credential store
            try {
                await accountManager.writeToCredentialStore(freshAccount.token);
                steps[steps.length - 1] = t('switchacc.step_written_keyring', { error: injErr.message.slice(0, 50) });
            } catch (credErr) {
                steps[steps.length - 1] = t('switchacc.step_write_failed', { error: injErr.message.slice(0, 60) });
            }
        }
        await editStatus(buildSwitchStatus(account, steps));

        // Step 4 — Restart Antigravity (same preferred app that was killed)
        // Mirrors AntigravityManager's startAntigravity(appTarget) call
        steps.push(t('switchacc.step_starting', { app }));
        await editStatus(buildSwitchStatus(account, steps));

        const appPort = getCDPPort(app);
        try {
            cleanLockFile(app);
            await launchIDE(null, appPort, app);
            steps[steps.length - 1] = t('switchacc.step_started', { app });
        } catch (e) {
            steps[steps.length - 1] = t('switchacc.step_start_failed', { app, error: e.message.slice(0, 70) });
        }

        // Step 5 — Done
        steps.push('━'.repeat(22));
        steps.push(t('switchacc.step_done', { id: account.numericId }));
        steps.push(t('switchacc.step_done_email', { email: account.email }));
        await editStatus(buildSwitchStatus(account, steps));

    } catch (e) {
        console.error('[/switchacc] Error:', e.message);
        steps.push('━'.repeat(22));
        steps.push(t('switchacc.error', { error: e.message }));
        await editStatus(buildSwitchStatus(account, steps));
    }
});

// ── /getinfo ──────────────────────────────────────────────────────────────────

bot.command('getinfo', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    const idArg = parts[1] ? parts[1].replace(/^#/, '').trim() : null;

    const accounts = accountManager.loadAccounts();
    const allAccounts = Object.values(accounts).sort((a, b) => a.numericId - b.numericId);

    if (allAccounts.length === 0) {
        return ctx.reply(t('quota.no_accounts'), { parse_mode: 'HTML' });
    }

    // Default to account #1 if no ID given
    let account;
    if (!idArg) {
        account = allAccounts[0];
    } else if (isNaN(Number(idArg))) {
        return ctx.reply(t('quota.usage'), { parse_mode: 'HTML' });
    } else {
        account = accountManager.findAccount(accounts, idArg);
    }

    if (!account) {
        return ctx.reply(t('quota.not_found', { id: idArg }), { parse_mode: 'HTML' });
    }

    setReaction(ctx, REACTION.THINKING);
    const loadingMsg = await ctx.reply(t('quota.fetching'), { parse_mode: 'HTML' });

    try {
        // Refresh token if needed
        const { account: freshAccount, refreshed } = await accountManager.ensureFreshToken(account);
        if (refreshed) {
            accounts[String(account.numericId)] = freshAccount;
            accountManager.saveAccounts(accounts);
            account = freshAccount;
        }

        // Fetch fresh quota
        let quotaData = account.quota || {};
        try {
            quotaData = await accountManager.fetchQuota(account.token.access_token);
            accounts[String(account.numericId)].quota = quotaData;
            accountManager.saveAccounts(accounts);
        } catch (e) {
            console.warn('[/getinfo] Quota fetch failed:', e.message);
        }

        const html = formatQuotaHtml(account, quotaData);

        await ctx.telegram.editMessageText(
            ctx.chat.id, loadingMsg.message_id, undefined,
            html,
            { parse_mode: 'HTML' }
        );
        setReaction(ctx, REACTION.SUCCESS);

    } catch (e) {
        console.error('[/getinfo] Error:', e.message);
        setReaction(ctx, null);
        await ctx.telegram.editMessageText(
            ctx.chat.id, loadingMsg.message_id, undefined,
            t('quota.fetch_failed', { error: e.message }),
            { parse_mode: 'HTML' }
        ).catch(() => {});
    }
});

// ── /delacc ─────────────────────────────────────────────────────────────────

bot.command('delacc', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    const idArg = parts[1] ? parts[1].replace(/^#/, '').trim() : null;

    if (!idArg || isNaN(Number(idArg))) {
        return ctx.reply(
            [
                'ℹ️ <b>Usage</b>',
                '━'.repeat(22),
                '<code>/delacc &lt;id&gt;</code>',
                '',
                'Example: <code>/delacc 2</code>',
                'Use /accounts to see your account IDs.',
            ].join('\n'),
            { parse_mode: 'HTML' }
        );
    }

    const accounts = accountManager.loadAccounts();
    const account = accountManager.findAccount(accounts, idArg);

    if (!account) {
        return ctx.reply(
            [
                `❌ <b>Account #${idArg} not found</b>`,
                '',
                'Use /accounts to see your saved accounts.',
            ].join('\n'),
            { parse_mode: 'HTML' }
        );
    }

    // Ask for confirmation before deleting
    const confirmKeyboard = Markup.inlineKeyboard([
        [
            Markup.button.callback(`🗑 Yes, delete #${account.numericId}`, `delacc_confirm_${account.numericId}`),
            Markup.button.callback('✖ Cancel', `delacc_cancel_${account.numericId}`),
        ],
    ]);

    await ctx.reply(
        [
            `⚠️ <b>Delete Account #${account.numericId}?</b>`,
            '━'.repeat(22),
            `👤 <b>${account.name || account.email}</b>`,
            `📧 <code>${account.email}</code>`,
            '',
            'This removes the saved token from this bot.',
            '<i>Antigravity itself will not be affected.</i>',
        ].join('\n'),
        { parse_mode: 'HTML', ...confirmKeyboard }
    );
});

// Confirmation: delete
bot.action(/^delacc_confirm_(\d+)$/, async (ctx) => {
    const numericId = parseInt(ctx.match[1]);
    await ctx.answerCbQuery();

    const accounts = accountManager.loadAccounts();
    const account = accountManager.findAccount(accounts, String(numericId));

    if (!account) {
        return ctx.editMessageText(
            [
                `❌ <b>Account #${numericId} not found</b>`,
                '',
                'It may have already been deleted.',
            ].join('\n'),
            { parse_mode: 'HTML' }
        ).catch(() => {});
    }

    const email = account.email;

    // Check and log out from active IDE/Agent if the email matches
    let loggedOutApps = [];
    for (const app of ['ide', 'agent']) {
        try {
            const activeEmail = await accountManager.getActiveEmail(app);
            if (activeEmail && activeEmail.toLowerCase() === email.toLowerCase()) {
                await accountManager.logoutIde(app);
                loggedOutApps.push(app.toUpperCase());
            }
        } catch (e) {
            console.error(`[delacc logout] Error checking/logging out of ${app}:`, e.message);
        }
    }

    delete accounts[String(numericId)];
    accountManager.saveAccounts(accounts);

    const remaining = Object.keys(accounts).length;
    
    let logoutNote = '';
    if (loggedOutApps.length > 0) {
        logoutNote = `\n🔓 <b>Session Invalidated</b>: Logged out active session in ${loggedOutApps.join(' & ')}.\n`;
    }

    await ctx.editMessageText(
        [
            `🗑 <b>Account #${numericId} deleted</b>`,
            '━'.repeat(22),
            `📧 ${email}`,
            logoutNote,
            remaining > 0
                ? `${remaining} account${remaining !== 1 ? 's' : ''} remaining. Use /accounts to view them.`
                : 'No accounts remain. Use /login to add one.',
        ].join('\n'),
        { parse_mode: 'HTML' }
    ).catch(() => {});
});

// Confirmation: cancel
bot.action(/^delacc_cancel_(\d+)$/, async (ctx) => {
    await ctx.answerCbQuery('Cancelled');
    await ctx.editMessageText(
        [
            '✖ <b>Deletion cancelled</b>',
            '',
            'Account was not deleted.',
        ].join('\n'),
    ).catch(() => {});
});

init();

// --- Start Heartbeat for Watchdog Agent ---
const HEARTBEAT_FILE = path.join(__dirname, '..', '.heartbeat');
function startHeartbeat() {
    const updateHeartbeat = () => {
        try {
            fs.writeFileSync(HEARTBEAT_FILE, Date.now().toString(), 'utf8');
        } catch (e) {
            console.error('[heartbeat] Failed to write heartbeat:', e.message);
        }
    };
    updateHeartbeat();
    setInterval(updateHeartbeat, 30000); // update every 30 seconds
}
startHeartbeat();

// Enable graceful stop
const handleExit = async (signal) => {
    console.log(`\nReceived ${signal}. Stopping bot polling...`);
    if (global.__taskWatcher) global.__taskWatcher.stop();
    if (activeArtifactWatcher) {
        try { activeArtifactWatcher.close(); } catch (_) {}
    }
    try {
        // Fire-and-forget: bot.stop() may never resolve during long-polling,
        // but calling it triggers the internal cleanup (webhook delete, offset commit).
        // We wait a fixed delay to let the HTTP request complete.
        bot.stop(signal);
        await new Promise(r => setTimeout(r, 1500));
        console.log('Bot polling stopped cleanly.');
    } catch (_) {}
    // NOTE: We intentionally do NOT call cleanupAll() here.
    // PM2 restarts should not kill running Antigravity apps.
    // Use /restart command for explicit app cleanup.
    process.exit(0);
};


process.once('SIGINT', () => handleExit('SIGINT'));
process.once('SIGTERM', () => handleExit('SIGTERM'));
