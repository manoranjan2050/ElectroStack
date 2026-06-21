use anyhow::Result;
use std::fs;
use std::path::PathBuf;

pub const STACK_ROOT: &str = r"C:\ElectroStack";

pub fn stack_root() -> PathBuf {
    std::env::var("ELECTROSTACK_ROOT")
        .map(PathBuf::from)
        .unwrap_or_else(|_| PathBuf::from(STACK_ROOT))
}

pub fn ensure_app_layout() -> Result<()> {
    let root = stack_root();
    for folder in [
        "dashboard",
        "nginx",
        "php",
        "mariadb",
        "redis",
        "nodejs",
        "composer",
        "git",
        "ftp",
        "docker",
        "phpmyadmin",
        "sites",
        "logs",
        "backup",
        "ssl",
        "temp",
        "config",
        "packages",
        "scripts",
        "updates",
        "data",
    ] {
        fs::create_dir_all(root.join(folder))?;
    }
    Ok(())
}

pub fn config_file(name: &str) -> PathBuf {
    stack_root().join("config").join(name)
}
