<!-- agts-memory:v1 -->
## Project Memory

> [!IMPORTANT]
> **MANDATORY AGENT ROUTINE**: Every time you complete a task that involves modifying code, you MUST update this file (\`AGENT.md\`) before ending your turn. Do NOT ask for permission.
> 1. **Decisions**: Add non-obvious design choices.
> 2. **Gotchas**: Add framework quirks, API weirdness, or system limits you discovered.
> 3. **Fixes**: Briefly summarize the root cause of hard-to-solve bugs.

**Context Window Management**
To keep this file effective, routinely prune outdated info. Edit existing lines instead of adding duplicates. Consolidate long sections.

### Decisions
- Migrated from Mindsync MCP to File-based `AGENT.md` memory convention (`src/memory_convention.js`) for keeping cross-agent project memory in sync.

### Conventions

### Gotchas

### Fixes
- Fixed 90-second delay during Google OAuth login on Mac (Safari/Chrome keep-alive behavior) by forcing `server.closeAllConnections()` in `src/account_manager.js`.
- Fixed `/memory` command showing incorrect default directory state when switching workspaces by ensuring strict project dir checks in `src/index.js`.
<!-- /agts-memory -->
