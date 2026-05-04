const os = require('os');
const path = require('path');
const { exec } = require('child_process');

const PLATFORM = os.platform(); // 'linux', 'darwin', 'win32'
const HOME = os.homedir();

/**
 * Get platform-specific paths and commands for Antigravity IDE.
 */
const config = {
    /** Antigravity IDE binary path */
    get ideBinary() {
        switch (PLATFORM) {
            case 'darwin':
                const fs = require('fs');
                const userApp = path.join(HOME, 'Applications', 'Antigravity.app');
                if (fs.existsSync(userApp)) return userApp;
                return '/Applications/Antigravity.app';
            case 'win32':
                return path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity', 'Antigravity.exe');
            default: // linux
                return '/usr/share/antigravity/antigravity';
        }
    },

    /** IDE data directory path */
    get dataDir() {
        switch (PLATFORM) {
            case 'darwin': return path.join(HOME, 'Library', 'Application Support', 'Antigravity');
            case 'win32': return path.join(process.env.APPDATA || '', 'Antigravity');
            default: return path.join(HOME, '.config', 'Antigravity');
        }
    },

    /** IDE lock file path */
    get lockFile() {
        return path.join(this.dataDir, 'code.lock');
    },

    /** Default projects directory */
    get projectsDir() {
        let dir = process.env.PROJECTS_DIR || path.join(HOME, 'Projects');
        if (dir.startsWith('~')) {
            dir = path.join(HOME, dir.slice(1));
        }
        return dir;
    },

    /** Temp directory for file downloads */
    get tempDir() {
        return os.tmpdir();
    },

    /** Process name for detection */
    get processName() {
        switch (PLATFORM) {
            case 'darwin': return 'Antigravity';
            case 'win32': return 'Antigravity.exe';
            default: return 'antigravity';
        }
    },

    /** Current platform identifier */
    platform: PLATFORM,

    /** Home directory */
    home: HOME
};

/**
 * Check if the IDE process is currently running.
 * @returns {Promise<boolean>}
 */
function isIDERunning() {
    return new Promise((resolve) => {
        let cmd;
        switch (PLATFORM) {
            case 'win32':
                cmd = `tasklist /FI "IMAGENAME eq ${config.processName}" /NH`;
                exec(cmd, (err, stdout) => {
                    resolve(!!(stdout && stdout.toLowerCase().includes('antigravity')));
                });
                break;
            case 'darwin':
                cmd = `pgrep -f "Antigravity.app/Contents/MacOS"`;
                exec(cmd, (err, stdout) => {
                    resolve(!!(stdout && stdout.trim()));
                });
                break;
            default: // linux
                cmd = `pgrep -x "${config.processName}"`;
                exec(cmd, (err, stdout) => {
                    resolve(!!(stdout && stdout.trim()));
                });
        }
    });
}

/**
 * Kill all IDE processes and clean up lock files.
 * @returns {Promise<void>}
 */
function killIDE() {
    return new Promise((resolve) => {
        const fs = require('fs');
        let cmd;

        switch (PLATFORM) {
            case 'win32':
                cmd = `taskkill /F /IM "${config.processName}" 2>nul & timeout /t 2 /nobreak >nul`;
                break;
            case 'darwin':
                cmd = `pkill -9 -f "${config.ideBinary}" 2>/dev/null; pkill -9 -f "antigravity-launcher" 2>/dev/null; sleep 2`;
                break;
            default: // linux
                // Kill ALL antigravity-related processes including child processes
                // (chrome-sandbox, crashpad_handler, language_server, utility processes)
                cmd = [
                    `pkill -9 -f "${config.ideBinary}" 2>/dev/null`,
                    `pkill -9 -f "antigravity-launcher" 2>/dev/null`,
                    `pkill -9 -f "chrome_crashpad_handler" 2>/dev/null`,
                    `pkill -9 -f "chrome-sandbox" 2>/dev/null`,
                    `pkill -9 -f "language_server_linux" 2>/dev/null`,
                    `pkill -9 -f "user-data-dir.*Antigravity" 2>/dev/null`,
                    `sleep 2`,
                    // Ensure the debugging port is freed
                    `fuser -k 9333/tcp 2>/dev/null || true`
                ].join('; ');
        }

        console.log(`[platform] killIDE cmd: ${cmd}`);
        exec(cmd, () => {
            // Clean lock file
            try { fs.unlinkSync(config.lockFile); } catch (_) {}

            // Verification loop: wait until all antigravity processes are truly dead (max 5s)
            if (PLATFORM === 'linux' || PLATFORM === 'darwin') {
                let attempts = 0;
                const verifyCmd = PLATFORM === 'darwin' 
                    ? 'pgrep -f "Antigravity.app/Contents/MacOS" 2>/dev/null'
                    : 'pgrep -x "antigravity" 2>/dev/null';
                
                const verifyDead = () => {
                    attempts++;
                    exec(verifyCmd, (err, stdout) => {
                        const pids = (stdout || '').trim();
                        if (!pids || attempts >= 10) {
                            if (pids && attempts >= 10) {
                                console.log('[platform] killIDE: force-killing surviving PIDs:', pids);
                                exec(`echo "${pids}" | xargs kill -9 2>/dev/null`);
                            }
                            console.log(`[platform] killIDE verified after ${attempts} checks`);
                            resolve();
                        } else {
                            console.log(`[platform] killIDE: ${pids.split('\n').length} processes still alive, waiting... (${attempts}/10)`);
                            setTimeout(verifyDead, 500);
                        }
                    });
                };
                verifyDead();
            } else {
                console.log('[platform] killIDE completed');
                resolve();
            }
        });
    });
}

/**
 * Remove the IDE lock file.
 */
function cleanLockFile() {
    const fs = require('fs');
    try { fs.unlinkSync(config.lockFile); } catch (_) {}
}

/**
 * Clear the IDE's window restore state so a fresh workspace can be opened.
 * After SIGKILL, the IDE tries to restore the previous session and ignores
 * the workspace argument. Removing the Backups directory prevents this.
 */
function clearWindowState() {
    const fs = require('fs');
    const backupsDir = path.join(config.dataDir, 'Backups');
    try {
        if (fs.existsSync(backupsDir)) {
            fs.rmSync(backupsDir, { recursive: true, force: true });
            console.log('[platform] Cleared IDE Backups (session restore state)');
        }
    } catch (e) {
        console.error('[platform] Failed to clear Backups:', e.message);
    }
    // Clear backupWorkspaces from the CORRECT storage.json location
    // (User/globalStorage/storage.json — NOT the root-level one which doesn't exist)
    clearBackupWorkspaces();
}

/**
 * Surgically clear the backupWorkspaces entry from storage.json
 * so the IDE doesn't try to restore old windows on restart.
 * Preserves all other settings (telemetry, profiles, etc).
 */
function clearBackupWorkspaces() {
    const fs = require('fs');
    const storageFile = path.join(config.dataDir, 'User', 'globalStorage', 'storage.json');
    try {
        if (!fs.existsSync(storageFile)) {
            console.log('[platform] storage.json not found at', storageFile);
            return;
        }
        const data = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
        if (data.backupWorkspaces) {
            // Clear all workspace restore entries
            data.backupWorkspaces = { workspaces: [], folders: [], emptyWindows: [] };
            fs.writeFileSync(storageFile, JSON.stringify(data, null, 2), 'utf8');
            console.log('[platform] Cleared backupWorkspaces in storage.json');
        }
    } catch (e) {
        console.error('[platform] Failed to clear backupWorkspaces:', e.message);
        // Fallback: try deleting the file entirely
        try { fs.unlinkSync(storageFile); console.log('[platform] Deleted storage.json as fallback'); } catch (_) {}
    }
}

/**
 * Launch the IDE with an optional workspace path.
 * @param {string} [workspace] - Optional workspace/project path
 * @param {number} [port] - CDP debugging port
 * @returns {Promise<void>}
 */
function launchIDE(workspace, port = 9333) {
    return new Promise((resolve, reject) => {
        const binary = config.ideBinary;
        const fs = require('fs');

        // Check if binary exists
        if (!fs.existsSync(binary)) {
            return reject(new Error('IDE_NOT_INSTALLED'));
        }

        const executeCmd = () => {
            let cmd;
            // --new-window ensures the IDE opens a fresh window for the workspace
            // instead of restoring the previous session
            // --disable-workspace-trust prevents the trust dialog from blocking automation
            const wsArg = workspace ? `--new-window --disable-workspace-trust "${workspace}"` : '';

            console.log(`[platform] launchIDE: workspace=${workspace || 'none'}, port=${port}`);

            switch (PLATFORM) {
                case 'win32':
                    cmd = `start "" "${binary}" --remote-debugging-port=${port} ${wsArg}`;
                    break;
                case 'darwin':
                    // Executing the binary directly allows passing arguments to an already running instance (like --new-window)
                    // Using 'open -a' ignores arguments if the app is already running.
                    const macBinary = `${binary}/Contents/MacOS/Antigravity`;
                    cmd = `nohup "${macBinary}" --remote-debugging-port=${port} ${wsArg} > /dev/null 2>&1 &`;
                    break;
                default: // linux
                    // Always use the binary directly with full args for reliable workspace switching.
                    // The launcher script doesn't pass --disable-workspace-trust and can interfere.
                    cmd = `nohup "${binary}" --remote-debugging-port=${port} ${wsArg} > /dev/null 2>&1 &`;
            }

            console.log(`[platform] launchIDE cmd: ${cmd}`);

            exec(cmd, (err) => {
                if (err) {
                    console.error(`[platform] launchIDE exec error: ${err.message}`);
                    reject(err);
                } else {
                    console.log('[platform] launchIDE exec completed successfully');
                    resolve();
                }
            });
        };

        if (workspace) {
            isIDERunning().then(running => {
                // Only clear session restore state if NO existing IDE is running.
                // With multi-window, we don't want to wipe other windows' backup state.
                if (!running) {
                    clearWindowState();
                }
                executeCmd();
            });
        } else {
            executeCmd();
        }
    });
}

/**
 * Auto-click the "Trust Workspace" button via CDP after IDE launches.
 * The IDE shows a trust dialog when opening an untrusted workspace.
 * This function polls CDP until the dialog appears and clicks "Trust Workspace".
 * @param {number} port - CDP debugging port
 * @param {number} maxAttempts - Maximum number of polling attempts
 * @returns {Promise<boolean>} - true if trust was clicked
 */
function trustWorkspaceViaCDP(port = 9333, maxAttempts = 15) {
    const http = require('http');
    return new Promise(async (resolve) => {
        for (let i = 0; i < maxAttempts; i++) {
            await new Promise(r => setTimeout(r, 2000));
            try {
                const raw = await new Promise((res, rej) => {
                    http.get(`http://127.0.0.1:${port}/json`, (resp) => {
                        let data = '';
                        resp.on('data', chunk => data += chunk);
                        resp.on('end', () => res(data));
                    }).on('error', rej);
                });
                const targets = JSON.parse(raw);
                const pages = targets.filter(t => t.webSocketDebuggerUrl && !t.url.includes('devtools://'));

                for (const target of pages) {
                    let client;
                    try {
                        const CDP = require('chrome-remote-interface');
                        client = await CDP({ target: target.webSocketDebuggerUrl });
                        const { Runtime } = client;
                        await Runtime.enable();

                        const result = await Runtime.evaluate({
                            expression: `
                                (function() {
                                    // Look for "Trust Workspace" button in the trust dialog
                                    const allBtns = Array.from(document.querySelectorAll('button, a.monaco-button'));
                                    const trustBtn = allBtns.find(b => {
                                        const text = (b.textContent || '').trim().toLowerCase();
                                        return text.includes('trust workspace') || 
                                               text.includes('trust') ||
                                               text.includes('güven') ||
                                               text.includes('çalışma alanına güven');
                                    });
                                    if (trustBtn) {
                                        trustBtn.click();
                                        return { clicked: true, text: trustBtn.textContent.trim() };
                                    }
                                    // Also check for "Manage" or "Cancel" dialog indicator
                                    const hasDialog = allBtns.some(b => {
                                        const t = (b.textContent || '').toLowerCase();
                                        return t.includes('trust') || t.includes('manage') || t.includes('restricted');
                                    });
                                    return { clicked: false, hasDialog };
                                })()
                            `,
                            returnByValue: true
                        });

                        const val = result?.result?.value;
                        await client.close();

                        if (val && val.clicked) {
                            console.log(`[platform] Trust Workspace clicked: "${val.text}"`);
                            resolve(true);
                            return;
                        }
                    } catch (e) {
                        try { if (client) await client.close(); } catch (_) {}
                    }
                }
            } catch (_) {
                // CDP not ready yet
            }
        }
        console.log('[platform] Trust dialog not found (may not be needed)');
        resolve(false);
    });
}

module.exports = {
    config,
    isIDERunning,
    killIDE,
    cleanLockFile,
    launchIDE,
    trustWorkspaceViaCDP,
    PLATFORM
};
