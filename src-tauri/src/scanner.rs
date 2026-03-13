use std::fs;
use std::path::PathBuf;
use crate::types::SkillInfo;

pub fn try_fetch_schema(json_content: &str) -> Option<String> {
    let v: serde_json::Value = serde_json::from_str(json_content).ok()?;
    let schema_url = v.get("$schema")?.as_str()?;

    if schema_url.starts_with("http") {
        reqwest::blocking::get(schema_url).ok()?.text().ok()
    } else {
        None
    }
}

pub fn get_skill_description(skill_path: &PathBuf) -> Option<String> {
    let skill_md = skill_path.join("SKILL.md");
    if skill_md.exists() {
        if let Ok(content) = fs::read_to_string(skill_md) {
            return Some(content.lines().take(3).collect::<Vec<_>>().join("\n"));
        }
    }
    
    let pkg_json = skill_path.join("package.json");
    if pkg_json.exists() {
        if let Ok(content) = fs::read_to_string(pkg_json) {
            if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(desc) = v.get("description").and_then(|d| d.as_str()) {
                    return Some(desc.to_string());
                }
            }
        }
    }
    None
}

pub fn scan_for_skills(dir: &PathBuf) -> Vec<SkillInfo> {
    let mut skills = Vec::new();
    if dir.exists() {
        if let Ok(entries) = fs::read_dir(dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_dir() {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.starts_with('.') {
                        continue;
                    }
                    let description = get_skill_description(&path);
                    skills.push(SkillInfo { 
                        name, 
                        description,
                        path: Some(path.to_string_lossy().to_string()),
                    });
                }
            }
        }
    }
    skills
}
