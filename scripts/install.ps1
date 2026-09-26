# ============================================================
# Antigravity Bot — One-Line Bootstrap Installer (Windows)
# ============================================================
# Usage (PowerShell): iwr -useb https://raw.githubusercontent.com/emreturkmencom/antigravity-telegram-suite/main/scripts/install.ps1 | iex
# Usage (CMD):        powershell -ExecutionPolicy Bypass -c "iwr -useb https://raw.githubusercontent.com/emreturkmencom/antigravity-telegram-suite/main/scripts/install.ps1 | iex"
# ============================================================

$ErrorActionPreference = "Stop"
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch {}

$RepoUrl = "https://github.com/emreturkmencom/antigravity-telegram-suite"
$ProjectName = "antigravity-telegram-suite"

# ---- Determine install location ----
$InstallDir = $null
if ($args.Count -gt 0) {
    $InstallDir = $args[0]
} elseif ($env:AG_INSTALL_DIR) {
    $InstallDir = $env:AG_INSTALL_DIR
}

if (-not $InstallDir) {
    # Default: ~/antigravity-telegram-suite, or if already inside a clone, stay there
    if (Test-Path (Join-Path (Get-Location) "package.json")) -and (Test-Path (Join-Path (Get-Location) ".git")) {
        $InstallDir = Get-Location
        Write-Host "[!] Already inside a $ProjectName clone — reinstalling in place." -ForegroundColor Yellow
    } else {
        $InstallDir = Join-Path $HOME $ProjectName
    }
}

function Write-Step { param($msg) Write-Host "[+] $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "[!] $msg" -ForegroundColor Yellow }
function Write-Error { param($msg) Write-Host "[X] $msg" -ForegroundColor Red }

Write-Host ""
Write-Host "=======================================" -ForegroundColor Blue
Write-Host "  * Antigravity Bot — One-Line Install *" -ForegroundColor Blue
Write-Host "=======================================" -ForegroundColor Blue
Write-Host ""

# ---- Check Node.js ----
function Check-Node {
    try {
        $version = (node -v) -replace 'v', ''
        $major = [int]($version.Split('.')[0])
        if ($major -ge 18) {
            Write-Step "Node.js v$version found"
            return $true
        }
        Write-Warn "Node.js v$version is too old (need >= 18)"
    } catch {
        Write-Warn "Node.js not found"
    }

    Write-Host ""
    Write-Host "Node.js >= 18 is required." -ForegroundColor Yellow
    Write-Host "Download from: https://nodejs.org/en/download/" -ForegroundColor Cyan
    Write-Host ""
    $choice = Read-Host "Press Enter after installing Node.js, or type 'skip' to exit"
    if ($choice -eq 'skip') {
        Write-Error "Please install Node.js >= 18 and re-run this script."
        exit 1
    }
    return (Check-Node)
}

# ---- Clone or update repo ----
function Clone-Or-Update {
    if ((Test-Path $InstallDir) -and (Test-Path (Join-Path $InstallDir "package.json"))) {
        Write-Step "Existing installation found at $InstallDir"
        Write-Host ""
        $upgrade = Read-Host "Upgrade to latest version? [y/N]"
        if ($upgrade -match '^[Yy]$') {
            Set-Location $InstallDir
            Write-Step "Pulling latest changes..."
            try {
                git pull --ff-only origin main
            } catch {
                Write-Warn "Fast-forward pull failed — pulling with merge..."
                git pull origin main
            }
        } else {
            Write-Step "Keeping current version."
            Set-Location $InstallDir
        }
    } else {
        Write-Step "Cloning $ProjectName..."
        if (-not (Test-Path $InstallDir)) {
            New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
        }
        git clone $RepoUrl $InstallDir
        Set-Location $InstallDir
    }
}

# ---- Install npm dependencies ----
function Install-Deps {
    if (-not (Test-Path "node_modules")) {
        Write-Host "Installing npm dependencies..."
        npm install
    } else {
        Write-Step "npm dependencies already installed"
    }
}

# ---- Configure .env ----
function Setup-Env {
    $envFile = ".env"
    if (Test-Path $envFile) {
        Write-Step ".env file already exists"
        return
    }

    Copy-Item ".env.example" $envFile

    Write-Host ""
    Write-Host "Configure your bot:" -ForegroundColor White

    $botToken = Read-Host "  Telegram Bot Token (from @BotFather)"
    if ($botToken) {
        (Get-Content $envFile) -replace 'your_bot_token_here', $botToken | Set-Content $envFile
    }

    $chatId = Read-Host "  Your Telegram Chat ID (optional, press Enter to skip)"
    if ($chatId) {
        (Get-Content $envFile) -replace '^ALLOWED_CHAT_ID=$', "ALLOWED_CHAT_ID=$chatId" | Set-Content $envFile
    }

    $lang = Read-Host "  Language [en/tr] (default: en)"
    if ($lang) {
        (Get-Content $envFile) -replace '^LANGUAGE=en$', "LANGUAGE=$lang" | Set-Content $envFile
    }

    Write-Step ".env configured"
}

# ---- Create Start Menu shortcuts ----
function Create-Shortcut {
    $shortcutDir = [System.IO.Path]::Combine($env:APPDATA, "Microsoft", "Windows", "Start Menu", "Programs")
    $startShortcutPath = Join-Path $shortcutDir "Start Antigravity Bot.lnk"
    $stopShortcutPath = Join-Path $shortcutDir "Stop Antigravity Bot.lnk"

    try {
        $shell = New-Object -ComObject WScript.Shell

        # Start Shortcut (Invisible in background)
        $startShortcut = $shell.CreateShortcut($startShortcutPath)
        $startShortcut.TargetPath = "powershell.exe"
        $startShortcut.Arguments = "-NoProfile -WindowStyle Hidden -Command `"Start-Process node -ArgumentList 'src/watchdog.js' -WindowStyle Hidden -WorkingDirectory '$InstallDir'`""
        $startShortcut.WorkingDirectory = $InstallDir
        $startShortcut.Description = "Start Antigravity Bot in Background"
        $startShortcut.Save()

        # Stop Shortcut
        $stopShortcut = $shell.CreateShortcut($stopShortcutPath)
        $stopShortcut.TargetPath = Join-Path $InstallDir "stop_bot.bat"
        $stopShortcut.WorkingDirectory = $InstallDir
        $stopShortcut.Description = "Stop Background Antigravity Bot"
        $stopShortcut.Save()

        Write-Step "Start Menu shortcuts created (Start & Stop)"
    } catch {
        Write-Warn "Could not create shortcuts: $_"
    }
}

# ---- Optional: Install as Windows Service via pm2-windows-service ----
function Setup-PM2 {
    Write-Host ""
    $pm2Choice = Read-Host "Install PM2 for 24/7 operation? [y/N]"
    if ($pm2Choice -match '^[Yy]$') {
        try {
            npm install -g pm2
            Set-Location $InstallDir
            pm2 start src/index.js --name antigravity-bot
            pm2 save
            Write-Step "PM2 configured"
            Write-Warn "For auto-start on boot, see: https://github.com/jessety/pm2-installer"
        } catch {
            Write-Warn "PM2 setup failed: $_"
        }
    } else {
        Write-Step "Skipped PM2 setup. Run manually: npm start"
    }
}

# ---- Main ----
Check-Node
Clone-Or-Update
Install-Deps
Setup-Env
Create-Shortcut
Setup-PM2

Write-Host ""
Write-Host "=======================================" -ForegroundColor Green
Write-Host "  Setup Complete!" -ForegroundColor Green
Write-Host "=======================================" -ForegroundColor Green
Write-Host ""
Write-Host "Project location: $InstallDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "Quick start:"
Write-Host "  cd $InstallDir && npm start" -ForegroundColor Cyan
Write-Host ""
Write-Host "Make sure Antigravity IDE is launched with:" -ForegroundColor Yellow
Write-Host "  antigravity.exe --remote-debugging-port=9333" -ForegroundColor Yellow
Write-Host ""
