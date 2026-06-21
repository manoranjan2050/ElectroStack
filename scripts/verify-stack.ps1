param([string]$Root = "C:\ElectroStack")

$ErrorActionPreference = "Stop"
$required = @("dashboard","nginx","php","mariadb","redis","nodejs","composer","git","ftp","docker","phpmyadmin","sites","logs","backup","ssl","temp","config","packages","scripts","updates","data")
$missing = @()

foreach ($folder in $required) {
    $path = Join-Path $Root $folder
    if (-not (Test-Path $path)) {
        $missing += $path
    }
}

[pscustomobject]@{
    Root = $Root
    Missing = $missing
    Valid = $missing.Count -eq 0
    CheckedAt = (Get-Date).ToString("o")
} | ConvertTo-Json -Depth 3
