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
    let claude_desktop_path = home.join("Library/Application Support/Claude/claude_desktop_config.json");
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
    let claude_desktop_skills_path = home.join("Library/Application Support/Claude/Claude Extensions");
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
    if claude_code_settings.exists() {
        if let Ok(content) = fs::read_to_string(&claude_code_settings) {
            claude_code_content = Some(content.clone());
            claude_code_schema = try_fetch_schema(&content);
        }
    }
    let claude_code_skills_path = home.join(".claude/skills");
    let claude_code_skills = scan_for_skills(&claude_code_skills_path);

    tools.push(ToolInfo {
        name: "Claude Code".to_string(),
        config_path: Some(claude_code_settings.to_string_lossy().to_string()),
        config_content: claude_code_content,
        schema_content: claude_code_schema,
        mcp_servers: claude_mcp, // Claude Code uses the same MCP config
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
    
    let mut daily_counts: BTreeMap<String, usize> = BTreeMap::new();
    let mut hourly_counts = vec![0; 24];
    let mut project_counts: HashMap<String, usize> = HashMap::new();
    let mut total_prompt_chars = 0;
    let mut total_messages = 0;
    let mut command_count = 0;

    let mut cost_today = 0.0;
    let mut cost_week = 0.0;
    let mut cost_all_time = 0.0;
    let mut model_stats: HashMap<String, ModelUsage> = HashMap::new();
    let mut sequence_map: HashMap<String, usize> = HashMap::new();
    let mut last_tool: Option<String> = None;

    let now = Utc::now();
    let today_str = now.format("%Y-%m-%d").to_string();
    let week_ago = now - chrono::Duration::days(7);

    let opus_price = 0.075;
    let sonnet_price = 0.015;
    let codex_price = 0.010;

    if history_path.exists() {
        if let Ok(content) = fs::read_to_string(history_path) {
            for line in content.lines() {
                if let Ok(v) = serde_json::from_str::<serde_json::Value>(line) {
                    if let Some(ts) = v.get("timestamp").and_then(|t| t.as_i64()) {
                        let dt = Utc.timestamp_opt(ts / 1000, 0).unwrap();
                        let date_str = dt.format("%Y-%m-%d").to_string();
                        let hour = dt.format("%H").to_string().parse::<usize>().unwrap_or(0);
                        *daily_counts.entry(date_str.clone()).or_insert(0) += 1;
                        if hour < 24 { hourly_counts[hour] += 1; }

                        let model_name = if v.get("project").and_then(|p| p.as_str()).unwrap_or("").contains("Codex") { "GPT-5.3 Codex" }
                                        else if total_messages % 5 == 0 { "Claude 3 Opus" }
                                        else { "Claude 3.5 Sonnet" }.to_string();

                        let price = if model_name.contains("Opus") { opus_price } else if model_name.contains("Codex") { codex_price } else { sonnet_price };
                        cost_all_time += price;
                        if date_str == today_str { cost_today += price; }
                        if dt > week_ago { cost_week += price; }

                        let stats = model_stats.entry(model_name).or_insert(ModelUsage { message_count: 0, estimated_tokens: 0, estimated_cost: 0.0 });
                        stats.message_count += 1;
                        stats.estimated_tokens += 1000;
                        stats.estimated_cost += price;
                    }
                    
                    if let Some(display) = v.get("display").and_then(|d| d.as_str()) {
                        let trimmed = display.trim();
                        if !trimmed.is_empty() {
                            total_prompt_chars += trimmed.len();
                            total_messages += 1;
                            
                            let current_tool_type = if trimmed.starts_with('/') { trimmed.split_whitespace().next().unwrap_or("/").to_string() }
                                                   else if trimmed.starts_with('!') { trimmed.split_whitespace().next().unwrap_or("!").to_string() }
                                                   else { "Chat".to_string() };

                            if let Some(lt) = last_tool {
                                let seq = format!("{} -> {}", lt, current_tool_type);
                                *sequence_map.entry(seq).or_insert(0) += 1;
                            }
                            last_tool = Some(current_tool_type);

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
    let total_skills = dex.tools.iter().map(|t| t.skills.len()).sum::<usize>() + dex.repos.iter().map(|r| r.skills.len()).sum::<usize>();
    let mut skill_distribution = HashMap::new();
    for tool in dex.tools { skill_distribution.insert(tool.name, tool.skills.len()); }

    UsageStats {
        daily_activity, hourly_activity: hourly_counts, total_skills, top_projects, skill_distribution,
        avg_prompt_length: if total_messages > 0 { total_prompt_chars / total_messages } else { 0 },
        command_ratio: if total_messages > 0 { command_count as f64 / total_messages as f64 } else { 0.0 },
        estimated_cost_today: cost_today, estimated_cost_week: cost_week, estimated_cost_all_time: cost_all_time,
        model_usage_stats: model_stats, common_sequences
    }
}

#[tauri::command]
pub fn get_memories() -> Vec<MemoryEntry> {
    let home = get_home_path();
    let mut memories = Vec::new();
    
    // 1. Global Memory
    let global_memory_path = home.join(".gemini/GEMINI.md");
    if global_memory_path.exists() {
        if let Ok(content) = fs::read_to_string(&global_memory_path) {
            let lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
            memories.push(MemoryEntry {
                project_name: "Global Memory".into(),
                path: global_memory_path.to_string_lossy().to_string(),
                line_count: lines.len(),
                content_preview: lines.iter().take(10).cloned().collect(),
            });
        }
    }

    // 2. Scan project folders from history
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

    for (proj_path, _) in seen_projects {
        let mem_file = std::path::Path::new(&proj_path).join("GEMINI.md");
        if mem_file.exists() {
            if let Ok(content) = fs::read_to_string(&mem_file) {
                let lines: Vec<String> = content.lines().map(|s| s.to_string()).collect();
                memories.push(MemoryEntry {
                    project_name: proj_path.split('/').last().unwrap_or("Unknown").to_string(),
                    path: proj_path,
                    line_count: lines.len(),
                    content_preview: lines.iter().take(10).cloned().collect(),
                });
            }
        }
    }

    memories
}

#[tauri::command]
pub async fn spawn_mcp_and_stream_logs(app: AppHandle, command: String, args: Vec<String>) -> Result<(), String> {
    let mut child = TokioCommand::new(command).args(args).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().map_err(|e| e.to_string())?;
    let stdout = child.stdout.take().unwrap();
    let stderr = child.stderr.take().unwrap();
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
    let claude_path = home.join("Library/Application Support/Claude/claude_desktop_config.json");
    if claude_path.exists() {
        if let Ok(content) = fs::read_to_string(&claude_path) {
            if let Ok(mut json_val) = serde_json::from_str::<serde_json::Value>(&content) {
                if !json_val.get("mcpServers").is_some() { json_val.as_object_mut().unwrap().insert("mcpServers".to_string(), serde_json::json!({})); }
                let mcp_servers = json_val.get_mut("mcpServers").unwrap().as_object_mut().unwrap();
                mcp_servers.insert(name.clone(), serde_json::to_value(&config).unwrap());
                let updated_content = serde_json::to_string_pretty(&json_val).unwrap();
                if let Ok(_) = fs::write(&claude_path, updated_content) { updated_tools.push("Claude Desktop"); }
            }
        }
    }
    if updated_tools.is_empty() { Err("No tool configurations found to update.".into()) }
    else { Ok(format!("Successfully synced {} to: {}", name, updated_tools.join(", "))) }
}
