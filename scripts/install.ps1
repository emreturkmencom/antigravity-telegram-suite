# ============================================================
# Antigravity Bot — Setup Script (Windows PowerShell)
# ============================================================
# Run: powershell -ExecutionPolicy Bypass -File scripts\install.ps1

$ErrorActionPreference = "Stop"
$ProjectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

Write-Host ""
Write-Host "══════════════════════════════════════" -ForegroundColor Blue
Write-Host "  🚀 Antigravity Bot Setup (Windows)" -ForegroundColor Blue
Write-Host "══════════════════════════════════════" -ForegroundColor Blue
Write-Host ""

# ---- Check Node.js ----
function Check-Node {
    try {
        $version = (node -v) -replace 'v', ''
        $major = [int]($version.Split('.')[0])
        if ($major -ge 18) {
            Write-Host "[✓] Node.js v$version found" -ForegroundColor Green
            return $true
        }
        Write-Host "[!] Node.js v$version is too old (need >= 18)" -ForegroundColor Yellow
    } catch {
        Write-Host "[!] Node.js not found" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "Node.js >= 18 is required." -ForegroundColor Yellow
    Write-Host "Download from: https://nodejs.org/en/download/" -ForegroundColor Cyan
    Write-Host ""
    $choice = Read-Host "Press Enter after installing Node.js, or type 'skip' to exit"
    if ($choice -eq 'skip') {
        Write-Host "[✗] Please install Node.js >= 18 and re-run this script." -ForegroundColor Red
        exit 1
    }
    return (Check-Node)
}

# ---- Install npm dependencies ----
function Install-Deps {
    Set-Location $ProjectDir
    if (-not (Test-Path "node_modules")) {
        Write-Host "Installing npm dependencies..."
        npm install
    } else {
        Write-Host "[✓] npm dependencies already installed" -ForegroundColor Green
    }
}

# ---- Configure .env ----
function Setup-Env {
    $envFile = Join-Path $ProjectDir ".env"
    if (Test-Path $envFile) {
        Write-Host "[✓] .env file already exists" -ForegroundColor Green
        return
    }

    Copy-Item (Join-Path $ProjectDir ".env.example") $envFile

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

    Write-Host "[✓] .env configured" -ForegroundColor Green
}

# ---- Create Start Menu shortcut ----
function Create-Shortcut {
    $shortcutDir = [System.IO.Path]::Combine($env:APPDATA, "Microsoft", "Windows", "Start Menu", "Programs")
    $shortcutPath = Join-Path $shortcutDir "Antigravity Bot.lnk"

    try {
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($shortcutPath)
        $shortcut.TargetPath = "cmd.exe"
        $shortcut.Arguments = "/k cd /d `"$ProjectDir`" && npm start"
        $shortcut.WorkingDirectory = $ProjectDir
        $shortcut.Description = "Antigravity Telegram Bot"
        $shortcut.Save()
        Write-Host "[✓] Start Menu shortcut created" -ForegroundColor Green
    } catch {
        Write-Host "[!] Could not create shortcut: $_" -ForegroundColor Yellow
    }
}

# ---- Optional: Install as Windows Service via pm2-windows-service ----
function Setup-PM2 {
    Write-Host ""
    $pm2Choice = Read-Host "Install PM2 for 24/7 operation? [y/N]"
    if ($pm2Choice -match '^[Yy]$') {
        try {
            npm install -g pm2
            Set-Location $ProjectDir
            pm2 start src/index.js --name antigravity-bot
            pm2 save
            Write-Host "[✓] PM2 configured" -ForegroundColor Green
            Write-Host "[!] For auto-start on boot, see: https://github.com/jessety/pm2-installer" -ForegroundColor Yellow
        } catch {
            Write-Host "[!] PM2 setup failed: $_" -ForegroundColor Yellow
        }
    } else {
        Write-Host "[✓] Skipped PM2 setup. Run manually: npm start" -ForegroundColor Green
    }
}

# ---- Main ----
Check-Node
Install-Deps
Setup-Env
Create-Shortcut
Setup-PM2

Write-Host ""
Write-Host "══════════════════════════════════════" -ForegroundColor Green
Write-Host "  ✅ Setup Complete!" -ForegroundColor Green
Write-Host "══════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "Quick start:"
Write-Host "  npm start          # Run the bot"
Write-Host ""
Write-Host "Make sure Antigravity IDE is launched with:"
Write-Host "  antigravity.exe --remote-debugging-port=9333"
Write-Host ""
