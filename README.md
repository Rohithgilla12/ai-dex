# AI Dex 🚀

**AI Dex** is a unified dashboard and management tool for your local AI agents, skills, and Model Context Protocol (MCP) servers.

As the ecosystem of local AI tools (like Claude Desktop, Claude Code, Gemini CLI, and Codex) grows, managing configurations, installing skills, and troubleshooting MCP servers across different tools becomes fragmented. AI Dex provides a single, beautiful interface to view, manage, and verify all of them.

![AI Dex Interface](./public/tauri.svg) *(Screenshot coming soon)*

## ✨ Features

- **Centralized Dashboard:** A single pane of glass for all your configured AI tools.
- **Skill Discovery & Management:** Integrated with the [skills.sh](https://skills.sh) registry. Search, install, and uninstall global skills directly from the UI.
- **Skill Scaffolding:** Automated creator flow to bootstrap new skills for Gemini CLI or Claude Code, generating standard `package.json` and `SKILL.md` templates.
- **Dual-Mode Configuration:** 
    - **Form Interface:** Add and configure MCP servers through a user-friendly UI.
    - **Raw Editor:** Directly edit JSON/TOML configuration files for advanced users.
- **MCP Health Checks:** One-click diagnostics to verify if your MCP server commands (like `npx` or `uvx` scripts) are executable and correctly configured in your environment.
- **Cross-Tool Sync:** "Configure once, sync everywhere." Instantly propagate an MCP server definition across multiple supported AI tools.
- **Git Repository Support:** Manage collections of skills by cloning and syncing remote Git repositories.

## 🛠 Supported Tools

AI Dex automatically detects and manages:
- [Claude Desktop](https://claude.ai/download) (MCP Config & Extensions)
- [Claude Code](https://github.com/anthropics/claude-code) (MCP Config & Local Skills)
- [Gemini CLI](https://github.com/google/gemini-cli) (Local & Global Skills)
- [Codex](https://github.com/google-labs/codex) (Config & Skills)

## 🏗 Architecture

- **Frontend:** React 19 + TypeScript + Vite.
- **Backend:** Rust (Tauri v2).
- **Styling:** Custom Vanilla CSS for a lightweight, native-feeling dark mode experience.
- **Storage:** Direct integration with local config paths (`~/.claude/settings.json`, `~/.agents/skills`, etc.).

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

To build a standalone executable for your platform:

```bash
pnpm tauri build
```
Compiled binaries will be found in `src-tauri/target/release/bundle`.

## 🔍 Troubleshooting

- **MCP Server Test Fails:** Ensure the command (e.g., `npx`, `uvx`) is in your system `PATH`. AI Dex runs these commands as they would be executed by your terminal.
- **Permissions:** AI Dex requires read/write access to your home directory configuration folders (`~/.claude`, `~/.agents`, etc.) to manage settings.

## 🗺 Future Roadmap (Future Scopes)

- [ ] **Remote MCP Directory:** Integration with a community-maintained list of MCP servers for one-click discovery.
- [ ] **Automatic Dependency Management:** Detect and offer to install missing dependencies (like `pnpm` or `uv`) for MCP servers.
- [ ] **MCP Inspector Integration:** Launch the MCP Inspector directly from AI Dex for deep debugging.
- [ ] **Multi-Profile Support:** Switch between different configuration profiles (e.g., Work vs. Personal) for all tools at once.
- [ ] **Skill Marketplace:** A built-in browseable interface for community-shared skills with ratings and documentation previews.
- [ ] **AI-Powered Diagnostics:** Use local LLMs to analyze MCP error logs and suggest fixes.

## 🤝 Contributing

We welcome contributions! Whether it's adding support for a new AI tool, fixing bugs, or improving the UI, feel free to open an issue or submit a pull request.

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---
Built with ❤️ for the AI developer community.
