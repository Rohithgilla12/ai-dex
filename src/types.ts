export interface McpServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface SkillInfo {
  name: string;
  description?: string;
  path?: string;
}

export interface RepoInfo {
  name: string;
  url: string;
  path: string;
  skills: SkillInfo[];
}

export interface ToolInfo {
  name: string;
  configPath?: string;
  configContent?: string;
  schemaContent?: string;
  mcpServers?: Record<string, McpServerConfig>;
  skills: SkillInfo[];
}

export interface GlobalSkillSearchResult {
  id: string;
  installs: string;
  url: string;
}

export interface DexData {
  tools: ToolInfo[];
  repos: RepoInfo[];
}

export type ViewMode = "tools" | "repos" | "add_repo" | "global_search" | "create_skill";
