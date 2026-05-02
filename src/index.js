require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { loadLocale, t, getLang } = require('./i18n');
const { config, isIDERunning, killIDE, cleanLockFile, launchIDE, trustWorkspaceViaCDP, PLATFORM } = require('./platform');
const { isAgentWorking, getFullLatestResponse, snapshotChatState, captureAgentScreenshot, captureFullIDEScreenshot, waitForAgentResponse, sendViaCDP, triggerNewChat, triggerModelMenu, getAvailableModels, selectModel, getCurrentModel, stopAgent, getQuota, listWindows, setPreferredWindow, getPreferredWindow, getCachedWindows, closeWindow, listAgentThreads, switchAgentThread, getActiveThreadId } = require('./cdp_controller');
const autoaccept = require('./autoaccept');
const updater = require('./updater');

let cachedAgentThreads = [];
let cachedArtifacts = [];

// Load configured language
const lang = process.env.LANGUAGE || 'en';
loadLocale(lang);

// ===== SECURITY: ALLOWED_CHAT_ID is mandatory =====
const ALLOWED_CHAT_ID = process.env.ALLOWED_CHAT_ID;
if (!ALLOWED_CHAT_ID) {
    if (process.env.SETUP_MODE === 'true') {
        console.warn('\n⚠️  SETUP MODE: Bot is running without ALLOWED_CHAT_ID.');
        console.warn('Send /start to your bot to discover your chat ID.\n');
    } else {
        console.error('\n❌ SECURITY ERROR: ALLOWED_CHAT_ID is required.\n');
        console.error('Set ALLOWED_CHAT_ID in your .env file to your Telegram chat ID.');
        console.error('Send /start to your bot to discover your chat ID.');
        console.error('Tip: Set SETUP_MODE=true in .env to run without ALLOWED_CHAT_ID during initial setup.\n');
        process.exit(1);
    }
}

const bot = new Telegraf(process.env.BOT_TOKEN, { handlerTimeout: 900000 }); // 15 minutes timeout to allow long /ask requests
const CDP_PORT = process.env.DEBUGGING_PORT || 9333;

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
async function sendLongMessage(ctx, text, prefix = '') {
    const MAX_LEN = 3500;
    
    // Parse text to HTML and preserve prefix formatting
    const htmlText = prefix ? `<b>${prefix}</b>\n\n${markdownToTelegramHtml(text)}` : markdownToTelegramHtml(text);
    
    async function replyWithRetry(content, retries = 3) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                await ctx.reply(content, { parse_mode: 'HTML' });
                return;
            } catch (err) {
                console.error(`sendLongMessage attempt ${attempt}/${retries} failed:`, err.message);
                if (attempt < retries && !err.message.includes("can't parse entities")) {
                    await new Promise(r => setTimeout(r, 2000 * attempt));
                } else if (err.message.includes("can't parse entities")) {
                    // Fallback to sending raw text if HTML parsing completely fails
                    try {
                        const plain = content.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
                        await ctx.reply(plain);
                        return;
                    } catch (fallbackErr) {
                        throw fallbackErr;
                    }
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

        for (const line of lines) {
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
                await replyWithRetry(currentChunk);
                currentChunk = inPre ? (preLang ? `<pre><code class="language-${preLang}">\n` : '<pre>\n') : '';
            }
            currentChunk += line + '\n';
        }
        if (currentChunk.trim().length > 0) {
            await replyWithRetry(currentChunk);
        }
        console.log(`sendLongMessage: Sent successfully`);
    } catch (err) {
        console.error('sendLongMessage final error:', err.message);
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
    if (!ALLOWED_CHAT_ID) {
        console.log(`\n🔔 NEW CHAT ID DETECTED: ${ctx.chat.id}`);
        console.log(`Please add ALLOWED_CHAT_ID=${ctx.chat.id} to your .env file and restart.\n`);
        return ctx.reply(`Welcome! Your Chat ID is: ${ctx.chat.id}\nPlease add it to the .env file as ALLOWED_CHAT_ID and restart the bot.`);
    }
    if (ctx.chat.id.toString() !== ALLOWED_CHAT_ID) {
        return ctx.reply(t('auth.unauthorized'));
    }
    return next();
}

bot.use(checkAuth);

// ===== COMMANDS =====

bot.start((ctx) => {
    ctx.reply(t('bot.started', { chatId: ctx.chat.id }));
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
    const running = await isIDERunning();
    if (running) {
        return ctx.reply(t('ide.already_running'));
    }
    cleanLockFile();
    ctx.reply(t('ide.starting'));
    try {
        await launchIDE(null, CDP_PORT);
        ctx.reply(t('ide.started'));
        setTimeout(() => {
            if (autoaccept.isEnabled) autoaccept.enable(CDP_PORT).catch(()=>{});
        }, 3000);
    } catch (err) {
        if (err.message === 'IDE_NOT_INSTALLED') {
            ctx.reply(t('ide.not_installed'));
        } else {
            ctx.reply(t('ide.start_failed', { error: err.message }));
        }
    }
});

bot.command('close', async (ctx) => {
    const running = await isIDERunning();
    if (!running) {
        cleanLockFile();
        return ctx.reply(t('ide.already_closed'));
    }
    ctx.reply(t('ide.closing'));
    await killIDE();
    ctx.reply(t('ide.closed'));
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

bot.command('status', async (ctx) => {
    let msg = t('status.title') + '\n';
    
    const ideCheck = await isIDERunning();
    msg += ideCheck ? t('status.ide_running') + '\n' : t('status.ide_stopped') + '\n';
    
    try {
        await getActiveThreadId(CDP_PORT);
        msg += t('status.cdp_active') + '\n';
    } catch {
        msg += t('status.cdp_inactive') + '\n';
    }
    
    msg += t('status.bot_running') + '\n';
    
    try {
        const activeId = await getActiveThreadId(CDP_PORT);
        if (activeId) {
            const workspaces = await listAgentThreads(CDP_PORT);
            let activeWorkspace = null;
            let activeThread = null;
            
            for (const ws of workspaces) {
                const found = ws.threads.find(t => t.id === activeId);
                if (found) {
                    activeWorkspace = ws.workspace;
                    activeThread = found.name;
                    break;
                }
            }
            
            if (activeWorkspace && activeThread) {
                msg += `\n💬 <b>Chat:</b>\n`;
                msg += `- Workspace: ${activeWorkspace}\n`;
                msg += `- Thread: ${activeThread}\n`;
                const currentModel = await getCurrentModel(CDP_PORT);
                if (currentModel) msg += `- Model: ${currentModel}\n`;
                const isWorking = await isAgentWorking(CDP_PORT);
                msg += `- Status: ${isWorking ? 'Working...' : 'Idle'}\n`;
            }
        }
    } catch (e) {
        // silently fail if we can't get chat info
    }

    msg += '\n<b>Auto-Accept:</b> ' + (autoaccept.isEnabled ? '✅ ON' : '❌ OFF') + '\n';

    ctx.reply(msg, { parse_mode: 'HTML' });
});

/**
 * Appends thread info and agent status footer to response text.
 */
async function appendThreadFooter(text) {
    try {
        const activeId = await getActiveThreadId(CDP_PORT);
        if (activeId) {
            const workspaces = await listAgentThreads(CDP_PORT);
            let threadName = null;
            let wsName = null;
            for (const ws of workspaces) {
                const found = ws.threads.find(t => t.id === activeId);
                if (found) { wsName = ws.workspace; threadName = found.name; break; }
            }
            const isWorking = await isAgentWorking(CDP_PORT);
            const statusLine = isWorking ? 'Working...' : 'Idle';
            text += '\n\n' + `📁 ${wsName || 'Unknown'}` + (threadName ? ` / ${threadName}` : '') + `\nAgent Status: ${statusLine}`;
        }
    } catch (_) {}
    return text;
}

bot.command('latest', async (ctx) => {
    try {
        let text = await getFullLatestResponse(CDP_PORT);
        text = await appendThreadFooter(text);
        await sendLongMessage(ctx, text, t('latest.title'));
    } catch (err) {
        ctx.reply(t('latest.error', { error: err.message }));
    }
});

bot.command('screenshot', async (ctx) => {
    try {
        ctx.reply(t('screenshot.taking'));
        const buffer = await captureFullIDEScreenshot(CDP_PORT);
        await ctx.replyWithPhoto({ source: buffer });
    } catch (err) {
        ctx.reply(t('screenshot.error', { error: err.message }));
    }
});

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
            await sendViaCDP(query, CDP_PORT);
            await ctx.reply(t('ask.sent'));

            // Wait briefly for message to render in DOM before anchoring state
            await new Promise(r => setTimeout(r, 1500));
            await snapshotChatState(CDP_PORT).catch(() => {});
            
            const isDone = await waitForAgentResponse(CDP_PORT, 450000, createProgressHandler(ctx));
            if (isDone) {
                let text = await getFullLatestResponse(CDP_PORT);
                text = stripQueryFromResponse(text, query);
                if (!text) text = t('ask.done_empty');
                text = await appendThreadFooter(text);
                await sendLongMessage(ctx, text, t('ask.done'));
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
        return ctx.reply('Lütfen çalıştırılacak komutu girin. Örnek: /cmd ls -la');
    }
    
    ctx.reply(`⏳ Komut çalıştırılıyor:\n\`${cmdStr}\``, { parse_mode: 'MarkdownV2' });
    
    exec(cmdStr, { timeout: 60000, maxBuffer: 1024 * 1024 * 5 }, async (error, stdout, stderr) => {
        let output = "";
        if (stdout) output += `[STDOUT]\n${stdout}\n`;
        if (stderr) output += `[STDERR]\n${stderr}\n`;
        if (error) output += `[ERROR]\n${error.message}\n`;
        
        if (!output) output = "✅ Komut başarıyla çalıştı (Çıktı yok).";
        
        await sendLongMessage(ctx, output, `💻 Komut Çıktısı:`);
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
        if (success) ctx.reply(t('new_chat.opened'));
        else ctx.reply(t('new_chat.not_found'));
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
            ctx.reply(t('agents.switched', { name: thread.name }) || `✅ Switched to thread: ${thread.name}`, { parse_mode: 'HTML' });
            const success = await switchAgentThread(CDP_PORT, thread.name);
            if (!success) {
                ctx.reply(t('agents.not_found') || '❌ Thread could not be selected.');
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
        ctx.reply(t('agents.switched', { name: thread.name }) || `✅ Switched to thread: ${thread.name}`, { parse_mode: 'HTML' });
        const success = await switchAgentThread(CDP_PORT, thread.name);
        if (!success) {
            ctx.reply(t('agents.not_found') || '❌ Thread could not be selected.');
        }
    } else {
        ctx.reply(t('agents.invalid_number') || '❌ Invalid thread number.');
    }
});

bot.command('artifacts', async (ctx) => {
    try {
        const activeId = await getActiveThreadId(CDP_PORT);
        if (!activeId) {
            return ctx.reply(t('artifacts.no_active_thread') || '⚠️ No active thread found. Please select a thread in the IDE first.');
        }

        const artifactsDir = path.join(os.homedir(), '.gemini', 'antigravity', 'brain', activeId);
        if (!fs.existsSync(artifactsDir)) {
            return ctx.reply(t('artifacts.no_artifacts') || 'ℹ️ No artifacts found for the current thread.');
        }

        const items = fs.readdirSync(artifactsDir, { withFileTypes: true });
        cachedArtifacts = [];
        
        for (const item of items) {
            if (item.isDirectory()) continue;
            const name = item.name;
            if (name.includes('.metadata.json') || name.includes('.resolved') || name.startsWith('.sys')) {
                continue;
            }
            if (name.endsWith('.md') || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg') || name.endsWith('.webp') || name.endsWith('.mp4') || name.endsWith('.mov')) {
                cachedArtifacts.push({ name, path: path.join(artifactsDir, name) });
            }
        }

        // Also scan the scratch/ subdirectory for temporary files
        const scratchDir = path.join(artifactsDir, 'scratch');
        if (fs.existsSync(scratchDir)) {
            const scratchItems = fs.readdirSync(scratchDir, { withFileTypes: true });
            for (const item of scratchItems) {
                if (item.isDirectory()) continue;
                const name = item.name;
                cachedArtifacts.push({ name: `scratch/${name}`, path: path.join(scratchDir, name) });
            }
        }

        if (cachedArtifacts.length === 0) {
            return ctx.reply(t('artifacts.no_artifacts') || 'ℹ️ No artifacts found for the current thread.');
        }

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
});

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

bot.command('model', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    parts.shift();
    const modelName = parts.join(' ').trim();
    
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
        'Gemini 3.1 Pro (Low)',
        'Gemini 3 Flash',
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
});

bot.action(/md_(.+)/, async (ctx) => {
    try {
        const modelName = Buffer.from(ctx.match[1], 'base64').toString('utf-8');
        ctx.answerCbQuery(modelName);
        ctx.reply(t('model.changing', { model: modelName }));
        const success = await selectModel(CDP_PORT, modelName);
        if (success) ctx.reply(t('model.changed', { model: modelName }));
        else ctx.reply(t('model.select_failed'));
    } catch(e) {
        ctx.answerCbQuery(t('model.error'));
    }
});

// ===== AUTO-ACCEPT =====

bot.command('autoaccept', async (ctx) => {
    const parts = ctx.message.text.split(' ');
    parts.shift();
    const subCommand = parts.join(' ').trim().toLowerCase();

    try {
        if (subCommand === 'on' || (subCommand === '' && !autoaccept.isEnabled)) {
            // Enable auto-accept
            ctx.reply(t('autoaccept.enabling'));
            const result = await autoaccept.enable(CDP_PORT);
            if (result.injected > 0) {
                ctx.reply(t('autoaccept.enabled', { injected: result.injected }));
            } else {
                ctx.reply(t('autoaccept.enabled_none'));
            }
        } else if (subCommand === 'off' || (subCommand === '' && autoaccept.isEnabled)) {
            // Disable auto-accept
            ctx.reply(t('autoaccept.disabling'));
            const result = await autoaccept.disable(CDP_PORT);
            ctx.reply(t('autoaccept.disabled', { clicks: result.totalClicks }));
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
});

bot.action('aa_on', async (ctx) => {
    try {
        ctx.answerCbQuery('Enabling...');
        const result = await autoaccept.enable(CDP_PORT);
        if (result.injected > 0) {
            ctx.reply(t('autoaccept.enabled', { injected: result.injected }));
        } else {
            ctx.reply(t('autoaccept.enabled_none'));
        }
    } catch (e) {
        ctx.reply(t('autoaccept.error', { error: e.message }));
    }
});

bot.action('aa_off', async (ctx) => {
    try {
        ctx.answerCbQuery('Disabling...');
        const result = await autoaccept.disable(CDP_PORT);
        ctx.reply(t('autoaccept.disabled', { clicks: result.totalClicks }));
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
        // Multi-window support: DO NOT kill existing IDE instances!
        // We just launch the new workspace.
        
        try {
            await launchIDE(workspace, CDP_PORT);
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
                        cdpReady = true;
                        break;
                    }
                } catch (_) {
                    // CDP not ready yet, keep waiting
                }
            }
            if (cdpReady) {
                ctx.reply(t('workspace.started'));
                // Auto-click Trust Workspace dialog if it appears
                trustWorkspaceViaCDP(CDP_PORT, 10).then(trusted => {
                    if (trusted) {
                        ctx.reply(t('workspace.trusted'));
                    }
                }).catch(() => {});
                
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

bot.command('workspace', (ctx) => {
    const parts = ctx.message.text.split(' ');
    parts.shift();
    const workspace = parts.join(' ').trim();
    
    if (!workspace) {
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
    // If user typed a folder name (not full path), resolve it to full path
    const wsPath = workspace.startsWith('/') ? workspace : path.join(config.projectsDir, workspace);
    currentWorkspaceDir = wsPath;
    doLaunchWorkspace(ctx, wsPath);
});

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
    
    if (newLang && ['en', 'tr'].includes(newLang)) {
        loadLocale(newLang);
        await clearAllMenuScopes();
        await setMenuOnAllScopes();
        return ctx.reply(t('lang.changed', { lang: newLang }));
    }
    
    const buttons = [
        [{ text: '🇬🇧 English', callback_data: 'lang_en' }],
        [{ text: '🇹🇷 Türkçe', callback_data: 'lang_tr' }]
    ];
    
    ctx.reply(t('lang.select_prompt'), {
        reply_markup: { inline_keyboard: buttons }
    });
});

bot.action(/lang_(.+)/, async (ctx) => {
    const newLang = ctx.match[1];
    loadLocale(newLang);
    await clearAllMenuScopes();
    await setMenuOnAllScopes();
    ctx.answerCbQuery(t('lang.changed', { lang: newLang }));
    ctx.reply(t('lang.changed', { lang: newLang }));
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
    
    // Explicitly re-inject autoaccept into the selected window to ensure it tracks
    if (autoaccept.isEnabled) {
        autoaccept.enable(CDP_PORT).catch(() => {});
    }
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
    return [
        { command: 'help', description: t('menu.help_desc') },
        { command: 'latest', description: t('menu.latest_desc') },
        { command: 'screenshot', description: t('menu.screenshot_desc') },
        { command: 'status', description: t('menu.status_desc') },
        { command: 'start_ide', description: t('menu.start_ide_desc') },
        { command: 'close', description: t('menu.close_desc') },
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
        { command: 'menu', description: t('menu.menu_desc') }
    ];
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
    
    // Also clear chat-specific scope if ALLOWED_CHAT_ID is set
    if (ALLOWED_CHAT_ID) {
        for (const lang of langs) {
            try {
                const params = { scope: { type: 'chat', chat_id: parseInt(ALLOWED_CHAT_ID) } };
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
    const langs = ['en', 'tr'];
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

        if (ALLOWED_CHAT_ID) {
            const paramsChat = { 
                commands: cmds, 
                scope: { type: 'chat', chat_id: parseInt(ALLOWED_CHAT_ID) } 
            };
            if (langCode !== defaultLang) {
                paramsChat.language_code = langCode;
            }
            await bot.telegram.callApi('setMyCommands', paramsChat).catch(()=>{});
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
    ctx.reply(t('menu.updated'));
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
    ctx.reply('🔍 Güncellemeler kontrol ediliyor...');
    try {
        const result = await updater.checkForUpdates();
        if (!result.available) {
            ctx.reply(
                `✅ Güncelsiniz!\n\nv${result.localVersion} (${result.localCommit})`,
                { parse_mode: 'HTML' }
            );
            return;
        }
        ctx.reply(
            `🔄 <b>Güncelleme Mevcut!</b>\n\n` +
            `Mevcut: v${result.localVersion} (${result.localCommit})\n` +
            `Yeni: v${result.remoteVersion} (${result.remoteCommit})\n\n` +
            `Güncelleniyor...`,
            { parse_mode: 'HTML' }
        );
        const updateResult = await updater.performUpdate();
        if (!updateResult.updated) {
            ctx.reply(`ℹ️ ${updateResult.message}`);
        }
        // If update succeeded, bot will restart and this code won't execute
    } catch(e) {
        ctx.reply(`❌ Güncelleme hatası: ${e.message}`);
    }
});

// ===== TEXT MESSAGE HANDLER (Headless mode) =====

bot.on('text', (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    const query = ctx.message.text;
    
    (async () => {
        try {
            await sendViaCDP(query, CDP_PORT);
            await ctx.reply(t('ask.sent'));

            // Wait briefly for message to render in DOM before anchoring state
            await new Promise(r => setTimeout(r, 1500));
            await snapshotChatState(CDP_PORT).catch(() => {});
            
            const isDone = await waitForAgentResponse(CDP_PORT, 450000, createProgressHandler(ctx));
            if (isDone) {
                let text = await getFullLatestResponse(CDP_PORT);
                text = stripQueryFromResponse(text, query);
                if (!text) text = t('ask.done_empty');
                text = await appendThreadFooter(text);
                await sendLongMessage(ctx, text, t('ask.done'));
            } else {
                await ctx.reply(t('ask.timeout'));
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
            
            await ctx.reply(t('photo.downloaded'));
            await sendViaCDP(query, CDP_PORT);

            // Wait briefly for message to render in DOM before anchoring state
            await new Promise(r => setTimeout(r, 1500));
            await snapshotChatState(CDP_PORT).catch(() => {});
            
            const isDone = await waitForAgentResponse(CDP_PORT, 450000, createProgressHandler(ctx));
            if (isDone) {
                let text = await getFullLatestResponse(CDP_PORT);
                text = stripQueryFromResponse(text, query);
                if (caption) {
                    text = stripQueryFromResponse(text, caption);
                }
                if (!text) text = t('ask.done_empty');
                text = await appendThreadFooter(text);
                await sendLongMessage(ctx, text, t('ask.done'));
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
    bot.launch({ dropPendingUpdates: true }).catch(err => {
        console.error("Bot launch failed:", err);
    });

    // Start periodic update checker (notifies via Telegram when update is available)
    updater.startUpdateChecker(bot, ALLOWED_CHAT_ID);
}

init();

// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
