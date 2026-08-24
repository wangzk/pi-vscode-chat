# Changelog

## Unreleased

### Fixes

- **Blinking caret leak**: assistant messages kept a permanently blinking streaming caret after the agent finished, accumulating over the session. Root cause: the webview is disposed when the sidebar is hidden, so if a run finished while hidden the `agentEnd` cleanup was lost — and the persisted webview state still contained the transient `live` class, restored verbatim on next show. Snapshots are now cleaned of ephemeral streaming state (`live` carets, `running` tool-card spinners, thinking shimmers) before persisting, and stale artifacts from previously saved state are healed on restore.
- **Stray blinking carets + duplicated empty blocks after restoring a mid-stream session**: `restoreState()` rebuilt the DOM without re-tagging `data-msg-id`, while `currentMessageId`/`accumulatedText` were restored verbatim — so after any webview reload (sidebar hidden while streaming), the next run never found its message, created duplicate empty ones, appended stray `streaming-text` blocks, and concatenated stale text into new answers. Restored messages now get fresh ids; a restored *idle* session (or an `init` message reporting idle, which is authoritative — a mid-stream snapshot whose `agentEnd` was lost when the webview got disposed) resets run state and settles artifacts.
- **Thinking animation breaks after the first tool-using turn**: `blockIndex` (the assistant message's `contentIndex`) restarts at 0 for every turn of an agent run, while all turns render into one DOM message — so from the second turn on, thinking deltas were appended into the previous turn's *already settled* thinking block: no shimmer/"Thinking…" indicator appeared, and `thinkingEnd` overwrote the earlier turn's thinking content. Settled blocks are now marked (`data-settled`) and never reused; each turn's thinking gets a fresh block.

## 0.2.3 (2026-08-03)

### Performance

- **Typing lag fix**: removed forced layout reflow on every keystroke (CSS `field-sizing: content` replaces JS height calc)
- **Autocomplete IPC gated**: only sends search to extension host when cursor is near `@` or `/` (was every keystroke)
- **Streaming throttle**: textDelta renders via rAF instead of O(n²) re-render per character
- **hljs skip during streaming**: syntax highlighting deferred to agentEnd (saves ~200ms per delta)
- **saveState debounced**: DOM serialization batched at 100ms
- **escapeHtml optimized**: pure string replace instead of temp DOM element
- **Vendor bundle trimmed**: hljs reduced from 254KB to 189KB (20 essential languages)

## 0.2.2 (2026-08-03)

### Docs

- Playwright screenshot harness: 8 automated screenshots (welcome, chat, tools, thinking, edits, workflow, slash commands, model picker)
- README rewritten: Marketplace badges, installation guide, screenshot gallery, development docs
- Repository migrated to `iqbalabiyoga/pi-vscode-chat`

## 0.2.1 (2026-08-02)

### Fixes

- **Provider auth sync**: window reload after `pi /login` so provider list refreshes.
- **Provider toggle**: login/logout + reload QuickPick after auth changes.
- **Model filtering**: only show models from authenticated providers (from `auth.json`).

## 0.2.0 (2026-07-08)

### Major

- **Privacy audit & fix**: environment variable leak fixed — child process now receives only `PATH`, `HOME`, `USER`, `TERM` (not full `process.env`). Added `piChat.extraEnv` setting for opt-in env forwarding.
- **Comprehensive README**: data flow diagram, privacy & data handling disclosure, security recommendations, full dependency tree, troubleshooting table.
- **Extension icon**: custom π + chat bubble icon for Marketplace listing.
- **CHANGELOG, LICENSE** files added per Marketplace recommendations.

### Features

- Streaming chat with real-time markdown + syntax highlighting
- Agent steering (Enter = steer, Esc = abort)
- Slash commands (`/`) with autocomplete
- `@` file search with fuzzy matching
- Edit tracking: Diff / Keep / Undo per edit, Keep all / Undo all batch actions
- Session management: browse, resume previous sessions per workspace
- Live stats: context %, cost, token totals in footer
- Model switching via QuickPick, thinking level cycling
- Extension status chips (rtk toggle, caveman level, agents-team panel)
- Attachments: file picker, image paste, drag & drop
- Theme-native UI (all colors from `--vscode-*` tokens)
- Strict CSP, no CDN assets

### Infrastructure

- Bundled vendor deps: marked + highlight.js via `bun run build:vendor`
- RPC protocol over JSONL stdin/stdout to `pi --mode rpc`
- Process isolation: pi crash never affects VS Code
- Auto-restart on configuration change
- Dependency checker: audits pi binary, bun, node, npm globals, skills, build deps

## 0.1.0 (2026-06-??)

- Initial prototype: basic chat sidebar with pi RPC integration.
