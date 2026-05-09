# Auto-Accept State Machine

The Auto-Accept feature (`src/autoaccept.js`) is one of the most powerful capabilities of the Antigravity Telegram Suite. It allows the agent to run autonomously for long periods by automatically clicking "Accept", "Allow", or "Continue" whenever the IDE prompts the user for permission.

## How It Works

Unlike a simple macro, the Auto-Accept system operates as an intelligent observer inside the Chrome browser.

1. When you type `/aa on`, the bot uses CDP to inject a `MutationObserver` directly into the DOM of the active IDE page.
2. This observer runs completely independently of the Node.js Telegram bot. It silently watches the DOM for changes in real-time.
3. Whenever a `<button>` appears on the screen, the observer analyzes its text content.
4. If the button text matches known approval keywords (e.g., "run", "accept", "allow", "continue", "retry"), the observer automatically fires a click event on that button.

## Bypassing Rate Limits

If an LLM fails or hits a rate limit, the IDE often presents a "Retry" button. The Auto-Accept observer is smart enough to handle this. It will automatically click "Retry", ensuring that temporary network hiccups don't permanently stall your background task.

## Safeguards

Because the observer runs natively inside the browser, it requires no network overhead and responds in milliseconds. However, you maintain absolute control:
- Typing `/aa off` sends a CDP command that flips the `window.__AA_BOT_PAUSED` flag, instantly neutralizing the observer without having to detach it.
- If the Chrome tab crashes or refreshes, the Telegram bot detects the disconnection and will automatically re-inject the observer when the IDE boots back up.
