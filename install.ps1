# LOOM MCP One-Line Installer (Windows PowerShell)
# Fetches the latest release tarball from GitHub, builds locally, and sets up
# PATH + MCP config.
#
# Usage:
#   irm https://raw.githubusercontent.com/Spongeacer/Loom-MCP-Server/main/install.ps1 | iex
#   $env:LOOM_VERSION = "0.1.0"; irm ... | iex

$ErrorActionPreference = "Stop"

$Repo = "Spongeacer/Loom-MCP-Server"
$InstallDir = "$env:USERPROFILE\.loom-server"
$BinDir = "$env:USERPROFILE\.local\bin"

function Write-Info($msg) { Write-Host "[LOOM] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "[LOOM] $msg" -ForegroundColor Yellow }
function Write-Err($msg) { Write-Host "[LOOM] $msg" -ForegroundColor Red }

# 0. Checks
if (-not (Get-Command curl -ErrorAction SilentlyContinue)) {
    Write-Err "curl is required but not installed."
    exit 1
}
if (-not (Get-Command tar -ErrorAction SilentlyContinue)) {
    Write-Err "tar is required but not installed."
    exit 1
}
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Err "Node.js >= 18 is required but not installed."
    exit 1
}
$nodeVersion = (node -v).TrimStart('v')
$nodeMajor = [int]($nodeVersion.Split('.')[0])
if ($nodeMajor -lt 18) {
    Write-Err "Node.js >= 18 is required. Found: $nodeVersion"
    exit 1
}
Write-Info "Node.js version: $nodeVersion"

# 1. Resolve version
if ($env:LOOM_VERSION) {
    $Version = $env:LOOM_VERSION
    Write-Info "Installing LOOM MCP v${Version}..."
} else {
    Write-Info "Resolving latest release..."
    $release = Invoke-RestMethod -Uri "https://api.github.com/repos/${Repo}/releases/latest" -UseBasicParsing
    $Version = $release.tag_name.TrimStart('v')
    Write-Info "Latest version is v${Version}"
}

$TarballUrl = "https://github.com/${Repo}/archive/refs/tags/v${Version}.tar.gz"

# 2. Download and extract
Remove-Item -Recurse -Force $InstallDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null

Write-Info "Downloading release tarball..."
$tmpTar = "$env:TEMP\loom-mcp-v${Version}.tar.gz"
curl -fsSL $TarballUrl -o $tmpTar
tar -xzf $tmpTar --strip-components=1 -C $InstallDir
Remove-Item $tmpTar

# 3. Build
Write-Info "Installing dependencies and building..."
Push-Location "$InstallDir\packages\loom"
npm install
npm run build
Pop-Location

# 4. Add to PATH via wrapper scripts
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

$loomWrapper = @"
@echo off
node "$InstallDir\packages\loom\dist\cli.js" %*
"@
$loomWrapper | Out-File -Encoding ASCII "$BinDir\loom.cmd"

$loomMcpWrapper = @"
@echo off
node "$InstallDir\packages\loom\dist\mcp.js" %*
"@
$loomMcpWrapper | Out-File -Encoding ASCII "$BinDir\loom-mcp.cmd"

Write-Info "Installed loom CLI to $BinDir\loom.cmd"
Write-Info "Installed loom-mcp to $BinDir\loom-mcp.cmd"

$pathEnv = [Environment]::GetEnvironmentVariable("Path", "User")
if (-not ($pathEnv -split ';' | Where-Object { $_ -ieq $BinDir })) {
    Write-Warn "$BinDir is not in your PATH. Adding it to User PATH..."
    [Environment]::SetEnvironmentVariable("Path", "$BinDir;$pathEnv", "User")
    Write-Warn "Please restart your terminal for PATH changes to take effect."
}

# 5. MCP auto-config
$kimiConfig = "$env:USERPROFILE\.kimi\mcp.json"
if (Test-Path "$env:USERPROFILE\.kimi") {
    $loomEntry = @{
        loom = @{
            command = "$BinDir\loom-mcp.cmd"
            args    = @()
        }
    }
    if (Test-Path $kimiConfig) {
        $cfg = Get-Content $kimiConfig | ConvertFrom-Json
        if (-not $cfg.mcpServers) { $cfg | Add-Member -NotePropertyName mcpServers -NotePropertyValue @{} -Force }
        $cfg.mcpServers = $cfg.mcpServers | Select-Object *
        $cfg.mcpServers | Add-Member -NotePropertyName loom -NotePropertyValue $loomEntry.loom -Force
        $cfg | ConvertTo-Json -Depth 10 | Set-Content $kimiConfig
    } else {
        New-Item -ItemType Directory -Force -Path (Split-Path $kimiConfig) | Out-Null
        @{ mcpServers = $loomEntry } | ConvertTo-Json -Depth 10 | Set-Content $kimiConfig
    }
    Write-Info "Registered LOOM MCP for Kimi Code: $kimiConfig"
    $registered = "kimi"
}

if (-not $registered) {
    Write-Warn "No supported MCP client detected automatically."
    Write-Warn "Please register manually with your client using:"
    Write-Warn "  command: $BinDir\loom-mcp.cmd"
}

# 6. Auto-init in current directory
$cwd = Get-Location
if (-not (Test-Path "$cwd\.loom")) {
    Write-Info "Initializing LOOM workspace in $cwd..."
    & "$BinDir\loom.cmd" init (Split-Path $cwd -Leaf) | Out-Null
} else {
    Write-Info "LOOM workspace already initialized in $cwd."
}

# 7. Summary
Write-Host ""
Write-Info "Installation complete!"
Write-Host ""
Write-Host "  Version:     v${Version}"
Write-Host "  CLI:         loom status"
Write-Host "  MCP:         loom-mcp"
Write-Host "  Install dir: $InstallDir"
if ($registered) {
    Write-Host "  MCP clients configured: $registered"
    Write-Warn "Please restart your MCP client to load the new server."
}
Write-Host ""
Write-Host "Quick start:"
Write-Host "  loom status              # View context"
Write-Host "  loom task create '...'   # Create a task"
Write-Host "  loom fs health           # Check file health"
Write-Host ""
