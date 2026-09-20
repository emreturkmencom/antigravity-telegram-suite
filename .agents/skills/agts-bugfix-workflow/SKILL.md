---
name: agts-bugfix-workflow
description: Step-by-step contribution guidelines, testing procedures, and debugging workflows for antigravity-telegram-suite.
---

# AGTS Bugfix & Contribution Skill

Use this skill when developing, debugging, or submitting bug fixes to `antigravity-telegram-suite`.

## 1. Project Structure Overview
- **Entry Point:** [`src/index.js`](src/index.js) (Telegram command dispatching & Telegraf handlers)
- **CDP Controller:** [`src/cdp_controller.js`](src/cdp_controller.js) (DOM queries, Chrome DevTools Protocol automation)
- **App Drivers:** [`src/drivers/`](src/drivers/) (Adapters for IDE vs Standalone Agent)
- **Locales:** [`locales/`](locales/) (Translations for 7 supported languages)
- **Tests:** [`test/`](test/) (Unit and integration tests)

## 2. Bug Fix Workflow

### Step 1: Reproduce & Test
Always run existing tests before making any changes:
```bash
npm test
```
To run all tests including smoke tests:
```bash
npm run test:all
```

### Step 2: i18n Validation
If adding or modifying user-facing text:
1. Edit [`locales/en.json`](locales/en.json) and corresponding locale files (`tr`, `zh`, `ko`, `de`, `es`, `fr`).
2. Validate completeness across locales:
```bash
npm run i18n:validate
```

### Step 3: Verify Code & CDP Safety
- Ensure CommonJS standard (`require` / `module.exports`).
- Keep DOM selectors updated in [`src/locators/`](src/locators/) if targeting IDE/Standalone UI elements.

### Step 4: Final Check
Ensure tests pass clean before committing:
```bash
git status
npm test
```
