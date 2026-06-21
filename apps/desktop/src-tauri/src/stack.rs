use crate::config;
use crate::models::{BackupInfo, DatabaseInfo, FtpUser, LogEntry, Settings, Website};
use anyhow::{anyhow, Result};
use chrono::Utc;
use regex::Regex;
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::fs;
use std::path::{Path, PathBuf};
use tokio::process::Command;

use tauri::Manager;

pub async fn initialize_with_resources(app: tauri::AppHandle) -> Result<String> {
    config::ensure_app_layout()?;
    
    let install_script = app.path().resolve("scripts/install-stack.ps1", tauri::path::BaseDirectory::Resource)
        .map_err(|e| anyhow!("Failed to resolve install script: {e}"))?;
        
    let repair_script = app.path().resolve("scripts/repair-stack.ps1", tauri::path::BaseDirectory::Resource)
        .map_err(|e| anyhow!("Failed to resolve repair script: {e}"))?;
        
    let status = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &format!(
                "Start-Process PowerShell -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"{}\"'",
                install_script.display()
            ),
        ])
        .status()?;
        
    if !status.success() {
        return Err(anyhow!("Stack installation failed or was cancelled."));
    }
    
    let status_repair = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-File",
            &format!("{}", repair_script.display()),
        ])
        .status()?;
        
    if !status_repair.success() {
        return Err(anyhow!("Stack layout repair failed."));
    }
    
    write_service_scripts()?;
    write_default_configs()?;
    
    Ok(format!("Initialized and provisioned stack at {}", config::stack_root().display()))
}



pub fn websites() -> Result<Vec<Website>> {
    let path = config::config_file("websites.json");
    read_json_vec(path)
}

pub fn create_website(domain: &str, php_version: Option<String>, ssl: bool) -> Result<Website> {
    validate_domain(domain)?;
    let root = config::stack_root().join("sites").join(domain);
    fs::create_dir_all(&root)?;
    let index = root.join("index.php");
    if !index.exists() {
        fs::write(
            &index,
            format!(
                "<?php\nphpinfo();\n// ElectroStack site: {}\n",
                domain
            ),
        )?;
    }
    let php_version = php_version.unwrap_or_else(|| "8.3".to_string());
    write_nginx_vhost(domain, &root, &php_version, ssl)?;
    let mut websites = websites()?;
    websites.retain(|site| site.domain != domain);
    let site = Website {
        domain: domain.to_string(),
        root: root.to_string_lossy().to_string(),
        php_version,
        ssl,
        created_at: Utc::now().to_rfc3339(),
    };
    websites.push(site.clone());
    write_json(config::config_file("websites.json"), &websites)?;
    Ok(site)
}

pub fn delete_website(domain: &str) -> Result<()> {
    validate_domain(domain)?;
    let mut websites = websites()?;
    websites.retain(|site| site.domain != domain);
    write_json(config::config_file("websites.json"), &websites)?;
    let vhost = config::stack_root().join("nginx/conf/sites-enabled").join(format!("{domain}.conf"));
    if vhost.exists() {
        fs::remove_file(vhost)?;
    }
    Ok(())
}

pub fn delete_website_protected(domain: &str, admin_password: &str) -> Result<()> {
    verify_admin_password(admin_password)?;
    delete_website(domain)
}

pub fn clone_website(source: &str, target: &str) -> Result<Website> {
    validate_domain(source)?;
    validate_domain(target)?;
    let source_path = config::stack_root().join("sites").join(source);
    let target_path = config::stack_root().join("sites").join(target);
    if !source_path.exists() {
        return Err(anyhow!("source website does not exist"));
    }
    copy_dir(&source_path, &target_path)?;
    create_website(target, Some("8.3".to_string()), false)
}

pub async fn download_website(domain: &str, database: Option<String>) -> Result<String> {
    validate_domain(domain)?;
    let site_root = config::stack_root().join("sites").join(domain);
    if !site_root.exists() {
        return Err(anyhow!("website folder does not exist"));
    }

    let backup_dir = config::stack_root().join("backup/websites");
    let work_dir = config::stack_root()
        .join("temp")
        .join(format!("{}-{}", domain, Utc::now().format("%Y%m%d%H%M%S")));
    fs::create_dir_all(&backup_dir)?;
    fs::create_dir_all(&work_dir)?;
    copy_dir(&site_root, &work_dir.join("site"))?;

    if let Some(database) = database.filter(|value| !value.trim().is_empty()) {
        let sql_path = backup_database(&database).await?;
        fs::copy(sql_path, work_dir.join(format!("{database}.sql")))?;
    }

    let target = backup_dir.join(format!("{}-{}.zip", domain, Utc::now().format("%Y%m%d%H%M%S")));
    compress_path(&work_dir, &target)?;
    let _ = fs::remove_dir_all(&work_dir);
    Ok(target.to_string_lossy().to_string())
}

pub fn php_versions() -> Result<Vec<String>> {
    let php_root = config::stack_root().join("php");
    if !php_root.exists() {
        return Ok(vec![]);
    }
    let mut versions = vec![];
    for entry in fs::read_dir(php_root)? {
        let entry = entry?;
        if entry.file_type()?.is_dir() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name != "current" {
                versions.push(name);
            }
        }
    }
    versions.sort();
    Ok(versions)
}

pub fn switch_php_version(version: &str) -> Result<String> {
    let target = config::stack_root().join("php").join(version);
    if !target.exists() {
        return Err(anyhow!("PHP version is not installed: {version}"));
    }
    
    // Kill running php-cgi.exe instances to unlock files
    let _ = std::process::Command::new("taskkill")
        .args(["/F", "/IM", "php-cgi.exe"])
        .status();
    std::thread::sleep(std::time::Duration::from_millis(500));

    let current = config::stack_root().join("php/current");
    if current.exists() {
        let _ = fs::remove_dir_all(&current);
    }
    copy_dir(&target, &current)?;
    
    // Write active version to active.txt
    let _ = fs::write(config::stack_root().join("php/active.txt"), version);

    // Restart PHP-FPM service to boot the new version on port 9000
    let restart_script = config::stack_root().join("scripts/restart-php-fpm.ps1");
    if restart_script.exists() {
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", &restart_script.to_string_lossy()])
            .status();
    }
    
    Ok(version.to_string())
}

pub fn read_php_ini(version: &str) -> Result<String> {
    let path = config::stack_root().join("php").join(version).join("php.ini");
    Ok(fs::read_to_string(path)?)
}

pub fn save_php_ini(version: &str, content: &str) -> Result<()> {
    let path = config::stack_root().join("php").join(version).join("php.ini");
    fs::write(path, content)?;
    Ok(())
}

pub async fn list_databases() -> Result<Vec<DatabaseInfo>> {
    let output = mysql(&["-N", "-e", "SHOW DATABASES;"]).await?;
    Ok(output
        .lines()
        .filter(|name| !["information_schema", "mysql", "performance_schema", "sys"].contains(name))
        .map(|name| DatabaseInfo {
            name: name.to_string(),
            size_mb: 0.0,
            created_at: None,
        })
        .collect())
}

pub async fn create_database_with_user(name: &str, username: &str, password: &str) -> Result<String> {
    validate_identifier(name)?;
    validate_identifier(username)?;
    if password.len() < 6 {
        return Err(anyhow!("database password must be at least 6 characters"));
    }
    let escaped_password = password.replace('\'', "''");
    mysql(&["-e", &format!(
        "CREATE DATABASE IF NOT EXISTS `{name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci; CREATE USER IF NOT EXISTS '{username}'@'localhost' IDENTIFIED BY '{escaped_password}'; GRANT ALL PRIVILEGES ON `{name}`.* TO '{username}'@'localhost'; FLUSH PRIVILEGES;"
    )]).await
}

pub async fn delete_database(name: &str) -> Result<String> {
    validate_identifier(name)?;
    mysql(&["-e", &format!("DROP DATABASE IF EXISTS `{name}`;")]).await
}

pub async fn delete_database_protected(name: &str, admin_password: &str) -> Result<String> {
    verify_admin_password(admin_password)?;
    delete_database(name).await
}

pub async fn backup_database(name: &str) -> Result<String> {
    validate_identifier(name)?;
    let backup_dir = config::stack_root().join("backup/databases");
    fs::create_dir_all(&backup_dir)?;
    let target = backup_dir.join(format!("{}-{}.sql", name, Utc::now().format("%Y%m%d%H%M%S")));
    let exe = config::stack_root().join("mariadb/bin/mariadb-dump.exe");
    let output = Command::new(exe)
        .args(["-u", "root"])
        .arg(name)
        .output()
        .await?;
    if !output.status.success() {
        return Err(anyhow!(String::from_utf8_lossy(&output.stderr).to_string()));
    }
    fs::write(&target, output.stdout)?;
    Ok(target.to_string_lossy().to_string())
}

pub async fn download_database(name: &str) -> Result<String> {
    backup_database(name).await
}

pub async fn restore_database(name: &str, sql_path: &str) -> Result<String> {
    validate_identifier(name)?;
    let sql = fs::read_to_string(sql_path)?;
    mysql(&["-e", &format!("CREATE DATABASE IF NOT EXISTS `{name}`; USE `{name}`; {sql}")]).await
}

pub async fn redis_stats() -> Result<Value> {
    let exe = config::stack_root().join("redis/redis-cli.exe");
    let output = Command::new(exe).arg("INFO").output().await?;
    if !output.status.success() {
        return Err(anyhow!("redis-cli failed"));
    }
    let mut map = serde_json::Map::new();
    for line in String::from_utf8_lossy(&output.stdout).lines() {
        if let Some((key, value)) = line.split_once(':') {
            map.insert(key.to_string(), Value::String(value.trim().to_string()));
        }
    }
    Ok(Value::Object(map))
}

pub async fn flush_redis() -> Result<String> {
    let exe = config::stack_root().join("redis/redis-cli.exe");
    run(exe, ["FLUSHALL"]).await
}

pub fn logs(source: Option<String>, filter: Option<String>) -> Result<Vec<LogEntry>> {
    let mut entries = vec![];
    let log_root = config::stack_root().join("logs");
    if !log_root.exists() {
        return Ok(entries);
    }
    for entry in fs::read_dir(log_root)? {
        let entry = entry?;
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("log") {
            continue;
        }
        let name = path.file_stem().unwrap_or_default().to_string_lossy().to_string();
        if source.as_ref().is_some_and(|selected| selected != &name) {
            continue;
        }
        let mut lines: Vec<String> = fs::read_to_string(&path)?
            .lines()
            .rev()
            .take(300)
            .map(|line| line.to_string())
            .collect();
        lines.reverse();
        if let Some(filter) = &filter {
            let needle = filter.to_lowercase();
            lines.retain(|line| line.to_lowercase().contains(&needle));
        }
        entries.push(LogEntry {
            source: name,
            path: path.to_string_lossy().to_string(),
            lines,
        });
    }
    Ok(entries)
}

pub fn backups() -> Result<Vec<BackupInfo>> {
    let mut list = vec![];
    let root = config::stack_root().join("backup");
    if !root.exists() {
        return Ok(list);
    }
    collect_backups(&root, &mut list)?;
    Ok(list)
}

pub fn create_backup(kind: &str, name: &str) -> Result<String> {
    validate_identifier(name)?;
    let backup_dir = config::stack_root().join("backup").join(kind);
    fs::create_dir_all(&backup_dir)?;
    let target = backup_dir.join(format!("{}-{}.zip", name, Utc::now().format("%Y%m%d%H%M%S")));
    let source = match kind {
        "website" => config::stack_root().join("sites").join(name),
        "full" => config::stack_root(),
        _ => return Err(anyhow!("unsupported backup kind")),
    };
    let status = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command"])
        .arg(format!(
            "Compress-Archive -Path '{}' -DestinationPath '{}' -Force",
            source.display(),
            target.display()
        ))
        .status()?;
    if !status.success() {
        return Err(anyhow!("backup compression failed"));
    }
    Ok(target.to_string_lossy().to_string())
}

pub fn settings() -> Result<Settings> {
    let path = config::config_file("settings.json");
    if !path.exists() {
        return Ok(Settings {
            preferred_php: "8.3".to_string(),
            minimize_to_tray: true,
            ..Settings::default()
        });
    }
    Ok(serde_json::from_str(&fs::read_to_string(path)?)?)
}

pub fn save_settings(settings: &Settings) -> Result<Settings> {
    write_json(config::config_file("settings.json"), settings)?;
    Ok(settings.clone())
}

pub fn is_admin_configured() -> Result<bool> {
    Ok(settings()?.admin_password_hash.is_some())
}

pub fn setup_admin_password(password: &str) -> Result<bool> {
    if password.len() < 6 {
        return Err(anyhow!("admin password must be at least 6 characters"));
    }
    let mut settings = settings()?;
    if settings.admin_password_hash.is_some() {
        return Err(anyhow!("admin password is already configured"));
    }
    settings.admin_password_hash = Some(hash_password(password));
    save_settings(&settings)?;
    Ok(true)
}

pub fn login_admin(password: &str) -> Result<bool> {
    verify_admin_password(password)?;
    Ok(true)
}

pub fn ftp_users() -> Result<Vec<FtpUser>> {
    read_json_vec(config::config_file("ftp-users.json"))
}

pub fn save_ftp_user(user: FtpUser) -> Result<FtpUser> {
    validate_identifier(&user.username)?;
    let mut users = ftp_users()?;
    users.retain(|existing| existing.username != user.username);
    users.push(user.clone());
    write_json(config::config_file("ftp-users.json"), &users)?;
    Ok(user)
}

pub fn delete_ftp_user(username: &str) -> Result<()> {
    validate_identifier(username)?;
    let mut users = ftp_users()?;
    users.retain(|user| user.username != username);
    write_json(config::config_file("ftp-users.json"), &users)?;
    Ok(())
}

pub fn generate_certificate(domain: &str) -> Result<String> {
    validate_domain(domain)?;
    let cert_dir = config::stack_root().join("ssl").join(domain);
    fs::create_dir_all(&cert_dir)?;
    let key = cert_dir.join("localhost.key");
    let crt = cert_dir.join("localhost.crt");
    let status = std::process::Command::new("openssl")
        .args([
            "req",
            "-x509",
            "-newkey",
            "rsa:2048",
            "-nodes",
            "-keyout",
            &key.to_string_lossy(),
            "-out",
            &crt.to_string_lossy(),
            "-days",
            "825",
            "-subj",
            &format!("/CN={domain}"),
        ])
        .status()?;
    if !status.success() {
        return Err(anyhow!("openssl certificate generation failed"));
    }
    Ok(crt.to_string_lossy().to_string())
}

pub async fn docker_containers() -> Result<Vec<crate::models::DockerContainer>> {
    let output = run("docker", ["ps", "-a", "--format", "{{json .}}"]).await?;
    let mut containers = vec![];
    for line in output.lines() {
        let value: Value = serde_json::from_str(line)?;
        containers.push(crate::models::DockerContainer {
            id: value["ID"].as_str().unwrap_or_default().to_string(),
            name: value["Names"].as_str().unwrap_or_default().to_string(),
            image: value["Image"].as_str().unwrap_or_default().to_string(),
            status: value["Status"].as_str().unwrap_or_default().to_string(),
        });
    }
    Ok(containers)
}

pub async fn docker_control(id: &str, action: &str) -> Result<String> {
    match action {
        "start" | "stop" | "restart" | "logs" => run("docker", [action, id]).await,
        _ => Err(anyhow!("unsupported Docker action")),
    }
}

pub async fn node_versions() -> Result<Vec<String>> {
    let mut versions = vec![];
    if which::which("node").is_ok() {
        versions.push(run("node", ["--version"]).await?);
    }
    Ok(versions)
}

pub async fn npm_command(project_dir: &str, args: Vec<String>) -> Result<String> {
    run_in_dir("npm", args, project_dir).await
}

pub async fn composer_command(project_dir: &str, args: Vec<String>) -> Result<String> {
    run_in_dir("composer", args, project_dir).await
}

pub async fn git_action(repo_dir: &str, args: Vec<String>) -> Result<String> {
    run_in_dir("git", args, repo_dir).await
}

pub async fn check_updates() -> Result<Value> {
    Ok(serde_json::json!({
        "channel": "github-releases",
        "currentVersion": env!("CARGO_PKG_VERSION"),
        "endpoint": "https://github.com/electrostack/electrostack/releases/latest"
    }))
}

async fn mysql(args: &[&str]) -> Result<String> {
    let exe = config::stack_root().join("mariadb/bin/mariadb.exe");
    let mut cmd_args = vec!["-u", "root"];
    cmd_args.extend_from_slice(args);
    run(exe, cmd_args).await
}

fn verify_admin_password(password: &str) -> Result<()> {
    let Some(stored) = settings()?.admin_password_hash else {
        return Err(anyhow!("admin password is not configured"));
    };
    if hash_password(password) == stored {
        Ok(())
    } else {
        Err(anyhow!("invalid admin password"))
    }
}

fn hash_password(password: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(b"electrostack-admin-v1:");
    hasher.update(password.as_bytes());
    format!("{:x}", hasher.finalize())
}

fn compress_path(source: &Path, target: &Path) -> Result<()> {
    let status = std::process::Command::new("powershell")
        .args(["-NoProfile", "-Command"])
        .arg(format!(
            "Compress-Archive -Path '{}' -DestinationPath '{}' -Force",
            source.display(),
            target.display()
        ))
        .status()?;
    if !status.success() {
        return Err(anyhow!("backup compression failed"));
    }
    Ok(())
}

async fn run<I, S, P>(program: P, args: I) -> Result<String>
where
    I: IntoIterator<Item = S>,
    S: AsRef<std::ffi::OsStr>,
    P: AsRef<std::ffi::OsStr>,
{
    let output = Command::new(program).args(args).output().await?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(anyhow!(String::from_utf8_lossy(&output.stderr).to_string()))
    }
}

async fn run_in_dir(program: &str, args: Vec<String>, dir: &str) -> Result<String> {
    let output = Command::new(program).args(args).current_dir(dir).output().await?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(anyhow!(String::from_utf8_lossy(&output.stderr).to_string()))
    }
}

fn write_nginx_vhost(domain: &str, root: &Path, php_version: &str, ssl: bool) -> Result<()> {
    let dir = config::stack_root().join("nginx/conf/sites-enabled");
    fs::create_dir_all(&dir)?;
    let ssl_block = if ssl {
        format!(
            "\n    listen 443 ssl;\n    ssl_certificate C:/ElectroStack/ssl/{domain}/localhost.crt;\n    ssl_certificate_key C:/ElectroStack/ssl/{domain}/localhost.key;"
        )
    } else {
        String::new()
    };
    
    let port = match php_version {
        "8.1" => 9081,
        "8.2" => 9082,
        "8.3" => 9083,
        "8.4" => 9084,
        _ => 9000,
    };

    let config = format!(
        "server {{\n    listen 80;\n    server_name {domain};{ssl_block}\n    root {};\n    index index.php index.html;\n\n    location / {{\n        try_files $uri $uri/ /index.php?$query_string;\n    }}\n\n    location ~ \\.php$ {{\n        include fastcgi_params;\n        fastcgi_pass 127.0.0.1:{port};\n        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;\n        fastcgi_param ELECTROSTACK_PHP_VERSION {php_version};\n    }}\n}}\n",
        root.to_string_lossy().replace('\\', "/")
    );
    fs::write(dir.join(format!("{domain}.conf")), config)?;
    Ok(())
}

fn write_default_configs() -> Result<()> {
    let root = config::stack_root();
    let root_str = root.to_string_lossy().replace('\\', "/");
    fs::create_dir_all(root.join("nginx/conf/sites-enabled"))?;
    fs::write(
        root.join("nginx/conf/nginx.conf"),
        "worker_processes auto;\nevents { worker_connections 1024; }\nhttp { include mime.types; include sites-enabled/*.conf; }\n",
    )?;
    
    let localhost_conf = format!(
        "server {{\n    listen 80;\n    server_name localhost;\n    root {root_str}/sites;\n    index index.php index.html;\n\n    location / {{\n        try_files $uri $uri/ /index.php?$query_string;\n    }}\n\n    location /phpmyadmin {{\n        alias {root_str}/phpmyadmin;\n        index index.php index.html index.htm;\n        \n        location ~ \\.php$ {{\n            fastcgi_pass 127.0.0.1:9000;\n            fastcgi_index index.php;\n            include fastcgi_params;\n            fastcgi_param SCRIPT_FILENAME $request_filename;\n        }}\n    }}\n\n    location /trading {{\n        alias {root_str}/sites/trading.local;\n        index index.php index.html index.htm;\n        \n        location ~ \\.php$ {{\n            fastcgi_pass 127.0.0.1:9000;\n            fastcgi_index index.php;\n            include fastcgi_params;\n            fastcgi_param SCRIPT_FILENAME $request_filename;\n        }}\n    }}\n\n    location ~ \\.php$ {{\n        include fastcgi_params;\n        fastcgi_pass 127.0.0.1:9000;\n        fastcgi_param SCRIPT_FILENAME $document_root$fastcgi_script_name;\n    }}\n}}\n"
    );
    fs::write(
        root.join("nginx/conf/sites-enabled/localhost.conf"),
        localhost_conf,
    )?;

    let pma_config_path = root.join("phpmyadmin/config.inc.php");
    if !pma_config_path.exists() {
        fs::write(
            pma_config_path,
            "<?php\n$cfg['blowfish_secret'] = 'change-this-electrostack-secret-32-chars-long-12345';\n$i = 1;\n$cfg['Servers'][$i]['auth_type'] = 'config';\n$cfg['Servers'][$i]['host'] = '127.0.0.1';\n$cfg['Servers'][$i]['user'] = 'root';\n$cfg['Servers'][$i]['password'] = '';\n$cfg['Servers'][$i]['AllowNoPassword'] = true;\n",
        )?;
    }

    fs::write(
        root.join("redis/redis.windows.conf"),
        "bind 127.0.0.1\nport 6379\ndir C:/ElectroStack/data/redis\nlogfile C:/ElectroStack/logs/redis.log\n",
    )?;
    Ok(())
}

fn write_service_scripts() -> Result<()> {
    let dir = config::stack_root().join("scripts");
    fs::create_dir_all(&dir)?;
    let scripts = [
        ("start-nginx.ps1", "Start-Process C:\\ElectroStack\\nginx\\nginx.exe -ArgumentList '-p C:\\ElectroStack\\nginx' -WorkingDirectory C:\\ElectroStack\\nginx -WindowStyle Hidden"),
        ("stop-nginx.ps1", "C:\\ElectroStack\\nginx\\nginx.exe -p C:\\ElectroStack\\nginx -s stop"),
        ("restart-nginx.ps1", "C:\\ElectroStack\\nginx\\nginx.exe -p C:\\ElectroStack\\nginx -s reload"),
        ("start-redis.ps1", "Start-Process C:\\ElectroStack\\redis\\redis-server.exe C:\\ElectroStack\\redis\\redis.windows.conf"),
        ("stop-redis.ps1", "C:\\ElectroStack\\redis\\redis-cli.exe shutdown"),
        ("restart-redis.ps1", "& C:\\ElectroStack\\scripts\\stop-redis.ps1; & C:\\ElectroStack\\scripts\\start-redis.ps1"),
    ];
    for (name, content) in scripts {
        fs::write(dir.join(name), content)?;
    }
    Ok(())
}

fn validate_domain(domain: &str) -> Result<()> {
    let re = Regex::new(r"^[a-z0-9][a-z0-9-]{1,62}\.local$")?;
    if re.is_match(domain) {
        Ok(())
    } else {
        Err(anyhow!("domain must look like example.local"))
    }
}

fn validate_identifier(value: &str) -> Result<()> {
    let re = Regex::new(r"^[A-Za-z0-9_.-]{1,64}$")?;
    if re.is_match(value) {
        Ok(())
    } else {
        Err(anyhow!("invalid identifier"))
    }
}

fn read_json_vec<T: serde::de::DeserializeOwned>(path: PathBuf) -> Result<Vec<T>> {
    if !path.exists() {
        return Ok(vec![]);
    }
    Ok(serde_json::from_str(&fs::read_to_string(path)?)?)
}

fn write_json<T: serde::Serialize>(path: PathBuf, value: &T) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)?;
    }
    fs::write(path, serde_json::to_string_pretty(value)?)?;
    Ok(())
}

fn copy_dir(source: &Path, target: &Path) -> Result<()> {
    fs::create_dir_all(target)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let next_target = target.join(entry.file_name());
        if entry.file_type()?.is_dir() {
            copy_dir(&entry.path(), &next_target)?;
        } else {
            fs::copy(entry.path(), next_target)?;
        }
    }
    Ok(())
}

fn collect_backups(root: &Path, list: &mut Vec<BackupInfo>) -> Result<()> {
    for entry in fs::read_dir(root)? {
        let entry = entry?;
        let path = entry.path();
        if entry.file_type()?.is_dir() {
            collect_backups(&path, list)?;
        } else {
            let metadata = entry.metadata()?;
            list.push(BackupInfo {
                name: entry.file_name().to_string_lossy().to_string(),
                path: path.to_string_lossy().to_string(),
                kind: path
                    .parent()
                    .and_then(|parent| parent.file_name())
                    .unwrap_or_default()
                    .to_string_lossy()
                    .to_string(),
                size_mb: metadata.len() as f64 / 1024.0 / 1024.0,
                created_at: metadata
                    .created()
                    .map(chrono::DateTime::<Utc>::from)
                    .unwrap_or_else(|_| Utc::now())
                    .to_rfc3339(),
            });
        }
    }
    Ok(())
}

pub async fn trust_website_certificate(domain: &str) -> Result<String> {
    validate_domain(domain)?;
    let script = config::stack_root().join("scripts/trust-cert.ps1");
    if !script.exists() {
        return Err(anyhow!("trust-cert.ps1 script not found"));
    }
    let status = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &format!(
                "Start-Process PowerShell -Verb RunAs -Wait -ArgumentList '-NoProfile -ExecutionPolicy Bypass -File \"{}\" -Domain {}'",
                script.display(),
                domain
            ),
        ])
        .status()?;
    if !status.success() {
        return Err(anyhow!("Failed to trust certificate or was cancelled."));
    }
    Ok(format!("Certificate for {} trusted successfully", domain))
}

pub async fn toggle_xdebug(version: &str, enable: bool) -> Result<String> {
    let root = config::stack_root();
    let ini_path = root.join("php").join(version).join("php.ini");
    if !ini_path.exists() {
        return Err(anyhow!("php.ini not found for version {}", version));
    }
    let mut content = fs::read_to_string(&ini_path)?;
    
    let has_xdebug = content.contains("zend_extension=xdebug") || content.contains("zend_extension=php_xdebug");
    
    if enable {
        if !has_xdebug {
            content.push_str("\n[xdebug]\nzend_extension=xdebug\nxdebug.mode=debug\nxdebug.start_with_request=yes\n");
        } else {
            content = content.replace(";zend_extension=xdebug", "zend_extension=xdebug");
            content = content.replace("; zend_extension=xdebug", "zend_extension=xdebug");
        }
    } else {
        content = content.replace("zend_extension=xdebug", ";zend_extension=xdebug");
    }
    
    fs::write(&ini_path, &content)?;

    let current_ini = root.join("php/current/php.ini");
    if current_ini.exists() {
        let _ = fs::write(&current_ini, content);
    }
    
    let script_name = format!("restart-php-fpm-{}.ps1", version);
    let restart_script = root.join("scripts").join(&script_name);
    if restart_script.exists() {
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", &restart_script.to_string_lossy()])
            .status();
    } else {
        let _ = std::process::Command::new("powershell")
            .args(["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", &root.join("scripts/restart-php-fpm.ps1").to_string_lossy()])
            .status();
    }
    
    Ok(format!("Xdebug {}", if enable { "enabled" } else { "disabled" }))
}

pub async fn start_local_tunnel(domain: &str) -> Result<String> {
    let mut child = tokio::process::Command::new("cmd")
        .args([
            "/C",
            &format!("npx localtunnel --port 80 --local-host {}", domain),
        ])
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()?;
        
    let stdout = child.stdout.take().ok_or_else(|| anyhow!("Failed to capture stdout"))?;
    let mut reader = tokio::io::BufReader::new(stdout);
    let mut line = String::new();
    
    for _ in 0..100 {
        line.clear();
        let read_fut = tokio::io::AsyncBufReadExt::read_line(&mut reader, &mut line);
        match tokio::time::timeout(std::time::Duration::from_secs(8), read_fut).await {
            Ok(Ok(0)) | Err(_) => break,
            Ok(Ok(_)) => {
                let trimmed = line.trim();
                if trimmed.contains("your url is:") || trimmed.contains("https://") {
                    if let Some(pos) = trimmed.find("https://") {
                        let url = trimmed[pos..].to_string();
                        tokio::spawn(async move {
                            let _ = child.wait().await;
                        });
                        return Ok(url);
                    }
                }
            }
            Ok(Err(_)) => break,
        }
    }
    
    Err(anyhow!("Failed to retrieve tunnel URL. Make sure npx localtunnel works."))
}

pub async fn install_app_template(domain: &str, template: &str) -> Result<String> {
    validate_domain(domain)?;
    let site_root = config::stack_root().join("sites").join(domain);
    fs::create_dir_all(&site_root)?;
    
    match template {
        "wordpress" => {
            let wp_zip = config::stack_root().join("packages/wordpress-latest.zip");
            if !wp_zip.exists() {
                let status = std::process::Command::new("powershell")
                    .args([
                        "-NoProfile",
                        "-Command",
                        &format!(
                            "Invoke-WebRequest -Uri 'https://wordpress.org/latest.zip' -OutFile '{}' -UseBasicParsing",
                            wp_zip.display()
                        ),
                    ])
                    .status()?;
                if !status.success() {
                    return Err(anyhow!("Failed to download WordPress zip"));
                }
            }
            
            let temp_extract = config::stack_root().join("temp").join(format!("wp-{}", domain));
            if temp_extract.exists() {
                let _ = fs::remove_dir_all(&temp_extract);
            }
            fs::create_dir_all(&temp_extract)?;
            
            let status = std::process::Command::new("powershell")
                .args([
                    "-NoProfile",
                    "-Command",
                    &format!(
                        "Expand-Archive -Path '{}' -DestinationPath '{}' -Force",
                        wp_zip.display(),
                        temp_extract.display()
                    ),
                ])
                .status()?;
            if !status.success() {
                return Err(anyhow!("Failed to extract WordPress"));
            }
            
            let wp_src = temp_extract.join("wordpress");
            if wp_src.exists() {
                copy_dir(&wp_src, &site_root)?;
            }
            let _ = fs::remove_dir_all(&temp_extract);
            
            let db_name = domain.replace('.', "_");
            let _ = mysql(&["-e", &format!("CREATE DATABASE IF NOT EXISTS `{db_name}`;")]).await;
        }
        "laravel" => {
            let output = tokio::process::Command::new("composer.bat")
                .args(["create-project", "laravel/laravel", ".", "--prefer-dist"])
                .current_dir(&site_root)
                .output()
                .await;
                
            let output = if output.is_err() {
                tokio::process::Command::new("composer")
                    .args(["create-project", "laravel/laravel", ".", "--prefer-dist"])
                    .current_dir(&site_root)
                    .output()
                    .await?
            } else {
                output?
            };
            
            if !output.status.success() {
                return Err(anyhow!(String::from_utf8_lossy(&output.stderr).to_string()));
            }
        }
        "react" => {
            let output = tokio::process::Command::new("cmd")
                .args([
                    "/C",
                    "npm create vite@latest . --y -- --template react-ts",
                ])
                .current_dir(&site_root)
                .output()
                .await?;
            if !output.status.success() {
                return Err(anyhow!(String::from_utf8_lossy(&output.stderr).to_string()));
            }
        }
        _ => {}
    }
    
    Ok(format!("Template {} installed successfully", template))
}

pub fn is_xdebug_enabled(version: &str) -> Result<bool> {
    let root = config::stack_root();
    let ini_path = root.join("php").join(version).join("php.ini");
    if !ini_path.exists() {
        return Ok(false);
    }
    let content = fs::read_to_string(&ini_path)?;
    Ok(content.lines().any(|line| {
        let trimmed = line.trim();
        (trimmed.starts_with("zend_extension=xdebug") || trimmed.starts_with("zend_extension=php_xdebug"))
            && !trimmed.starts_with(';')
    }))
}

pub async fn install_php_version(version: &str) -> Result<String> {
    let status = std::process::Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-Command",
            &format!(
                r#"$version = '{}'
$Root = 'C:\ElectroStack'
$packagesDir = "$Root\packages"
$phpDir = "$Root\php\$version"

$zipName = switch ($version) {{
    "8.1" {{ "php-8.1.31-nts-Win32-vs16-x64.zip" }}
    "8.2" {{ "php-8.2.27-nts-Win32-vs16-x64.zip" }}
    "8.3" {{ "php-8.3.15-nts-Win32-vs16-x64.zip" }}
    "8.4" {{ "php-8.4.2-nts-Win32-vs17-x64.zip" }}
    default {{ throw "Unsupported PHP version" }}
}}

$zipPath = "$packagesDir\$zipName"
$primaryUrl = "https://windows.php.net/downloads/releases/$zipName"
$fallbackUrl = "https://windows.php.net/downloads/releases/archives/$zipName"

if (-not (Test-Path $packagesDir)) {{ New-Item -ItemType Directory -Force -Path $packagesDir | Out-Null }}
if (-not (Test-Path $phpDir)) {{ New-Item -ItemType Directory -Force -Path $phpDir | Out-Null }}

if (-not (Test-Path "$phpDir\php-cgi.exe")) {{
    if (-not (Test-Path $zipPath)) {{
        Write-Host "Downloading PHP $version from $primaryUrl..."
        try {{
            Invoke-WebRequest -Uri $primaryUrl -OutFile $zipPath -UseBasicParsing -ErrorAction Stop
        }} catch {{
            Write-Host "Primary URL failed, trying archives fallback: $fallbackUrl..."
            Invoke-WebRequest -Uri $fallbackUrl -OutFile $zipPath -UseBasicParsing -ErrorAction Stop
        }}
    }}
    Write-Host "Extracting PHP $version to $phpDir..."
    Expand-Archive -Path $zipPath -DestinationPath $phpDir -Force
}}

$repairScript = "$Root\scripts\repair-stack.ps1"
if (Test-Path $repairScript) {{
    Write-Host "Running repair stack..."
    powershell -NoProfile -ExecutionPolicy Bypass -File $repairScript
}}
"#,
                version
            )
        ])
        .status()?;
    if !status.success() {
        return Err(anyhow!("Failed to install PHP version {version}"));
    }
    Ok(format!("PHP {} installed successfully", version))
}

pub fn get_active_php_version() -> Result<String> {
    let active_file = config::stack_root().join("php/active.txt");
    if active_file.exists() {
        if let Ok(content) = fs::read_to_string(&active_file) {
            return Ok(content.trim().to_string());
        }
    }
    Ok("8.3".to_string())
}
