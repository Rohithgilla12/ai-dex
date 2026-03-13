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

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MarketplaceServer {
    pub name: String,
    pub description: String,
    pub command: String,
    pub args: Vec<String>,
    pub author: String,
    pub category: String,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnosticResult {
    pub success: bool,
    pub message: String,
    pub suggestion: Option<String>,
    pub missing_runtime: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageStats {
    pub daily_activity: Vec<ActivityPoint>,
    pub hourly_activity: Vec<usize>, // 24 entries
    pub total_skills: usize,
    pub top_projects: Vec<ProjectActivity>,
    pub skill_distribution: HashMap<String, usize>,
    pub avg_prompt_length: usize,
    pub command_ratio: f64, // 0.0 to 1.0
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivityPoint {
    pub date: String,
    pub count: usize,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProjectActivity {
    pub name: String,
    pub count: usize,
}
