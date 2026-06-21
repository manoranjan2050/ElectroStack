use crate::config;
use crate::models::SystemOverview;
use crate::services;
use sysinfo::{Disks, System};

pub async fn overview() -> SystemOverview {
    let mut system = System::new_all();
    system.refresh_all();
    let services = services::refresh_services().await;
    let running_services = services
        .iter()
        .filter(|service| matches!(service.status, crate::models::ServiceStatus::Running))
        .count();
    let total_memory = system.total_memory();
    let used_memory = system.used_memory();
    let ram_usage = if total_memory == 0 {
        0.0
    } else {
        (used_memory as f32 / total_memory as f32) * 100.0
    };
    let disk_usage = disk_usage_percent();

    SystemOverview {
        cpu_usage: system.global_cpu_info().cpu_usage(),
        ram_usage,
        disk_usage,
        total_memory,
        used_memory,
        hostname: System::host_name().unwrap_or_else(|| "Windows".to_string()),
        os: System::long_os_version().unwrap_or_else(|| "Windows".to_string()),
        stack_root: config::stack_root().to_string_lossy().to_string(),
        running_services,
        services,
    }
}

fn disk_usage_percent() -> f32 {
    let root = config::stack_root();
    let disks = Disks::new_with_refreshed_list();
    for disk in &disks {
        if root.starts_with(disk.mount_point()) {
            let total = disk.total_space();
            if total == 0 {
                return 0.0;
            }
            return ((total - disk.available_space()) as f32 / total as f32) * 100.0;
        }
    }
    0.0
}
