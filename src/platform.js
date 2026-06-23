const os = require('os');
const path = require('path');
const { exec } = require('child_process');

const PLATFORM = os.platform(); // 'linux', 'darwin', 'win32'
const HOME = os.homedir();

// ===== DUAL-APP SUPPORT (New in 2.0) =====
// Supports both Antigravity Standalone Agent and Antigravity IDE
function getPreferredApp() {
    return process.env.ANTIGRAVITY_PREFERRED_APP || 'agent';
}

/**
 * Get platform-specific paths and commands for Antigravity applications.
 * Supports dual-app architecture: 'agent' (standalone) vs 'ide' (classic VS Code fork).
 */
const config = {
    /** Get preferred active app name */
    get preferredApp() {
        return getPreferredApp();
    },

    /** Antigravity Standalone Agent binary path */
    get agentBinary() {
        return getAppBinary('agent');
    },

    /** Antigravity IDE (Classic VSCode-based) binary path */
    get ideBinary() {
        return getAppBinary('ide');
    },

    /** Standalone Agent data directory path */
    get agentDataDir() {
        return getAppDataDir('agent');
    },

    /** Classic IDE data directory path */
    get ideDataDir() {
        return getAppDataDir('ide');
    },

    /** Preferred app data directory path (backwards compatibility) */
    get dataDir() {
        return getAppDataDir(getPreferredApp());
    },

    /** Preferred app lock file path (backwards compatibility) */
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

    /** Preferred process name (backwards compatibility) */
    get processName() {
        return getAppProcessName(getPreferredApp());
    },

    /** Current platform identifier */
    platform: PLATFORM,

    /** Home directory */
    home: HOME
};

/**
 * Get binary path for specific Antigravity application.
 * @param {string} app - 'agent' or 'ide'
 */
function getAppBinary(app = getPreferredApp()) {
    if (app === 'ide') {
        if (process.env.ANTIGRAVITY_IDE_PATH) return process.env.ANTIGRAVITY_IDE_PATH;
        switch (PLATFORM) {
            case 'darwin':
                const fs = require('fs');
                const userApp = path.join(HOME, 'Applications', 'Antigravity IDE.app');
                if (fs.existsSync(userApp)) return userApp;
                return '/Applications/Antigravity IDE.app';
            case 'win32':
                return path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity', 'Antigravity IDE.exe');
            default: // linux
                return '/opt/antigravity-ide/antigravity-ide';
        }
    } else {
        // agent (standalone)
        if (process.env.ANTIGRAVITY_AGENT_PATH) return process.env.ANTIGRAVITY_AGENT_PATH;
        switch (PLATFORM) {
            case 'darwin':
                const fs2 = require('fs');
                const userApp2 = path.join(HOME, 'Applications', 'Antigravity.app');
                if (fs2.existsSync(userApp2)) return userApp2;
                return '/Applications/Antigravity.app';
            case 'win32':
                return path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity', 'Antigravity.exe');
            default: // linux
                return '/opt/antigravity/antigravity';
        }
    }
}

/**
 * Get data directory path for specific Antigravity application.
 * @param {string} app - 'agent' or 'ide'
 */
function getAppDataDir(app = getPreferredApp()) {
    const fs = require('fs');
    if (app === 'ide') {
        const candidates = [];
        switch (PLATFORM) {
            case 'darwin':
                candidates.push(path.join(HOME, 'Library', 'Application Support', 'Antigravity IDE'));
                candidates.push(path.join(HOME, 'Library', 'Application Support', 'Antigravity-IDE'));
                candidates.push(path.join(HOME, 'Library', 'Application Support', 'antigravity-ide'));
                break;
            case 'win32':
                const base = process.env.APPDATA || '';
                candidates.push(path.join(base, 'Antigravity IDE'));
                candidates.push(path.join(base, 'Antigravity-IDE'));
                candidates.push(path.join(base, 'antigravity-ide'));
                break;
            default:
                candidates.push(path.join(HOME, '.config', 'Antigravity IDE'));
                candidates.push(path.join(HOME, '.config', 'Antigravity-IDE'));
                candidates.push(path.join(HOME, '.config', 'antigravity-ide'));
                break;
        }

        let activeDir = candidates[0];
        let maxTime = 0;

        for (const dir of candidates) {
            if (!fs.existsSync(dir)) continue;
            const vscdbPath = path.join(dir, 'User', 'globalStorage', 'state.vscdb');
            if (fs.existsSync(vscdbPath)) {
                const stat = fs.statSync(vscdbPath);
                if (stat.mtimeMs > maxTime) {
                    maxTime = stat.mtimeMs;
                    activeDir = dir;
                }
            } else {
                const stat = fs.statSync(dir);
                if (maxTime === 0 && stat.mtimeMs > maxTime) {
                    activeDir = dir;
                }
            }
        }
        return activeDir;
    } else {
        // Standalone Agent — directory name unchanged
        const suffix = 'Antigravity';
        switch (PLATFORM) {
            case 'darwin': return path.join(HOME, 'Library', 'Application Support', suffix);
            case 'win32': return path.join(process.env.APPDATA || '', suffix);
            default: return path.join(HOME, '.config', suffix);
        }
    }
}

/**
 * Get process name for specific Antigravity application.
 * @param {string} app - 'agent' or 'ide'
 */
function getAppProcessName(app = getPreferredApp()) {
    if (app === 'ide') {
        switch (PLATFORM) {
            case 'darwin': return 'Antigravity IDE';
            case 'win32': return 'Antigravity IDE.exe';
            default: return 'antigravity-ide';
        }
    } else {
        switch (PLATFORM) {
            case 'darwin': return 'Antigravity';
            case 'win32': return 'Antigravity.exe';
            default: return 'antigravity';
        }
    }
}

/**
 * Check if the specified Antigravity process is currently running.
 * @param {string} [app=PREFERRED_APP] - 'agent' or 'ide'
 * @returns {Promise<boolean>}
 */
function isIDERunning(app = getPreferredApp()) {
    return new Promise((resolve) => {
        const procName = getAppProcessName(app);
        let cmd;
        switch (PLATFORM) {
            case 'win32':
                cmd = `tasklist /FI "IMAGENAME eq ${procName}" /NH`;
                exec(cmd, (err, stdout) => {
                    resolve(!!(stdout && stdout.toLowerCase().includes(procName.toLowerCase().replace('.exe', ''))));
                });
                break;
            case 'darwin':
                cmd = `pgrep -f "${procName}.app/Contents/MacOS"`;
                exec(cmd, (err, stdout) => {
                    resolve(!!(stdout && stdout.trim()));
                });
                break;
            default: // linux
                cmd = `pgrep -x "${procName}"`;
                exec(cmd, (err, stdout) => {
                    resolve(!!(stdout && stdout.trim()));
                });
        }
    });
}

/**
 * Kill specified Antigravity processes and clean up lock files.
 * @param {string} [app=PREFERRED_APP] - 'agent' or 'ide'
 * @returns {Promise<void>}
 */
function killIDE(app = getPreferredApp()) {
    return new Promise((resolve) => {
        const fs = require('fs');
        const procName = getAppProcessName(app);
        const binary = getAppBinary(app);
        const lock = path.join(getAppDataDir(app), 'code.lock');
        let cmd;

        // Two-stage termination: SIGTERM first (graceful) → wait → SIGKILL (fallback)
        // SIGKILL alone prevents Electron from flushing state.vscdb to disk,
        // causing chat history and settings to be lost on restart.
        switch (PLATFORM) {
            case 'win32':
                // Try graceful termination first, then fallback to force-kill
                cmd = `taskkill /IM "${procName}" 2>nul & timeout /t 3 /nobreak >nul & taskkill /F /IM "${procName}" 2>nul & timeout /t 1 /nobreak >nul`;
                break;
            case 'darwin':
                // macOS Native quit triggers the graceful shutdown and state saving perfectly
                cmd = `osascript -e 'quit app "${procName}"'`;
                break;
            default: // linux
                // Kill ALL app-related processes including child processes
                // (chrome-sandbox, crashpad_handler, language_server, utility processes)
                cmd = [
                    // Stage 1: Graceful SIGTERM — lets Electron flush state.vscdb
                    `pkill -15 -x "${procName}" 2>/dev/null`,
                    `pkill -15 -f "${binary}" 2>/dev/null`,
                    `pkill -15 -f "antigravity-launcher" 2>/dev/null`,
                    `sleep 3`,
                    // Stage 2: Forceful SIGKILL fallback for any lingering processes
                    `pkill -9 -x "${procName}" 2>/dev/null`,
                    `pkill -9 -f "${binary}" 2>/dev/null`,
                    `pkill -9 -f "antigravity-launcher" 2>/dev/null`,
                    `pkill -9 -f "chrome_crashpad_handler" 2>/dev/null`,
                    `pkill -9 -f "chrome-sandbox" 2>/dev/null`,
                    `pkill -9 -f "language_server_linux" 2>/dev/null`,
                    `pkill -9 -f "user-data-dir.*${app === 'ide' ? 'Antigravity.IDE' : 'Antigravity'}" 2>/dev/null`,
                    `sleep 1`,
                    // Ensure the debugging port is freed
                    `fuser -k ${app === 'ide' ? (process.env.IDE_CDP_PORT || 9334) : (process.env.AGENT_CDP_PORT || process.env.DEBUGGING_PORT || 9333)}/tcp 2>/dev/null || true`
                ].join('; ');
        }

        console.log(`[platform] killIDE app=${app} cmd: ${cmd}`);
        exec(cmd, () => {
            // Clean lock file
            try { fs.unlinkSync(lock); } catch (_) {}

            // Verification loop: wait until all processes are truly dead (max 5s)
            if (PLATFORM === 'linux' || PLATFORM === 'darwin') {
                let attempts = 0;
                const verifyCmd = PLATFORM === 'darwin' 
                    ? `pgrep -f "${procName}.app/Contents/MacOS" 2>/dev/null`
                    : `pgrep -x "${procName}" 2>/dev/null`;
                
                const verifyDead = () => {
                    attempts++;
                    exec(verifyCmd, (err, stdout) => {
                        const pids = (stdout || '').trim();
                        if (!pids || attempts >= 10) {
                            if (pids && attempts >= 10) {
                                console.log(`[platform] killIDE app=${app}: force-killing surviving PIDs:`, pids);
                                exec(`echo "${pids}" | xargs kill -9 2>/dev/null`);
                            }
                            console.log(`[platform] killIDE app=${app} verified after ${attempts} checks`);
                            resolve();
                        } else {
                            console.log(`[platform] killIDE: ${pids.split('\n').length} processes still alive, waiting... (${attempts}/10)`);
                            setTimeout(verifyDead, 500);
                        }
                    });
                };
                verifyDead();
            } else {
                console.log(`[platform] killIDE app=${app} completed`);
                resolve();
            }
        });
    });
}

/**
 * Remove the specified lock file.
 * @param {string} [app=PREFERRED_APP] - 'agent' or 'ide'
 */
function cleanLockFile(app = getPreferredApp()) {
    const fs = require('fs');
    const lock = path.join(getAppDataDir(app), 'code.lock');
    try { fs.unlinkSync(lock); } catch (_) {}
}

/**
 * Clear the IDE's window restore state so a fresh workspace can be opened.
 * After SIGKILL, the IDE tries to restore the previous session and ignores
 * the workspace argument. Removing the Backups directory prevents this.
 * @param {string} [app=PREFERRED_APP] - 'agent' or 'ide'
 */
function clearWindowState(app = getPreferredApp()) {
    // We intentionally DO NOT delete the Backups directory here anymore.
    // Deleting Backups wipes the hot exit state, which includes the active AI chat session UUID.
    // This was causing 'her yeni başlatmaya eski sohbet geçmişi yok oluyor' (old chat history disappearing on restart).
    
    // Clear backupWorkspaces from the CORRECT storage.json location
    // (User/globalStorage/storage.json — NOT the root-level one which doesn't exist)
    // clearBackupWorkspaces(app);
}

/**
 * Surgically clear the backupWorkspaces entry from storage.json
 * so the IDE doesn't try to restore old windows on restart.
 * Preserves all other settings (telemetry, profiles, etc).
 * @param {string} [app=PREFERRED_APP] - 'agent' or 'ide'
 */
function clearBackupWorkspaces(app = getPreferredApp()) {
    const fs = require('fs');
    const storageFile = path.join(getAppDataDir(app), 'User', 'globalStorage', 'storage.json');
    try {
        if (!fs.existsSync(storageFile)) {
            console.log(`[platform] storage.json not found for ${app} at`, storageFile);
            return;
        }
        const data = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
        if (data.backupWorkspaces) {
            // Clear all workspace restore entries
            data.backupWorkspaces = { workspaces: [], folders: [], emptyWindows: [] };
            fs.writeFileSync(storageFile, JSON.stringify(data, null, 2), 'utf8');
            console.log(`[platform] Cleared backupWorkspaces in storage.json for ${app}`);
        }
    } catch (e) {
        console.error(`[platform] Failed to clear backupWorkspaces for ${app}:`, e.message);
        // Fallback: try deleting the file entirely
        try { fs.unlinkSync(storageFile); console.log(`[platform] Deleted storage.json for ${app} as fallback`); } catch (_) {}
    }
}

/**
 * Launch the specified Antigravity application with an optional workspace path.
 * Supports running both Standalone and Classic IDE concurrently by isolating user data directories.
 * 
 * LINUX SAFETY: Preserves critical fallback mechanisms:
 * - CDP target verification loop after IPC calls
 * - Raw binary fallback if IPC fails
 * - GDK_BACKEND environment stripping (RustDesk/Wayland)
 * - clearWindowState() on fresh launches
 * 
 * @param {string} [workspace] - Optional workspace/project path
 * @param {number} [port=9333] - CDP debugging port
 * @param {string} [app=PREFERRED_APP] - 'agent' or 'ide'
 * @returns {Promise<void>}
 */
function launchIDE(workspace, port = 9333, app = getPreferredApp()) {
    return new Promise((resolve, reject) => {
        const binary = getAppBinary(app);
        const fs = require('fs');

        // Check if binary exists
        if (!fs.existsSync(binary)) {
            return reject(new Error('IDE_NOT_INSTALLED'));
        }

        const executeCmd = async (isRunning) => {
            let cmd;
            // --new-window ensures the IDE opens a fresh window for the workspace
            // instead of restoring the previous session
            // --disable-workspace-trust prevents the trust dialog from blocking automation
            const wsArg = workspace ? `--new-window --disable-workspace-trust "${workspace}"` : '';
            const dataDir = getAppDataDir(app);
            
            // Core upgrade: Supply separate --user-data-dir parameter to Electron
            // so both apps can run concurrently without instance locking conflicts!
            const dataDirArg = `--user-data-dir="${dataDir}"`;

            console.log(`[platform] launchIDE: app=${app}, workspace=${workspace || 'none'}, port=${port}, isRunning=${isRunning}`);

            switch (PLATFORM) {
                case 'win32':
                    cmd = isRunning
                        ? `start "" "${binary}" ${dataDirArg} ${wsArg}`
                        : `start "" "${binary}" --remote-debugging-port=${port} ${dataDirArg} ${wsArg}`;
                    break;
                case 'darwin':
                    // Use the CLI script which handles IPC to correctly open new windows
                    // in existing instances, unlike the raw MacOS binary.
                    const macCli = `${binary}/Contents/Resources/app/bin/${app === 'ide' ? 'antigravity-ide' : 'antigravity'}`;
                    const cliToUse = fs.existsSync(macCli) ? macCli : `${binary}/Contents/Resources/app/bin/antigravity`;
                    cmd = isRunning
                        ? `nohup "${cliToUse}" ${dataDirArg} ${wsArg} > /dev/null 2>&1 &`
                        : `nohup "${cliToUse}" --remote-debugging-port=${port} ${dataDirArg} ${wsArg} > /dev/null 2>&1 &`;
                    break;
                default: // linux
                    if (isRunning) {
                        // IDE is already running with CDP on the port.
                        // Cannot launch raw binary again — it tries to init a GUI
                        // and crashes if Wayland is unavailable (e.g. disabled for RustDesk).
                        // Instead, use ELECTRON_RUN_AS_NODE + cli.js to send IPC to the
                        // running instance. This only sends a message, no GUI needed.
                        const resolvedBinary = fs.realpathSync(binary);
                        const cliJs = `${path.dirname(resolvedBinary)}/resources/app/out/cli.js`;
                        if (fs.existsSync(cliJs)) {
                            cmd = `ELECTRON_RUN_AS_NODE=1 "${binary}" "${cliJs}" ${dataDirArg} ${wsArg}`;
                        } else {
                            cmd = `nohup "${binary}" --remote-debugging-port=${port} ${dataDirArg} ${wsArg} > /dev/null 2>&1 &`;
                        }
                    } else {
                        // First launch — use raw binary with debugging port.
                        cmd = `nohup "${binary}" --remote-debugging-port=${port} ${dataDirArg} ${wsArg} > /dev/null 2>&1 &`;
                    }
            }

            console.log(`[platform] launchIDE app=${app} cmd: ${cmd}`);

            // Strip VSCODE_* and WAYLAND/GDK env vars to avoid conflicts.
            // PM2 inherits stale VSCODE_* from the IDE terminal, and
            // WAYLAND_DISPLAY / GDK_BACKEND=wayland can cause crashes
            // if Wayland was disabled or stripped.
            const cleanEnv = { ...process.env };
            delete cleanEnv.VSCODE_IPC_HOOK;
            delete cleanEnv.VSCODE_IPC_HOOK_CLI;
            delete cleanEnv.VSCODE_PID;
            delete cleanEnv.VSCODE_CWD;
            delete cleanEnv.VSCODE_NLS_CONFIG;
            delete cleanEnv.VSCODE_CODE_CACHE_PATH;
            delete cleanEnv.WAYLAND_DISPLAY;
            delete cleanEnv.GDK_BACKEND;  // LINUX SAFETY: Prevent Wayland crash (RustDesk)

            // Auto-detect X11 DISPLAY and XAUTHORITY on Linux (e.g. when running under systemd user service)
            if (PLATFORM === 'linux') {
                if (!cleanEnv.DISPLAY) {
                    try {
                        const fs = require('fs');
                        const files = fs.readdirSync('/tmp/.X11-unix');
                        const xSocket = files.find(f => f.startsWith('X'));
                        if (xSocket) {
                            cleanEnv.DISPLAY = `:${xSocket.substring(1)}`;
                            console.log(`[platform] Auto-detected DISPLAY=${cleanEnv.DISPLAY}`);
                        }
                    } catch (e) {
                        console.error('[platform] Failed to auto-detect DISPLAY:', e.message);
                    }
                }
                if (!cleanEnv.XAUTHORITY) {
                    try {
                        const fs = require('fs');
                        const xauth = path.join(HOME, '.Xauthority');
                        if (fs.existsSync(xauth)) {
                            cleanEnv.XAUTHORITY = xauth;
                            console.log(`[platform] Auto-detected XAUTHORITY=${cleanEnv.XAUTHORITY}`);
                        }
                    } catch (_) {}
                }
                if (cleanEnv.DISPLAY) {
                    cleanEnv.GDK_BACKEND = 'x11';
                }
            }

            if (isRunning && PLATFORM === 'linux') {
                const { execSync } = require('child_process');
                try {
                    // Dynamically find the active IPC socket to prevent cli.js from spawning a new instance
                    // New IDE uses vscode-*-main.sock (not vscode-ide), sort by most recent to find active
                    const socketCmd = `find /run/user/$(id -u)/ -name "vscode-*-main.sock" -type s -printf "%T@ %p\\n" 2>/dev/null | sort -nr | head -1 | awk '{print $2}'`;
                    const activeSocket = execSync(socketCmd, { encoding: 'utf8' }).trim();
                    if (activeSocket) {
                        cleanEnv.VSCODE_IPC_HOOK = activeSocket;
                    }
                    
                    // LINUX SAFETY: Snapshot existing CDP targets BEFORE IPC call
                    // so we can verify a new window actually appeared afterwards
                    let targetsBefore = [];
                    try {
                        const raw = execSync(`curl -s http://127.0.0.1:${port}/json/list 2>/dev/null`, { encoding: 'utf8', timeout: 3000 });
                        targetsBefore = JSON.parse(raw).filter(t => t.type === 'page').map(t => t.id);
                    } catch (_) {}

                    // Use execSync for cli.js IPC call — must complete synchronously
                    execSync(cmd, { env: cleanEnv, timeout: 15000, stdio: 'pipe' });
                    console.log(`[platform] launchIDE app=${app} execSync completed successfully`);
                    
                    // LINUX SAFETY: Verify the new window actually appeared via CDP
                    // Prevents "workspace opened" false positives when IPC silently fails
                    if (workspace && targetsBefore.length > 0) {
                        const wsName = require('path').basename(workspace).toLowerCase();
                        let verified = false;
                        for (let i = 0; i < 10; i++) {
                            await new Promise(r => setTimeout(r, 1500));
                            try {
                                const raw = execSync(`curl -s http://127.0.0.1:${port}/json/list 2>/dev/null`, { encoding: 'utf8', timeout: 3000 });
                                const pages = JSON.parse(raw).filter(t => t.type === 'page');
                                const newTarget = pages.find(t => !targetsBefore.includes(t.id) || t.title.toLowerCase().includes(wsName));
                                if (newTarget) {
                                    console.log(`[platform] launchIDE verified: new window "${newTarget.title}" appeared`);
                                    verified = true;
                                    break;
                                }
                            } catch (_) {}
                        }
                        if (!verified) {
                            console.warn('[platform] launchIDE: IPC succeeded but new window verification timed out or title mismatched. Assuming success.');
                        }
                    }
                    resolve();
                } catch (err) {
                    console.error(`[platform] launchIDE app=${app} execSync error: ${err.message}`);
                    // LINUX SAFETY: Fallback — try raw binary launch on IPC failure
                    // This is the last resort when cli.js IPC doesn't work
                    console.warn('[platform] launchIDE: IPC failed — falling back to raw binary');
                    const fallbackCmd = `nohup "${binary}" --remote-debugging-port=${port} ${dataDirArg} --new-window --disable-workspace-trust "${workspace || ''}" > /dev/null 2>&1 &`;
                    console.log(`[platform] launchIDE fallback cmd: ${fallbackCmd}`);
                    exec(fallbackCmd, { env: cleanEnv }, (fallbackErr) => {
                        if (fallbackErr) {
                            console.error(`[platform] launchIDE fallback also failed: ${fallbackErr.message}`);
                            reject(err); // reject with original error
                        } else {
                            console.log('[platform] launchIDE fallback exec completed');
                            resolve();
                        }
                    });
                }
            } else {
                exec(cmd, { env: cleanEnv }, (err) => {
                    if (err) {
                        console.error(`[platform] launchIDE app=${app} exec error: ${err.message}`);
                        reject(err);
                    } else {
                        console.log(`[platform] launchIDE app=${app} exec completed successfully`);
                        resolve();
                    }
                });
            }
        };

        if (workspace) {
            isIDERunning(app).then(running => {
                // LINUX SAFETY: Only clear session restore state if NO existing instance is running.
                // With multi-window, we don't want to wipe other windows' backup state.
                if (!running) {
                    clearWindowState(app);
                }
                executeCmd(running);
            });
        } else {
            isIDERunning(app).then(running => {
                executeCmd(running);
            });
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
    getAppBinary,
    getAppDataDir,
    getAppProcessName,
    isIDERunning,
    killIDE,
    cleanLockFile,
    launchIDE,
    trustWorkspaceViaCDP,
    PLATFORM
};
