# ElectroStack API

ElectroStack exposes local capabilities through Tauri commands. A REST bridge can map these commands for automation when enabled by an administrator.

## Services

- `get_services`
- `control_service({ key, action })`
- `get_overview`

## Websites

- `get_websites`
- `create_website({ request })`
- `delete_website({ domain })`
- `clone_website({ source, target })`

## Databases

- `get_databases`
- `create_database({ name })`
- `delete_database({ name })`
- `backup_database({ name })`
- `restore_database({ name, sqlPath })`

## Backups

- `get_backups`
- `create_backup({ kind, name })`

## Security

REST bridge requests must include an authenticated desktop session token and CSRF token. Public network binding is disabled by default.
