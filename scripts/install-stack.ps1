param(
    [string]$Root = "C:\ElectroStack",
    [switch]$SkipDownloads
)

$ErrorActionPreference = "Stop"
$Folders = @(
    "dashboard","nginx","php","mariadb","redis","nodejs","composer","git","ftp","docker",
    "phpmyadmin","sites","logs","backup","ssl","temp","config","packages","scripts","updates","data"
)

function Assert-Admin {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Run this installer from an elevated PowerShell session."
    }
}

function New-StackLayout {
    foreach ($folder in $Folders) {
        New-Item -ItemType Directory -Force -Path (Join-Path $Root $folder) | Out-Null
    }
    New-Item -ItemType Directory -Force -Path (Join-Path $Root "nginx\conf\sites-enabled") | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $Root "data\redis") | Out-Null
    New-Item -ItemType Directory -Force -Path (Join-Path $Root "backup\databases") | Out-Null
}

function Get-PackageManifest {
    $manifestPath = Join-Path $PSScriptRoot "packages.json"
    if (-not (Test-Path $manifestPath)) {
        throw "Missing package manifest: $manifestPath"
    }
    Get-Content $manifestPath -Raw | ConvertFrom-Json
}

function Get-CachedPackage {
    param([string]$Name, [pscustomobject]$Package)
    $extension = if ($Package.url.EndsWith(".phar")) { ".phar" } else { ".zip" }
    Join-Path $Root "packages\$Name-$($Package.version)$extension"
}

function Save-Package {
    param([string]$Name, [pscustomobject]$Package)
    $target = Get-CachedPackage $Name $Package
    if ((Test-Path $target) -and (Test-Checksum $target $Package.sha256)) {
        Write-Host "Using cached $Name"
        return $target
    }
    if ($SkipDownloads) {
        Write-Warning "Skipping download for $Name"
        return $target
    }
    Write-Host "Downloading $Name $($Package.version)"
    Invoke-WebRequest -Uri $Package.url -OutFile $target
    if (-not (Test-Checksum $target $Package.sha256)) {
        throw "Checksum failed for $Name"
    }
    $target
}

function Test-Checksum {
    param([string]$Path, [string]$Expected)
    if ([string]::IsNullOrWhiteSpace($Expected)) {
        Write-Warning "No checksum pinned for $Path. Pin sha256 before public releases."
        return $true
    }
    $actual = (Get-FileHash -Algorithm SHA256 -Path $Path).Hash.ToLowerInvariant()
    $actual -eq $Expected.ToLowerInvariant()
}

function Expand-Package {
    param([string]$Archive, [pscustomobject]$Package)
    if (-not (Test-Path $Archive)) { return }
    $destination = Join-Path $Root $Package.destination
    New-Item -ItemType Directory -Force -Path $destination | Out-Null
    if ($Archive.EndsWith(".zip")) {
        Expand-Archive -Path $Archive -DestinationPath $destination -Force
    } elseif ($Archive.EndsWith(".phar")) {
        Copy-Item -LiteralPath $Archive -Destination (Join-Path $destination "composer.phar") -Force
    }
}

function Write-DefaultConfigs {
    @"
worker_processes auto;
events { worker_connections 1024; }
http {
    include mime.types;
    include sites-enabled/*.conf;
    access_log C:/ElectroStack/logs/nginx-access.log;
    error_log C:/ElectroStack/logs/nginx-error.log;
}
"@ | Set-Content -Encoding UTF8 (Join-Path $Root "nginx\conf\nginx.conf")

    @"
server {
    listen 80;
    server_name localhost;
    root C:/ElectroStack/sites;
    index index.php index.html;

    location / {
        try_files `$uri `$uri/ /index.php?``query_string;
    }

    location /phpmyadmin {
        alias C:/ElectroStack/phpmyadmin;
        index index.php index.html index.htm;
        
        location ~ \.php$ {
            fastcgi_pass 127.0.0.1:9000;
            fastcgi_index index.php;
            include fastcgi_params;
            fastcgi_param SCRIPT_FILENAME `$request_filename;
        }
    }

    location /trading {
        alias C:/ElectroStack/sites/trading.local;
        index index.php index.html index.htm;
        
        location ~ \.php$ {
            fastcgi_pass 127.0.0.1:9000;
            fastcgi_index index.php;
            include fastcgi_params;
            fastcgi_param SCRIPT_FILENAME `$request_filename;
        }
    }

    location ~ \.php$ {
        include fastcgi_params;
        fastcgi_pass 127.0.0.1:9000;
        fastcgi_param SCRIPT_FILENAME `$document_root``fastcgi_script_name;
    }
}
"@ | Set-Content -Encoding UTF8 (Join-Path $Root "nginx\conf\sites-enabled\localhost.conf")

    @"
bind 127.0.0.1
port 6379
dir C:/ElectroStack/data/redis
logfile C:/ElectroStack/logs/redis.log
"@ | Set-Content -Encoding UTF8 (Join-Path $Root "redis\redis.windows.conf")

    @"
<?php
`$cfg['blowfish_secret'] = 'change-this-electrostack-secret-32-chars-long-12345';
`$i = 1;
`$cfg['Servers'][`$i]['auth_type'] = 'config';
`$cfg['Servers'][`$i]['host'] = '127.0.0.1';
`$cfg['Servers'][`$i]['user'] = 'root';
`$cfg['Servers'][`$i]['password'] = '';
`$cfg['Servers'][`$i]['AllowNoPassword'] = true;
"@ | Set-Content -Encoding UTF8 (Join-Path $Root "phpmyadmin\config.inc.php")
}

function Write-ServiceScripts {
    $scriptRoot = Join-Path $Root "scripts"
    @{
        "start-nginx.ps1" = "Start-Process C:\ElectroStack\nginx\nginx.exe -WorkingDirectory C:\ElectroStack\nginx"
        "stop-nginx.ps1" = "C:\ElectroStack\nginx\nginx.exe -s stop"
        "restart-nginx.ps1" = "C:\ElectroStack\nginx\nginx.exe -s reload"
        "start-redis.ps1" = "Start-Process C:\ElectroStack\redis\redis-server.exe C:\ElectroStack\redis\redis.windows.conf"
        "stop-redis.ps1" = "C:\ElectroStack\redis\redis-cli.exe shutdown"
        "restart-redis.ps1" = "& C:\ElectroStack\scripts\stop-redis.ps1; & C:\ElectroStack\scripts\start-redis.ps1"
    }.GetEnumerator() | ForEach-Object {
        Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot $_.Key) -Value $_.Value
    }
}

Assert-Admin
New-StackLayout

$manifest = Get-PackageManifest
$manifest.PSObject.Properties | ForEach-Object {
    $archive = Save-Package -Name $_.Name -Package $_.Value
    Expand-Package -Archive $archive -Package $_.Value
}

Write-DefaultConfigs
Write-ServiceScripts
Write-Host "ElectroStack installed at $Root"
