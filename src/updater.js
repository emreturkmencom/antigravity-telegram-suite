/**
 * Updater Module
 * 
 * Checks for updates from the GitHub repository, notifies the user
 * via Telegram, and provides self-update capability.
 * 
 * Uses git to compare local vs remote commits and pm2 to restart.
 */

const { execSync, exec } = require('child_process');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { t } = require('./i18n');

const PROJECT_ROOT = path.join(__dirname, '..');
const PACKAGE_JSON = path.join(PROJECT_ROOT, 'package.json');
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Get the current local version and git commit hash.
 */
function getLocalVersion() {
    let version = '0.0.0';
    try {
        const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
        version = pkg.version || version;
    } catch(_) {}

    let commitHash = 'unknown';
    try {
        commitHash = execSync('git rev-parse --short HEAD', { cwd: PROJECT_ROOT })
            .toString().trim();
    } catch(_) {}

    return { version, commitHash };
}

/**
 * Get the latest remote commit hash and message.
 */
function getRemoteCommitInfo() {
    return new Promise((resolve, reject) => {
        try {
            // Fetch origin fix-telegram-4000-char-limit so we can get the latest commit message
            execSync('git fetch origin fix-telegram-4000-char-limit', { cwd: PROJECT_ROOT, stdio: 'ignore' });
            
            const hash = execSync('git log -1 --format="%h" origin/fix-telegram-4000-char-limit', { cwd: PROJECT_ROOT }).toString().trim();
            const message = execSync('git log -1 --format="%s" origin/fix-telegram-4000-char-limit', { cwd: PROJECT_ROOT }).toString().trim();
            
            resolve({ hash, message });
        } catch(e) {
            // Fallback to ls-remote if fetch fails
            try {
                const result = execSync('git ls-remote origin HEAD', { cwd: PROJECT_ROOT }).toString().trim();
                const hash = result.split('\t')[0];
                resolve({ hash: hash ? hash.substring(0, 7) : null, message: '' });
            } catch(e2) {
                reject(e2);
            }
        }
    });
}

/**
 * Get remote version from package.json on GitHub (fix-telegram-4000-char-limit branch).
 */
function getRemoteVersion() {
    return new Promise((resolve, reject) => {
        // Read repo URL from package.json
        let repoUrl = '';
        try {
            const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON, 'utf8'));
            repoUrl = pkg.repository?.url || '';
        } catch(_) {}

        // Extract owner/repo from URL
        const match = repoUrl.match(/github\.com[/:]([^/]+)\/([^/.]+)/);
        if (!match) return resolve(null);

        const [, owner, repo] = match;
        const url = `https://raw.githubusercontent.com/${owner}/${repo}/fix-telegram-4000-char-limit/package.json`;

        https.get(url, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const remote = JSON.parse(data);
                    resolve(remote.version || null);
                } catch(_) { resolve(null); }
            });
        }).on('error', () => resolve(null));
    });
}

/**
 * Helper to check if a remote version is newer than the local version using semver logic.
 */
function isNewerVersion(remote, local) {
    if (!remote || !local) return false;
    const rParts = remote.split('.').map(Number);
    const lParts = local.split('.').map(Number);
    for (let i = 0; i < Math.max(rParts.length, lParts.length); i++) {
        const r = rParts[i] || 0;
        const l = lParts[i] || 0;
        if (r > l) return true;
        if (r < l) return false;
    }
    return false;
}

/**
 * Check if an update is available.
 * Returns { available, localVersion, remoteVersion, localCommit, remoteCommit }
 */
async function checkForUpdates() {
    const local = getLocalVersion();
    let remoteCommit = null;
    let remoteCommitMessage = '';
    let remoteVersion = null;

    try { 
        const info = await getRemoteCommitInfo(); 
        remoteCommit = info.hash;
        remoteCommitMessage = info.message;
    } catch(_) {}
    
    try { remoteVersion = await getRemoteVersion(); } catch(_) {}

    let hasNewCommits = false;
    if (remoteCommit) {
        try {
            // Check if origin/fix-telegram-4000-char-limit is already merged into HEAD (ancestor of HEAD)
            execSync('git merge-base --is-ancestor origin/fix-telegram-4000-char-limit HEAD', { cwd: PROJECT_ROOT });
        } catch (_) {
            // If the command fails, origin/fix-telegram-4000-char-limit is not an ancestor, so we have new commits
            hasNewCommits = true;
        }
    }

    const available = hasNewCommits || (remoteVersion && isNewerVersion(remoteVersion, local.version));

    return {
        available: !!available,
        localVersion: local.version,
        remoteVersion: remoteVersion || local.version,
        localCommit: local.commitHash,
        remoteCommit: remoteCommit || local.commitHash,
        remoteCommitMessage: remoteCommitMessage
    };
}

/**
 * Perform a self-update: git pull, npm install (if needed), pm2 restart.
 * Returns a promise that resolves with the update result message.
 */
function performUpdate() {
    return new Promise((resolve, reject) => {
        const pmId = process.env.pm_id;
        const isWatchdog = process.env.WATCHDOG === 'true';
        if (!pmId && !isWatchdog) {
            return reject(new Error('Not running under PM2 or Watchdog. Please update manually:\n`cd ' + PROJECT_ROOT + ' && git pull && npm install`'));
        }

        // Step 1: Check if package.json will change before we merge
        exec('git fetch origin fix-telegram-4000-char-limit && git diff --name-only HEAD origin/fix-telegram-4000-char-limit', { cwd: PROJECT_ROOT }, (err, stdout) => {
            if (err) return reject(new Error(`git fetch failed: ${err.message}`));
            
            const diffOutput = stdout.trim();
            const packageChanged = diffOutput.includes('package.json') || diffOutput.includes('package-lock.json');

            // Step 2: Check if working directory is dirty, and stash if so to prevent conflicts with unstaged changes
            let stashed = false;
            try {
                const isDirty = execSync('git status --porcelain', { cwd: PROJECT_ROOT }).toString().trim();
                if (isDirty) {
                    execSync('git stash', { cwd: PROJECT_ROOT });
                    stashed = true;
                }
            } catch (e) {
                console.error('[updater] Stash check failed:', e.message);
            }

            // Step 3: Try to merge updates from the developer's fix-telegram-4000-char-limit branch instead of discarding corrections with reset --hard
            exec('git merge origin/fix-telegram-4000-char-limit -m "Merge updates from developer"', { cwd: PROJECT_ROOT }, (err2, mergeOut) => {
                if (err2) {
                    // Merge failed (e.g., conflicts) -> abort the merge and restore stash
                    try {
                        execSync('git merge --abort', { cwd: PROJECT_ROOT });
                    } catch (_) {}
                    if (stashed) {
                        try { execSync('git stash pop', { cwd: PROJECT_ROOT }); } catch (_) {}
                    }
                    return reject(new Error(`git merge failed (conflicts detected): ${err2.message}`));
                }

                // Merge succeeded. Restore stash if we had one.
                if (stashed) {
                    try {
                        execSync('git stash pop', { cwd: PROJECT_ROOT });
                    } catch (stashPopErr) {
                        console.error('[updater] Failed to pop stash after successful merge:', stashPopErr.message);
                    }
                }

                const nextStep = () => {
                    // Set update flag for index.js
                    try { fs.writeFileSync(path.join(PROJECT_ROOT, '.update_flag'), '1'); } catch (e) {}
                    
                    // Resolve immediately so the bot can send the confirmation message
                    resolve({ updated: true, message: t('update.success') });
                    
                    // Delay restart by 3 seconds to let Telegram API deliver the message
                    setTimeout(() => {
                        if (isWatchdog) {
                            process.exit(0);
                        } else {
                            exec(`pm2 restart ${pmId}`, (err2) => {
                                if (err2) console.error(`PM2 restart failed: ${err2.message}`);
                            });
                        }
                    }, 3000);
                };

                if (packageChanged) {
                    exec('npm install --production', { cwd: PROJECT_ROOT }, (err3) => {
                        if (err3) console.error('npm install warning:', err3.message);
                        nextStep();
                    });
                } else {
                    nextStep();
                }
            }); // close exec git merge
        }); // close exec git fetch
    }); // close new Promise
} // close performUpdate

/**
 * Start periodic update checking. Sends Telegram notification, fusions updates, and restarts bot.
 * @param {object} bot - Telegraf bot instance
 * @param {Array<string>} chatIds - Array of Chat IDs to send notifications to
 */
function startUpdateChecker(bot, chatIds) {
    if (!chatIds || chatIds.length === 0) return;

    const doCheck = async () => {
        try {
            const result = await checkForUpdates();
            if (result.available) {
                // Send auto-update starting message
                const msg = t('update.auto_updating', { version: result.remoteVersion, commit: result.remoteCommit }) ||
                            `🔄 <b>[Mise à jour auto]</b> Nouvelle mise à jour du développeur détectée.\nFusion des changements et mise à jour en cours...`;
                
                for (const chatId of chatIds) {
                    await bot.telegram.sendMessage(chatId, msg, { parse_mode: 'HTML' }).catch(() => {});
                }

                // Execute the update
                try {
                    await performUpdate();
                    // performUpdate will write the .update_flag and restart or exit
                } catch (updateErr) {
                    const failMsg = t('update.auto_update_failed', { error: updateErr.message }) ||
                                    `❌ <b>[Mise à jour auto]</b> Échec de la mise à jour : ${updateErr.message}`;
                    for (const chatId of chatIds) {
                        await bot.telegram.sendMessage(chatId, failMsg, { parse_mode: 'HTML' }).catch(() => {});
                    }
                }
            }
        } catch(e) {
            console.debug(`[updater] check failed: ${e.message}`);
        }
    };

    // Check on startup (after 30 seconds delay to let bot initialize)
    setTimeout(doCheck, 30000);

    // Periodic check
    setInterval(doCheck, CHECK_INTERVAL_MS);
}

module.exports = {
    checkForUpdates,
    performUpdate,
    getLocalVersion,
    startUpdateChecker,
    isNewerVersion
};
