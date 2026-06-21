param([string]$Root = "C:\ElectroStack")

$ErrorActionPreference = "Stop"

function Find-FirstFile {
    param([string]$Base, [string]$Name)
    if (-not (Test-Path $Base)) { return $null }
    Get-ChildItem -LiteralPath $Base -Recurse -Filter $Name -File -ErrorAction SilentlyContinue |
        Select-Object -First 1 -ExpandProperty FullName
}

function Copy-DirectoryContents {
    param([string]$Source, [string]$Destination)
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Get-ChildItem -LiteralPath $Source -Force | ForEach-Object {
        Copy-Item -LiteralPath $_.FullName -Destination $Destination -Recurse -Force
    }
}

function Flatten-Package {
    param([string]$Destination, [string]$ExeName)
    $direct = Join-Path $Destination $ExeName
    if (Test-Path $direct) { return $direct }
    $nested = Find-FirstFile -Base $Destination -Name $ExeName
    if ($nested) {
        Copy-DirectoryContents -Source (Split-Path $nested -Parent) -Destination $Destination
    }
    if (Test-Path $direct) { return $direct }
    return $nested
}

function Download-File {
    param([string]$Url, [string]$Target)
    if (Test-Path $Target) { return }
    Write-Host "Downloading $Url"
    Invoke-WebRequest -Uri $Url -OutFile $Target -UseBasicParsing
}

function Expand-Zip {
    param([string]$Archive, [string]$Destination)
    if (-not (Test-Path $Archive)) { return }
    New-Item -ItemType Directory -Force -Path $Destination | Out-Null
    Expand-Archive -Path $Archive -DestinationPath $Destination -Force
}

function Ensure-MariaDbPortable {
    $exe = Join-Path $Root "mariadb\bin\mariadbd.exe"
    if (Test-Path $exe) { return }
    $archive = Join-Path $Root "packages\mariadb-11.4.8.zip"
    Download-File -Url "https://archive.mariadb.org/mariadb-11.4.8/winx64-packages/mariadb-11.4.8-winx64.zip" -Target $archive
    Expand-Zip -Archive $archive -Destination (Join-Path $Root "mariadb")
    $found = Find-FirstFile -Base (Join-Path $Root "mariadb") -Name "mariadbd.exe"
    if ($found) {
        Copy-DirectoryContents -Source (Split-Path (Split-Path $found -Parent) -Parent) -Destination (Join-Path $Root "mariadb")
    }
}

function Ensure-PhpFromWinget {
    param([string]$Version)
    $target = Join-Path $Root "php\$Version"
    if (Test-Path (Join-Path $target "php-cgi.exe")) { return }
    $packageId = "PHP.PHP.NTS.$Version"
    Write-Host "Installing $packageId with winget as PHP fallback..."
    winget install --id $packageId --exact --silent --accept-source-agreements --accept-package-agreements | Out-Host
    $phpCgi = Find-FirstFile -Base "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Name "php-cgi.exe"
    if (-not $phpCgi) { $phpCgi = Find-FirstFile -Base "C:\Program Files" -Name "php-cgi.exe" }
    if (-not $phpCgi) { $phpCgi = Find-FirstFile -Base "C:\tools" -Name "php-cgi.exe" }
    if ($phpCgi) {
        Copy-DirectoryContents -Source (Split-Path $phpCgi -Parent) -Destination $target
    }
}

function Ensure-RedisFromWinget {
    $target = Join-Path $Root "redis"
    if (Test-Path (Join-Path $target "redis-server.exe")) { return }
    Write-Host "Installing Redis.Redis with winget as Redis fallback..."
    winget install --id Redis.Redis --exact --silent --accept-source-agreements --accept-package-agreements | Out-Host
    $redis = Find-FirstFile -Base "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Name "redis-server.exe"
    if (-not $redis) { $redis = Find-FirstFile -Base "C:\Program Files" -Name "redis-server.exe" }
    if ($redis) {
        Copy-DirectoryContents -Source (Split-Path $redis -Parent) -Destination $target
    }
}

function Ensure-FtpFallback {
    $ftpRoot = Join-Path $Root "ftp"
    New-Item -ItemType Directory -Force -Path $ftpRoot | Out-Null
    $server = Join-Path $ftpRoot "server.js"
    $package = Join-Path $ftpRoot "package.json"
    if (-not (Test-Path $package)) {
        @"
{
  "name": "electrostack-ftp-runtime",
  "version": "0.1.0",
  "private": true,
  "type": "commonjs",
  "dependencies": {
    "ftp-srv": "^4.6.3"
  }
}
"@ | Set-Content -Encoding UTF8 $package
    }
    if (-not (Test-Path $server)) {
        @"
const { FtpSrv } = require('ftp-srv');
const fs = require('fs');
const path = require('path');

const root = process.env.ELECTROSTACK_FTP_ROOT || 'C:/ElectroStack/sites';
fs.mkdirSync(root, { recursive: true });

const server = new FtpSrv({
  url: 'ftp://0.0.0.0:21',
  anonymous: false,
  pasv_url: '127.0.0.1',
  pasv_min: 50000,
  pasv_max: 50100
});

server.on('login', ({ username, password }, resolve, reject) => {
  if (username === 'admin' && password === 'electrostack') {
    return resolve({ root: path.resolve(root) });
  }
  return reject(new Error('Invalid FTP credentials'));
});

server.listen().then(() => {
  console.log('ElectroStack FTP server listening on ftp://127.0.0.1:21');
});
"@ | Set-Content -Encoding UTF8 $server
    }
    if (-not (Test-Path (Join-Path $ftpRoot "node_modules\ftp-srv"))) {
        Push-Location $ftpRoot
        try {
            npm.cmd install --omit=dev
        } finally {
            Pop-Location
        }
    }
}

function Ensure-PhpCurrent {
    $current = Join-Path $Root "php\current"
    if ((Test-Path (Join-Path $current "php-cgi.exe")) -and (Test-Path (Join-Path $current "ext"))) { return }
    Get-Process php-cgi -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Milliseconds 400
    if (Test-Path $current) {
        try {
            Remove-Item -LiteralPath $current -Recurse -Force
        } catch {
            Write-Warning "Could not refresh php\current because files are locked. Existing PHP runtime will be kept."
            return
        }
    }
    foreach ($version in @("8.4","8.3","8.2","8.1")) {
        $candidate = Join-Path $Root "php\$version"
        if (Test-Path (Join-Path $candidate "php-cgi.exe")) {
            Copy-DirectoryContents -Source $candidate -Destination $current
            return
        }
    }
}

function Ensure-PhpIni {
    $iniContent = @"
[PHP]
engine = On
short_open_tag = Off
precision = 14
output_buffering = 4096
zlib.output_compression = Off
implicit_flush = Off
unserialize_callback_func =
serialize_precision = -1
disable_functions =
disable_classes =
zend.enable_gc = On
zend.exception_ignore_args = Off
zend.exception_string_param_max_len = 15

max_execution_time = 120
max_input_time = 60
memory_limit = 512M

error_reporting = E_ALL
display_errors = On
display_startup_errors = On
log_errors = On
ignore_repeated_errors = Off
ignore_repeated_source = Off
report_memleaks = On
html_errors = On
error_log = "C:/ElectroStack/logs/php-error.log"

post_max_size = 128M
upload_max_filesize = 128M
max_file_uploads = 20

extension_dir = "ext"
enable_dl = Off

extension=curl
extension=fileinfo
extension=gd
extension=gettext
extension=intl
extension=mbstring
extension=exif
extension=mysqli
extension=openssl
extension=pdo_mysql
extension=pdo_sqlite
extension=sqlite3
extension=sockets
extension=tidy
extension=xsl
extension=zip

[CLI Server]
cli_server.color = On

[Date]
date.timezone = UTC

[Session]
session.save_handler = files
session.save_path = "C:/ElectroStack/temp"
session.use_strict_mode = 0
session.use_cookies = 1
session.use_only_cookies = 1
session.name = PHPSESSID
session.auto_start = 0
session.cookie_lifetime = 0
session.cookie_path = /
session.cookie_domain =
session.cookie_secure =
session.cookie_httponly =
session.cookie_samesite =
session.serialize_handler = php
session.gc_probability = 1
session.gc_divisor = 1000
session.gc_maxlifetime = 1440
session.referer_check =
session.cache_limiter = nocache
session.cache_expire = 180
session.use_trans_sid = 0
session.sid_length = 26
session.sid_bits_per_character = 5
"@

    $current = Join-Path $Root "php\current"
    if (Test-Path (Join-Path $current "php-cgi.exe")) {
        $currentIni = Join-Path $current "php.ini"
        if (-not (Test-Path $currentIni)) {
            $iniContent | Set-Content -Encoding UTF8 -Path $currentIni -Force
        }
    }

    Get-ChildItem -Path (Join-Path $Root "php") -Directory | ForEach-Object {
        if ($_.Name -ne "current") {
            $versionIni = Join-Path $_.FullName "php.ini"
            if (-not (Test-Path $versionIni)) {
                $iniContent | Set-Content -Encoding UTF8 -Path $versionIni -Force
            }
        }
    }
}

function Ensure-Mailpit {
    $mailpitDir = Join-Path $Root "mailpit"
    $exe = Join-Path $mailpitDir "mailpit.exe"
    if (Test-Path $exe) { return }
    New-Item -ItemType Directory -Force -Path $mailpitDir | Out-Null
    $archive = Join-Path $Root "packages\mailpit.zip"
    Write-Host "Downloading Mailpit..."
    try {
        Download-File -Url "https://github.com/axllent/mailpit/releases/latest/download/mailpit-windows-amd64.zip" -Target $archive
        Expand-Zip -Archive $archive -Destination $mailpitDir
        Flatten-Package -Destination $mailpitDir -ExeName "mailpit.exe" | Out-Null
    } catch {
        Write-Warning "Failed to download Mailpit: $_"
    }
}

function Write-ServiceScripts {
    $scriptRoot = Join-Path $Root "scripts"
    New-Item -ItemType Directory -Force -Path $scriptRoot | Out-Null

    $nginx = Find-FirstFile -Base (Join-Path $Root "nginx") -Name "nginx.exe"
    $php = Find-FirstFile -Base (Join-Path $Root "php\current") -Name "php-cgi.exe"
    $mariadb = Find-FirstFile -Base (Join-Path $Root "mariadb") -Name "mariadbd.exe"
    $redis = Find-FirstFile -Base (Join-Path $Root "redis") -Name "redis-server.exe"
    $redisCli = Find-FirstFile -Base (Join-Path $Root "redis") -Name "redis-cli.exe"
    $ftpServer = Join-Path $Root "ftp\server.js"

    if ($nginx) {
        Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot "start-nginx.ps1") -Value "Start-Process -FilePath `"$nginx`" -ArgumentList '-p `"$Root\nginx`"' -WorkingDirectory `"$Root\nginx`" -WindowStyle Hidden"
        Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot "stop-nginx.ps1") -Value "& `"$nginx`" -p `"$Root\nginx`" -s stop"
        Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot "restart-nginx.ps1") -Value "& `"$nginx`" -p `"$Root\nginx`" -s reload"
    }
    if ($php) {
        Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot "start-php-fpm.ps1") -Value "Start-Process -FilePath `"$php`" -ArgumentList '-b 127.0.0.1:9000' -WorkingDirectory `"$Root\php\current`" -WindowStyle Hidden"
        Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot "stop-php-fpm.ps1") -Value "Get-Process php-cgi -ErrorAction SilentlyContinue | Stop-Process -Force"
        Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot "restart-php-fpm.ps1") -Value "& `"$scriptRoot\stop-php-fpm.ps1`"; Start-Sleep -Milliseconds 500; & `"$scriptRoot\start-php-fpm.ps1`""
    }
    
    # Write version specific PHP-FPM scripts (ports 9081 - 9084)
    foreach ($v in @("8.1", "8.2", "8.3", "8.4")) {
        $phpPath = Join-Path $Root "php\$v"
        $phpCgiExe = Join-Path $phpPath "php-cgi.exe"
        if (Test-Path $phpCgiExe) {
            $port = 9000 + [int]($v.Replace(".", ""))
            Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot "start-php-fpm-$v.ps1") -Value "Start-Process -FilePath `"$phpCgiExe`" -ArgumentList '-b 127.0.0.1:$port' -WorkingDirectory `"$phpPath`" -WindowStyle Hidden"
            Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot "stop-php-fpm-$v.ps1") -Value "Get-Process php-cgi -ErrorAction SilentlyContinue | Where-Object { `$_.Path -like '*php\\$v*' } | Stop-Process -Force"
            Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot "restart-php-fpm-$v.ps1") -Value "& `"$scriptRoot\stop-php-fpm-$v.ps1`"; Start-Sleep -Milliseconds 500; & `"$scriptRoot\start-php-fpm-$v.ps1`""
        }
    }

    if ($mariadb) {
        $data = Join-Path $Root "data\mariadb"
        New-Item -ItemType Directory -Force -Path $data | Out-Null
        $installer = Find-FirstFile -Base (Join-Path $Root "mariadb") -Name "mariadb-install-db.exe"
        if ($installer -and -not (Test-Path (Join-Path $data "mysql"))) {
            & $installer "--datadir=$data" | Out-Host
        }
        Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot "start-mariadb.ps1") -Value "Start-Process -FilePath `"$mariadb`" -ArgumentList '--datadir=$data --port=3306 --console' -WorkingDirectory `"$Root\mariadb`" -WindowStyle Hidden"
        Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot "stop-mariadb.ps1") -Value "Get-Process mariadbd -ErrorAction SilentlyContinue | Stop-Process -Force"
        Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot "restart-mariadb.ps1") -Value "& `"$scriptRoot\stop-mariadb.ps1`"; Start-Sleep -Milliseconds 500; & `"$scriptRoot\start-mariadb.ps1`""
    }
    if ($redis) {
        Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot "start-redis.ps1") -Value "Start-Process -FilePath `"$redis`" -ArgumentList `"$Root\redis\redis.windows.conf`" -WorkingDirectory `"$Root\redis`" -WindowStyle Hidden"
    }
    if ($redisCli) {
        Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot "stop-redis.ps1") -Value "& `"$redisCli`" shutdown"
        Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot "restart-redis.ps1") -Value "& `"$scriptRoot\stop-redis.ps1`"; Start-Sleep -Milliseconds 500; & `"$scriptRoot\start-redis.ps1`""
    }
    if (Test-Path $ftpServer) {
        Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot "start-ftp.ps1") -Value "Start-Process -FilePath `"node.exe`" -ArgumentList `"$ftpServer`" -WorkingDirectory `"$Root\ftp`" -WindowStyle Hidden"
        Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot "stop-ftp.ps1") -Value "Get-CimInstance Win32_Process -Filter `"Name = 'node.exe'`" | Where-Object { `$_.CommandLine -like '*ElectroStack*ftp*server.js*' } | ForEach-Object { Stop-Process -Id `$_.ProcessId -Force }"
        Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot "restart-ftp.ps1") -Value "& `"$scriptRoot\stop-ftp.ps1`"; Start-Sleep -Milliseconds 500; & `"$scriptRoot\start-ftp.ps1`""
    }

    # Write Mailpit service scripts
    $mailpit = Join-Path $Root "mailpit\mailpit.exe"
    if (Test-Path $mailpit) {
        Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot "start-mailpit.ps1") -Value "Start-Process -FilePath `"$mailpit`" -ArgumentList '--smtp-bind 127.0.0.1:1025 --ui-bind 127.0.0.1:8025' -WorkingDirectory `"$Root\mailpit`" -WindowStyle Hidden"
        Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot "stop-mailpit.ps1") -Value "Get-Process mailpit -ErrorAction SilentlyContinue | Stop-Process -Force"
        Set-Content -Encoding UTF8 -Path (Join-Path $scriptRoot "restart-mailpit.ps1") -Value "& `"$scriptRoot\stop-mailpit.ps1`"; Start-Sleep -Milliseconds 500; & `"$scriptRoot\start-mailpit.ps1`""
    }

    # Write trust-cert.ps1 script
    $trustCertPath = Join-Path $scriptRoot "trust-cert.ps1"
    Set-Content -Encoding UTF8 -Path $trustCertPath -Value @'
param(
    [Parameter(Mandatory=$true)][string]$Domain
)
$certPath = "C:\ElectroStack\ssl\$Domain\localhost.crt"
if (-not (Test-Path $certPath)) {
    throw "Certificate not found at $certPath"
}
Import-Certificate -FilePath $certPath -CertStoreLocation "Cert:\LocalMachine\Root"
Write-Host "Certificate for $Domain trusted successfully."
'@
}

New-Item -ItemType Directory -Force -Path (Join-Path $Root "packages") | Out-Null
Flatten-Package -Destination (Join-Path $Root "nginx") -ExeName "nginx.exe" | Out-Null
Ensure-MariaDbPortable
Ensure-PhpFromWinget -Version "8.3"
Ensure-RedisFromWinget
Ensure-FtpFallback
Ensure-PhpCurrent
Ensure-PhpIni
Ensure-Mailpit
Write-ServiceScripts

[pscustomobject]@{
    Nginx = [bool](Find-FirstFile -Base (Join-Path $Root "nginx") -Name "nginx.exe")
    Php = [bool](Find-FirstFile -Base (Join-Path $Root "php") -Name "php-cgi.exe")
    MariaDB = [bool](Find-FirstFile -Base (Join-Path $Root "mariadb") -Name "mariadbd.exe")
    Redis = [bool](Find-FirstFile -Base (Join-Path $Root "redis") -Name "redis-server.exe")
    Mailpit = [bool](Test-Path (Join-Path $Root "mailpit\mailpit.exe"))
    Ftp = Test-Path (Join-Path $Root "ftp\server.js")
    Root = $Root
} | Format-List
