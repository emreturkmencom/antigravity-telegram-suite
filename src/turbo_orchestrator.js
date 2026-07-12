const {
    selectModel,
    sendViaCDP,
    snapshotChatState,
    waitForAgentResponse,
    getFullLatestResponse,
    getQuota
} = require('./cdp_controller');
const { t } = require('./i18n');

function isQuotaError(text) {
    if (!text) return false;
    const textToCheck = text.length > 2500 ? text.substring(text.length - 2500) : text;
    const lower = textToCheck.toLowerCase();
    return lower.includes('quota exceeded') ||
           lower.includes('rate limit') ||
           lower.includes('usage limit') ||
           lower.includes('resource has been exhausted') ||
           lower.includes('429 too many requests') ||
           lower.includes('api key') ||
           lower.includes('too many requests') ||
           lower.includes('limit reached') ||
           lower.includes('insufficient ai credits') ||
           lower.includes('balance is too low') ||
           lower.includes('out of credits');
}

const TURBO_PHASE1_MODEL = process.env.TURBO_PHASE1_MODEL || "Claude Opus 4.6 (Thinking)";
const TURBO_PHASE1_FALLBACK = process.env.TURBO_PHASE1_FALLBACK || "Gemini 3.5 Flash";
const TURBO_PHASE2_MODEL = process.env.TURBO_PHASE2_MODEL || "Gemini 3.1 Pro (High)";
const TURBO_PHASE3_MODEL = process.env.TURBO_PHASE3_MODEL || "Claude Opus 4.6 (Thinking)";
const TURBO_PHASE3_FALLBACK = process.env.TURBO_PHASE3_FALLBACK || "Gemini 3.1 Pro (High)";
const TURBO_PHASE4_MODEL = process.env.TURBO_PHASE4_MODEL || "Gemini 3.1 Pro (High)";
const TURBO_PHASE5_MODEL = process.env.TURBO_PHASE5_MODEL || "Gemini 3.5 Flash";

async function checkClaudeQuota(CDP_PORT) {
    try {
        const quotaInfo = await getQuota(CDP_PORT, null, true);
        const claudeModelName = TURBO_PHASE1_MODEL.replace(/ \\(.*?\\)/, '');
        const claudeModel = quotaInfo?.userStatus?.cascadeModelConfigData?.clientModelConfigs?.find(c => (c.label || '').includes(claudeModelName));
        if (claudeModel && claudeModel.quotaInfo) {
            const rem = claudeModel.quotaInfo.remainingFraction;
            if (rem !== undefined && rem < 0.1) {
                console.log(`[turbo] Claude usage is high (remaining: ${Math.round(rem * 100)}%). Skipping Claude.`);
                return false;
            }
        }
    } catch (e) {
        console.log('[turbo] Error checking quota:', e.message);
    }
    return true;
}

/**
 * Runs the Multi-Agent "Agents Council" workflow.
 * Phase 1: Planning (Claude)
 * Phase 2: Execution (Gemini)
 * Phase 3: Review (Claude)
 * Phase 4: Fix (Gemini) [Conditional]
 */
async function runTurboOrchestration(query, CDP_PORT, explicitTargetId, ctx, createProgressHandler, stripQueryFromResponse) {
    let statusMsgId = null;

    try {
        // Send initial status
        const statusMsg = await ctx.reply(t('turbo.p1_start') || '🚀 <b>Turbo Mode Started:</b>\n\n⏳ <b>Phase 1:</b> Selecting model (Claude)...', { parse_mode: 'HTML' });
        statusMsgId = statusMsg.message_id;

        // --- PHASE 1: PLANNING (Claude) ---
        let skipClaude = !(await checkClaudeQuota(CDP_PORT));
        let planText = "";
        let sentTargetId = null;
        const pmPrompt = `You are the Project Manager and Lead Architect. Create a detailed, step-by-step implementation plan for the following request. List the files to create/modify, the architecture decisions, and define clear tasks. Do NOT write the final code yet.\n\nUser Request: ${query}`;

        if (skipClaude) {
            await ctx.telegram.editMessageText(
                ctx.chat.id, statusMsgId, undefined,
                t('turbo.p1_fallback') || `🚀 <b>Turbo Mode Active:</b>\n\n⚠️ Claude limit is under 10%.\n⏳ <b>Phase 1:</b> Automatically selected ${TURBO_PHASE1_FALLBACK} for planning...`,
                { parse_mode: 'HTML' }
            ).catch(() => {});

            await selectModel(CDP_PORT, TURBO_PHASE1_FALLBACK, explicitTargetId);
            await new Promise(r => setTimeout(r, 800));

            sentTargetId = await sendViaCDP(pmPrompt, CDP_PORT, explicitTargetId);
            await new Promise(r => setTimeout(r, 2000));
            await snapshotChatState(CDP_PORT, explicitTargetId).catch(() => {});
            
            let isDone = await waitForAgentResponse(CDP_PORT, 600000, createProgressHandler(ctx), sentTargetId);
            if (!isDone) throw new Error(t('turbo.p1_error') || "Gemini 3.5 Flash timed out during the planning phase.");

            let _planTextRaw = await getFullLatestResponse(CDP_PORT, sentTargetId);
            planText = typeof _planTextRaw === 'string' ? _planTextRaw : _planTextRaw.text;
            planText = stripQueryFromResponse(planText, pmPrompt);
        } else {
            await selectModel(CDP_PORT, TURBO_PHASE1_MODEL, explicitTargetId);
            await new Promise(r => setTimeout(r, 800));

            await ctx.telegram.editMessageText(
                ctx.chat.id, statusMsgId, undefined,
                t('turbo.p1_planning') || '🚀 <b>Turbo Mode Started:</b>\n\n⏳ <b>Phase 1:</b> Claude is preparing the plan...',
                { parse_mode: 'HTML' }
            ).catch(() => {});
            
            sentTargetId = await sendViaCDP(pmPrompt, CDP_PORT, explicitTargetId);
            await new Promise(r => setTimeout(r, 2000));
            await snapshotChatState(CDP_PORT, explicitTargetId).catch(() => {});
            
            let isDone = await waitForAgentResponse(CDP_PORT, 600000, createProgressHandler(ctx), sentTargetId);
            let _planTextRaw = isDone ? await getFullLatestResponse(CDP_PORT, sentTargetId) : "";
            planText = typeof _planTextRaw === 'string' ? _planTextRaw : _planTextRaw.text;
            planText = stripQueryFromResponse(planText, pmPrompt);

            if (!isDone || isQuotaError(planText)) {
                console.log(`[turbo] Claude Phase 1 failed/timed-out/quota-hit. Falling back to ${TURBO_PHASE1_FALLBACK}.`);
                await sendViaCDP('reject', CDP_PORT, sentTargetId).catch(() => {});
                await new Promise(r => setTimeout(r, 500));
                
                await ctx.telegram.editMessageText(
                    ctx.chat.id, statusMsgId, undefined,
                    t('turbo.p1_fallback') || `🚀 <b>Turbo Mode Active:</b>\n\n⚠️ Claude limit reached or timeout.\n⏳ <b>Phase 1:</b> Falling back to ${TURBO_PHASE1_FALLBACK} for planning...`,
                    { parse_mode: 'HTML' }
                ).catch(() => {});

                await selectModel(CDP_PORT, TURBO_PHASE1_FALLBACK, sentTargetId);
                await new Promise(r => setTimeout(r, 800));

                sentTargetId = await sendViaCDP(pmPrompt, CDP_PORT, sentTargetId);
                await new Promise(r => setTimeout(r, 2000));
                await snapshotChatState(CDP_PORT, sentTargetId).catch(() => {});
                
                isDone = await waitForAgentResponse(CDP_PORT, 600000, createProgressHandler(ctx), sentTargetId);
                if (!isDone) throw new Error(t('turbo.p1_error') || "Gemini 3.5 Flash timed out during the planning phase fallback.");

                _planTextRaw = await getFullLatestResponse(CDP_PORT, sentTargetId);
                planText = typeof _planTextRaw === 'string' ? _planTextRaw : _planTextRaw.text;
                planText = stripQueryFromResponse(planText, pmPrompt);
            }
        }

        // Update Telegram Status
        await ctx.telegram.editMessageText(
            ctx.chat.id, statusMsgId, undefined,
            t('turbo.p2_switching') || '🚀 <b>Turbo Mode Active:</b>\n\n✅ <b>Phase 1:</b> Claude finished the plan.\n⏳ <b>Phase 2:</b> Switching model (Gemini)...',
            { parse_mode: 'HTML' }
        ).catch(() => {});

        // --- PHASE 2: EXECUTION (Gemini) ---
        await selectModel(CDP_PORT, TURBO_PHASE2_MODEL, sentTargetId);
        await new Promise(r => setTimeout(r, 800));

        await ctx.telegram.editMessageText(
            ctx.chat.id, statusMsgId, undefined,
            t('turbo.p2_coding') || '🚀 <b>Turbo Mode Active:</b>\n\n✅ <b>Phase 1:</b> Claude finished the plan.\n⏳ <b>Phase 2:</b> Gemini is writing code...',
            { parse_mode: 'HTML' }
        ).catch(() => {});

        const coderPrompt = `You are the Lead Developer. The Project Manager (Claude) has created the following implementation plan. Execute it precisely — write the code, create/modify the files as specified. Follow the plan strictly.\n\n--- PLAN ---\n${planText}\n--- END PLAN ---`;
        
        const sentTargetId2 = await sendViaCDP(coderPrompt, CDP_PORT, sentTargetId);
        await new Promise(r => setTimeout(r, 2000));
        await snapshotChatState(CDP_PORT, sentTargetId).catch(() => {});
        
        isDone = await waitForAgentResponse(CDP_PORT, 600000, createProgressHandler(ctx), sentTargetId2);
        if (!isDone) throw new Error(t('turbo.p2_error') || "Gemini timed out during the coding phase.");

        let _codeTextRaw = await getFullLatestResponse(CDP_PORT, sentTargetId2);
        let codeText = typeof _codeTextRaw === 'string' ? _codeTextRaw : _codeTextRaw.text;
        codeText = stripQueryFromResponse(codeText, coderPrompt);

        // --- PHASE 3: REVIEW (Claude) ---
        let skipClaudeP3 = !(await checkClaudeQuota(CDP_PORT));
        let reviewText = "";
        let sentTargetId3 = null;
        const reviewPrompt = `You are the Security Auditor and Code Reviewer. Review the code that was just written.\nIf you find critical bugs or security issues, list them clearly with "ISSUES_FOUND: true".\nIf everything looks good, respond with "ISSUES_FOUND: false".`;

        if (skipClaudeP3) {
            await ctx.telegram.editMessageText(
                ctx.chat.id, statusMsgId, undefined,
                t('turbo.p3_fallback') || `🚀 <b>Turbo Mode Active:</b>\n\n✅ <b>Phase 1:</b> Planning\n✅ <b>Phase 2:</b> Coding\n⚠️ Claude limit is under 10%.\n⏳ <b>Phase 3:</b> Automatically selected ${TURBO_PHASE3_FALLBACK} for review...`,
                { parse_mode: 'HTML' }
            ).catch(() => {});

            await selectModel(CDP_PORT, TURBO_PHASE3_FALLBACK, sentTargetId2);
            await new Promise(r => setTimeout(r, 800));

            sentTargetId3 = await sendViaCDP(reviewPrompt, CDP_PORT, sentTargetId2);
            await new Promise(r => setTimeout(r, 2000));
            await snapshotChatState(CDP_PORT, sentTargetId2).catch(() => {});
            
            isDone = await waitForAgentResponse(CDP_PORT, 600000, createProgressHandler(ctx), sentTargetId3);
            if (!isDone) throw new Error(t('turbo.p3_error') || "Gemini 3.1 Pro timed out during the review phase.");

            let _reviewTextRaw = await getFullLatestResponse(CDP_PORT, sentTargetId3);
            reviewText = typeof _reviewTextRaw === 'string' ? _reviewTextRaw : _reviewTextRaw.text;
            reviewText = stripQueryFromResponse(reviewText, reviewPrompt);
        } else {
            await ctx.telegram.editMessageText(
                ctx.chat.id, statusMsgId, undefined,
                t('turbo.p3_switching') || '🚀 <b>Turbo Mode Active:</b>\n\n✅ <b>Phase 1:</b> Planning\n✅ <b>Phase 2:</b> Coding\n⏳ <b>Phase 3:</b> Switching model (Claude) - Reviewing...',
                { parse_mode: 'HTML' }
            ).catch(() => {});

            await selectModel(CDP_PORT, TURBO_PHASE3_MODEL, sentTargetId2);
            await new Promise(r => setTimeout(r, 800));

            await ctx.telegram.editMessageText(
                ctx.chat.id, statusMsgId, undefined,
                t('turbo.p3_reviewing') || '🚀 <b>Turbo Mode Active:</b>\n\n✅ <b>Phase 1:</b> Planning\n✅ <b>Phase 2:</b> Coding\n⏳ <b>Phase 3:</b> Claude is reviewing the code...',
                { parse_mode: 'HTML' }
            ).catch(() => {});
            
            sentTargetId3 = await sendViaCDP(reviewPrompt, CDP_PORT, sentTargetId2);
            await new Promise(r => setTimeout(r, 2000));
            await snapshotChatState(CDP_PORT, sentTargetId2).catch(() => {});
            
            isDone = await waitForAgentResponse(CDP_PORT, 600000, createProgressHandler(ctx), sentTargetId3);
            let _reviewTextRaw = isDone ? await getFullLatestResponse(CDP_PORT, sentTargetId3) : "";
            reviewText = typeof _reviewTextRaw === 'string' ? _reviewTextRaw : _reviewTextRaw.text;
            reviewText = stripQueryFromResponse(reviewText, reviewPrompt);

            if (!isDone || isQuotaError(reviewText)) {
                console.log(`[turbo] Claude Phase 3 failed/timed-out/quota-hit. Falling back to ${TURBO_PHASE3_FALLBACK}.`);
                await sendViaCDP('reject', CDP_PORT, sentTargetId3).catch(() => {});
                await new Promise(r => setTimeout(r, 500));
                
                await ctx.telegram.editMessageText(
                    ctx.chat.id, statusMsgId, undefined,
                    t('turbo.p3_fallback') || `🚀 <b>Turbo Mode Active:</b>\n\n✅ <b>Phase 1:</b> Planning\n✅ <b>Phase 2:</b> Coding\n⚠️ Claude limit reached or timeout.\n⏳ <b>Phase 3:</b> Falling back to ${TURBO_PHASE3_FALLBACK} for review...`,
                    { parse_mode: 'HTML' }
                ).catch(() => {});

                await selectModel(CDP_PORT, TURBO_PHASE3_FALLBACK, sentTargetId3);
                await new Promise(r => setTimeout(r, 800));

                sentTargetId3 = await sendViaCDP(reviewPrompt, CDP_PORT, sentTargetId3);
                await new Promise(r => setTimeout(r, 2000));
                await snapshotChatState(CDP_PORT, sentTargetId3).catch(() => {});
                
                isDone = await waitForAgentResponse(CDP_PORT, 600000, createProgressHandler(ctx), sentTargetId3);
                if (!isDone) throw new Error(t('turbo.p3_error') || "Gemini 3.1 Pro timed out during the review phase fallback.");

                _reviewTextRaw = await getFullLatestResponse(CDP_PORT, sentTargetId3);
                reviewText = typeof _reviewTextRaw === 'string' ? _reviewTextRaw : _reviewTextRaw.text;
                reviewText = stripQueryFromResponse(reviewText, reviewPrompt);
            }
        }
        
        let fixText = "N/A";
        const hasIssues = reviewText.includes("ISSUES_FOUND: true");
        let sentTargetId4 = null;

        if (hasIssues) {
            // --- PHASE 4: FIX (Gemini) ---
            await ctx.telegram.editMessageText(
                ctx.chat.id, statusMsgId, undefined,
                t('turbo.p4_fixing') || '🚀 <b>Turbo Mode Active:</b>\n\n✅ <b>Phase 1:</b> Planning\n✅ <b>Phase 2:</b> Coding\n⚠️ <b>Phase 3:</b> Issues found!\n⏳ <b>Phase 4:</b> Gemini is fixing the issues...',
                { parse_mode: 'HTML' }
            ).catch(() => {});

            await selectModel(CDP_PORT, TURBO_PHASE4_MODEL, sentTargetId3);
            await new Promise(r => setTimeout(r, 800));

            const fixPrompt = `You are the Lead Developer. The Security Auditor found issues in the previous implementation. Please fix all the issues mentioned by the Auditor.`;
            
            sentTargetId4 = await sendViaCDP(fixPrompt, CDP_PORT, sentTargetId3);
            await new Promise(r => setTimeout(r, 2000));
            await snapshotChatState(CDP_PORT, sentTargetId3).catch(() => {});
            
            isDone = await waitForAgentResponse(CDP_PORT, 600000, createProgressHandler(ctx), sentTargetId4);
            if (!isDone) throw new Error(t('turbo.p4_error') || "Fixing phase failed.");

            let _fixTextRaw = await getFullLatestResponse(CDP_PORT, sentTargetId4);
            fixText = typeof _fixTextRaw === 'string' ? _fixTextRaw : _fixTextRaw.text;
            fixText = stripQueryFromResponse(fixText, fixPrompt);

        }

        let fallbackText = hasIssues ? fixText : reviewText;

        // --- PHASE 5: EXECUTIVE SUMMARY (Gemini) ---
        try {
            await ctx.telegram.editMessageText(
                ctx.chat.id, statusMsgId, undefined,
                t('turbo.p5_summarizing') || '⏳ Phase 5: Preparing summary...',
                { parse_mode: 'HTML' }
            ).catch(() => {});

        if (!skipClaudeP3) {
            // Model is currently Claude (from Review phase), switch to Gemini for summary
            await selectModel(CDP_PORT, TURBO_PHASE5_MODEL, sentTargetId4 || sentTargetId3);
            await new Promise(r => setTimeout(r, 800));
        }

        const summaryPrompt = `You are a Project Manager summarizing a completed multi-agent coding session for the user.

Here is what happened:
- PHASE 1 (Planning):
${planText.substring(0, 500)}...

- PHASE 2 (Coding):
${codeText.substring(0, 500)}...

- PHASE 3 (Review):
${reviewText.substring(0, 500)}...

- PHASE 4 (Fix):
${hasIssues ? fixText.substring(0, 500) + "..." : "N/A"}

Write a brief, user-friendly summary in the user's language. Include:
1. What was requested
2. What files were created/modified
3. Key decisions made
4. Current status (ready to test, needs attention, etc.)

Keep it concise (max 10 lines). Use emoji for readability.`;

        const lastTargetId = hasIssues ? sentTargetId4 : sentTargetId3;
        const sentTargetId5 = await sendViaCDP(summaryPrompt, CDP_PORT, lastTargetId);
        await new Promise(r => setTimeout(r, 2000));
        await snapshotChatState(CDP_PORT, lastTargetId).catch(() => {});
        
        isDone = await waitForAgentResponse(CDP_PORT, 300000, createProgressHandler(ctx), sentTargetId5);
        if (!isDone) throw new Error(t('turbo.p5_error') || "Timed out during the summary phase.");

            let _summaryTextRaw = await getFullLatestResponse(CDP_PORT, sentTargetId5);
            let summaryText = typeof _summaryTextRaw === 'string' ? _summaryTextRaw : _summaryTextRaw.text;
            summaryText = stripQueryFromResponse(summaryText, summaryPrompt);

            await ctx.telegram.editMessageText(
                ctx.chat.id, statusMsgId, undefined,
                t('turbo.done_summary') || '✨ Turbo Mode Completed (Summary ready)',
                { parse_mode: 'HTML' }
            ).catch(() => {});

            return summaryText;
        } catch (summaryErr) {
            console.error('[turbo] Phase 5 (Summary) failed, falling back to raw output:', summaryErr.message);
            // Revert status message to done_issues / done_no_issues
            if (hasIssues) {
                await ctx.telegram.editMessageText(
                    ctx.chat.id, statusMsgId, undefined,
                    t('turbo.done_issues') || '🚀 <b>Turbo Mode Completed:</b>\n\n✅ <b>Phase 1:</b> Planning (Claude)\n✅ <b>Phase 2:</b> Coding (Gemini)\n⚠️ <b>Phase 3:</b> Review (Claude)\n✅ <b>Phase 4:</b> Fixing (Gemini)\n\n✨ Results are coming...',
                    { parse_mode: 'HTML' }
                ).catch(() => {});
            } else {
                await ctx.telegram.editMessageText(
                    ctx.chat.id, statusMsgId, undefined,
                    t('turbo.done_no_issues') || '🚀 <b>Turbo Mode Completed:</b>\n\n✅ <b>Phase 1:</b> Planning (Claude)\n✅ <b>Phase 2:</b> Coding (Gemini)\n✅ <b>Phase 3:</b> Review - No Issues (Claude)\n\n✨ Results are coming...',
                    { parse_mode: 'HTML' }
                ).catch(() => {});
            }
            return fallbackText;
        }

    } catch (err) {
        console.error('[turbo] Orchestration error:', err.message);
        if (statusMsgId) {
            const errTitle = t('turbo.error_title') ? t('turbo.error_title').replace('{error}', err.message) : `❌ <b>Turbo Mode Error:</b>\n\n${err.message}`;
            await ctx.telegram.editMessageText(
                ctx.chat.id, statusMsgId, undefined,
                errTitle,
                { parse_mode: 'HTML' }
            ).catch(() => {});
        }
        throw err;
    }
}

module.exports = {
    runTurboOrchestration
};
