# Architecture

The Antigravity Telegram Suite is fundamentally a **bridge** between the Telegram Bot API and the Chrome DevTools Protocol (CDP). 

Since the Antigravity Agent runs inside a browser-based IDE (React frontend), this bot acts as an invisible user, manipulating the DOM, reading React state, and observing network traffic to relay that information to you.

## System Components

### 1. The Telegram Interface (`src/index.js`)
This is the entry point of the application. It uses the `telegraf` library to connect to the Telegram API. 
- Handles routing of all `/commands` and text messages.
- Manages the localized Telegram menu.
- Relays messages back to the user, breaking long markdown responses into smaller chunks to respect Telegram's message limits.

### 2. The CDP Controller (`src/cdp_controller.js`)
This is the core engine of the bot. It connects to the headless browser running the Antigravity IDE via WebSockets (CDP) and injects JavaScript to manipulate the UI.
- **`waitForAgentResponse`**: A highly optimized, persistent loop that monitors network requests and DOM state to determine exactly when the agent has finished thinking.
- **Screenshotting**: Captures exact coordinates of the active chat or the entire IDE window.
- **Session Management**: Lists and switches between different workspaces and active threads.

### 3. DOM Manipulation (`src/ui_locators.js`)
Since the agent's IDE is a complex React application, `ui_locators.js` provides a stable abstraction layer over the raw HTML. It exposes methods like `AG_UI.getChatInput()` or `AG_UI.getVisibleChatContainer()` so that the CDP controller doesn't break every time the CSS classes change.

### 4. Platform and System (`src/platform.js`)
Handles native OS operations.
- Process management (finding and killing zombie IDE processes).
- Bootstrapping the Chrome instance with the correct debugging flags.
- Managing macOS/Linux specific lockfiles.

## Execution Flow Example: Sending a Message
1. User types "Hello" in Telegram.
2. `index.js` receives the message and calls `sendViaCDP` in `cdp_controller.js`.
3. `cdp_controller.js` injects JavaScript to find the IDE's text area, sets the value to "Hello", and simulates a click on the "Send" button.
4. `waitForAgentResponse` establishes a network listener. It watches for the "Stop" button to appear, and monitors API traffic.
5. Once the network is quiet and the "Stop" button disappears, the loop exits.
6. `getFullLatestResponse` scrapes the newly generated markdown from the DOM.
7. `index.js` formats the text, appends the footer, and replies to the user in Telegram.
