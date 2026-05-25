require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Telegraf, Markup } = require('telegraf');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { loadLocale, t, getLang } = require('./i18n');
const { config, isIDERunning, killIDE, cleanLockFile, launchIDE, trustWorkspaceViaCDP, PLATFORM } = require('./platform');
const { isAgentWorking, getFullLatestResponse, snapshotChatState, captureAgentScreenshot, captureFullIDEScreenshot, waitForAgentResponse, sendViaCDP, triggerNewChat, triggerModelMenu, getAvailableModels, selectModel, getCurrentModel, stopAgent, getQuota, listWindows, setPreferredWindow, getPreferredWindow, getPreferredTargetId, getCachedWindows, closeWindow, listAgentThreads, switchAgentThread, getActiveThreadId, getActiveThreadInfo, setActiveWorkspace, switchStandaloneWorkspace } = require('./cdp_controller');
const autoaccept = require('./autoaccept');
const updater = require('./updater');
const { runTurboOrchestration } = require('./turbo_orchestrator');

const TURBO_STATE_FILE = path.join(os.homedir(), '.gemini', 'antigravity', 'turbo_state.json');

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
function getCDPPort(app = process.env.ANTIGRAVITY_PREFERRED_APP || 'agent') {
    if (app === 'ide') {
        return parseInt(process.env.IDE_CDP_PORT || '9334', 10);
    }
    return parseInt(process.env.AGENT_CDP_PORT || process.env.DEBUGGING_PORT || '9333', 10);
}
let CDP_PORT = getCDPPort();

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
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
    html = html.replace(/\[x\]/ig, '✅');
    html = html.replace(/\[ \]/g, '⬜');
    html = html.replace(/\[\/\]/g, '🔄');
    return html;
}

// Helper: Send long messages safely within Telegram's 4096 char limit
async function sendLongMessage(ctx, text, prefix = '', buttons = null, replyToMsgId = null) {
    const MAX_LEN = 3500;
    
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
                const sentMsg = await replyWithRetry(currentChunk, false, buttons, 3, currentReplyId);
                if (sentMsg) {
                    currentReplyId = sentMsg.message_id;
                    sentMsgIds.push(sentMsg.message_id);
                }
                currentChunk = inPre ? (preLang ? `<pre><code class="language-${preLang}">\n` : '<pre>\n') : '';
            }
            currentChunk += line + '\n';
        }
        if (currentChunk.trim().length > 0) {
            const sentMsg = await replyWithRetry(currentChunk, false, buttons, 3, currentReplyId);
            if (sentMsg) sentMsgIds.push(sentMsg.message_id);
        }
        console.log(`sendLongMessage: Sent successfully`);
        return sentMsgIds;
    } catch (err) {
        console.error('sendLongMessage final error:', err.message);
        return [];
    }
}

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

function checkAuth(ctx, next) {
    if (ALLOWED_CHAT_IDS.length === 0) {
        console.log(`\n🔔 NEW CHAT ID DETECTED: ${ctx.chat.id}`);
        console.log(`Please add ALLOWED_CHAT_ID=${ctx.chat.id} to your .env file and restart.\n`);
        return ctx.reply(`Welcome! Your Chat ID is: ${ctx.chat.id}\nPlease add it to the .env file as ALLOWED_CHAT_ID and restart the bot.`).catch(e => console.error('[checkAuth]', e.message));
    }
    if (!ALLOWED_CHAT_IDS.includes(ctx.chat.id.toString())) {
        const from = ctx.from || ctx.chat;
        if (from && ALLOWED_CHAT_IDS.length > 0) {
            const username = from.username ? `@${from.username}` : 'Yok';
            const fullName = `${from.first_name || ''} ${from.last_name || ''}`.trim() || 'İsimsiz';
            
            let actionDetails = `Eylem: ${ctx.updateType || 'Bilinmiyor'}`;
            if (ctx.message && ctx.message.text) actionDetails = `Mesaj: "${ctx.message.text}"`;
            else if (ctx.callbackQuery) actionDetails = `Buton: ${ctx.callbackQuery.data}`;

            const alertMsg = `⚠️ <b>Yetkisiz Erişim Denemesi!</b>\n\n👤 <b>Kişi:</b> ${fullName}\n🔖 <b>Kullanıcı Adı:</b> ${username}\n🆔 <b>ID:</b> <code>${from.id}</code>\n💬 <b>${actionDetails}</b>`;
            ctx.telegram.sendMessage(ALLOWED_CHAT_IDS[0], alertMsg, { parse_mode: 'HTML' }).catch(e => console.error('[checkAuth Alert]', e.message));
        }
        // Silently ignore unauthorized access to prevent errors if the user blocked the bot
        return Promise.resolve();
    }
    return next();
}

bot.use(checkAuth);

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
    await cleanupAll();
    process.exit(0);
});

bot.help((ctx) => {
    const helpMessage = `
${t('help.title')}

${t('help.messaging_title')}
${t('help.messaging_text')}

${t('help.status_title')}
${t('help.status_text')}

${t('help.ide_title')}
${t('help.ide_text')}

${t('help.chat_title')}
${t('help.chat_text')}
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
    ctx.reply(t('ide.starting'));
    try {
        const appPort = getCDPPort(app);
        await launchIDE(null, appPort, app);
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
    ctx.reply(t('standalone.starting'));
    try {
        const appPort = getCDPPort(app);
        await launchIDE(null, appPort, app);
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
            ctx.reply(`❌ Başlatma hatası: ${err.message}`);
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
    ctx.reply(t('ide.closing'));
    await killIDE(app);
    ctx.reply(t('ide.closed'));
});

bot.command('close_ag', async (ctx) => {
    const app = 'agent';
    const running = await isIDERunning(app);
    if (!running) {
        cleanLockFile(app);
        return ctx.reply(t('standalone.already_closed'));
    }
    ctx.reply(t('standalone.closing'));
    await killIDE(app);
    ctx.reply(t('standalone.closed'));
});

bot.command('close', async (ctx) => {
    ctx.reply(t('close.select_prompt'));
});

bot.command('close_window', async (ctx) => {
    ctx.reply(t('ide.closing_window') || '🪟 Pencere kapatılıyor...');
    const success = await closeWindow(CDP_PORT);
    if (success) {
        ctx.reply(t('ide.window_closed') || '✅ Pencere başarıyla kapatıldı.');
    } else {
        ctx.reply(t('ide.window_close_failed') || '❌ Pencere kapatılamadı. Açık pencere yok mu?');
    }
});

const handleStatus = async (ctx) => {
    let msg = '📊 <b>Antigravity Bot Durum Raporu</b>\n\n';
    
    const agentCheck = await isIDERunning('agent');
    const ideCheck = await isIDERunning('ide');
    
    msg += `🤖 <b>Antigravity Standalone:</b> ${agentCheck ? '🟢 ÇALIŞIYOR' : '🔴 KAPALI'}\n`;
    msg += `💻 <b>Antigravity IDE (Classic):</b> ${ideCheck ? '🟢 ÇALIŞIYOR' : '🔴 KAPALI'}\n`;
    
    const activeApp = process.env.ANTIGRAVITY_PREFERRED_APP || 'agent';
    msg += `🎯 <b>Tercih Edilen Uygulama:</b> <code>${activeApp === 'agent' ? 'Standalone' : 'Classic IDE'}</code>\n\n`;
    
    try {
        await getActiveThreadId(CDP_PORT);
        msg += '⚡ <b>CDP Otomasyonu:</b> 🟢 AKTİF\n';
    } catch {
        msg += '⚡ <b>CDP Otomasyonu:</b> 🔴 PASİF (CDP bağlantısı kurulamadı)\n';
    }
    
    msg += '🤖 <b>Telegram Bot:</b> 🟢 AKTİF\n';
    
    try {
        const activeInfo = await getActiveThreadInfo(CDP_PORT);
        if (activeInfo) {
            msg += `\n💬 <b>Aktif Sohbet Detayları:</b>\n`;
            msg += `- Proje Alanı: <code>${activeInfo.workspace}</code>\n`;
            msg += `- Ajan Başlığı: <code>${activeInfo.name}</code>\n`;
            const currentModel = await getCurrentModel(CDP_PORT);
            if (currentModel) msg += `- Seçili Model: <code>${currentModel}</code>\n`;
            const isWorking = await isAgentWorking(CDP_PORT);
            msg += `- Ajan Durumu: <b>${isWorking ? '🔄 Çalışıyor (Meşgul)' : '💤 Beklemede (Idle)'}</b>\n`;
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
            return `📁 ${wsName}\n🤖 ${thName}\n<i>(Bu ajanı yanıtlamak için mesajı sola kaydırın)</i>`;
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
    let modelName = t('menu.model_not_selected') || 'Model Seçilmedi';
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
            t('menu.btn_screenshot') || '📸 Ekran', 
            t('menu.btn_artifacts') || "📦 Artifact'ler", 
            isTurboMode ? (t('turbo.btn_on') || '🚀 Turbo ✅') : (t('turbo.btn_off') || '🚀 Turbo'), 
            t('menu.btn_latest') || '💬 Son Yanıt'
        ]
    ]).resize();
}

async function sendMainMenu(ctx, text = '🕹️ Kontrol Paneli:', overrideThread = null, overrideWorkspace = null, targetId = null) {
    const kb = await buildMainMenu(overrideThread, overrideWorkspace, targetId);
    return ctx.reply(text, kb);
}

async function pushMainMenuToUser(text, silent = false) {
    if (ALLOWED_CHAT_IDS.length === 0 || process.env.SETUP_MODE === 'true') return;
    const kb = await buildMainMenu();
    return Promise.all(ALLOWED_CHAT_IDS.map(id => bot.telegram.sendMessage(id, text, { ...kb, disable_notification: silent }).catch(() => {})));
}

bot.command('start', async (ctx) => {
    await sendMainMenu(ctx, '👋 Hoşgeldin! Panelin hazır:');
});

const handleLatest = async (ctx) => {
    try {
        let text = await getFullLatestResponse(CDP_PORT);
        const header = await getChatHeader(null, t('latest.title'));
        await sendLongMessage(ctx, text, header);
    } catch (err) {
        ctx.reply(t('latest.error', { error: err.message }));
    }
};

bot.command('latest', handleLatest);
bot.hears(/^💬/i, handleLatest);

const handleScreenshot = async (ctx) => {
    try {
        ctx.reply(t('screenshot.taking'));
        const buffer = await captureFullIDEScreenshot(CDP_PORT);
        await ctx.replyWithPhoto({ source: buffer });
    } catch (err) {
        ctx.reply(t('screenshot.error', { error: err.message }));
    }
};
bot.command('screenshot', handleScreenshot);
bot.hears(/^📸/i, handleScreenshot);

bot.command('quota', async (ctx) => {
    try {
        ctx.reply(t('quota.checking'));
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
            await ctx.reply(t('ask.sent'));

            // Wait briefly for message to render in DOM before anchoring state
            await new Promise(r => setTimeout(r, 1500));
            await snapshotChatState(CDP_PORT, targetId).catch(() => {});
            
            const isDone = await waitForAgentResponse(CDP_PORT, 450000, createProgressHandler(ctx));
            if (isDone) {
                let text = await getFullLatestResponse(CDP_PORT);
                text = stripQueryFromResponse(text, query);
                if (!text) text = t('ask.done_empty');
                const header = await getChatHeader(null, t('ask.done'));
                await sendLongMessage(ctx, text, header);
            } else {
                await ctx.reply(t('ask.timeout'));
            }
        } catch (err) {
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
        
        await sendLongMessage(ctx, output, t('cmd.output_title'));
    });
});

bot.command('stop', async (ctx) => {
    try {
        ctx.reply(t('stop.stopping'));
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
                await sendMainMenu(ctx, `✅ Sohbet değiştirildi: ${thread.name}`, thread.name, thread.workspace);
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
        const targetId = await switchAgentThread(CDP_PORT, thread.name);
        if (!targetId) {
            ctx.reply(t('agents.not_found') || '❌ Thread could not be selected.');
        } else {
            // Reset window preference and let it auto-detect the workspace
            setPreferredWindow(null);
            if (thread.workspace) {
                setActiveWorkspace(thread.workspace);
            }
            // Update lastResolvedThreadId so /latest reads from this thread
            await snapshotChatState(CDP_PORT, targetId).catch(() => {});
            // Menüyü yenile — buton yeni ajan ismini göstersin
            await sendMainMenu(ctx, `✅ Sohbet değiştirildi: ${thread.name}`, thread.name, thread.workspace);
        }
    } else {
        ctx.reply(t('agents.invalid_number') || '❌ Invalid thread number.');
    }
});

const handleArtifacts = async (ctx) => {
    try {
        const activeId = await getActiveThreadId(CDP_PORT);
        if (!activeId) {
            return ctx.reply(t('artifacts.no_active_thread') || '⚠️ No active thread found. Please select a thread in the IDE first.');
        }

        const appDataName = (process.env.ANTIGRAVITY_PREFERRED_APP || 'agent') === 'ide' ? 'antigravity-ide' : 'antigravity';
        const conversationDir = path.join(os.homedir(), '.gemini', appDataName, 'brain', activeId);
        if (!fs.existsSync(conversationDir)) {
            return ctx.reply(t('artifacts.no_artifacts') || 'ℹ️ No artifacts found for the current thread.');
        }

        cachedArtifacts = [];
        
        // Helper to check if a file should be listed as an artifact
        const ARTIFACT_EXTENSIONS = ['.md', '.png', '.jpg', '.jpeg', '.webp', '.mp4', '.mov', '.gif', '.pdf', '.txt', '.json', '.csv', '.html'];
        const isArtifactFile = (name) => {
            if (name.includes('.metadata.json') || name.includes('.resolved') || name.startsWith('.sys') || name.startsWith('.')) return false;
            return ARTIFACT_EXTENSIONS.some(ext => name.endsWith(ext));
        };

        // Helper to get file mtime safely
        const getMtime = (filePath) => {
            try { return fs.statSync(filePath).mtimeMs; } catch (_) { return 0; }
        };

        // 1. Primary: Scan artifacts/ subdirectory (new Antigravity UI structure)
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

        // 2. Also scan conversation root for stray files (e.g. browser recordings)
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

        let msg = t('artifacts.list_title') || '📎 <b>Artifacts for Current Thread:</b>\\n\\n';
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
            msg += `/artifact_${i + 1} - ${displayName}\n`;
        }
        
        ctx.reply(msg, { parse_mode: 'HTML' });
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
                await sendLongMessage(ctx, content);
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
            ctx.reply(t('model.selecting', { model: modelName }));
            const success = await selectModel(CDP_PORT, modelName);
            if (success) ctx.reply(t('model.changed', { model: modelName }));
            else ctx.reply(t('model.not_found'));
        } catch(e) {
            ctx.reply(t('stop.error', { error: e.message }));
        }
        return;
    }
    const models = [
        'Gemini 3.1 Pro (High)',
        'Gemini 3.5 Flash (High)',
        'Gemini 3.1 Pro (Low)',
        'Claude Sonnet 4.6 (Thinking)',
        'Claude Opus 4.6 (Thinking)',
        'GPT-OSS 120B (Medium)'
    ];
    
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
        ctx.reply(t('model.changing', { model: modelName }));
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
                [{ text: '⚡ ' + (autoaccept.isEnabled ? 'Kapat' : 'Aç'), callback_data: autoaccept.isEnabled ? 'aa_off' : 'aa_on' }],
                [{ text: '📊 Durum', callback_data: 'aa_status' }]
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
        ctx.reply(msg, { parse_mode: 'HTML' });
    } catch (e) {
        ctx.reply(t('autoaccept.error', { error: e.message }));
    }
});

// ===== WORKSPACE =====

function doLaunchWorkspace(ctx, workspace) {
    ctx.reply(t('workspace.switching', { workspace }));
    (async () => {
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
                        await sendMainMenu(ctx, t('workspace.started') || '📁 Çalışma alanı başarıyla değiştirildi!');
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
                        await sendMainMenu(ctx, t('workspace.started') || '📁 Çalışma alanı başarıyla değiştirildi!');
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
                await sendMainMenu(ctx, t('workspace.started'));
                // trustWorkspaceViaCDP removed — CDP intervention during startup
                // interrupts Electron's init/sync and prevents state.vscdb from saving
                
                // Clear preferred window when workspace changes
                setPreferredWindow(null);
                
                // Re-inject autoaccept into the new window immediately
                if (autoaccept.isEnabled) {
                    autoaccept.enable(CDP_PORT).catch(() => {});
                }
            } else {
                ctx.reply(t('workspace.started') + t('workspace.cdp_warning'));
            }
        } catch (err) {
            console.error('doLaunchWorkspace error:', err);
            ctx.reply(t('workspace.start_failed', { error: err.message }));
        }
    })();
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
        'tr': '🇹🇷 Türkçe',
        'es': '🇪🇸 Español',
        'fr': '🇫🇷 Français',
        'de': '🇩🇪 Deutsch'
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
    
    let msg = `🤖 <b>Antigravity Uygulama Seçimi</b>\n\n`;
    msg += `Tercih Edilen Uygulama: <b>${appName}</b>\n`;
    msg += `Aktif CDP Bağlantı Portu: <code>${currentPort}</code>\n\n`;
    msg += t('app.select_prompt');
    msg += `• <b>Standalone Agent:</b> CDP Port 9333\n`;
    msg += `• <b>Monaco IDE:</b> CDP Port 9334\n\n`;
    msg += `⚡ <i>Seçiminiz kalıcı olarak .env dosyasına kaydedilir ve botu yeniden başlatmadan anında uygulanır.</i>`;

    const buttons = [
        [{ text: '🤖 Standalone Agent (Port: 9333)', callback_data: 'pref_app_agent' }],
        [{ text: '💻 Classic Monaco IDE (Port: 9334)', callback_data: 'pref_app_ide' }]
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
        ctx.answerCbQuery(`Uygulama tercihi '${selectedApp}' olarak güncellendi!`);
        
        const appName = selectedApp === 'ide' ? '💻 Classic Monaco IDE' : '🤖 Standalone Agent (2.0)';
        let msg = `✅ <b>Uygulama Tercihi Güncellendi!</b>\n\n`;
        msg += `Tercih Edilen: <b>${appName}</b>\n`;
        msg += `Yeni Bağlantı Portu: <code>${CDP_PORT}</code>\n\n`;
        msg += `Bot şimdi tüm mesaj ve komutlarınızı bu uygulamaya yönlendirecektir.`;
        
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
        
        await sendMainMenu(ctx, `🕹️ Kontrol Paneli (${selectedApp === 'ide' ? 'IDE' : 'Agent'}):`);
    } else {
        ctx.answerCbQuery('Hata: Tercih kaydedilemedi.');
    }
});

// ===== SHORTCUTS FIXER =====

bot.command('fix_shortcuts', async (ctx) => {
    ctx.reply(t('shortcuts.scanning'));
    
    const platform = require('./platform').PLATFORM;
    const { getAppBinary } = require('./platform');
    
    if (platform === 'linux') {
        // Linux: Update launcher scripts and .desktop files
        try {
            const localBin = path.join(os.homedir(), '.local', 'bin');
            const desktop = path.join(os.homedir(), 'Desktop');
            let fixedCount = 0;
            let status = t('shortcuts.updated_header') || 'Kısayollar güncellendi:\n';

            // Ensure directories exist
            if (!fs.existsSync(localBin)) fs.mkdirSync(localBin, { recursive: true });

            // --- 1. IDE Launcher (Port 9334) ---
            const ideBinary = getAppBinary('ide');
            const ideLauncherPath = path.join(localBin, 'antigravity-ide-launcher.sh');
            const ideDesktopPath = path.join(desktop, 'Antigravity-IDE-CDP.desktop');
            
            if (fs.existsSync(ideBinary) || fs.existsSync(require('fs').realpathSync(ideBinary).replace(/\/[^/]+$/, ''))) {
                const ideLauncher = `#!/bin/bash\n# Antigravity IDE Launcher — Port 9334\nPORT=9334\nAPP_PATH="${ideBinary}"\n\ncleanup_port() {\n    local pids\n    pids=$(lsof -t -i :"$PORT" 2>/dev/null || true)\n    if [ -n "$pids" ]; then\n        echo "[launcher-ide] Port $PORT temizleniyor: $pids"\n        echo "$pids" | xargs kill -9 2>/dev/null || true\n        sleep 0.5\n    fi\n    rm -f "$HOME/.config/Antigravity IDE/code.lock"\n    rm -f "$HOME/.config/Antigravity-IDE/code.lock"\n}\n\ncleanup_port\n$APP_PATH --remote-debugging-port=$PORT "$@" &\nAG_PID=$!\nwait $AG_PID\ncleanup_port\n`;
                fs.writeFileSync(ideLauncherPath, ideLauncher, { mode: 0o755 });

                const ideDesktop = `[Desktop Entry]\nName=Antigravity IDE (CDP 9334)\nComment=Start Antigravity IDE with CDP 9334\nExec=${ideLauncherPath} %F\nIcon=antigravity-ide\nType=Application\nTerminal=false\nStartupNotify=false\nStartupWMClass=antigravity-ide\nCategories=Development;IDE;\nMimeType=application/x-antigravity-workspace;\n`;
                fs.writeFileSync(ideDesktopPath, ideDesktop);
                exec(`chmod +x "${ideDesktopPath}"`);
                status += `• 💻 <b>Antigravity IDE</b> -> <code>--remote-debugging-port=9334</code> ✅\n`;
                fixedCount++;
            } else {
                status += `• 💻 <i>Antigravity IDE</i> (${t('shortcuts.binary_not_found') || 'binary bulunamadı'})\n`;
            }

            // --- 2. Standalone Agent (Port 9333) ---
            const agentBinary = getAppBinary('agent');
            const agentLauncherPath = path.join(localBin, 'antigravity-standalone-launcher.sh');
            const agentDesktopPath = path.join(desktop, 'Antigravity-Standalone-CDP.desktop');
            
            if (fs.existsSync(agentBinary)) {
                const agentLauncher = `#!/bin/bash\n# Antigravity Standalone Launcher — Port 9333\nPORT=9333\nAPP_PATH="${agentBinary}"\n\ncleanup_port() {\n    local pids\n    pids=$(lsof -t -i :"$PORT" 2>/dev/null || true)\n    if [ -n "$pids" ]; then\n        echo "[launcher-standalone] Port $PORT temizleniyor: $pids"\n        echo "$pids" | xargs kill -9 2>/dev/null || true\n        sleep 0.5\n    fi\n    rm -f "$HOME/.config/Antigravity/code.lock"\n}\n\ncleanup_port\n$APP_PATH --remote-debugging-port=$PORT "$@" &\nAG_PID=$!\nwait $AG_PID\ncleanup_port\n`;
                fs.writeFileSync(agentLauncherPath, agentLauncher, { mode: 0o755 });

                const agentDesktop = `[Desktop Entry]\nName=Antigravity Standalone (CDP 9333)\nComment=Start Antigravity Standalone Agent with CDP 9333\nExec=${agentLauncherPath} %F\nIcon=antigravity-standalone\nType=Application\nTerminal=false\nStartupNotify=false\nStartupWMClass=antigravity\nCategories=Development;IDE;\nMimeType=application/x-antigravity-workspace;\n`;
                fs.writeFileSync(agentDesktopPath, agentDesktop);
                exec(`chmod +x "${agentDesktopPath}"`);
                status += `• 🤖 <b>Antigravity Standalone</b> -> <code>--remote-debugging-port=9333</code> ✅\n`;
                fixedCount++;
            } else {
                status += `• 🤖 <i>Antigravity Standalone</i> (${t('shortcuts.binary_not_found') || 'binary bulunamadı'})\n`;
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

# 1. Standalone Agent (Port 9333)
$lnkAgent = Join-Path $desktop "Antigravity.lnk"
if (Test-Path $lnkAgent) {
    $lnk = $sh.CreateShortcut($lnkAgent)
    $lnk.Arguments = "--remote-debugging-port=9333"
    $lnk.Save()
    Write-Output "agent-fixed"
}

# 2. Classic IDE (Port 9334)
$lnkIDE = Join-Path $desktop "Antigravity IDE.lnk"
if (Test-Path $lnkIDE) {
    $lnk = $sh.CreateShortcut($lnkIDE)
    $lnk.Arguments = "--remote-debugging-port=9334"
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
                
                let status = 'Kısayollar güncellendi:\n';
                const output = stdout.toLowerCase();
                let fixedCount = 0;
                if (output.includes('agent-fixed')) {
                    status += '\u2022 \ud83e\udd16 <b>Antigravity.lnk</b> -> <code>--remote-debugging-port=9333</code> \u2705\n';
                    fixedCount++;
                } else {
                    status += '\u2022 \ud83e\udd16 <i>Antigravity.lnk</i> (' + t('shortcuts.not_found') + ')\n';
                }
                if (output.includes('ide-fixed')) {
                    status += '\u2022 \ud83d\udcbb <b>Antigravity IDE.lnk</b> -> <code>--remote-debugging-port=9334</code> \u2705\n';
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
            let status = 'Kısayollar güncellendi:\n';
            
            // 1. Standalone Agent (Port 9333)
            const agentBinary = getAppBinary('agent'); // Uygulamanın .app dizinini döndürür
            if (fs.existsSync(agentBinary)) {
                const agentAppPath = path.join(desktop, 'Antigravity Agent (CDP).app');
                // open -a komutuyla uygulamayı debug portu ile başlatacak script
                const script = `do shell script "open -a \\"${agentBinary}\\" --args --remote-debugging-port=9333"`;
                execSync(`osacompile -e '${script}' -o "${agentAppPath}"`);
                status += `• 🤖 <b>Antigravity Agent (CDP).app</b> -> <code>Port 9333</code> ✅\n`;
                fixedCount++;
            }
            
            // 2. Classic IDE (Port 9334)
            const ideBinary = getAppBinary('ide');
            if (fs.existsSync(ideBinary)) {
                const ideAppPath = path.join(desktop, 'Antigravity IDE (CDP).app');
                const script = `do shell script "open -a \\"${ideBinary}\\" --args --remote-debugging-port=9334"`;
                execSync(`osacompile -e '${script}' -o "${ideAppPath}"`);
                status += `• 💻 <b>Antigravity IDE (CDP).app</b> -> <code>Port 9334</code> ✅\n`;
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
    ctx.reply(t('window.cleared_msg') || '🔄 Window preference cleared. Bot will auto-detect the active IDE window.');
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
    ctx.reply(t('window.selected_msg', { title: selected.title }) || `✅ Now targeting: <b>${selected.title}</b>\n\nAll commands will route to this window.`, { parse_mode: 'HTML' });
    
    // Auto-show latest agent response from the new window
    (async () => {
        try {
            await new Promise(r => setTimeout(r, 800));
            let text = await getFullLatestResponse(CDP_PORT);
            if (text && !text.startsWith('[No previous')) {
                const header = await getChatHeader(null, '📋 Son Agent Yanıtı:');
                await sendLongMessage(ctx, text, header);
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
    ctx.answerCbQuery(t('ask.focus_toast', { title: shortTitle }) || `Yanıtlanıyor: ${shortTitle}`);
    ctx.reply(t('ask.focus_success', { title: selected.title }) || `✅ <b>${selected.title}</b> ajanına kilitlenildi.\n✍️ Şimdi yazacağınız mesaj doğrudan bu ajana gidecek.`, { 
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
        ctx.reply(`📂 <b>${relativePath}</b>\n${dirInfo}`, {
            parse_mode: 'HTML',
            reply_markup: { inline_keyboard: buttons }
        });
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
        { command: 'restart', description: t('menu.restart_desc') || 'Restart the bot' }
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
                `✅ Güncelsiniz!\n\nv${result.localVersion} (${result.localCommit})`,
                { parse_mode: 'HTML' }
            );
            return;
        }
        await ctx.reply(
            `🔄 <b>Güncelleme Mevcut!</b>\n\n` +
            `Mevcut: v${result.localVersion} (${result.localCommit})\n` +
            `Yeni: v${result.remoteVersion} (${result.remoteCommit})\n` +
            (result.remoteCommitMessage ? `📝 <b>Changelog:</b> <i>${result.remoteCommitMessage}</i>\n\n` : `\n`) +
            `<i>💡 Not: Antigravity 2.0 (Standalone App) desteklenir, fakat Antigravity IDE önerilir.</i>\n\n` +
            `Güncelleniyor...`,
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
        await sendMainMenu(ctx, t('turbo.off') || '🛑 Turbo Mod Kapatıldı.\nNormal asistan moduna dönüldü.');
    } else {
        const msg = await ctx.reply(
            t('turbo.on_msg') || '⚡ <b>TURBO MOD AKTİF</b> ⚡\n\n⚠️ <b>Dikkat:</b> Bu modda gönderdiğiniz talepler Claude ve Gemini tarafından sırayla (Planlama -> Kodlama -> İnceleme) işlenecektir. Kodlar kendi aralarında düzenlenip inceleneceği için <b>daha fazla token harcanır.</b>\n\nBu modu kapatmak için tekrar <code>/turbo</code> yazabilir veya menüdeki butona tıklayabilirsiniz.', 
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

bot.on('text', (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    const query = ctx.message.text;
    
    let explicitTargetId = null;
    let explicitThreadName = null;
    if (ctx.message.reply_to_message) {
        const val = messageTargetMap.get(ctx.message.reply_to_message.message_id);
        if (typeof val === 'string') explicitTargetId = val;
        else if (val) { explicitTargetId = val.targetId; explicitThreadName = val.threadName; }
    }
    if (!explicitTargetId && ctx.message.reply_to_message?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data?.startsWith('focus_')) {
        explicitTargetId = ctx.message.reply_to_message.reply_markup.inline_keyboard[0][0].callback_data.replace('focus_', '');
    }
    
    (async () => {
        try {
            if (explicitThreadName) await switchAgentThread(CDP_PORT, explicitThreadName).catch(()=>{});
            let targetId = explicitTargetId;
            let text = "";

            if (isTurboMode) {
                const turboTargetId = explicitTargetId || getPreferredTargetId() || null;
                text = await runTurboOrchestration(query, CDP_PORT, turboTargetId, ctx, createProgressHandler, stripQueryFromResponse);
                targetId = turboTargetId;
            } else {
                targetId = await sendViaCDP(query, CDP_PORT, explicitTargetId);
                await ctx.reply(t('ask.sent'));

                // Wait briefly for message to render in DOM before anchoring state
                await new Promise(r => setTimeout(r, 1500));
                await snapshotChatState(CDP_PORT, targetId).catch(() => {});
                
                const isDone = await waitForAgentResponse(CDP_PORT, 450000, createProgressHandler(ctx), targetId);
                if (isDone) {
                    text = await getFullLatestResponse(CDP_PORT, targetId, explicitThreadName);
                    text = stripQueryFromResponse(text, query);
                } else {
                    return await ctx.reply(t('ask.timeout'));
                }
            }

            if (!text) text = t('ask.done_empty');
            const header = await getChatHeader(targetId, t('ask.done'));
            const buttons = await buildMainMenu(null, null, targetId);
            
            const sentIds = await sendLongMessage(ctx, text, header, buttons, ctx.message.message_id);
            if (sentIds && sentIds.length > 0 && targetId) {
                const activeInfo = await getActiveThreadInfo(CDP_PORT, targetId).catch(() => null);
                const currentThreadName = activeInfo ? activeInfo.name : null;
                sentIds.forEach(id => messageTargetMap.set(id, { targetId, threadName: currentThreadName }));
                saveMessageTargetMap(messageTargetMap);
            }
        } catch(err) {
            const errorMsg = err.message === 'no_chat_input' ? t('ask.no_chat_input') : err.message;
            ctx.reply(t('ask.headless_error', { error: errorMsg })).catch(() => {});
        }
    })();
});

// ===== PHOTO & DOCUMENT HANDLER =====

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
            
            const caption = ctx.message.caption ? `\nUser's message: ${ctx.message.caption}` : "";
            const query = `[System: The user has uploaded an image or file. You MUST use your \`view_file\` tool to examine the file at this absolute path: ${dest} . Do not say you cannot see it. Use the tool!]${caption}`;
            
            let explicitTargetId = null;
            let explicitThreadName = null;
            if (ctx.message.reply_to_message) {
                const val = messageTargetMap.get(ctx.message.reply_to_message.message_id);
                if (typeof val === 'string') explicitTargetId = val;
                else if (val) { explicitTargetId = val.targetId; explicitThreadName = val.threadName; }
            }
            if (!explicitTargetId && ctx.message.reply_to_message?.reply_markup?.inline_keyboard?.[0]?.[0]?.callback_data?.startsWith('focus_')) {
                explicitTargetId = ctx.message.reply_to_message.reply_markup.inline_keyboard[0][0].callback_data.replace('focus_', '');
            }
            
            await ctx.reply(t('photo.downloaded'));
            if (explicitThreadName) await switchAgentThread(CDP_PORT, explicitThreadName).catch(()=>{});
            const targetId = await sendViaCDP(query, CDP_PORT, explicitTargetId);

            // Wait briefly for message to render in DOM before anchoring state
            await new Promise(r => setTimeout(r, 1500));
            await snapshotChatState(CDP_PORT, targetId).catch(() => {});
            
            const isDone = await waitForAgentResponse(CDP_PORT, 450000, createProgressHandler(ctx), targetId);
            if (isDone) {
                let text = await getFullLatestResponse(CDP_PORT, targetId);
                text = stripQueryFromResponse(text, query);
                if (caption) {
                    text = stripQueryFromResponse(text, caption);
                }
                if (!text) text = t('ask.done_empty');
                const header = await getChatHeader(targetId, t('ask.done'));
                
                const buttons = await buildMainMenu(null, null, targetId);
                
                const sentIds = await sendLongMessage(ctx, text, header, buttons, ctx.message.message_id);
                if (sentIds && sentIds.length > 0 && targetId) {
                    const activeInfo = await getActiveThreadInfo(CDP_PORT, targetId).catch(() => null);
                    const currentThreadName = activeInfo ? activeInfo.name : null;
                    sentIds.forEach(id => messageTargetMap.set(id, { targetId, threadName: currentThreadName }));
                    saveMessageTargetMap(messageTargetMap);
                }
            } else {
                await ctx.reply(t('ask.timeout'));
            }
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

    bot.launch({ dropPendingUpdates: true }).catch(err => {
        console.error("Bot launch failed:", err);
    });

    // Push the main menu keyboard to the user so it's active by default (wait 3s to let IDE/CDP initialize)
    setTimeout(() => {
        const updateFlagPath = path.join(__dirname, '..', '.update_flag');
        if (fs.existsSync(updateFlagPath)) {
            const startupMsg = '🚀 Antigravity Bot başarıyla güncellendi!';
            pushMainMenuToUser(startupMsg).catch(console.error);
            try { fs.unlinkSync(updateFlagPath); } catch (e) {}
        } else {
            // Sadece sessizce menüyü güncelle
            pushMainMenuToUser('🔄 Bot yeniden başlatıldı.', true).catch(console.error);
        }
    }, 3000);

    // Start periodic update checker (notifies via Telegram when update is available)
    updater.startUpdateChecker(bot, ALLOWED_CHAT_IDS);
}

init();

// Enable graceful stop
const handleExit = async (signal) => {
    console.log(`\nReceived ${signal}. Stopping bot polling...`);
    try {
        bot.stop(signal);
    } catch (_) {}
    // NOTE: We intentionally do NOT call cleanupAll() here.
    // PM2 restarts should not kill running Antigravity apps.
    // Use /restart command for explicit app cleanup.
    process.exit(0);
};


process.once('SIGINT', () => handleExit('SIGINT'));
process.once('SIGTERM', () => handleExit('SIGTERM'));
