use crate::config;
use crate::models::{ServiceInfo, ServiceStatus};
use anyhow::{anyhow, Result};
use std::path::{Path, PathBuf};
use tokio::process::Command;

pub fn service_catalog() -> Vec<ServiceInfo> {
    let root = config::stack_root();
    vec![
        service(
            "nginx",
            "Nginx",
            80,
            find_executable(&root, &["nginx/nginx.exe"], "nginx.exe"),
        ),
        service(
            "php-fpm",
            "PHP-FPM",
            9000,
            find_executable(
                &root,
                &["php/current/php-cgi.exe", "php/8.4/php-cgi.exe", "php/8.3/php-cgi.exe"],
                "php-cgi.exe",
            ),
        ),
        service(
            "mariadb",
            "MariaDB",
            3306,
            find_executable(&root, &["mariadb/bin/mariadbd.exe"], "mariadbd.exe"),
        ),
        service(
            "redis",
            "Redis",
            6379,
            find_executable(&root, &["redis/redis-server.exe"], "redis-server.exe"),
        ),
        service(
            "ftp",
            "FTP Server",
            21,
            find_executable(
                &root,
                &[
                    "ftp/FileZilla Server.exe",
                    "ftp/filezilla-server.exe",
                    "ftp/server.js",
                ],
                "server.js",
            ),
        ),
        service(
            "mailpit",
            "Mail Catcher",
            1025,
            find_executable(&root, &["mailpit/mailpit.exe"], "mailpit.exe"),
        ),
    ]
}

fn service(key: &str, name: &str, port: u16, executable: PathBuf) -> ServiceInfo {
    ServiceInfo {
        key: key.to_string(),
        name: name.to_string(),
        status: if executable.exists() {
            ServiceStatus::Stopped
        } else {
            ServiceStatus::Missing
        },
        port: Some(port),
        version: None,
        executable: executable.to_string_lossy().to_string(),
    }
}

fn find_executable(root: &Path, preferred: &[&str], file_name: &str) -> PathBuf {
    for relative in preferred {
        let candidate = root.join(relative);
        if candidate.exists() {
            return candidate;
        }
    }

    for folder in ["nginx", "php", "mariadb", "redis", "ftp"] {
        let base = root.join(folder);
        if let Some(found) = find_file(&base, file_name, 5) {
            return found;
        }
    }

    if let Ok(found) = which::which(file_name) {
        return found;
    }

    root.join(preferred.first().copied().unwrap_or(file_name))
}

fn find_file(base: &Path, file_name: &str, max_depth: usize) -> Option<PathBuf> {
    if max_depth == 0 || !base.exists() {
        return None;
    }
    let entries = std::fs::read_dir(base).ok()?;
    for entry in entries.flatten() {
        let path = entry.path();
        if path
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.eq_ignore_ascii_case(file_name))
        {
            return Some(path);
        }
        if path.is_dir() {
            if let Some(found) = find_file(&path, file_name, max_depth - 1) {
                return Some(found);
            }
        }
    }
    None
}

pub async fn refresh_services() -> Vec<ServiceInfo> {
    let mut services = service_catalog();
    for service in &mut services {
        if matches!(service.status, ServiceStatus::Missing) {
            continue;
        }
        service.status = if port_is_listening(service.port.unwrap_or_default()).await {
            ServiceStatus::Running
        } else {
            ServiceStatus::Stopped
        };
    }
    services
}

async fn port_is_listening(port: u16) -> bool {
    if port == 0 {
        return false;
    }
    tokio::task::spawn_blocking(move || {
        std::net::TcpStream::connect_timeout(
            &std::net::SocketAddr::new(
                std::net::IpAddr::V4(std::net::Ipv4Addr::new(127, 0, 0, 1)),
                port,
            ),
            std::time::Duration::from_millis(100),
        )
        .is_ok()
    })
    .await
    .unwrap_or(false)
}

pub async fn control_service(key: &str, action: &str) -> Result<String> {
    let root = config::stack_root();
    let scripts = root.join("scripts");
    let script = match action {
        "start" => scripts.join(format!("start-{}.ps1", key)),
        "stop" => scripts.join(format!("stop-{}.ps1", key)),
        "restart" => scripts.join(format!("restart-{}.ps1", key)),
        _ => return Err(anyhow!("unsupported service action: {action}")),
    };
    if !script.exists() {
        return Err(anyhow!("service script not found: {}", script.display()));
    }
    let output = Command::new("powershell")
        .args([
            "-NoProfile",
            "-ExecutionPolicy",
            "Bypass",
            "-WindowStyle",
            "Hidden",
            "-File",
        ])
        .arg(script)
        .output()
        .await?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        Err(anyhow!(String::from_utf8_lossy(&output.stderr).to_string()))
    }
}

pub async fn control_all_services(action: &str) -> Result<String> {
    let order = match action {
        "start" => vec!["mariadb", "redis", "php-fpm", "nginx", "mailpit", "ftp"],
        "stop" => vec!["ftp", "mailpit", "nginx", "php-fpm", "redis", "mariadb"],
        "restart" => vec!["ftp", "mailpit", "nginx", "php-fpm", "redis", "mariadb"],
        _ => return Err(anyhow!("unsupported service action: {action}")),
    };

    let mut results = Vec::new();
    for key in order {
        let result = if action == "restart" {
            control_service(key, "restart").await
        } else {
            control_service(key, action).await
        };
        match result {
            Ok(message) if message.is_empty() => results.push(format!("{key}: ok")),
            Ok(message) => results.push(format!("{key}: {message}")),
            Err(error) => results.push(format!("{key}: {error}")),
        }
    }

    Ok(results.join("\n"))
}
