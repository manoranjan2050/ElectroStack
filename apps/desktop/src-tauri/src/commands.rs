use crate::models::{
    CreateDatabaseRequest, CreateWebsiteRequest, FtpUser, ProtectedNameRequest,
    ProtectedWebsiteRequest, Settings, WebsiteDownloadRequest,
};
use crate::{services, stack, system};
use crate::config;
use serde_json::Value;
use tauri::Manager;

type CommandResult<T> = Result<T, String>;

#[tauri::command]
pub async fn get_overview() -> CommandResult<crate::models::SystemOverview> {
    Ok(system::overview().await)
}

#[tauri::command]
pub async fn get_services() -> CommandResult<Vec<crate::models::ServiceInfo>> {
    Ok(services::refresh_services().await)
}

#[tauri::command]
pub async fn control_service(key: String, action: String) -> CommandResult<String> {
    services::control_service(&key, &action).await.map_err(to_string)
}

#[tauri::command]
pub async fn control_all_services(action: String) -> CommandResult<String> {
    services::control_all_services(&action).await.map_err(to_string)
}

#[tauri::command]
pub async fn initialize_stack(app: tauri::AppHandle) -> CommandResult<String> {
    stack::initialize_with_resources(app).await.map_err(to_string)
}

#[tauri::command]
pub fn get_websites() -> CommandResult<Vec<crate::models::Website>> {
    stack::websites().map_err(to_string)
}

#[tauri::command]
pub fn create_website(request: CreateWebsiteRequest) -> CommandResult<crate::models::Website> {
    stack::create_website(&request.domain, request.php_version, request.ssl).map_err(to_string)
}

#[tauri::command]
pub fn delete_website(request: ProtectedWebsiteRequest) -> CommandResult<()> {
    stack::delete_website_protected(&request.domain, &request.admin_password).map_err(to_string)
}

#[tauri::command]
pub fn clone_website(source: String, target: String) -> CommandResult<crate::models::Website> {
    stack::clone_website(&source, &target).map_err(to_string)
}

#[tauri::command]
pub async fn download_website(request: WebsiteDownloadRequest) -> CommandResult<String> {
    stack::download_website(&request.domain, request.database).await.map_err(to_string)
}

#[tauri::command]
pub fn open_path(path: String) -> CommandResult<()> {
    tauri_plugin_opener::open_path(path, None::<&str>).map_err(to_string)
}

#[tauri::command]
pub fn open_url(url: String) -> CommandResult<()> {
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(to_string)
}

#[tauri::command]
pub async fn open_vscode(path: String) -> CommandResult<String> {
    stack::git_action(".", vec!["--version".to_string()]).await.ok();
    tokio::process::Command::new("code")
        .arg(path)
        .output()
        .await
        .map(|_| "VS Code opened".to_string())
        .map_err(to_string)
}

#[tauri::command]
pub fn open_dashboard(app: tauri::AppHandle) -> CommandResult<()> {
    if let Some(window) = app.get_webview_window("main") {
        window.show().map_err(to_string)?;
        window.set_focus().map_err(to_string)?;
    }
    if let Some(panel) = app.get_webview_window("tray-panel") {
        let _ = panel.hide();
    }
    Ok(())
}

#[tauri::command]
pub fn hide_tray_panel(app: tauri::AppHandle) -> CommandResult<()> {
    if let Some(panel) = app.get_webview_window("tray-panel") {
        panel.hide().map_err(to_string)?;
    }
    Ok(())
}

#[tauri::command]
pub fn open_sites_folder() -> CommandResult<()> {
    let path = config::stack_root().join("sites");
    tauri_plugin_opener::open_path(path.to_string_lossy().to_string(), None::<&str>).map_err(to_string)
}

#[tauri::command]
pub fn open_stack_folder() -> CommandResult<()> {
    let path = config::stack_root();
    tauri_plugin_opener::open_path(path.to_string_lossy().to_string(), None::<&str>).map_err(to_string)
}

#[tauri::command]
pub fn get_php_versions() -> CommandResult<Vec<String>> {
    stack::php_versions().map_err(to_string)
}

#[tauri::command]
pub fn switch_php_version(version: String) -> CommandResult<String> {
    stack::switch_php_version(&version).map_err(to_string)
}

#[tauri::command]
pub fn read_php_ini(version: String) -> CommandResult<String> {
    stack::read_php_ini(&version).map_err(to_string)
}

#[tauri::command]
pub fn save_php_ini(version: String, content: String) -> CommandResult<()> {
    stack::save_php_ini(&version, &content).map_err(to_string)
}

#[tauri::command]
pub async fn get_databases() -> CommandResult<Vec<crate::models::DatabaseInfo>> {
    stack::list_databases().await.map_err(to_string)
}

#[tauri::command]
pub async fn create_database(request: CreateDatabaseRequest) -> CommandResult<String> {
    stack::create_database_with_user(&request.name, &request.username, &request.password).await.map_err(to_string)
}

#[tauri::command]
pub async fn delete_database(request: ProtectedNameRequest) -> CommandResult<String> {
    stack::delete_database_protected(&request.name, &request.admin_password).await.map_err(to_string)
}

#[tauri::command]
pub async fn backup_database(name: String) -> CommandResult<String> {
    stack::backup_database(&name).await.map_err(to_string)
}

#[tauri::command]
pub async fn download_database(name: String) -> CommandResult<String> {
    stack::download_database(&name).await.map_err(to_string)
}

#[tauri::command]
pub async fn restore_database(name: String, sql_path: String) -> CommandResult<String> {
    stack::restore_database(&name, &sql_path).await.map_err(to_string)
}

#[tauri::command]
pub async fn get_redis_stats() -> CommandResult<Value> {
    stack::redis_stats().await.map_err(to_string)
}

#[tauri::command]
pub async fn flush_redis() -> CommandResult<String> {
    stack::flush_redis().await.map_err(to_string)
}

#[tauri::command]
pub async fn get_docker_containers() -> CommandResult<Vec<crate::models::DockerContainer>> {
    stack::docker_containers().await.map_err(to_string)
}

#[tauri::command]
pub async fn control_docker_container(id: String, action: String) -> CommandResult<String> {
    stack::docker_control(&id, &action).await.map_err(to_string)
}

#[tauri::command]
pub async fn get_node_versions() -> CommandResult<Vec<String>> {
    stack::node_versions().await.map_err(to_string)
}

#[tauri::command]
pub async fn run_npm_command(project_dir: String, args: Vec<String>) -> CommandResult<String> {
    stack::npm_command(&project_dir, args).await.map_err(to_string)
}

#[tauri::command]
pub async fn run_composer_command(project_dir: String, args: Vec<String>) -> CommandResult<String> {
    stack::composer_command(&project_dir, args).await.map_err(to_string)
}

#[tauri::command]
pub async fn git_action(repo_dir: String, args: Vec<String>) -> CommandResult<String> {
    stack::git_action(&repo_dir, args).await.map_err(to_string)
}

#[tauri::command]
pub fn get_ftp_users() -> CommandResult<Vec<FtpUser>> {
    stack::ftp_users().map_err(to_string)
}

#[tauri::command]
pub fn save_ftp_user(user: FtpUser) -> CommandResult<FtpUser> {
    stack::save_ftp_user(user).map_err(to_string)
}

#[tauri::command]
pub fn delete_ftp_user(username: String) -> CommandResult<()> {
    stack::delete_ftp_user(&username).map_err(to_string)
}

#[tauri::command]
pub fn generate_certificate(domain: String) -> CommandResult<String> {
    stack::generate_certificate(&domain).map_err(to_string)
}

#[tauri::command]
pub fn get_backups() -> CommandResult<Vec<crate::models::BackupInfo>> {
    stack::backups().map_err(to_string)
}

#[tauri::command]
pub fn create_backup(kind: String, name: String) -> CommandResult<String> {
    stack::create_backup(&kind, &name).map_err(to_string)
}

#[tauri::command]
pub fn get_logs(source: Option<String>, filter: Option<String>) -> CommandResult<Vec<crate::models::LogEntry>> {
    stack::logs(source, filter).map_err(to_string)
}

#[tauri::command]
pub async fn check_updates() -> CommandResult<Value> {
    stack::check_updates().await.map_err(to_string)
}

#[tauri::command]
pub fn get_settings() -> CommandResult<Settings> {
    stack::settings().map_err(to_string)
}

#[tauri::command]
pub fn save_settings(settings: Settings) -> CommandResult<Settings> {
    stack::save_settings(&settings).map_err(to_string)
}

#[tauri::command]
pub fn is_admin_configured() -> CommandResult<bool> {
    stack::is_admin_configured().map_err(to_string)
}

#[tauri::command]
pub fn setup_admin_password(password: String) -> CommandResult<bool> {
    stack::setup_admin_password(&password).map_err(to_string)
}

#[tauri::command]
pub fn login_admin(password: String) -> CommandResult<bool> {
    stack::login_admin(&password).map_err(to_string)
}

#[tauri::command]
pub async fn trust_website_certificate(domain: String) -> CommandResult<String> {
    stack::trust_website_certificate(&domain).await.map_err(to_string)
}

#[tauri::command]
pub async fn toggle_xdebug(version: String, enable: bool) -> CommandResult<String> {
    stack::toggle_xdebug(&version, enable).await.map_err(to_string)
}

#[tauri::command]
pub async fn start_local_tunnel(domain: String) -> CommandResult<String> {
    stack::start_local_tunnel(&domain).await.map_err(to_string)
}

#[tauri::command]
pub async fn install_app_template(domain: String, template: String) -> CommandResult<String> {
    stack::install_app_template(&domain, &template).await.map_err(to_string)
}

#[tauri::command]
pub fn is_xdebug_enabled(version: String) -> CommandResult<bool> {
    stack::is_xdebug_enabled(&version).map_err(to_string)
}

#[tauri::command]
pub async fn install_php_version(version: String) -> CommandResult<String> {
    stack::install_php_version(&version).await.map_err(to_string)
}

#[tauri::command]
pub fn get_active_php_version() -> CommandResult<String> {
    stack::get_active_php_version().map_err(to_string)
}

#[tauri::command]
pub async fn get_docker_images() -> CommandResult<Vec<crate::models::DockerImage>> {
    stack::get_docker_images().await.map_err(to_string)
}

#[tauri::command]
pub async fn run_docker_container(image: String, name: Option<String>, port_mapping: Option<String>) -> CommandResult<String> {
    stack::run_docker_container(&image, name, port_mapping).await.map_err(to_string)
}

#[tauri::command]
pub async fn pull_docker_image(image: String) -> CommandResult<String> {
    stack::pull_docker_image(&image).await.map_err(to_string)
}

#[tauri::command]
pub async fn prune_docker_system() -> CommandResult<String> {
    stack::prune_docker_system().await.map_err(to_string)
}

#[tauri::command]
pub async fn run_ssh_deployment(req: crate::models::SshDeploymentRequest) -> CommandResult<String> {
    stack::run_ssh_deployment(req).await.map_err(to_string)
}

fn to_string(error: impl std::fmt::Display) -> String {
    error.to_string()
}

