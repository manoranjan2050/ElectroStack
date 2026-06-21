# Architecture

ElectroStack has three layers:

1. Tauri desktop shell for Windows integration, tray, autostart, updater, secure storage, and process control.
2. React dashboard for administration workflows.
3. PowerShell provisioning scripts for downloading, verifying, extracting, and configuring runtime packages under `C:\ElectroStack`.

The Rust command layer is the only component allowed to mutate local services and configuration. The frontend only invokes typed commands and displays results.

## Runtime Layout

All runtime state lives under `C:\ElectroStack`. This makes backup, reset, and future Linux portability straightforward.

## Service Strategy

Services are started through explicit scripts in `C:\ElectroStack\scripts`. The scripts can later be swapped for Windows Service wrappers without changing the dashboard command surface.
