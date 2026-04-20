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
                return '/Applications/Antigravity.app/Contents/MacOS/Antigravity';
            case 'win32':
                return path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity', 'Antigravity.exe');
            default: // linux
                return '/usr/share/antigravity/antigravity';
        }
    },

    /** IDE lock file path */
    get lockFile() {
        switch (PLATFORM) {
            case 'darwin':
                return path.join(HOME, 'Library', 'Application Support', 'Antigravity', 'code.lock');
            case 'win32':
                return path.join(process.env.APPDATA || '', 'Antigravity', 'code.lock');
            default:
                return path.join(HOME, '.config', 'Antigravity', 'code.lock');
        }
    },

    /** Default projects directory */
    get projectsDir() {
        return process.env.PROJECTS_DIR || path.join(HOME, 'Projects');
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
                cmd = `pgrep -x "${config.processName}"`;
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
                cmd = `pkill -9 -f "${config.ideBinary}" 2>/dev/null; pkill -9 -f "antigravity-launcher" 2>/dev/null; sleep 2`;
        }

        exec(cmd, () => {
            // Clean lock file
            try { fs.unlinkSync(config.lockFile); } catch (_) {}
            resolve();
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

        let cmd;
        const wsArg = workspace ? `"${workspace}"` : '';

        switch (PLATFORM) {
            case 'win32':
                cmd = `start "" "${binary}" --remote-debugging-port=${port} ${wsArg}`;
                break;
            case 'darwin':
                cmd = `open -a "${binary}" --args --remote-debugging-port=${port} ${wsArg}`;
                break;
            default: // linux
                // Use the launcher script if available, otherwise direct binary
                const launcherPath = path.join(HOME, '.local', 'bin', 'antigravity-launcher.sh');
                if (fs.existsSync(launcherPath)) {
                    cmd = `nohup bash "${launcherPath}" ${wsArg} > /dev/null 2>&1 &`;
                } else {
                    cmd = `nohup "${binary}" --remote-debugging-port=${port} ${wsArg} > /dev/null 2>&1 &`;
                }
        }

        exec(cmd, (err) => {
            if (err) reject(err);
            else resolve();
        });
    });
}

module.exports = {
    config,
    isIDERunning,
    killIDE,
    cleanLockFile,
    launchIDE,
    PLATFORM
};
