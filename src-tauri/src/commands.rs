use std::fs;
use std::process::Command;
use crate::types::*;
use crate::utils::*;
use crate::scanner::*;

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
pub fn test_mcp_connection(command: String, args: Vec<String>) -> Result<String, String> {
    match Command::new(&command).args(&args).spawn() {
        Ok(mut child) => {
            let _ = child.kill();
            Ok("Connection successful. Command exists and is executable.".into())
        }
        Err(e) => Err(format!("Failed to start MCP server: {}", e)),
    }
}

#[tauri::command]
pub fn sync_mcp_to_all_tools(name: String, config: McpServerConfig) -> Result<String, String> {
    let home = get_home_path();
    let mut updated_tools = Vec::new();
    let claude_path = home.join("Library/Application Support/Claude/claude_desktop_config.json");
    if claude_path.exists() {
        if let Ok(content) = fs::read_to_string(&claude_path) {
            if let Ok(mut json_val) = serde_json::from_str::<serde_json::Value>(&content) {
                if !json_val.get("mcpServers").is_some() {
                    json_val.as_object_mut().unwrap().insert("mcpServers".to_string(), serde_json::json!({}));
                }
                let mcp_servers = json_val.get_mut("mcpServers").unwrap().as_object_mut().unwrap();
                mcp_servers.insert(name.clone(), serde_json::to_value(&config).unwrap());
                let updated_content = serde_json::to_string_pretty(&json_val).unwrap();
                if let Ok(_) = fs::write(&claude_path, updated_content) {
                    updated_tools.push("Claude Desktop");
                }
            }
        }
    }
    if updated_tools.is_empty() {
        Err("No tool configurations found to update.".into())
    } else {
        Ok(format!("Successfully synced {} to: {}", name, updated_tools.join(", ")))
    }
}
