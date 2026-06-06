/**
 * Task Watcher — Monitors IDE transcript.jsonl for unsolicited agent messages.
 * 
 * Detects:
 * 1. Timer/schedule completions (agent proactively sends messages after timer fires)
 * 2. Sub-agent completion notifications
 * 3. Any new MODEL response when bot is NOT actively waiting (waitForAgentResponse not running)
 * 
 * Architecture:
 * - Uses fs.watch on the brain/ directory to detect new transcript writes
 * - Reads only NEW lines (tail-follow approach) to avoid re-processing old content
 * - Only triggers when bot is "idle" (not in an active waitForAgentResponse cycle)
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

class TaskWatcher {
    constructor(options = {}) {
        this.appDataName = options.appDataName || 'antigravity-ide';
        this.brainPath = path.join(os.homedir(), '.gemini', this.appDataName, 'brain');
        this.onNotification = options.onNotification || (() => {});
        this.isAgentBusy = false; // set by bot when waitForAgentResponse is active
        this.watchers = new Map(); // conversationId -> { watcher, lastSize, transcriptPath }
        this.activeConversationId = null;
        this.debounceTimer = null;
        this.DEBOUNCE_MS = 5000; // Wait 5s of silence before reading new content
        this.enabled = true;
    }

    /**
     * Set the active conversation to watch.
     * Cleans up old watcher and starts watching the new conversation's transcript.
     */
    setActiveConversation(conversationId) {
        if (this.activeConversationId === conversationId) return; // Already watching

        // Clean up old watcher
        if (this.activeConversationId && this.watchers.has(this.activeConversationId)) {
            const old = this.watchers.get(this.activeConversationId);
            if (old.watcher) {
                try { old.watcher.close(); } catch (_) {}
            }
            this.watchers.delete(this.activeConversationId);
            console.log(`[TaskWatcher] Stopped watching: ${this.activeConversationId.substring(0, 8)}`);
        }

        this.activeConversationId = conversationId;
        if (!conversationId) return;

        const transcriptPath = path.join(
            this.brainPath, conversationId,
            '.system_generated', 'logs', 'transcript.jsonl'
        );

        if (!fs.existsSync(transcriptPath)) {
            console.log(`[TaskWatcher] Transcript not found for ${conversationId.substring(0, 8)}, searching for most recent...`);
            // Fallback: find the most recently modified transcript.jsonl in brain/
            const fallbackId = this._findMostRecentConversation();
            if (fallbackId && fallbackId !== conversationId) {
                console.log(`[TaskWatcher] Falling back to most recent conversation: ${fallbackId.substring(0, 8)}`);
                this.activeConversationId = null; // Reset so recursive call works
                return this.setActiveConversation(fallbackId);
            }
            return;
        }

        // Record current file size as baseline (don't process existing content)
        const stats = fs.statSync(transcriptPath);
        const lastSize = stats.size;

        try {
            const watcher = fs.watch(transcriptPath, (eventType) => {
                if (eventType === 'change' && !this.isAgentBusy && this.enabled) {
                    this._onFileChange(conversationId, transcriptPath);
                }
            });

            watcher.on('error', (err) => {
                console.error(`[TaskWatcher] Watcher error: ${err.message}`);
            });

            this.watchers.set(conversationId, { watcher, lastSize, transcriptPath });
            console.log(`[TaskWatcher] Watching conversation: ${conversationId.substring(0, 8)} (baseline: ${lastSize} bytes)`);
        } catch (e) {
            console.error('[TaskWatcher] Failed to watch:', e.message);
        }
    }

    /**
     * Mark the bot as busy (actively waiting for agent response).
     * When going from busy→idle, update the baseline to skip content generated during the wait.
     */
    setBusy(busy) {
        const wasBusy = this.isAgentBusy;
        this.isAgentBusy = busy;

        // When going from busy→idle, update the lastSize to current
        // This prevents re-notifying content that was generated during the request/response cycle
        if (wasBusy && !busy && this.activeConversationId) {
            this._lastIdleTime = Date.now(); // Cooldown timer
            const entry = this.watchers.get(this.activeConversationId);
            if (entry && fs.existsSync(entry.transcriptPath)) {
                try {
                    entry.lastSize = fs.statSync(entry.transcriptPath).size;
                    console.log(`[TaskWatcher] Baseline updated after busy→idle: ${entry.lastSize} bytes`);
                } catch (_) {}
            }
        }
    }

    /**
     * Handle file change event with debounce.
     * Multiple rapid writes are coalesced into a single read.
     */
    _onFileChange(conversationId, transcriptPath) {
        clearTimeout(this.debounceTimer);
        this.debounceTimer = setTimeout(() => {
            this._processNewContent(conversationId, transcriptPath);
        }, this.DEBOUNCE_MS);
    }

    /**
     * Read new content since lastSize and check for unsolicited MODEL responses.
     * Only PLANNER_RESPONSE entries from MODEL source are considered notifications.
     * CRITICAL: If the batch also contains a USER_INPUT, it's a normal request-response
     * cycle (user asked, agent answered) — NOT a proactive notification.
     */
    _processNewContent(conversationId, transcriptPath) {
        // Double-check we're not busy (could have changed during debounce)
        if (this.isAgentBusy) return;

        // Cooldown: don't trigger within 10s of going idle
        // This prevents catching the response that was just sent to Telegram
        if (this._lastIdleTime && (Date.now() - this._lastIdleTime) < 10000) {
            return;
        }

        const entry = this.watchers.get(conversationId);
        if (!entry) return;

        try {
            const stats = fs.statSync(transcriptPath);
            if (stats.size <= entry.lastSize) return; // No new content

            // Read only the new bytes
            const fd = fs.openSync(transcriptPath, 'r');
            const newBytes = stats.size - entry.lastSize;
            const buffer = Buffer.alloc(newBytes);
            fs.readSync(fd, buffer, 0, newBytes, entry.lastSize);
            fs.closeSync(fd);

            entry.lastSize = stats.size;

            const newContent = buffer.toString('utf8');
            const lines = newContent.split('\n').filter(l => l.trim());

            // Parse all new entries
            let hasUserInput = false;
            const modelResponses = [];

            for (const line of lines) {
                try {
                    const parsed = JSON.parse(line);

                    // If there's a USER_INPUT in the batch, this is a normal conversation
                    if (parsed.source === 'USER_EXPLICIT' || parsed.type === 'USER_INPUT') {
                        hasUserInput = true;
                    }

                    if (
                        parsed.source === 'MODEL' &&
                        parsed.type === 'PLANNER_RESPONSE' &&
                        parsed.content &&
                        parsed.status === 'DONE'
                    ) {
                        modelResponses.push(parsed.content);
                    }
                } catch (_) {
                    // Not valid JSON line, skip
                }
            }

            // If there's a user input in this batch, it's a normal request-response — skip
            if (hasUserInput) {
                console.log(`[TaskWatcher] Skipping — batch contains USER_INPUT (normal conversation)`);
                return;
            }

            if (modelResponses.length > 0) {
                // Use the LAST model response (most complete)
                let finalText = modelResponses[modelResponses.length - 1];

                // Clean up excessive whitespace
                finalText = finalText.replace(/\n{3,}/g, '\n\n').trim();

                // Filter out trivial responses (very short tool-only steps)
                if (finalText.length > 30) {
                    console.log(`[TaskWatcher] 📬 Proactive notification detected (${finalText.length} chars, conv: ${conversationId.substring(0, 8)})`);
                    this.onNotification({
                        conversationId,
                        text: finalText,
                        type: 'agent_proactive'
                    });
                }
            }
        } catch (e) {
            console.error('[TaskWatcher] Error processing:', e.message);
        }
    }

    /**
     * Find the most recently modified transcript.jsonl across all conversations.
     * Used as fallback when resolved conversation ID doesn't have a transcript.
     */
    _findMostRecentConversation() {
        try {
            if (!fs.existsSync(this.brainPath)) return null;

            let newestId = null;
            let newestMtime = 0;

            const entries = fs.readdirSync(this.brainPath, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                // Skip non-UUID directories
                if (entry.name.length < 30) continue;

                const tPath = path.join(
                    this.brainPath, entry.name,
                    '.system_generated', 'logs', 'transcript.jsonl'
                );

                try {
                    const stats = fs.statSync(tPath);
                    if (stats.mtimeMs > newestMtime) {
                        newestMtime = stats.mtimeMs;
                        newestId = entry.name;
                    }
                } catch (_) {
                    // No transcript in this conversation
                }
            }

            return newestId;
        } catch (e) {
            console.error('[TaskWatcher] Error finding recent conversation:', e.message);
            return null;
        }
    }

    /**
     * Stop all watchers and clean up.
     */
    stop() {
        for (const [id, entry] of this.watchers) {
            if (entry.watcher) {
                try { entry.watcher.close(); } catch (_) {}
            }
        }
        this.watchers.clear();
        clearTimeout(this.debounceTimer);
        this.activeConversationId = null;
        console.log('[TaskWatcher] All watchers stopped.');
    }
}

module.exports = TaskWatcher;
