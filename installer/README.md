# Installer

ElectroStack uses Tauri's NSIS target to produce `ElectroStackSetup.exe`.

## Build

```powershell
npm install
npm run tauri:build
```

The installer is generated in:

```text
apps\desktop\src-tauri\target\release\bundle\nsis
```

## Runtime Provisioning

The desktop app installer installs the control panel. The local server stack is provisioned by `scripts/install-stack.ps1`, which can be launched from the dashboard or run manually as Administrator.

For public releases, pin every package checksum in `scripts/packages.json` before uploading the installer.
