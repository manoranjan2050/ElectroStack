mod api;
mod commands;
mod config;
mod models;
mod services;
mod stack;
mod system;

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{Manager, WindowEvent};

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(
            tauri_plugin_autostart::Builder::new()
                .args(["--minimized"])
                .build(),
        )
        .setup(|app| {
            config::ensure_app_layout()?;
            build_tray(app)?;
            tauri::async_runtime::spawn(api::run_server());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_overview,
            commands::get_services,
            commands::control_service,
            commands::control_all_services,
            commands::initialize_stack,
            commands::get_websites,
            commands::create_website,
            commands::delete_website,
            commands::clone_website,
            commands::download_website,
            commands::open_path,
            commands::open_url,
            commands::open_vscode,
            commands::open_dashboard,
            commands::open_sites_folder,
            commands::open_stack_folder,
            commands::hide_tray_panel,
            commands::get_php_versions,
            commands::switch_php_version,
            commands::read_php_ini,
            commands::save_php_ini,
            commands::get_databases,
            commands::create_database,
            commands::delete_database,
            commands::backup_database,
            commands::download_database,
            commands::restore_database,
            commands::get_redis_stats,
            commands::flush_redis,
            commands::get_docker_containers,
            commands::control_docker_container,
            commands::get_node_versions,
            commands::run_npm_command,
            commands::run_composer_command,
            commands::git_action,
            commands::get_ftp_users,
            commands::save_ftp_user,
            commands::delete_ftp_user,
            commands::generate_certificate,
            commands::get_backups,
            commands::create_backup,
            commands::get_logs,
            commands::check_updates,
            commands::get_settings,
            commands::save_settings,
            commands::is_admin_configured,
            commands::setup_admin_password,
            commands::login_admin,
            commands::trust_website_certificate,
            commands::toggle_xdebug,
            commands::start_local_tunnel,
            commands::install_app_template,
            commands::is_xdebug_enabled,
            commands::install_php_version,
            commands::get_active_php_version,
            commands::get_docker_images,
            commands::run_docker_container,
            commands::pull_docker_image,
            commands::prune_docker_system,
            commands::run_ssh_deployment
        ])
        .run(tauri::generate_context!())
        .expect("failed to run ElectroStack");
}

fn build_tray(app: &tauri::App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Open Dashboard", true, None::<&str>)?;
    let open_sites = MenuItem::with_id(app, "open_sites", "Open Websites Folder", true, None::<&str>)?;
    let open_root = MenuItem::with_id(app, "open_root", "Open ElectroStack Folder", true, None::<&str>)?;
    let open_pma = MenuItem::with_id(app, "open_pma", "Open phpMyAdmin", true, None::<&str>)?;
    
    let start_all = MenuItem::with_id(app, "start_all", "Start All Services", true, None::<&str>)?;
    let stop_all = MenuItem::with_id(app, "stop_all", "Stop All Services", true, None::<&str>)?;
    let restart_all = MenuItem::with_id(app, "restart_all", "Restart All Services", true, None::<&str>)?;
    
    let start_nginx = MenuItem::with_id(app, "start_nginx", "Start Nginx", true, None::<&str>)?;
    let stop_nginx = MenuItem::with_id(app, "stop_nginx", "Stop Nginx", true, None::<&str>)?;
    
    let start_php = MenuItem::with_id(app, "start_php-fpm", "Start PHP-FPM", true, None::<&str>)?;
    let stop_php = MenuItem::with_id(app, "stop_php-fpm", "Stop PHP-FPM", true, None::<&str>)?;
    
    let start_mariadb = MenuItem::with_id(app, "start_mariadb", "Start MariaDB", true, None::<&str>)?;
    let stop_mariadb = MenuItem::with_id(app, "stop_mariadb", "Stop MariaDB", true, None::<&str>)?;
    
    let start_redis = MenuItem::with_id(app, "start_redis", "Start Redis", true, None::<&str>)?;
    let stop_redis = MenuItem::with_id(app, "stop_redis", "Stop Redis", true, None::<&str>)?;
    
    let start_ftp = MenuItem::with_id(app, "start_ftp", "Start FTP", true, None::<&str>)?;
    let stop_ftp = MenuItem::with_id(app, "stop_ftp", "Stop FTP", true, None::<&str>)?;
    
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::new(app)?;
    menu.append(&show)?;
    menu.append(&open_sites)?;
    menu.append(&open_root)?;
    menu.append(&open_pma)?;
    
    // Add website shortcuts if any exist
    if let Ok(sites) = stack::websites() {
        if !sites.is_empty() {
            let sep = PredefinedMenuItem::separator(app)?;
            menu.append(&sep)?;
            for site in sites {
                let id = format!("site_{}", site.domain);
                let label = format!("Open {}", site.domain);
                if let Ok(item) = MenuItem::with_id(app, &id, &label, true, None::<&str>) {
                    menu.append(&item)?;
                }
            }
        }
    }
    
    let sep1 = PredefinedMenuItem::separator(app)?;
    menu.append(&sep1)?;
    menu.append(&start_all)?;
    menu.append(&stop_all)?;
    menu.append(&restart_all)?;
    
    let sep2 = PredefinedMenuItem::separator(app)?;
    menu.append(&sep2)?;
    menu.append(&start_nginx)?;
    menu.append(&stop_nginx)?;
    menu.append(&start_php)?;
    menu.append(&stop_php)?;
    menu.append(&start_mariadb)?;
    menu.append(&stop_mariadb)?;
    menu.append(&start_redis)?;
    menu.append(&stop_redis)?;
    menu.append(&start_ftp)?;
    menu.append(&stop_ftp)?;
    
    let sep3 = PredefinedMenuItem::separator(app)?;
    menu.append(&sep3)?;
    menu.append(&quit)?;

    TrayIconBuilder::new()
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "open_sites" => open_stack_path("sites"),
            "open_root" => open_stack_path(""),
            "open_pma" => {
                let _ = tauri_plugin_opener::open_url("http://localhost/phpmyadmin", None::<&str>);
            }
            "start_all" => run_all_services("start"),
            "stop_all" => run_all_services("stop"),
            "restart_all" => run_all_services("restart"),
            id if id.starts_with("start_") => run_service(&id[6..], "start"),
            id if id.starts_with("stop_") => run_service(&id[5..], "stop"),
            id if id.starts_with("site_") => {
                let domain = &id[5..];
                let _ = tauri_plugin_opener::open_url(format!("http://{}/", domain), None::<&str>);
            }
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
                show_tray_panel(tray.app_handle());
            }
        })
        .icon(app.default_window_icon().unwrap().clone())
        .build(app)?;

    Ok(())
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
}

fn show_tray_panel(app: &tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("tray-panel") {
        let _ = window.show();
        let _ = window.set_focus();
    } else {
        show_main_window(app);
    }
}

fn open_stack_path(relative: &str) {
    let path = if relative.is_empty() {
        config::stack_root()
    } else {
        config::stack_root().join(relative)
    };
    let _ = tauri_plugin_opener::open_path(path.to_string_lossy().to_string(), None::<&str>);
}

fn run_all_services(action: &'static str) {
    tauri::async_runtime::spawn(async move {
        let _ = services::control_all_services(action).await;
    });
}

fn run_service(key: &str, action: &'static str) {
    let key = key.to_string();
    tauri::async_runtime::spawn(async move {
        let _ = services::control_service(&key, action).await;
    });
}
