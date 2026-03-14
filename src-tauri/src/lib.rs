mod commands;
mod scanner;
mod types;
mod utils;

use commands::*;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            get_dex_data,
            save_config,
            add_repo,
            sync_repo,
            search_global_skills,
            install_global_skill,
            uninstall_global_skill,
            create_skill,
            test_mcp_connection,
            check_all_mcp_health,
            install_runtime,
            sync_mcp_to_all_tools,
            get_usage_stats,
            get_marketplace_servers,
            spawn_mcp_and_stream_logs,
            get_memories
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
