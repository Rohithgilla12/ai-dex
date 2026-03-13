use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct McpServerConfig {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default)]
    pub env: Option<HashMap<String, String>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClaudeDesktopConfig {
    #[serde(default)]
    pub mcp_servers: Option<HashMap<String, McpServerConfig>>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SkillInfo {
    pub name: String,
    pub description: Option<String>,
    pub path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoInfo {
    pub name: String,
    pub url: String,
    pub path: String,
    pub skills: Vec<SkillInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolInfo {
    pub name: String,
    pub config_path: Option<String>,
    pub config_content: Option<String>,
    pub schema_content: Option<String>,
    pub mcp_servers: Option<HashMap<String, McpServerConfig>>,
    pub skills: Vec<SkillInfo>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GlobalSkillSearchResult {
    pub id: String,
    pub installs: String,
    pub url: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DexData {
    pub tools: Vec<ToolInfo>,
    pub repos: Vec<RepoInfo>,
}
