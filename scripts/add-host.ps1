param(
    [Parameter(Mandatory=$true)][string]$Domain,
    [string]$Address = "127.0.0.1"
)

$ErrorActionPreference = "Stop"
if ($Domain -notmatch '^[a-z0-9][a-z0-9-]{1,62}\.local$') {
    throw "Domain must look like example.local"
}

$hosts = "$env:SystemRoot\System32\drivers\etc\hosts"
$line = "$Address`t$Domain"
$content = Get-Content $hosts -Raw
if ($content -notmatch [regex]::Escape($Domain)) {
    Add-Content -Path $hosts -Value $line
}
