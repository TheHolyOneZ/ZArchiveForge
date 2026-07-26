

mod archive;
mod commands;
mod crack;
mod error;
mod job;
mod state;


pub mod testing {
    pub use crate::archive::create::{create_archive, CreateRequest, CreateResult};
    pub use crate::archive::extract::{extract_archive, ExtractRequest, ExtractResult};
    pub use crate::archive::format::{ArchiveFormat, CompressionLevel, EncScheme};
    pub use crate::crack::bruteforce::BruteForce;
    pub use crate::crack::candidate::CandidateSource;
    pub use crate::crack::dictionary::Dictionary;
    pub use crate::crack::engine::preview;
    pub use crate::crack::mask::Mask;
    pub use crate::crack::verifier::{build_verifier, probe, PasswordVerifier};
    pub use crate::crack::AttackConfig;
    pub use crate::job::checkpoint::{self, Checkpoint};


    pub fn recover(
        verifier: &dyn PasswordVerifier,
        source: &mut dyn CandidateSource,
    ) -> Option<String> {
        let mut buf = Vec::new();
        loop {
            buf.clear();
            if source.next_batch(256, &mut buf) == 0 {
                return None;
            }
            for cand in &buf {
                if verifier.verify(cand) {
                    return Some(cand.clone());
                }
            }
        }
    }
}


fn show_main_window(app: &tauri::AppHandle) {
    use tauri::Manager;
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}


fn setup_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    use tauri::menu::{Menu, MenuItem};
    use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};

    let show = MenuItem::with_id(app, "show", "Show ZArchiveForge", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;

    let mut builder = TrayIconBuilder::with_id("main")
        .tooltip("ZArchiveForge")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }
    builder.build(app)?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(state::AppState::default())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            setup_tray(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::app_version,
            commands::rar_cli_available,
            commands::create_archive,
            commands::extract_archive,
            commands::inspect_archive,
            commands::preview_attack,
            commands::start_crack,
            commands::resume_job,
            commands::pause_job,
            commands::cancel_job,
            commands::list_checkpoints,
            commands::delete_checkpoint,
            commands::clear_checkpoints,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
