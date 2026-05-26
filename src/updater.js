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
            // Fetch origin main so we can get the latest commit message
            execSync('git fetch origin main', { cwd: PROJECT_ROOT, stdio: 'ignore' });
            
            const hash = execSync('git log -1 --format="%h" origin/main', { cwd: PROJECT_ROOT }).toString().trim();
            const message = execSync('git log -1 --format="%s" origin/main', { cwd: PROJECT_ROOT }).toString().trim();
            
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
 * Get remote version from package.json on GitHub (main branch).
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
        const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/package.json`;

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

    const available = (remoteCommit && remoteCommit !== local.commitHash) ||
                      (remoteVersion && remoteVersion !== local.version);

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
        if (!pmId) {
            return reject(new Error('Not running under PM2. Please update manually:\n`cd ' + PROJECT_ROOT + ' && git pull && npm install`'));
        }

        // Step 1: Check if package.json will change before we reset
        exec('git fetch origin main && git diff --name-only HEAD origin/main', { cwd: PROJECT_ROOT }, (err, stdout) => {
            if (err) return reject(new Error(`git fetch failed: ${err.message}`));
            
            const diffOutput = stdout.trim();
            const packageChanged = diffOutput.includes('package.json') || diffOutput.includes('package-lock.json');

            // Step 2: Force one-way sync (discard local changes)
            exec('git reset --hard origin/main', { cwd: PROJECT_ROOT }, (err2, resetOut) => {
                if (err2) return reject(new Error(`git reset failed: ${err2.message}`));

            const nextStep = () => {
                // Set update flag for index.js
                try { fs.writeFileSync(path.join(PROJECT_ROOT, '.update_flag'), '1'); } catch (e) {}
                
                // Resolve immediately so the bot can send the confirmation message
                resolve({ updated: true, message: t('update.success') });
                
                // Delay restart by 3 seconds to let Telegram API deliver the message
                setTimeout(() => {
                    exec(`pm2 restart ${pmId}`, (err2) => {
                        if (err2) console.error(`PM2 restart failed: ${err2.message}`);
                    });
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
        }); // close exec git reset
        }); // close exec git fetch
    }); // close new Promise
} // close performUpdate

/**
 * Start periodic update checking. Sends Telegram notification when update is found.
 * @param {object} bot - Telegraf bot instance
 * @param {Array<string>} chatIds - Array of Chat IDs to send notifications to
 */
function startUpdateChecker(bot, chatIds) {
    if (!chatIds || chatIds.length === 0) return;

    const doCheck = async () => {
        try {
            const result = await checkForUpdates();
            if (result.available) {
                const msg = t('update.available') +
                    t('update.current_version', { version: result.localVersion, commit: result.localCommit }) +
                    t('update.new_version_info', { version: result.remoteVersion, commit: result.remoteCommit }) +
                    (result.remoteCommitMessage ? t('update.changelog', { message: result.remoteCommitMessage }) : `\n`) +
                    t('update.click_to_download');
                for (const chatId of chatIds) {
                    bot.telegram.sendMessage(chatId, msg, { parse_mode: 'HTML' }).catch(() => {});
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
    startUpdateChecker
};
