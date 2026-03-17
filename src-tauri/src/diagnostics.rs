use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::Duration;

use chrono::Utc;
use serde::{Deserialize, Serialize};

use crate::types::{
    DiagnosticAction, DiagnosticAdvice, DiagnosticEvidence, DiagnosticHistoryEntry, DiagnosticResult,
    ExportedDiagnosticBundle, LastKnownGoodDiagnostic, McpServerConfig, ServerDiagnosticHistory,
    SuspiciousConfigChange,
};

const DIAGNOSTIC_TIMEOUT_MS: u64 = 450;

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredDiagnosticRun {
    checked_at: String,
    config_path: String,
    server_name: String,
    server_config: StoredServerConfig,
    result: DiagnosticResult,
    revision_filename: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredServerConfig {
    command: String,
    args: Vec<String>,
    env_summary: String,
}

pub fn run_diagnostic(
    config_path: Option<&str>,
    server_name: &str,
    server: &McpServerConfig,
) -> DiagnosticResult {
    let checked_at = current_timestamp();
    if let Some(result) = validate_server_setup(&checked_at, server) {
        return result;
    }

    let mut child = match start_probe(server, &checked_at) {
        Ok(child) => child,
        Err(result) => return result,
    };

    thread::sleep(Duration::from_millis(DIAGNOSTIC_TIMEOUT_MS));
    match child.try_wait() {
        Ok(None) => healthy_probe_result(checked_at, config_path, server_name, server, child),
        Ok(Some(_)) => exited_probe_result(checked_at, server, child),
        Err(err) => timeout_probe_result(checked_at, server, err),
    }
}

fn validate_server_setup(checked_at: &str, server: &McpServerConfig) -> Option<DiagnosticResult> {
    if server.command.trim().is_empty() {
        return Some(failure_result(
            checked_at.to_string(),
            "invalid_config",
            "No command configured for this MCP server.",
            vec!["Add a binary or launcher command before re-running health checks.".to_string()],
            vec![repair_action("rerun_check", "Re-run diagnostic", None, None, None)],
            Vec::new(),
            None,
            Some("Add a valid command such as `npx`, `uvx`, or a direct executable path.".to_string()),
        ));
    }

    let invalid_args = server
        .args
        .iter()
        .filter(|arg| arg.trim().is_empty())
        .map(|_| "An empty argument was found in the args list.".to_string())
        .collect::<Vec<_>>();
    if !invalid_args.is_empty() {
        return Some(failure_result(
            checked_at.to_string(),
            "invalid_args",
            "One or more arguments are empty.",
            invalid_args,
            vec![repair_action(
                "debug_server",
                "Debug server launch",
                Some("Open the live debug panel to confirm the final command line.".to_string()),
                None,
                None,
            )],
            vec![evidence("command", server.command.clone())],
            None,
            Some("Remove blank arguments and verify the command line matches the MCP server documentation.".to_string()),
        ));
    }

    let placeholder_keys = placeholder_env_keys(server.env.as_ref());
    if !placeholder_keys.is_empty() {
        return Some(failure_result(
            checked_at.to_string(),
            "missing_env",
            "Required environment variables look incomplete.",
            vec![format!(
                "Unset or placeholder environment values were found for: {}",
                placeholder_keys.join(", ")
            )],
            vec![
                repair_action(
                    "debug_server",
                    "Debug server launch",
                    Some("Stream stdout and stderr to confirm which credential is failing.".to_string()),
                    None,
                    None,
                ),
                repair_action(
                    "inspect_server",
                    "Open MCP Inspector",
                    Some("Launch Inspector with the exact saved config for this server.".to_string()),
                    None,
                    None,
                ),
            ],
            vec![
                evidence("command", server.command.clone()),
                evidence("envKeys", placeholder_keys.join(", ")),
            ],
            None,
            Some("Fill in the missing secrets or replace placeholder values before launching the server.".to_string()),
        ));
    }

    if !command_exists(&server.command) {
        let suggestion = runtime_install_hint(&server.command)
            .map(|runtime| format!("Install `{runtime}` and then retry the diagnostic."));
        return Some(failure_result(
            checked_at.to_string(),
            "missing_runtime",
            format!("Binary `{}` was not found in PATH.", server.command),
            vec![format!(
                "AI Dex could not resolve `{}` on the current machine.",
                server.command
            )],
            runtime_repair_actions(&server.command),
            vec![evidence("command", server.command.clone())],
            Some(server.command.clone()),
            suggestion,
        ));
    }

    None
}

fn start_probe(server: &McpServerConfig, checked_at: &str) -> Result<Child, DiagnosticResult> {
    let mut command = Command::new(&server.command);
    command
        .args(&server.args)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(env) = &server.env {
        command.envs(env);
    }
    command.spawn().map_err(|err| {
        let failure_kind = if err.kind() == io::ErrorKind::PermissionDenied {
            "permission_denied"
        } else {
            "spawn_error"
        };
        failure_result(
            checked_at.to_string(),
            failure_kind,
            format!("Failed to start `{}`.", server.command),
            vec![err.to_string()],
            vec![
                repair_action(
                    "debug_server",
                    "Debug server launch",
                    Some("Stream stdout and stderr to inspect how the command fails to start.".to_string()),
                    None,
                    None,
                ),
                repair_action(
                    "inspect_server",
                    "Open MCP Inspector",
                    Some("Launch Inspector with the saved config to compare behavior.".to_string()),
                    None,
                    None,
                ),
            ],
            vec![evidence("command", server.command.clone())],
            None,
            Some("Check the executable path, file permissions, and command arguments.".to_string()),
        )
    })
}

fn healthy_probe_result(
    checked_at: String,
    config_path: Option<&str>,
    server_name: &str,
    server: &McpServerConfig,
    mut child: Child,
) -> DiagnosticResult {
    let _ = child.kill();
    let _ = child.wait();
    success_result(
        checked_at,
        "Process started and stayed alive long enough to look healthy.",
        vec![
            format!("Observed a live process for at least {DIAGNOSTIC_TIMEOUT_MS}ms."),
            "Use Debug or Inspector if the server still behaves unexpectedly during actual sessions.".to_string(),
        ],
        vec![
            evidence("command", server.command.clone()),
            evidence("args", joined_args(&server.args)),
            evidence("server", server_name.to_string()),
            evidence("configPath", config_path.unwrap_or("<ad-hoc>").to_string()),
        ],
    )
}

fn exited_probe_result(checked_at: String, server: &McpServerConfig, child: Child) -> DiagnosticResult {
    let output = child.wait_with_output().ok();
    let stdout = output
        .as_ref()
        .map(|value| String::from_utf8_lossy(&value.stdout).trim().to_string())
        .unwrap_or_default();
    let stderr = output
        .as_ref()
        .map(|value| String::from_utf8_lossy(&value.stderr).trim().to_string())
        .unwrap_or_default();
    let combined = [stdout.as_str(), stderr.as_str()]
        .into_iter()
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join(" | ");
    let lowered = combined.to_lowercase();
    let exit_code = output.as_ref().and_then(|value| value.status.code());
    let failure_kind = if lowered.contains("auth")
        || lowered.contains("unauthorized")
        || lowered.contains("forbidden")
        || lowered.contains("api key")
    {
        "auth_error"
    } else if lowered.contains("permission denied") {
        "permission_denied"
    } else if exit_code == Some(0) {
        "protocol_mismatch"
    } else {
        "spawn_error"
    };

    let mut details = vec![format!(
        "The process exited after {}ms with status {:?}.",
        DIAGNOSTIC_TIMEOUT_MS,
        exit_code
    )];
    if !stderr.is_empty() {
        details.push(format!("stderr: {}", truncate(&stderr, 240)));
    }
    if !stdout.is_empty() {
        details.push(format!("stdout: {}", truncate(&stdout, 240)));
    }
    let suggestion = match failure_kind {
        "auth_error" => Some("Verify API keys and environment variables, then retry the launch.".to_string()),
        "permission_denied" => Some("Check that the binary is executable and the surrounding directories are accessible.".to_string()),
        "protocol_mismatch" => Some("The command exited before AI Dex observed a long-lived MCP transport. Re-check the args and launch it through Inspector.".to_string()),
        _ => Some("Review the command output and compare it against a known-good configuration.".to_string()),
    };

    failure_result(
        checked_at,
        failure_kind,
        "The server process exited before the MCP transport looked healthy.",
        details,
        vec![
            repair_action(
                "debug_server",
                "Debug server launch",
                Some("Stream stdout and stderr for a more complete failure trace.".to_string()),
                None,
                None,
            ),
            repair_action(
                "inspect_server",
                "Open MCP Inspector",
                Some("Launch Inspector against the exact saved config for this server.".to_string()),
                None,
                None,
            ),
        ],
        vec![
            evidence("command", server.command.clone()),
            evidence("args", joined_args(&server.args)),
            evidence("exitStatus", format!("{:?}", exit_code)),
        ],
        None,
        suggestion,
    )
}

fn timeout_probe_result(checked_at: String, server: &McpServerConfig, err: io::Error) -> DiagnosticResult {
    failure_result(
        checked_at,
        "timeout",
        "The health probe could not determine the process state.",
        vec![err.to_string()],
        vec![repair_action(
            "debug_server",
            "Debug server launch",
            Some("Retry the command in the live debug panel to capture its full output.".to_string()),
            None,
            None,
        )],
        vec![evidence("command", server.command.clone())],
        None,
        Some("Retry the diagnostic or launch the server in debug mode for more detail.".to_string()),
    )
}

pub fn record_diagnostic_run(
    base_dir: &Path,
    config_path: &str,
    server_name: &str,
    server: &McpServerConfig,
    result: &DiagnosticResult,
) -> Result<(), String> {
    let server_dir = diagnostics_server_dir(base_dir, config_path, server_name);
    fs::create_dir_all(&server_dir).map_err(|err| err.to_string())?;
    let stored = StoredDiagnosticRun {
        checked_at: result.checked_at.clone(),
        config_path: config_path.to_string(),
        server_name: server_name.to_string(),
        server_config: StoredServerConfig {
            command: server.command.clone(),
            args: redacted_args(&server.args),
            env_summary: redacted_env_summary(server.env.as_ref()),
        },
        result: result.clone(),
        revision_filename: latest_snapshot_before(base_dir, config_path, &result.checked_at),
    };
    let output_path = server_dir.join(format!("{}.json", stored.checked_at));
    let body = serde_json::to_string_pretty(&stored).map_err(|err| err.to_string())?;
    fs::write(output_path, body).map_err(|err| err.to_string())
}

pub fn load_diagnostic_history(
    base_dir: &Path,
    config_path: &str,
    server_name: &str,
    current_server: Option<&McpServerConfig>,
) -> Result<ServerDiagnosticHistory, String> {
    let server_dir = diagnostics_server_dir(base_dir, config_path, server_name);
    if !server_dir.exists() {
        return Ok(ServerDiagnosticHistory {
            server_name: server_name.to_string(),
            runs: Vec::new(),
            last_known_good: None,
        });
    }

    let mut runs = Vec::new();
    for entry in fs::read_dir(&server_dir).map_err(|err| err.to_string())? {
        let entry = entry.map_err(|err| err.to_string())?;
        if entry.path().extension().and_then(|ext| ext.to_str()) != Some("json") {
            continue;
        }
        let content = fs::read_to_string(entry.path()).map_err(|err| err.to_string())?;
        if let Ok(stored) = serde_json::from_str::<StoredDiagnosticRun>(&content) {
            runs.push(stored);
        }
    }

    runs.sort_by(|left, right| right.checked_at.cmp(&left.checked_at));
    let history_entries = runs
        .iter()
        .map(|stored| DiagnosticHistoryEntry {
            checked_at: stored.checked_at.clone(),
            status: stored.result.status.clone(),
            message: stored.result.message.clone(),
            failure_kind: stored.result.failure_kind.clone(),
            revision_filename: stored.revision_filename.clone(),
        })
        .collect::<Vec<_>>();
    let last_known_good = runs.iter().find(|stored| stored.result.success).map(|stored| {
        LastKnownGoodDiagnostic {
            checked_at: stored.checked_at.clone(),
            result: stored.result.clone(),
            revision_filename: stored.revision_filename.clone(),
            suspicious_changes: current_server
                .map(|current| detect_suspicious_changes(&stored.server_config, current))
                .unwrap_or_default(),
        }
    });

    Ok(ServerDiagnosticHistory {
        server_name: server_name.to_string(),
        runs: history_entries,
        last_known_good,
    })
}

pub fn export_bug_bundle(
    base_dir: &Path,
    config_path: &str,
    server_name: &str,
    current_server: &McpServerConfig,
    history: &ServerDiagnosticHistory,
    result: &DiagnosticResult,
    recent_logs: &[String],
) -> Result<ExportedDiagnosticBundle, String> {
    let bundle_dir = base_dir.join("diagnostic-bundles");
    fs::create_dir_all(&bundle_dir).map_err(|err| err.to_string())?;
    let ts = current_timestamp();
    let path = bundle_dir.join(format!(
        "{}-{}.md",
        safe_segment(server_name),
        ts
    ));

    let mut lines = vec![
        format!("# MCP Diagnostic Bundle: {}", server_name),
        String::new(),
        format!("- Generated at: {}", ts),
        format!("- Config path: {}", config_path),
        format!("- Status: {}", result.status),
        format!("- Message: {}", result.message),
        format!(
            "- Failure kind: {}",
            result
                .failure_kind
                .clone()
                .unwrap_or_else(|| "healthy".to_string())
        ),
        String::new(),
        "## Current Server Config".to_string(),
        format!("- Command: {}", current_server.command),
        format!("- Args: {}", joined_args(&current_server.args)),
        format!("- Env: {}", redacted_env_summary(current_server.env.as_ref())),
        String::new(),
        "## Evidence".to_string(),
    ];
    for item in &result.evidence {
        lines.push(format!("- {}: {}", item.label, item.value));
    }
    if !result.details.is_empty() {
        lines.push(String::new());
        lines.push("## Details".to_string());
        for detail in &result.details {
            lines.push(format!("- {}", detail));
        }
    }
    if let Some(last_good) = &history.last_known_good {
        lines.push(String::new());
        lines.push("## Last Known Good".to_string());
        lines.push(format!("- Checked at: {}", last_good.checked_at));
        if let Some(revision) = &last_good.revision_filename {
            lines.push(format!("- Revision: {}", revision));
        }
        if !last_good.suspicious_changes.is_empty() {
            lines.push("- Suspicious changes:".to_string());
            for change in &last_good.suspicious_changes {
                lines.push(format!(
                    "  - {}: {} -> {}",
                    change.label, change.previous_value, change.current_value
                ));
            }
        }
    }
    if !history.runs.is_empty() {
        lines.push(String::new());
        lines.push("## Recent Runs".to_string());
        for run in history.runs.iter().take(5) {
            lines.push(format!(
                "- {}: {} ({})",
                run.checked_at, run.message, run.status
            ));
        }
    }
    if !recent_logs.is_empty() {
        lines.push(String::new());
        lines.push("## Recent Logs".to_string());
        for line in recent_logs.iter().take(25) {
            lines.push(format!("- {}", truncate(line, 240)));
        }
    }

    let preview = lines.join("\n");
    fs::write(&path, &preview).map_err(|err| err.to_string())?;
    Ok(ExportedDiagnosticBundle {
        path: path.to_string_lossy().to_string(),
        preview,
    })
}

pub fn build_diagnostic_advice(
    result: &DiagnosticResult,
    history: Option<&ServerDiagnosticHistory>,
) -> DiagnosticAdvice {
    if result.success {
        return DiagnosticAdvice {
            title: "Healthy server".to_string(),
            summary: "The latest probe stayed alive long enough to look healthy.".to_string(),
            confidence: "high".to_string(),
            reasons: vec!["No failure signal is present in the current diagnostic result.".to_string()],
            recommended_steps: vec![
                "No repair action is needed right now.".to_string(),
                "Use Debug or Inspector only if the server misbehaves during a real session.".to_string(),
            ],
        };
    }

    let mut reasons = Vec::new();
    let mut recommended_steps = Vec::new();
    let (title, mut summary, mut confidence) = match result.failure_kind.as_deref() {
        Some("missing_runtime") => (
            "Missing runtime",
            "The configured launcher is not installed on this machine.".to_string(),
            "high".to_string(),
        ),
        Some("missing_env") => (
            "Environment variables incomplete",
            "Credentials or required env vars appear to be missing.".to_string(),
            "high".to_string(),
        ),
        Some("auth_error") => (
            "Authentication failure",
            "The server started but reported an auth-related problem.".to_string(),
            "medium".to_string(),
        ),
        Some("protocol_mismatch") => (
            "Process exits too early",
            "The command exited before AI Dex observed a stable MCP transport.".to_string(),
            "medium".to_string(),
        ),
        Some("permission_denied") => (
            "Permission problem",
            "The operating system blocked the binary from starting or finishing setup.".to_string(),
            "medium".to_string(),
        ),
        _ => (
            "General launch issue",
            "The saved command needs more inspection before AI Dex can classify it with higher confidence.".to_string(),
            "medium".to_string(),
        ),
    };

    match result.failure_kind.as_deref() {
        Some("missing_runtime") => {
            recommended_steps.push("Install the missing runtime from the repair action, then re-run the health check.".to_string());
            if let Some(runtime) = &result.missing_runtime {
                reasons.push(format!("`{runtime}` could not be resolved in PATH."));
            }
        }
        Some("missing_env") => {
            recommended_steps.push("Fill in the missing environment values and save the config before retrying.".to_string());
            reasons.push("One or more env vars still look like placeholders.".to_string());
        }
        Some("auth_error") => {
            recommended_steps.push("Verify API keys, tokens, and account access, then launch the server in Debug mode.".to_string());
            reasons.push("The captured output contains an auth-style error signature.".to_string());
        }
        Some("protocol_mismatch") => {
            recommended_steps.push("Compare the command and args with the MCP server documentation, then open Inspector.".to_string());
            recommended_steps.push("If the config changed recently, try the last known good revision first.".to_string());
        }
        Some("permission_denied") => {
            recommended_steps.push("Check executable permissions and whether the command points at a shell-only script.".to_string());
        }
        _ => {
            recommended_steps.push("Re-run the check in Debug mode to gather a fuller stdout/stderr trace.".to_string());
        }
    }

    if let Some(history) = history {
        if let Some(last_good) = &history.last_known_good {
            reasons.push(format!(
                "This server last passed on {}.",
                last_good.checked_at
            ));
            if !last_good.suspicious_changes.is_empty() {
                let changed_fields = last_good
                    .suspicious_changes
                    .iter()
                    .map(|change| change.label.clone())
                    .collect::<Vec<_>>()
                    .join(", ");
                recommended_steps.insert(
                    0,
                    format!(
                        "Restore the last known good revision or manually revert the changed fields: {}.",
                        changed_fields
                    ),
                );
                summary = "This looks like a regression from a previously healthy configuration.".to_string();
                confidence = "high".to_string();
            }
            if let Some(revision) = &last_good.revision_filename {
                reasons.push(format!("Nearest passing snapshot: {}.", revision));
            }
        }

        if history.runs.iter().take(3).all(|run| run.status == "failed") && history.runs.len() >= 3 {
            reasons.push("The last three diagnostic runs all failed, so this is not a one-off flake.".to_string());
        }
    }

    DiagnosticAdvice {
        title: title.to_string(),
        summary,
        confidence,
        reasons,
        recommended_steps,
    }
}

fn current_timestamp() -> String {
    Utc::now().format("%Y%m%d_%H%M%S").to_string()
}

fn success_result(
    checked_at: String,
    message: impl Into<String>,
    details: Vec<String>,
    evidence: Vec<DiagnosticEvidence>,
) -> DiagnosticResult {
    DiagnosticResult {
        success: true,
        status: "healthy".to_string(),
        message: message.into(),
        failure_kind: None,
        suggestion: None,
        missing_runtime: None,
        details,
        evidence,
        repair_actions: vec![
            repair_action(
                "rerun_check",
                "Re-run diagnostic",
                Some("Run the health probe again after making config changes.".to_string()),
                None,
                None,
            ),
            repair_action(
                "inspect_server",
                "Open MCP Inspector",
                Some("Open Inspector if you want to inspect tools and resources interactively.".to_string()),
                None,
                None,
            ),
        ],
        checked_at,
    }
}

fn failure_result(
    checked_at: String,
    failure_kind: impl Into<String>,
    message: impl Into<String>,
    details: Vec<String>,
    repair_actions: Vec<DiagnosticAction>,
    evidence: Vec<DiagnosticEvidence>,
    missing_runtime: Option<String>,
    suggestion: Option<String>,
) -> DiagnosticResult {
    DiagnosticResult {
        success: false,
        status: "failed".to_string(),
        message: message.into(),
        failure_kind: Some(failure_kind.into()),
        suggestion,
        missing_runtime,
        details,
        evidence,
        repair_actions,
        checked_at,
    }
}

fn evidence(label: impl Into<String>, value: impl Into<String>) -> DiagnosticEvidence {
    DiagnosticEvidence {
        label: label.into(),
        value: value.into(),
    }
}

fn repair_action(
    kind: impl Into<String>,
    label: impl Into<String>,
    description: Option<String>,
    runtime: Option<String>,
    revision_filename: Option<String>,
) -> DiagnosticAction {
    DiagnosticAction {
        kind: kind.into(),
        label: label.into(),
        description,
        runtime,
        revision_filename,
    }
}

fn runtime_install_hint(command: &str) -> Option<&'static str> {
    match command {
        "npx" | "npm" | "node" => Some("node"),
        "uvx" | "uv" => Some("uv"),
        "python3" | "python" => Some("python3"),
        _ => None,
    }
}

fn runtime_repair_actions(command: &str) -> Vec<DiagnosticAction> {
    let runtime = runtime_install_hint(command).unwrap_or(command);
    vec![
        repair_action(
            "install_runtime",
            format!("Install {}", runtime),
            Some("Use AI Dex to install the missing launcher runtime when available, or fall back to the manual install instructions.".to_string()),
            Some(runtime.to_string()),
            None,
        ),
        repair_action(
            "rerun_check",
            "Re-run diagnostic",
            Some("Re-check the server after installing its runtime.".to_string()),
            None,
            None,
        ),
    ]
}

fn command_exists(command: &str) -> bool {
    if command.contains('/') {
        return Path::new(command).exists();
    }
    Command::new("which")
        .arg(command)
        .output()
        .map(|output| output.status.success())
        .unwrap_or(false)
}

fn placeholder_env_keys(env: Option<&HashMap<String, String>>) -> Vec<String> {
    let mut keys = env
        .into_iter()
        .flat_map(|map| map.iter())
        .filter_map(|(key, value)| is_placeholder_value(value).then(|| key.clone()))
        .collect::<Vec<_>>();
    keys.sort();
    keys
}

fn is_placeholder_value(value: &str) -> bool {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return true;
    }
    let upper = trimmed.to_ascii_uppercase();
    upper == "YOUR_API_KEY"
        || upper == "YOUR_TOKEN"
        || upper == "CHANGE_ME"
        || upper == "CHANGEME"
        || upper == "REPLACE_ME"
        || trimmed.starts_with('<')
        || trimmed.ends_with('>')
}

pub fn joined_args(args: &[String]) -> String {
    if args.is_empty() {
        "<none>".to_string()
    } else {
        redacted_args(args).join(" ")
    }
}

fn redacted_args(args: &[String]) -> Vec<String> {
    let mut redacted = Vec::with_capacity(args.len());
    let mut redact_next = false;

    for arg in args {
        if redact_next {
            redacted.push("<redacted>".to_string());
            redact_next = false;
            continue;
        }

        if let Some((key, _)) = arg.split_once('=') {
            if is_sensitive_arg_key(key) {
                redacted.push(format!("{key}=<redacted>"));
                continue;
            }
        }

        if is_sensitive_arg_key(arg) {
            redacted.push(arg.clone());
            redact_next = true;
            continue;
        }

        let lower = arg.to_ascii_lowercase();
        if lower.starts_with("bearer ") || lower.contains("authorization: bearer ") {
            redacted.push("<redacted>".to_string());
            continue;
        }

        redacted.push(arg.clone());
    }

    redacted
}

fn is_sensitive_arg_key(value: &str) -> bool {
    let normalized = value.trim_start_matches('-').to_ascii_lowercase();
    ["token", "api-key", "apikey", "secret", "password", "authorization", "header", "key"]
        .iter()
        .any(|needle| normalized.contains(needle))
}

fn truncate(value: &str, max_len: usize) -> String {
    if value.chars().count() <= max_len {
        value.to_string()
    } else {
        format!("{}...", value.chars().take(max_len).collect::<String>())
    }
}

fn diagnostics_server_dir(base_dir: &Path, config_path: &str, server_name: &str) -> PathBuf {
    base_dir
        .join("diagnostics")
        .join(safe_segment(config_path))
        .join(safe_segment(server_name))
}

fn latest_snapshot_before(base_dir: &Path, config_path: &str, checked_at: &str) -> Option<String> {
    let history_dir = base_dir.join("history").join(config_history_key(config_path));
    let mut snapshots = fs::read_dir(history_dir)
        .ok()?
        .flatten()
        .filter_map(|entry| {
            let filename = entry.file_name().to_string_lossy().to_string();
            filename.ends_with(".snapshot").then_some(filename)
        })
        .collect::<Vec<_>>();
    snapshots.sort();
    snapshots
        .into_iter()
        .filter(|filename| filename.trim_end_matches(".snapshot") <= checked_at)
        .last()
}

fn config_history_key(path: &str) -> String {
    path.replace('/', "_").replace('\\', "_")
}

fn safe_segment(value: &str) -> String {
    value
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .collect()
}

fn detect_suspicious_changes(previous: &StoredServerConfig, current: &McpServerConfig) -> Vec<SuspiciousConfigChange> {
    let mut changes = Vec::new();
    if previous.command != current.command {
        changes.push(SuspiciousConfigChange {
            label: "command".to_string(),
            previous_value: previous.command.clone(),
            current_value: current.command.clone(),
        });
    }
    if previous.args != current.args {
        changes.push(SuspiciousConfigChange {
            label: "args".to_string(),
            previous_value: joined_args(&previous.args),
            current_value: joined_args(&current.args),
        });
    }
    let previous_env = previous.env_summary.clone();
    let current_env = redacted_env_summary(current.env.as_ref());
    if previous_env != current_env {
        changes.push(SuspiciousConfigChange {
            label: "env".to_string(),
            previous_value: previous_env,
            current_value: current_env,
        });
    }
    changes
}

fn redacted_env_summary(env: Option<&HashMap<String, String>>) -> String {
    match env {
        Some(values) if !values.is_empty() => {
            let mut items = values
                .keys()
                .map(|key| format!("{key}=<redacted>"))
                .collect::<Vec<_>>();
            items.sort();
            items.join(", ")
        }
        _ => "<none>".to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::{DiagnosticHistoryEntry, LastKnownGoodDiagnostic, SuspiciousConfigChange};
    use std::collections::HashMap;
    use std::fs;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn temp_path(label: &str) -> std::path::PathBuf {
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time should move forward")
            .as_nanos();
        std::env::temp_dir().join(format!("ai-dex-{label}-{nanos}"))
    }

    fn make_result(success: bool, status: &str, message: &str, failure_kind: Option<&str>) -> DiagnosticResult {
        DiagnosticResult {
            success,
            status: status.to_string(),
            message: message.to_string(),
            failure_kind: failure_kind.map(str::to_string),
            suggestion: None,
            missing_runtime: None,
            details: Vec::new(),
            evidence: Vec::new(),
            repair_actions: Vec::new(),
            checked_at: "20260316_120000".to_string(),
        }
    }

    #[test]
    fn run_diagnostic_should_classify_missing_runtime_and_offer_install() {
        let result = run_diagnostic(
            None,
            "missing-runtime",
            &McpServerConfig {
                command: "definitely-not-a-real-binary".to_string(),
                args: Vec::new(),
                env: None,
            },
        );

        assert!(!result.success);
        assert_eq!(result.failure_kind.as_deref(), Some("missing_runtime"));
        assert_eq!(result.missing_runtime.as_deref(), Some("definitely-not-a-real-binary"));
        assert!(result
            .repair_actions
            .iter()
            .any(|action| action.kind == "install_runtime"));
    }

    #[test]
    fn run_diagnostic_should_flag_placeholder_env_values_before_spawning() {
        let mut env = HashMap::new();
        env.insert("API_KEY".to_string(), "YOUR_API_KEY".to_string());
        let result = run_diagnostic(
            None,
            "placeholder-env",
            &McpServerConfig {
                command: "echo".to_string(),
                args: vec!["hello".to_string()],
                env: Some(env),
            },
        );

        assert!(!result.success);
        assert_eq!(result.failure_kind.as_deref(), Some("missing_env"));
        assert!(result.details.iter().any(|detail| detail.contains("API_KEY")));
    }

    #[test]
    fn run_diagnostic_should_treat_quick_exit_as_protocol_mismatch() {
        let result = run_diagnostic(
            None,
            "quick-exit",
            &McpServerConfig {
                command: "true".to_string(),
                args: Vec::new(),
                env: None,
            },
        );

        assert!(!result.success);
        assert_eq!(result.failure_kind.as_deref(), Some("protocol_mismatch"));
    }

    #[test]
    fn run_diagnostic_should_spawn_with_configured_env() {
        let mut env = HashMap::new();
        env.insert("AI_DEX_TEST_ENV".to_string(), "ready".to_string());
        let result = run_diagnostic(
            None,
            "env-backed",
            &McpServerConfig {
                command: "sh".to_string(),
                args: vec![
                    "-c".to_string(),
                    "[ \"$AI_DEX_TEST_ENV\" = ready ] && sleep 1 || exit 9".to_string(),
                ],
                env: Some(env),
            },
        );

        assert!(result.success, "expected configured env to be passed to the probe");
    }

    #[test]
    fn load_diagnostic_history_should_detect_suspicious_changes_from_last_good_run() {
        let base_dir = temp_path("history");
        fs::create_dir_all(&base_dir).expect("temp dir should exist");

        let old_server = McpServerConfig {
            command: "npx".to_string(),
            args: vec!["-y".to_string(), "@modelcontextprotocol/server-memory".to_string()],
            env: None,
        };
        let result = make_result(true, "healthy", "healthy", None);
        record_diagnostic_run(
            &base_dir,
            "/tmp/config.json",
            "memory",
            &old_server,
            &result,
        )
        .expect("record should succeed");

        let current_server = McpServerConfig {
            command: "uvx".to_string(),
            args: vec!["mcp-server-fetch".to_string()],
            env: None,
        };
        let history = load_diagnostic_history(
            &base_dir,
            "/tmp/config.json",
            "memory",
            Some(&current_server),
        )
        .expect("history should load");

        let last_good = history
            .last_known_good
            .expect("last known good should be available");
        assert!(last_good
            .suspicious_changes
            .iter()
            .any(|change| change.label == "command"));
        assert!(last_good
            .suspicious_changes
            .iter()
            .any(|change| change.label == "args"));
    }

    #[test]
    fn export_bug_bundle_should_redact_env_values() {
        let base_dir = temp_path("bundle");
        fs::create_dir_all(&base_dir).expect("temp dir should exist");

        let mut env = HashMap::new();
        env.insert("SECRET_TOKEN".to_string(), "super-secret-value".to_string());
        let current_server = McpServerConfig {
            command: "npx".to_string(),
            args: vec![
                "--api-key".to_string(),
                "super-secret-arg".to_string(),
                "@modelcontextprotocol/server-github".to_string(),
            ],
            env: Some(env),
        };
        let result = make_result(false, "failed", "binary missing", Some("missing_runtime"));
        let history = ServerDiagnosticHistory {
            server_name: "github".to_string(),
            runs: vec![DiagnosticHistoryEntry {
                checked_at: "20260316_120000".to_string(),
                status: "failed".to_string(),
                message: "binary missing".to_string(),
                failure_kind: Some("missing_runtime".to_string()),
                revision_filename: None,
            }],
            last_known_good: Some(LastKnownGoodDiagnostic {
                checked_at: "20260315_100000".to_string(),
                result: make_result(true, "healthy", "previously healthy", None),
                revision_filename: Some("20260315_100000.snapshot".to_string()),
                suspicious_changes: vec![SuspiciousConfigChange {
                    label: "command".to_string(),
                    previous_value: "npx".to_string(),
                    current_value: "uvx".to_string(),
                }],
            }),
        };

        let bundle = export_bug_bundle(
            &base_dir,
            "/tmp/config.json",
            "github",
            &current_server,
            &history,
            &result,
            &["stderr: auth failed".to_string()],
        )
        .expect("bundle should export");

        assert!(bundle.preview.contains("SECRET_TOKEN=<redacted>"));
        assert!(!bundle.preview.contains("super-secret-value"));
        assert!(bundle.preview.contains("--api-key <redacted>"));
        assert!(!bundle.preview.contains("super-secret-arg"));
    }

    #[test]
    fn record_diagnostic_run_should_not_persist_secret_env_values() {
        let base_dir = temp_path("history-redaction");
        fs::create_dir_all(&base_dir).expect("temp dir should exist");

        let mut env = HashMap::new();
        env.insert("SECRET_TOKEN".to_string(), "super-secret-value".to_string());
        let server = McpServerConfig {
            command: "npx".to_string(),
            args: vec!["--token".to_string(), "super-secret-arg".to_string()],
            env: Some(env),
        };
        let result = make_result(true, "healthy", "healthy", None);
        record_diagnostic_run(&base_dir, "/tmp/config.json", "memory", &server, &result)
            .expect("record should succeed");

        let history_file = base_dir
            .join("diagnostics")
            .join("_tmp_config_json")
            .join("memory")
            .join("20260316_120000.json");
        let content = fs::read_to_string(history_file).expect("history should be written");
        assert!(content.contains("SECRET_TOKEN=<redacted>"));
        assert!(!content.contains("super-secret-value"));
        assert!(content.contains("--token"));
        assert!(content.contains("<redacted>"));
        assert!(!content.contains("super-secret-arg"));
    }

    #[test]
    fn build_diagnostic_advice_should_prioritize_restore_for_recent_regression() {
        let result = make_result(false, "failed", "exited too quickly", Some("protocol_mismatch"));
        let history = ServerDiagnosticHistory {
            server_name: "filesystem".to_string(),
            runs: vec![DiagnosticHistoryEntry {
                checked_at: "20260316_120000".to_string(),
                status: "failed".to_string(),
                message: "exited too quickly".to_string(),
                failure_kind: Some("protocol_mismatch".to_string()),
                revision_filename: None,
            }],
            last_known_good: Some(LastKnownGoodDiagnostic {
                checked_at: "20260315_100000".to_string(),
                result: make_result(true, "healthy", "previously healthy", None),
                revision_filename: Some("20260315_100000.snapshot".to_string()),
                suspicious_changes: vec![SuspiciousConfigChange {
                    label: "args".to_string(),
                    previous_value: "-y @modelcontextprotocol/server-filesystem".to_string(),
                    current_value: "broken".to_string(),
                }],
            }),
        };

        let advice = build_diagnostic_advice(&result, Some(&history));

        assert!(advice
            .recommended_steps
            .iter()
            .any(|step| step.contains("Restore")));
    }

    #[test]
    fn build_diagnostic_advice_should_not_report_failure_for_healthy_server() {
        let advice = build_diagnostic_advice(&make_result(true, "healthy", "all good", None), None);

        assert_eq!(advice.title, "Healthy server");
        assert!(advice.summary.contains("healthy"));
        assert!(advice.recommended_steps.iter().any(|step| step.contains("No repair action")));
    }
}
