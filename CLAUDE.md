# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI Dex is a Tauri v2 desktop app that serves as a unified dashboard for managing local AI tools (Claude Desktop, Claude Code, Gemini CLI, Codex). It handles MCP server configuration, skill management, usage analytics, and cross-tool config syncing.

## Commands

```bash
pnpm install          # Install frontend dependencies
pnpm tauri dev        # Run in development mode (starts both Vite dev server on :1420 and Tauri)
pnpm tauri build      # Build release binary (output: src-tauri/target/release/bundle)
pnpm build            # Build frontend only (tsc + vite build)
```

Rust backend compiles automatically as part of `pnpm tauri dev` / `pnpm tauri build`. No separate cargo commands needed.

## Architecture

**Frontend** (`src/`): Single-file React 19 app (`App.tsx`) with all UI in one component. Uses vanilla CSS (`App.css`), no component library. Types are in `types.ts`. Communicates with Rust backend via `invoke()` from `@tauri-apps/api/core`.

**Backend** (`src-tauri/src/`):
- `lib.rs` — Tauri app setup, registers all command handlers
- `commands.rs` — All `#[tauri::command]` handlers (data loading, config saving, skill management, MCP testing, usage stats, marketplace)
- `scanner.rs` — Filesystem scanning for skills and schema fetching
- `types.rs` — Rust struct definitions (mirrors `src/types.ts`)
- `utils.rs` — Helper functions (home path, skill descriptions)

**IPC pattern**: Frontend calls `invoke("command_name", { args })`, backend exposes `#[tauri::command]` functions. Event streaming uses `tauri::Emitter` for real-time MCP log output.

**Config paths the app reads/writes** (all under `~/`):
- `.claude/settings.json` — Claude Code MCP config
- `.claude/projects/` — Claude Code usage/session data for analytics
- `Library/Application Support/Claude/claude_desktop_config.json` — Claude Desktop MCP config
- `.agents/skills/` — Gemini CLI skills directory
- `.codex/config.toml` — Codex configuration

## Key Conventions

- Frontend uses `recharts` for data visualization and `lucide-react` for icons
- No CSS framework — all styling is custom vanilla CSS with dark mode
- TypeScript strict mode enabled (`noUnusedLocals`, `noUnusedParameters`)
- Rust uses `serde_json` for config parsing, `reqwest` for HTTP, `tokio` for async
- The app is macOS-focused (hardcoded `Library/Application Support/` paths)
