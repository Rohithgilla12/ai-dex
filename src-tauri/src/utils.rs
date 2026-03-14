use regex::Regex;
use std::path::{Path, PathBuf};
use std::process::Command;

pub fn strip_ansi(s: &str) -> String {
    let re = Regex::new(r"\x1b\[[0-9;]*[a-zA-Z]").unwrap();
    re.replace_all(s, "").to_string()
}

pub fn get_home_path() -> PathBuf {
    dirs::home_dir().expect("Could not find home directory")
}

pub fn get_claude_desktop_dir() -> PathBuf {
    if cfg!(target_os = "macos") {
        get_home_path().join("Library/Application Support/Claude")
    } else if cfg!(target_os = "windows") {
        std::env::var("APPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|_| get_home_path().join("AppData/Roaming"))
            .join("Claude")
    } else {
        get_home_path().join(".config/Claude")
    }
}

pub fn get_git_remote_url(dir: &Path) -> Option<String> {
    let output = Command::new("git")
        .current_dir(dir)
        .args(["config", "--get", "remote.origin.url"])
        .output()
        .ok()?;
    if output.status.success() {
        Some(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        None
    }
}
