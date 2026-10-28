param([Parameter(Mandatory=$true)][string]$ScriptPath)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
if ($ScriptPath -notmatch '^(collectors|dist)[\\/]') { throw 'Choose a JavaScript file under collectors/ or dist/.' }
$full = [System.IO.Path]::GetFullPath((Join-Path $root $ScriptPath))
$prefix = $root.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
if (-not $full.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase) -or [System.IO.Path]::GetExtension($full) -ne '.js') { throw 'Script must be a JavaScript file inside this repository.' }
Set-Clipboard -Value (Get-Content -LiteralPath $full -Raw -Encoding UTF8)
Write-Host 'Copied the local script. Nothing was executed in Discord.'
Write-Host 'Inspect it before pasting into your own Vencord console.'
