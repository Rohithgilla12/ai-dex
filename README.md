# AI Dex 🚀

**AI Dex** is a unified dashboard and management tool for your local AI agents, skills, and Model Context Protocol (MCP) servers.

As the ecosystem of local AI tools (like Claude Desktop, Claude Code, Gemini CLI, and Codex) grows, managing configurations, installing skills, and troubleshooting MCP servers across different tools becomes fragmented. AI Dex provides a single, beautiful interface to view, manage, and verify all of them.

![AI Dex Interface](./public/tauri.svg) *(Screenshot coming soon)*

## ✨ Features

### MCP Server Management
- **Add, edit, delete** MCP servers through a form UI or raw JSON editor
- **Cross-Tool Sync:** Propagate an MCP server to Claude Desktop and Claude Code in one click
- **Health Check All:** Test every configured server at once with inline pass/fail status
- **MCP Inspector:** Launch the official MCP Inspector for deep interactive debugging
- **Environment Variables:** Configure API keys and env vars per server from the form UI

### MCP Marketplace
- **Smithery Registry:** Browse and search 3,800+ community MCP servers
- **One-Click Install:** Add any server to your tools directly from the marketplace
- **Offline Fallback:** Curated list of 10 popular servers available when offline

### Skill Management
- **Discovery & Install:** Search and install global skills from the [skills.sh](https://skills.sh) registry
- **Uninstall:** Remove skills directly from the tool view
- **Skill Scaffolding:** Bootstrap new skills for Gemini CLI or Claude Code with `SKILL.md` and `package.json` templates
- **Git Repositories:** Clone, sync, and manage collections of skills from remote repos

### AI Cost Center
- **Precise Spend Tracking:** Real cost data from Claude's pricing files, not estimates
- **Per-Model Breakdown:** See spend by model (Opus, Sonnet, Haiku) with correct per-family rates sourced from [models.dev](https://github.com/anomalyco/models.dev)
- **Cache Efficiency:** Track how much prompt caching is saving you
- **Time Ranges:** Today, this week, projected month, and all-time views

### Usage Analytics
- **Activity Charts:** Daily intensity and hourly peak distribution
- **Command Sequences:** Most common tool usage patterns
- **Project Breakdown:** Top projects by interaction count

### Config Version Control
- **Auto-Snapshots:** Every config save is automatically versioned in `~/.ai-dex/history/`
- **Diff Viewer:** Color-coded unified diffs showing exactly what changed between revisions
- **One-Click Restore:** Roll back to any previous config version (current state is snapshotted first, so restore is reversible)

### Memory Browser
- **Unified View:** Browse CLAUDE.md and GEMINI.md memory files across all projects
- **Global + Per-Project:** See both global memory and project-specific context

### Automatic Dependency Management
- **Runtime Detection:** Identifies missing runtimes (`npx`, `uvx`, `python`) when health-checking MCP servers
- **One-Click Install:** Offers to install missing dependencies (Homebrew on macOS, curl scripts for uv)

## 🛠 Supported Tools

AI Dex automatically detects and manages:
- [Claude Desktop](https://claude.ai/download) (MCP Config & Extensions)
- [Claude Code](https://github.com/anthropics/claude-code) (MCP Config & Local Skills)
- [Gemini CLI](https://github.com/google/gemini-cli) (Local & Global Skills)
- [Codex](https://github.com/google-labs/codex) (Config & Skills)

## 🏗 Architecture

- **Frontend:** React 19 + TypeScript + Vite
- **Backend:** Rust (Tauri v2)
- **Styling:** Custom vanilla CSS with Plus Jakarta Sans and JetBrains Mono (bundled, no CDN)
- **Charts:** Recharts for data visualization
- **Icons:** Lucide React
- **Storage:** Direct integration with local config paths, snapshots in `~/.ai-dex/`
- **Cross-Platform:** macOS, Windows, and Linux path support for Claude Desktop configs

## 🚀 Getting Started

### Prerequisites

- **Node.js** (v18 or higher)
- **Rust** & **Cargo** (for the Tauri backend)
- **pnpm** (recommended)

### Installation & Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/Rohithgilla12/ai-dex.git
   cd ai-dex
   ```

2. **Install dependencies:**
   ```bash
   pnpm install
   ```

3. **Run in development mode:**
   ```bash
   pnpm tauri dev
   ```

### Building for Release

```bash
pnpm tauri build
```
Compiled binaries will be found in `src-tauri/target/release/bundle`.

## 🔍 Troubleshooting

- **MCP Server Test Fails:** Ensure the command (e.g., `npx`, `uvx`) is in your system `PATH`. Use the "Health Check All" button to diagnose all servers at once, and the "Install" button to fix missing runtimes.
- **Permissions:** AI Dex requires read/write access to your home directory configuration folders (`~/.claude`, `~/.agents`, etc.) to manage settings.
- **Config Mistakes:** Use the History panel to view diffs and restore any previous config version.

## 🗺 Roadmap

- [ ] **Multi-Profile Support:** Switch between different configuration profiles (e.g., Work vs. Personal) for all tools at once.
- [ ] **AI-Powered Diagnostics:** Use local LLMs to analyze MCP error logs and suggest fixes.

## 🤝 Contributing

We welcome contributions! Whether it's adding support for a new AI tool, fixing bugs, or improving the UI, feel free to open an issue or submit a pull request.

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---
Built with ❤️ for the AI developer community.
