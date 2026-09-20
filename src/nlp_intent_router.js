const fs = require('fs');
const path = require('path');

/**
 * Classifies user intent from natural language input.
 * Possible intents:
 *  - COMMAND_SUGGESTION: Match phrasing to bot slash commands
 *  - PROJECT_TODO_QUERY: Questions about tasks, TODOs, or project progress
 *  - AGENT_PROMPT: Direct instructions intended for the IDE agent
 */

const COMMAND_PATTERNS = [
    { command: 'quota', regex: /\b(quota|limit|credits?|allowance|usage|tokens?)\b/i },
    { command: 'screenshot', regex: /\b(screenshot|snapshot|screen|capture)\b/i },
    { command: 'status', regex: /\b(status|health|system state)\b/i },
    { command: 'workspace', regex: /\b(workspace|project|folder|directory|switch project)\b/i },
    { command: 'agents', regex: /\b(agents|threads?|chats?|history|conversations?)\b/i },
    { command: 'artifacts', regex: /\b(artifacts?|files? generated|output files?)\b/i },
    { command: 'model', regex: /\b(model|gemini|claude|gpt|switch model|change model)\b/i },
    { command: 'help', regex: /\b(help|commands?|menu|guide|how to use)\b/i },
    { command: 'stop', regex: /\b(stop|cancel|abort|halt)\b/i }
];

const TODO_PATTERNS = [
    /\b(todo|to-do|tasks?|what('s| is) left|pending|completed|what to do|what next|progress|done|todo_done)\b/i
];

/**
 * Classifies the incoming message text.
 * @param {string} text 
 * @returns {object} { intent, matchedCommands, isTodoQuery }
 */
function classifyIntent(text) {
    if (!text || typeof text !== 'string') {
        return { intent: 'AGENT_PROMPT', matchedCommands: [] };
    }

    const trimmed = text.trim();

    // Check if it's explicitly asking about tasks or TODOs
    const isTodoQuery = TODO_PATTERNS.some(p => p.test(trimmed));
    if (isTodoQuery) {
        return { intent: 'PROJECT_TODO_QUERY', matchedCommands: [] };
    }

    // Check if it matches command patterns in casual text
    const matchedCommands = [];
    for (const item of COMMAND_PATTERNS) {
        if (item.regex.test(trimmed)) {
            matchedCommands.push(item.command);
        }
    }

    // If text matches command keywords or is a question asking "how to" / "where is" / "can I check"
    const isCasualQuestion = /\b(how|can i|where|what is|show me|check)\b/i.test(trimmed);
    if ((isCasualQuestion || matchedCommands.length > 0) && matchedCommands.length > 0) {
        return { intent: 'COMMAND_SUGGESTION', matchedCommands };
    }

    // Check if it's a casual greeting (e.g. "hi", "hello", "hey", "good morning")
    const isGreeting = /^(hi|hello|hey|greetings|good morning|good evening|good afternoon|howdy|sup)\b/i.test(trimmed);
    if (isGreeting) {
        return { intent: 'CASUAL_GREETING', matchedCommands: [] };
    }

    // Default: route to agent directly
    return { intent: 'AGENT_PROMPT', matchedCommands: [] };
}

/**
 * Safely inspects workspace directories and files for TODO / Task information.
 * Checks for:
 *  - TODO directory & TODO_DONE directory
 *  - TODO.md, task.md, implementation_plan.md, AGENT.md, GEMINI.md
 * @param {string} workspacePath 
 * @returns {object} { hasTaskData, todoFiles, todoDoneFiles, mdFiles, summaryText }
 */
function inspectWorkspaceTasks(workspacePath) {
    const result = {
        hasTaskData: false,
        todoItems: [],
        todoDoneItems: [],
        mdFiles: {},
        summaryText: ''
    };

    if (!workspacePath || !fs.existsSync(workspacePath)) {
        return result;
    }

    try {
        // 1. Inspect TODO folder if present
        const todoDirPath = path.join(workspacePath, 'TODO');
        if (fs.existsSync(todoDirPath) && fs.statSync(todoDirPath).isDirectory()) {
            const files = fs.readdirSync(todoDirPath).filter(f => !f.startsWith('.'));
            result.todoItems = files;
            if (files.length > 0) result.hasTaskData = true;
        }

        // 2. Inspect TODO_DONE folder if present
        const todoDoneDirPath = path.join(workspacePath, 'TODO_DONE');
        if (fs.existsSync(todoDoneDirPath) && fs.statSync(todoDoneDirPath).isDirectory()) {
            const files = fs.readdirSync(todoDoneDirPath).filter(f => !f.startsWith('.'));
            result.todoDoneItems = files;
            if (files.length > 0) result.hasTaskData = true;
        }

        // 3. Inspect common markdown task files safely
        const mdCandidates = ['TODO.md', 'task.md', 'implementation_plan.md', 'AGENT.md', 'GEMINI.md'];
        for (const filename of mdCandidates) {
            const filePath = path.join(workspacePath, filename);
            if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
                const content = fs.readFileSync(filePath, 'utf8');
                result.mdFiles[filename] = content.substring(0, 1000); // Excerpt
                result.hasTaskData = true;
            }
        }

        // Build human readable summary
        let summary = [];
        if (result.todoItems.length > 0) {
            summary.push(`<b>📋 TODO Directory (${result.todoItems.length} items):</b>\n` + result.todoItems.map(i => `• ${i}`).join('\n'));
        }
        if (result.todoDoneItems.length > 0) {
            summary.push(`<b>✅ TODO_DONE Directory (${result.todoDoneItems.length} items):</b>\n` + result.todoDoneItems.map(i => `• ${i}`).join('\n'));
        }
        for (const [name, snippet] of Object.entries(result.mdFiles)) {
            const previewLines = snippet.split('\n').filter(l => l.trim().startsWith('- [') || l.trim().startsWith('#')).slice(0, 5).join('\n');
            if (previewLines) {
                summary.push(`<b>📄 ${name} Preview:</b>\n${previewLines}`);
            }
        }

        result.summaryText = summary.join('\n\n');
    } catch (err) {
        console.error('[nlp_intent_router] Error inspecting workspace tasks:', err.message);
    }

    return result;
}

module.exports = {
    classifyIntent,
    inspectWorkspaceTasks
};
