use std::fs;
use std::process::Command;
use crate::types::*;
use crate::utils::*;
use crate::scanner::*;
use std::collections::{HashMap, BTreeMap};
use chrono::{Utc, TimeZone};
use tauri::{AppHandle, Emitter};
use std::process::Stdio;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command as TokioCommand;

#[tauri::command]
pub fn get_dex_data() -> DexData {
    let mut tools = Vec::new();
    let home = get_home_path();

    // 1. Gemini CLI Skills
    let gemini_skills_path = home.join(".agents/skills");
    let gemini_skills = scan_for_skills(&gemini_skills_path);
    tools.push(ToolInfo {
        name: "Gemini CLI".to_string(),
        config_path: None,
        config_content: None,
        schema_content: None,
        mcp_servers: None,
        skills: gemini_skills,
    });

    // 2. Claude Desktop (MCP)
    let claude_desktop_path = get_claude_desktop_dir().join("claude_desktop_config.json");
    let mut claude_mcp = None;
    let mut claude_desktop_content = None;
    let mut claude_schema = None;
    if claude_desktop_path.exists() {
        if let Ok(content) = fs::read_to_string(&claude_desktop_path) {
            claude_desktop_content = Some(content.clone());
            claude_schema = try_fetch_schema(&content);
            if let Ok(config) = serde_json::from_str::<ClaudeDesktopConfig>(&content) {
                claude_mcp = config.mcp_servers;
            }
        }
    }
    let claude_desktop_skills_path = get_claude_desktop_dir().join("Claude Extensions");
    let claude_desktop_skills = scan_for_skills(&claude_desktop_skills_path);

    tools.push(ToolInfo {
        name: "Claude Desktop".to_string(),
        config_path: Some(claude_desktop_path.to_string_lossy().to_string()),
        config_content: claude_desktop_content,
        schema_content: claude_schema,
        mcp_servers: claude_mcp.clone(),
        skills: claude_desktop_skills,
    });

    // 3. Claude Code
    let claude_code_settings = home.join(".claude/settings.json");
    let mut claude_code_content = None;
    let mut claude_code_schema = None;
    let mut claude_code_mcp = None;
    if claude_code_settings.exists() {
        if let Ok(content) = fs::read_to_string(&claude_code_settings) {
            claude_code_content = Some(content.clone());
            claude_code_schema = try_fetch_schema(&content);
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                claude_code_mcp = val.get("mcpServers")
                    .and_then(|v| serde_json::from_value(v.clone()).ok());
            }
        }
    }
    let claude_code_skills_path = home.join(".claude/skills");
    let claude_code_skills = scan_for_skills(&claude_code_skills_path);

    tools.push(ToolInfo {
        name: "Claude Code".to_string(),
        config_path: Some(claude_code_settings.to_string_lossy().to_string()),
        config_content: claude_code_content,
        schema_content: claude_code_schema,
        mcp_servers: claude_code_mcp,
        skills: claude_code_skills,
    });

    // 4. Codex
    let codex_config = home.join(".codex/config.toml");
    let mut codex_content = None;
    let mut codex_schema = None;
    if codex_config.exists() {
        if let Ok(content) = fs::read_to_string(&codex_config) {
            codex_content = Some(content.clone());
            codex_schema = try_fetch_schema(&content);
        }
    }
    let codex_skills_path = home.join(".codex/skills");
    let codex_skills = scan_for_skills(&codex_skills_path);

    tools.push(ToolInfo {
        name: "Codex".to_string(),
        config_path: Some(codex_config.to_string_lossy().to_string()),
        config_content: codex_content,
        schema_content: codex_schema,
        mcp_servers: None,
        skills: codex_skills,
    });

    // 5. Repositories
    let mut repos = Vec::new();
    let repos_dir = home.join(".ai-dex").join("repos");
    if repos_dir.exists() {
        if let Ok(entries) = fs::read_dir(&repos_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    let url = get_git_remote_url(&path).unwrap_or_else(|| "Unknown".to_string());
                    let skills = scan_for_skills(&path);
                    repos.push(RepoInfo {
                        name,
                        url,
                        path: path.to_string_lossy().to_string(),
                        skills,
                    });
                }
            }
        }
    }

    DexData { tools, repos }
}

#[tauri::command]
pub fn save_config(path: String, content: String) -> Result<(), String> {
    fs::write(path, content).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn add_repo(url: String) -> Result<String, String> {
    let home = get_home_path();
    let repos_dir = home.join(".ai-dex").join("repos");
    fs::create_dir_all(&repos_dir).map_err(|e| e.to_string())?;

    let parts: Vec<&str> = url.split('/').collect();
    let mut repo_name = parts.last().unwrap_or(&"repo").to_string();
    if repo_name.ends_with(".git") {
        repo_name = repo_name.replace(".git", "");
    }

    let target_dir = repos_dir.join(&repo_name);
    if target_dir.exists() {
        return Err("Repository already exists. Try syncing it.".into());
    }

    let output = Command::new("git")
        .current_dir(&repos_dir)
        .args(["clone", &url, &repo_name])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(format!("Successfully cloned {}", repo_name))
    } else {
        Err(strip_ansi(&String::from_utf8_lossy(&output.stderr)))
    }
}

#[tauri::command]
pub fn sync_repo(name: String) -> Result<String, String> {
    let home = get_home_path();
    let repo_dir = home.join(".ai-dex").join("repos").join(&name);

    if !repo_dir.exists() {
        return Err("Repository does not exist.".into());
    }

    let output = Command::new("git")
        .current_dir(&repo_dir)
        .args(["pull"])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(format!("Successfully synced {}", name))
    } else {
        Err(strip_ansi(&String::from_utf8_lossy(&output.stderr)))
    }
}

#[tauri::command]
pub fn search_global_skills(query: String) -> Result<Vec<GlobalSkillSearchResult>, String> {
    let output = Command::new("npx")
        .args(["skills", "find", &query])
        .output()
        .map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(strip_ansi(&String::from_utf8_lossy(&output.stderr)));
    }

    let stdout = strip_ansi(&String::from_utf8_lossy(&output.stdout));
    let mut results = Vec::new();
    let lines: Vec<&str> = stdout.lines().collect();
    
    for i in 0..lines.len() {
        let line = lines[i].trim();
        if line.contains("@") && line.contains("installs") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 3 {
                let id = parts[0].to_string();
                let installs = parts[1].to_string();
                let mut url = String::new();
                if i + 1 < lines.len() {
                    let next_line = lines[i+1].trim();
                    if next_line.starts_with("└") {
                        let url_parts: Vec<&str> = next_line.split_whitespace().collect();
                        if url_parts.len() >= 2 {
                            url = url_parts[1].to_string();
                        }
                    }
                }
                results.push(GlobalSkillSearchResult { id, installs, url });
            }
        }
    }
    Ok(results)
}

#[tauri::command]
pub fn install_global_skill(package: String) -> Result<String, String> {
    let output = Command::new("npx")
        .args(["skills", "add", &package, "-g", "-y"])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(format!("Successfully installed {}", package))
    } else {
        Err(strip_ansi(&String::from_utf8_lossy(&output.stderr)))
    }
}

#[tauri::command]
pub fn uninstall_global_skill(package: String) -> Result<String, String> {
    let output = Command::new("npx")
        .args(["skills", "remove", &package, "-g", "-y"])
        .output()
        .map_err(|e| e.to_string())?;

    if output.status.success() {
        Ok(format!("Successfully uninstalled {}", package))
    } else {
        Err(strip_ansi(&String::from_utf8_lossy(&output.stderr)))
    }
}

#[tauri::command]
pub fn create_skill(name: String, description: String, is_claude: bool) -> Result<String, String> {
    let home = get_home_path();
    let base_dir = if is_claude {
        home.join(".claude").join("skills")
    } else {
        home.join(".agents").join("skills")
    };
    
    let skill_dir = base_dir.join(&name);
    if skill_dir.exists() {
        return Err("Skill directory already exists".into());
    }

    fs::create_dir_all(&skill_dir).map_err(|e| e.to_string())?;
    let skill_md_content = format!("# {}\n\n{}\n\n## Instructions\n\nWrite your instructions here.\n", name, description);
    fs::write(skill_dir.join("SKILL.md"), skill_md_content).map_err(|e| e.to_string())?;

    let pkg_json_content = serde_json::json!({
        "name": name, "version": "0.1.0", "description": description, "type": "module"
    });
    fs::write(
        skill_dir.join("package.json"),
        serde_json::to_string_pretty(&pkg_json_content).unwrap()
    ).map_err(|e| e.to_string())?;

    Ok(format!("Successfully created skill {}", name))
}

#[tauri::command]
pub fn test_mcp_connection(command: String, args: Vec<String>) -> DiagnosticResult {
    let path_check = Command::new("which").arg(&command).output();
    if let Ok(output) = path_check {
        if !output.status.success() {
            let suggestion = match command.as_str() {
                "npx" => Some("Node.js is not installed. Install it from nodejs.org".to_string()),
                "uvx" | "uv" => Some("uv is not installed. Run 'curl -LsSf https://astral.sh/uv/install.sh | sh'".to_string()),
                "python3" | "python" => Some("Python is not installed or not in PATH.".to_string()),
                _ => Some(format!("The command '{}' was not found in your system PATH.", command)),
            };
            return DiagnosticResult {
                success: false,
                message: format!("Binary '{}' not found.", command),
                suggestion,
                missing_runtime: Some(command),
            };
        }
    }

    match Command::new(&command).args(&args).spawn() {
        Ok(mut child) => {
            let _ = child.kill();
            DiagnosticResult {
                success: true,
                message: "Connection successful. Command is executable.".into(),
                suggestion: None,
                missing_runtime: None,
            }
        }
        Err(e) => DiagnosticResult {
            success: false,
            message: format!("Failed to spawn process: {}", e),
            suggestion: Some("Ensure the command and arguments are correct.".into()),
            missing_runtime: None,
        },
    }
}

#[tauri::command]
pub fn check_all_mcp_health() -> HashMap<String, DiagnosticResult> {
    let dex = get_dex_data();
    let mut results = HashMap::new();
    for tool in &dex.tools {
        if let Some(ref servers) = tool.mcp_servers {
            for (name, config) in servers {
                if !results.contains_key(name) {
                    results.insert(name.clone(), test_mcp_connection(config.command.clone(), config.args.clone()));
                }
            }
        }
    }
    results
}

#[tauri::command]
pub async fn install_runtime(app: AppHandle, runtime: String) -> Result<String, String> {
    let (cmd, args): (&str, Vec<&str>) = match runtime.as_str() {
        "npx" | "node" | "npm" => {
            if cfg!(target_os = "macos") {
                ("brew", vec!["install", "node"])
            } else {
                return Err("Please install Node.js from https://nodejs.org".into());
            }
        }
        "uvx" | "uv" => {
            ("sh", vec!["-c", "curl -LsSf https://astral.sh/uv/install.sh | sh"])
        }
        "python3" | "python" => {
            if cfg!(target_os = "macos") {
                ("brew", vec!["install", "python3"])
            } else {
                return Err("Please install Python from https://python.org".into());
            }
        }
        _ => return Err(format!("Unknown runtime '{}'. Install it manually.", runtime)),
    };

    let _ = app.emit("mcp-log", format!(">>> Installing {} via: {} {}", runtime, cmd, args.join(" ")));

    let output = Command::new(cmd)
        .args(&args)
        .output()
        .map_err(|e| format!("Failed to run installer: {}", e))?;

    if output.status.success() {
        let _ = app.emit("mcp-log", format!(">>> {} installed successfully.", runtime));
        Ok(format!("Successfully installed {}", runtime))
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let _ = app.emit("mcp-log", format!(">>> Install failed: {}", stderr));
        Err(format!("Installation failed: {}", stderr.chars().take(200).collect::<String>()))
    }
}

#[tauri::command]
pub fn get_marketplace_servers() -> Vec<MarketplaceServer> {
    vec![
        MarketplaceServer {
            name: "Brave Search".into(),
            description: "Search the web using Brave's privacy-focused search engine.".into(),
            command: "npx".into(),
            args: vec!["-y".into(), "@modelcontextprotocol/server-brave-search".into()],
            author: "MCP Team".into(),
            category: "Search".into(),
        },
        MarketplaceServer {
            name: "Google Maps".into(),
            description: "Search for places and get location details.".into(),
            command: "npx".into(),
            args: vec!["-y".into(), "@modelcontextprotocol/server-google-maps".into()],
            author: "MCP Team".into(),
            category: "Location".into(),
        },
        MarketplaceServer {
            name: "GitHub".into(),
            description: "Interact with GitHub repositories, issues, and PRs.".into(),
            command: "npx".into(),
            args: vec!["-y".into(), "@modelcontextprotocol/server-github".into()],
            author: "MCP Team".into(),
            category: "Development".into(),
        },
        MarketplaceServer {
            name: "Postgres".into(),
            description: "Read-only access to PostgreSQL databases.".into(),
            command: "npx".into(),
            args: vec!["-y".into(), "@modelcontextprotocol/server-postgres".into()],
            author: "MCP Team".into(),
            category: "Database".into(),
        },
        MarketplaceServer {
            name: "Sequential Thinking".into(),
            description: "A tool for structured problem solving and brainstorming.".into(),
            command: "npx".into(),
            args: vec!["-y".into(), "@modelcontextprotocol/server-sequential-thinking".into()],
            author: "MCP Team".into(),
            category: "Thinking".into(),
        },
    ]
}

#[tauri::command]
pub fn get_usage_stats() -> UsageStats {
    let home = get_home_path();
    let history_path = home.join(".claude/history.jsonl");
    let pricing_path = home.join(".claude/readout-pricing.json");
    let cache_path = home.join(".claude/readout-cost-cache.json");
    
    let mut daily_counts: BTreeMap<String, usize> = BTreeMap::new();
    let mut hourly_counts = vec![0; 24];
    let mut project_counts: HashMap<String, usize> = HashMap::new();
    let mut total_prompt_chars = 0;
    let mut total_messages = 0;
    let mut command_count = 0;
    let mut sequence_map: HashMap<String, usize> = HashMap::new();
    let mut last_tool: Option<String> = None;

    // Load Real Pricing and Cache
    let pricing: Option<ClaudePricing> = fs::read_to_string(&pricing_path).ok().and_then(|c| serde_json::from_str(&c).ok());
    let cost_cache: Option<ClaudeCostCache> = fs::read_to_string(&cache_path).ok().and_then(|c| serde_json::from_str(&c).ok());

    let mut cost_today = 0.0;
    let mut cost_week = 0.0;
    let mut cost_all_time = 0.0;
    let mut total_tokens = 0;
    let mut total_cache_read = 0;
    let mut model_usage_agg: HashMap<String, ModelUsage> = HashMap::new();

    let now = Utc::now();
    let today_str = now.format("%Y-%m-%d").to_string();
    let week_ago = now - chrono::Duration::days(7);

    if let Some(cache) = cost_cache {
        for (date_str, models) in cache.days {
            let dt_opt = Utc.with_ymd_and_hms(
                date_str[0..4].parse().unwrap_or(2026),
                date_str[5..7].parse().unwrap_or(1),
                date_str[8..10].parse().unwrap_or(1),
                0, 0, 0
            ).single();

            for (model_id, usage) in models {
                // Derive display name from model ID
                // Pricing data sourced from https://github.com/anomalyco/models.dev
                let display_name = if model_id.contains("opus-4-6") { "Claude Opus 4.6" }
                                  else if model_id.contains("opus-4-5") { "Claude Opus 4.5" }
                                  else if model_id.contains("opus-4-1") { "Claude Opus 4.1" }
                                  else if model_id.contains("opus-4") { "Claude Opus 4" }
                                  else if model_id.contains("opus") { "Claude Opus" }
                                  else if model_id.contains("sonnet-4-6") { "Claude Sonnet 4.6" }
                                  else if model_id.contains("sonnet-4-5") { "Claude Sonnet 4.5" }
                                  else if model_id.contains("sonnet-4") { "Claude Sonnet 4" }
                                  else if model_id.contains("sonnet") { "Claude Sonnet" }
                                  else if model_id.contains("haiku") { "Claude Haiku 4.5" }
                                  else { &model_id };

                let (in_rate, out_rate, cr_rate, cw_rate) = if let Some(ref p) = pricing {
                    let key = if model_id.contains("opus-4-6") { "opus-4-6" }
                             else if model_id.contains("opus-4-5") { "opus-4-5" }
                             else if model_id.contains("opus-4-1") { "opus-4-1" }
                             else if model_id.contains("opus-4") { "opus-4" }
                             else if model_id.contains("sonnet-4-6") { "sonnet-4-6" }
                             else if model_id.contains("sonnet-4-5") { "sonnet-4-5" }
                             else if model_id.contains("sonnet-4") { "sonnet-4" }
                             else if model_id.contains("sonnet") { "sonnet-4" }
                             else { "haiku-4-5" };
                    let m = p.models.get(key);
                    (m.map(|x| x.input).unwrap_or(0.0) / 1_000_000.0,
                     m.map(|x| x.output).unwrap_or(0.0) / 1_000_000.0,
                     m.map(|x| x.cache_read).unwrap_or(0.0) / 1_000_000.0,
                     m.map(|x| x.cache_write).unwrap_or(0.0) / 1_000_000.0)
                } else {
                    // Fallback per-model-family rates ($ per token) from models.dev
                    // Opus:   $5/M in, $25/M out, $0.50/M cache_read, $6.25/M cache_write
                    // Sonnet: $3/M in, $15/M out, $0.30/M cache_read, $3.75/M cache_write
                    // Haiku:  $1/M in, $5/M out,  $0.10/M cache_read, $1.25/M cache_write
                    if model_id.contains("opus") {
                        (5.0 / 1_000_000.0, 25.0 / 1_000_000.0, 0.50 / 1_000_000.0, 6.25 / 1_000_000.0)
                    } else if model_id.contains("sonnet") {
                        (3.0 / 1_000_000.0, 15.0 / 1_000_000.0, 0.30 / 1_000_000.0, 3.75 / 1_000_000.0)
                    } else {
                        (1.0 / 1_000_000.0, 5.0 / 1_000_000.0, 0.10 / 1_000_000.0, 1.25 / 1_000_000.0)
                    }
                };

                let cost = (usage.input as f64 * in_rate) + (usage.output as f64 * out_rate) +
                           (usage.cache_read as f64 * cr_rate) + (usage.cache_write as f64 * cw_rate);

                cost_all_time += cost;
                total_tokens += usage.input + usage.output + usage.cache_read + usage.cache_write;
                total_cache_read += usage.cache_read;
                if date_str == today_str { cost_today += cost; }
                if let Some(d) = dt_opt { if d > week_ago { cost_week += cost; } }

                let stats = model_usage_agg.entry(display_name.to_string()).or_insert(ModelUsage { message_count: 0, estimated_tokens: 0, estimated_cost: 0.0 });
                stats.estimated_cost += cost;
                stats.estimated_tokens += usage.input + usage.output;
            }
        }
    }

    if history_path.exists() {
        if let Ok(content) = fs::read_to_string(history_path) {
            for line in content.lines() {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                    if let Some(ts) = v.get("timestamp").and_then(|t| t.as_i64()) {
                        let dt = Utc.timestamp_opt(ts / 1000, 0).unwrap();
                        let date_str = dt.format("%Y-%m-%d").to_string();
                        let hour = dt.format("%H").to_string().parse::<usize>().unwrap_or(0);
                        *daily_counts.entry(date_str).or_insert(0) += 1;
                        if hour < 24 { hourly_counts[hour] += 1; }
                    }
                    if let Some(display) = v.get("display").and_then(|d| d.as_str()) {
                        let trimmed = display.trim();
                        if !trimmed.is_empty() {
                            total_prompt_chars += trimmed.len();
                            total_messages += 1;
                            let tool = if trimmed.starts_with('/') { trimmed.split_whitespace().next().unwrap_or("/") }
                                      else if trimmed.starts_with('!') { trimmed.split_whitespace().next().unwrap_or("!") }
                                      else { "Chat" };
                            if let Some(lt) = last_tool {
                                let seq = format!("{} -> {}", lt, tool);
                                *sequence_map.entry(seq).or_insert(0) += 1;
                            }
                            last_tool = Some(tool.to_string());
                            if trimmed.starts_with('!') || trimmed.starts_with('/') { command_count += 1; }
                        }
                    }
                    if let Some(proj) = v.get("project").and_then(|p| p.as_str()) {
                        let name = proj.split('/').last().unwrap_or("unknown").to_string();
                        *project_counts.entry(name).or_insert(0) += 1;
                    }
                }
            }
        }
    }

    let daily_activity = daily_counts.into_iter().map(|(date, count)| ActivityPoint { date, count }).collect();
    let mut top_projects: Vec<ProjectActivity> = project_counts.into_iter().map(|(name, count)| ProjectActivity { name, count }).collect();
    top_projects.sort_by(|a, b| b.count.cmp(&a.count));
    top_projects.truncate(5);

    let mut common_sequences: Vec<ToolSequence> = sequence_map.into_iter().map(|(sequence, count)| ToolSequence { sequence, count }).collect();
    common_sequences.sort_by(|a, b| b.count.cmp(&a.count));
    common_sequences.truncate(8);

    let dex = get_dex_data();
    let mut skill_distribution = HashMap::new();
    let total_skills: usize = dex.tools.iter().map(|t| t.skills.len()).sum::<usize>() + dex.repos.iter().map(|r| r.skills.len()).sum::<usize>();
    for tool in &dex.tools { skill_distribution.insert(tool.name.clone(), tool.skills.len()); }

    UsageStats {
        daily_activity, hourly_activity: hourly_counts, total_skills,
        top_projects, skill_distribution, avg_prompt_length: if total_messages > 0 { total_prompt_chars / total_messages } else { 0 },
        command_ratio: if total_messages > 0 { command_count as f64 / total_messages as f64 } else { 0.0 },
        estimated_cost_today: cost_today, estimated_cost_week: cost_week, estimated_cost_all_time: cost_all_time,
        model_usage_stats: model_usage_agg, common_sequences, total_tokens, cache_read_tokens: total_cache_read
    }
}

#[tauri::command]
pub fn get_memories() -> Vec<MemoryEntry> {
    let home = get_home_path();
    let mut memories = Vec::new();
    
    let global_memory_files = [
        ("Gemini Global Memory", home.join(".gemini/GEMINI.md")),
        ("Claude Global Memory", home.join(".claude/CLAUDE.md")),
    ];
    for (label, path) in global_memory_files {
        if path.exists() {
            if let Ok(content) = fs::read_to_string(&path) {
                let lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
                memories.push(MemoryEntry {
                    project_name: label.into(),
                    path: path.to_string_lossy().to_string(),
                    line_count: lines.len(),
                    content_preview: lines.iter().take(10).cloned().collect(),
                });
            }
        }
    }

    let history_path = home.join(".claude/history.jsonl");
    let mut seen_projects = HashMap::new();
    if history_path.exists() {
        if let Ok(content) = fs::read_to_string(history_path) {
            for line in content.lines() {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                    if let Some(proj_path) = v.get("project").and_then(|p| p.as_str()) {
                        seen_projects.insert(proj_path.to_string(), true);
                    }
                }
            }
        }
    }

    let project_memory_files = ["CLAUDE.md", "GEMINI.md"];
    for (proj_path, _) in seen_projects {
        for filename in &project_memory_files {
            let mem_file = std::path::Path::new(&proj_path).join(filename);
            if mem_file.exists() {
                if let Ok(content) = fs::read_to_string(&mem_file) {
                    let lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
                    memories.push(MemoryEntry {
                        project_name: format!("{} ({})", proj_path.split('/').last().unwrap_or("Unknown"), filename),
                        path: mem_file.to_string_lossy().to_string(),
                        line_count: lines.len(),
                        content_preview: lines.iter().take(10).cloned().collect(),
                    });
                }
            }
        }
    }

    memories
}

#[tauri::command]
pub async fn spawn_mcp_and_stream_logs(app: AppHandle, command: String, args: Vec<String>) -> Result<(), String> {
    let mut child = TokioCommand::new(command).args(args).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().ok_or("Failed to capture stdout")?;
    let stderr = child.stderr.take().ok_or("Failed to capture stderr")?;
    let app_stdout = app.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = reader.next_line().await { let _ = app_stdout.emit("mcp-log", line); }
    });
    let app_stderr = app.clone();
    tokio::spawn(async move {
        let mut reader = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = reader.next_line().await { let _ = app_stderr.emit("mcp-log", format!("ERR: {}", line)); }
    });
    Ok(())
}

#[tauri::command]
pub fn sync_mcp_to_all_tools(name: String, config: McpServerConfig) -> Result<String, String> {
    let home = get_home_path();
    let mut updated_tools = Vec::new();
    let config_val = serde_json::to_value(&config).map_err(|e| e.to_string())?;

    let targets: Vec<(&str, std::path::PathBuf)> = vec![
        ("Claude Desktop", get_claude_desktop_dir().join("claude_desktop_config.json")),
        ("Claude Code", home.join(".claude/settings.json")),
    ];

    for (tool_name, path) in targets {
        if !path.exists() { continue; }
        let content = match fs::read_to_string(&path) { Ok(c) => c, Err(_) => continue };
        let mut json_val: serde_json::Value = match serde_json::from_str(&content) { Ok(v) => v, Err(_) => continue };
        let obj = match json_val.as_object_mut() { Some(o) => o, None => continue };
        obj.entry("mcpServers").or_insert(serde_json::json!({}));
        if let Some(servers) = obj.get_mut("mcpServers").and_then(|v| v.as_object_mut()) {
            servers.insert(name.clone(), config_val.clone());
            if let Ok(updated) = serde_json::to_string_pretty(&json_val) {
                if fs::write(&path, updated).is_ok() { updated_tools.push(tool_name); }
            }
        }
    }
    if updated_tools.is_empty() { Err("No tool configurations found to update.".into()) }
    else { Ok(format!("Successfully synced {} to: {}", name, updated_tools.join(", "))) }
}
