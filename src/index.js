require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Telegraf } = require('telegraf');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec } = require('child_process');
const { loadLocale, t, getLang } = require('./i18n');
const { config, isIDERunning, killIDE, cleanLockFile, launchIDE, PLATFORM } = require('./platform');
const { getLatestAgentResponse, getFullLatestResponse, captureAgentScreenshot, captureFullIDEScreenshot, waitForAgentResponse, sendViaCDP, triggerNewChat, triggerModelMenu, getAvailableModels, selectModel, stopAgent } = require('./cdp_controller');

// Load configured language
const lang = process.env.LANGUAGE || 'en';
loadLocale(lang);

const bot = new Telegraf(process.env.BOT_TOKEN);
const ALLOWED_CHAT_ID = process.env.ALLOWED_CHAT_ID;
const CDP_PORT = process.env.DEBUGGING_PORT || 9333;

// Helper: Send long messages safely within Telegram's 4096 char limit
async function sendLongMessage(ctx, text, prefix = '') {
    const MAX_LEN = 4000;
    const fullText = prefix ? `${prefix}\n\n${text}` : text;
    
    // Retry helper for transient network errors
    async function replyWithRetry(content, retries = 3) {
        for (let attempt = 1; attempt <= retries; attempt++) {
            try {
                await ctx.reply(content);
                return;
            } catch (err) {
                console.error(`sendLongMessage attempt ${attempt}/${retries} failed:`, err.message);
                if (attempt < retries && (err.code === 'EAI_AGAIN' || err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET')) {
                    await new Promise(r => setTimeout(r, 2000 * attempt));
                } else {
                    throw err;
                }
            }
        }
    }

    try {
        if (fullText.length <= MAX_LEN) {
            await replyWithRetry(fullText);
        } else {
            const chunks = [];
            for (let i = 0; i < fullText.length; i += MAX_LEN) {
                chunks.push(fullText.substring(i, i + MAX_LEN));
            }
            for (let i = 0; i < chunks.length; i++) {
                const suffix = chunks.length > 1 ? `\n\n(${i + 1}/${chunks.length})` : '';
                await replyWithRetry(chunks[i] + suffix);
            }
        }
        console.log(`sendLongMessage: Sent ${fullText.length} chars successfully`);
    } catch (err) {
        console.error('sendLongMessage error:', err.message);
        // On format error, retry as plain text
        try {
            const plain = fullText.replace(/[*_`\[\]]/g, '');
            if (plain.length <= MAX_LEN) {
                await replyWithRetry(plain);
            } else {
                await replyWithRetry(plain.substring(0, MAX_LEN) + '\n\n' + t('response_too_long'));
            }
        } catch (e2) {
            console.error('sendLongMessage final error:', e2.message);
        }
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
    if (ALLOWED_CHAT_ID && ctx.chat.id.toString() !== ALLOWED_CHAT_ID) {
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

bot.command('status', async (ctx) => {
    let msg = t('status.title') + '\n';
    
    const ideCheck = await isIDERunning();
    msg += ideCheck ? t('status.ide_running') + '\n' : t('status.ide_stopped') + '\n';
    
    try {
        await getLatestAgentResponse(CDP_PORT);
        msg += t('status.cdp_active') + '\n';
    } catch {
        msg += t('status.cdp_inactive') + '\n';
    }
    
    msg += t('status.bot_running') + '\n';
    ctx.reply(msg, { parse_mode: 'HTML' });
});

bot.command('latest', async (ctx) => {
    try {
        const text = await getLatestAgentResponse(CDP_PORT);
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

bot.command('ask', (ctx) => {
    const parts = ctx.message.text.split(' ');
    parts.shift();
    const query = parts.join(' ').trim();
    
    if (!query) return ctx.reply(t('ask.empty'));
    
    (async () => {
        try {
            await sendViaCDP(query, CDP_PORT);
            await ctx.reply(t('ask.sent', { query }));
            
            const isDone = await waitForAgentResponse(CDP_PORT, 450000, createProgressHandler(ctx));
            if (isDone) {
                let text = await getLatestAgentResponse(CDP_PORT);
                text = stripQueryFromResponse(text, query);
                // Fallback: if diff is empty, get the full last response
                if (!text || text === '[No new messages]') {
                    text = await getFullLatestResponse(CDP_PORT);
                    text = stripQueryFromResponse(text, query);
                }
                if (!text) text = t('ask.done_empty');
                await sendLongMessage(ctx, text, t('ask.done'));
            } else {
                await ctx.reply(t('ask.timeout'));
            }
        } catch (err) {
            ctx.reply(t('ask.send_error', { error: err.message })).catch(() => {});
        }
    })();
});

bot.command('check', async (ctx) => {
    try {
        const isDone = await waitForAgentResponse(CDP_PORT, 5000);
        if (isDone) {
            ctx.reply(t('check.done'));
        } else {
            ctx.reply(t('check.working'));
        }
    } catch (e) {
        ctx.reply(t('check.connection_error', { port: CDP_PORT }));
    }
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
    try {
        const success = await triggerNewChat(CDP_PORT);
        if (success) ctx.reply(t('new_chat.opened'));
        else ctx.reply(t('new_chat.not_found'));
    } catch(e) {
        ctx.reply(t('new_chat.error', { error: e.message }));
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

// ===== WORKSPACE =====

function doLaunchWorkspace(ctx, workspace) {
    ctx.reply(t('workspace.switching', { workspace }));
    (async () => {
        await killIDE();
        try {
            await launchIDE(workspace, CDP_PORT);
            ctx.reply(t('workspace.started'));
        } catch (err) {
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
    doLaunchWorkspace(ctx, workspace);
});

bot.action(/ws_(.+)/, (ctx) => {
    const project = ctx.match[1];
    const wsPath = path.join(config.projectsDir, project);
    currentWorkspaceDir = wsPath;
    ctx.answerCbQuery(t('workspace.selected', { project }));
    doLaunchWorkspace(ctx, wsPath);
});

// ===== LANGUAGE SWITCH =====

bot.command('lang', (ctx) => {
    const parts = ctx.message.text.split(' ');
    parts.shift();
    const newLang = parts.join(' ').trim().toLowerCase();
    
    if (newLang && ['en', 'tr'].includes(newLang)) {
        loadLocale(newLang);
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

bot.action(/lang_(.+)/, (ctx) => {
    const newLang = ctx.match[1];
    loadLocale(newLang);
    ctx.answerCbQuery(t('lang.changed', { lang: newLang }));
    ctx.reply(t('lang.changed', { lang: newLang }));
});

// ===== FILE EXPLORER =====

let currentWorkspaceDir = config.projectsDir;

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
            const encodedPath = Buffer.from(fullPath).toString('base64').slice(0, 60);
            const action = e.isDirectory() ? 'fd_' : 'ff_';
            return [{ text: `${icon} ${e.name}`, callback_data: `${action}${encodedPath}` }];
        });
        
        const navRow = [];
        const parentDir = path.dirname(dirPath);
        if (parentDir !== dirPath && dirPath !== config.projectsDir) {
            const parentEncoded = Buffer.from(parentDir).toString('base64').slice(0, 60);
            navRow.push({ text: t('file.parent_dir'), callback_data: `fd_${parentEncoded}` });
        }
        if (page > 0) {
            const prevData = Buffer.from(`${dirPath}|${page - 1}`).toString('base64').slice(0, 60);
            navRow.push({ text: t('file.prev_page'), callback_data: `fp_${prevData}` });
        }
        if (page < totalPages - 1) {
            const nextData = Buffer.from(`${dirPath}|${page + 1}`).toString('base64').slice(0, 60);
            navRow.push({ text: t('file.next_page'), callback_data: `fp_${nextData}` });
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
        const decoded = Buffer.from(ctx.match[1], 'base64').toString('utf-8');
        ctx.answerCbQuery();
        listDirectory(ctx, decoded);
    } catch(e) {
        ctx.answerCbQuery(t('model.error'));
    }
});

bot.action(/ff_(.+)/, (ctx) => {
    try {
        const decoded = Buffer.from(ctx.match[1], 'base64').toString('utf-8');
        ctx.answerCbQuery(t('file.sending', { filename: path.basename(decoded) }));
        
        const stat = fs.statSync(decoded);
        if (stat.size > 50 * 1024 * 1024) {
            return ctx.reply(t('file.too_large', { size: (stat.size / 1024 / 1024).toFixed(1) }));
        }
        
        ctx.replyWithDocument({ source: decoded, filename: path.basename(decoded) })
            .catch(e => ctx.reply(t('file.send_failed', { error: e.message })));
    } catch(e) {
        ctx.answerCbQuery(t('model.error'));
    }
});

bot.action(/fp_(.+)/, (ctx) => {
    try {
        const decoded = Buffer.from(ctx.match[1], 'base64').toString('utf-8');
        const [dirPath, pageStr] = decoded.split('|');
        ctx.answerCbQuery();
        listDirectory(ctx, dirPath, parseInt(pageStr) || 0);
    } catch(e) {
        ctx.answerCbQuery(t('model.error'));
    }
});

// ===== MENU REGISTRATION =====

bot.command('menu', async (ctx) => {
    await bot.telegram.deleteMyCommands();
    await bot.telegram.setMyCommands([
        { command: 'help', description: t('menu.help_desc') },
        { command: 'ask', description: t('menu.ask_desc') },
        { command: 'latest', description: t('menu.latest_desc') },
        { command: 'screenshot', description: t('menu.screenshot_desc') },
        { command: 'check', description: t('menu.check_desc') },
        { command: 'status', description: t('menu.status_desc') },
        { command: 'start_ide', description: t('menu.start_ide_desc') },
        { command: 'close', description: t('menu.close_desc') },
        { command: 'new', description: t('menu.new_desc') },
        { command: 'model', description: t('menu.model_desc') },
        { command: 'workspace', description: t('menu.workspace_desc') },
        { command: 'lang', description: t('menu.lang_desc') },
    ]);
    ctx.reply(t('menu.updated'));
});

// ===== TEXT MESSAGE HANDLER (Headless mode) =====

bot.on('text', (ctx) => {
    if (ctx.message.text.startsWith('/')) return;
    const query = ctx.message.text;
    
    (async () => {
        try {
            await sendViaCDP(query, CDP_PORT);
            await ctx.reply(t('ask.sent', { query }));
            
            const isDone = await waitForAgentResponse(CDP_PORT, 450000, createProgressHandler(ctx));
            if (isDone) {
                let text = await getLatestAgentResponse(CDP_PORT);
                text = stripQueryFromResponse(text, query);
                // Fallback: if diff is empty, get the full last response
                if (!text || text === '[No new messages]') {
                    text = await getFullLatestResponse(CDP_PORT);
                    text = stripQueryFromResponse(text, query);
                }
                if (!text) text = t('ask.done_empty');
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
            
            const isDone = await waitForAgentResponse(CDP_PORT, 450000, createProgressHandler(ctx));
            if (isDone) {
                let text = await getLatestAgentResponse(CDP_PORT);
                text = stripQueryFromResponse(text, query);
                if (caption) {
                    text = stripQueryFromResponse(text, caption);
                }
                // Fallback: if diff is empty, get the full last response
                if (!text || text === '[No new messages]') {
                    text = await getFullLatestResponse(CDP_PORT);
                    text = stripQueryFromResponse(text, query);
                    if (caption) text = stripQueryFromResponse(text, caption);
                }
                if (!text) text = t('ask.done_empty');
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

bot.launch().then(async () => {
    console.log(t('bot.polling'));
    try {
        await bot.telegram.setMyCommands([
            { command: 'help', description: t('menu.help_desc') },
            { command: 'ask', description: t('menu.ask_desc') },
            { command: 'latest', description: t('menu.latest_desc') },
            { command: 'screenshot', description: t('menu.screenshot_desc') },
            { command: 'check', description: t('menu.check_desc') },
            { command: 'status', description: t('menu.status_desc') },
            { command: 'start_ide', description: t('menu.start_ide_desc') },
            { command: 'close', description: t('menu.close_desc') },
            { command: 'new', description: t('menu.new_desc') },
            { command: 'model', description: t('menu.model_desc') },
            { command: 'workspace', description: t('menu.workspace_desc') },
            { command: 'lang', description: t('menu.lang_desc') },
            { command: 'cmd', description: t('menu.cmd_desc') }
        ]);
        console.log("Menu commands set.");
    } catch(e) {
        console.error("Could not set commands", e.message);
    }
});

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
