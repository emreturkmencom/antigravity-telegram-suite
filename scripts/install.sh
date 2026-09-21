#!/usr/bin/env bash
# ============================================================
# Antigravity Bot — One-Line Bootstrap Installer (Linux/macOS/WSL)
# ============================================================
# Usage: curl -fsSL https://raw.githubusercontent.com/emreturkmencom/antigravity-telegram-suite/main/scripts/install.sh | bash
# ============================================================
set -e

BOLD='\033[1m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

REPO_URL="https://github.com/emreturkmencom/antigravity-telegram-suite"
PROJECT_NAME="antigravity-telegram-suite"

print_header() {
    echo -e "\n${BLUE}${BOLD}═══════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}${BOLD}  Antigravity Bot — One-Line Install${NC}"
    echo -e "${BLUE}${BOLD}═══════════════════════════════════════════════════════${NC}\n"
}

print_step() {
    echo -e "${GREEN}[✓]${NC} $1"
}
print_warn() {
    echo -e "${YELLOW}[!]${NC} $1"
}
print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

# ---- Determine install location ----
INSTALL_DIR=""
if [ -n "$1" ]; then
    INSTALL_DIR="$1"
elif [ -n "${AG_INSTALL_DIR}" ]; then
    INSTALL_DIR="${AG_INSTALL_DIR}"
fi

if [ -z "$INSTALL_DIR" ]; then
    # Default: ~/antigravity-telegram-suite, or if already inside a clone, stay there
    if [ -f "package.json" ] && [ -d ".git" ]; then
        INSTALL_DIR="$(pwd)"
        print_warn "Already inside a $PROJECT_NAME clone — reinstalling in place."
    else
        INSTALL_DIR="$HOME/$PROJECT_NAME"
    fi
fi

# ---- Check Node.js ----
check_node() {
    if command -v node &>/dev/null; then
        local version
        version=$(node -v | sed 's/v//')
        local major
        major=$(echo "$version" | cut -d. -f1)
        if [ "$major" -ge 18 ]; then
            print_step "Node.js v${version} found"
            return 0
        else
            print_warn "Node.js v${version} is too old (need >= 18)"
        fi
    fi

    echo -e "\n${YELLOW}Node.js >= 18 is required. Install options:${NC}"
    echo "  1) Install via nvm (recommended)"
    echo "  2) Skip (I'll install it manually)"
    read -rp "Choose [1/2]: " choice

    if [ "$choice" = "1" ]; then
        if ! command -v nvm &>/dev/null; then
            echo "Installing nvm..."
            curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.0/install.sh | bash
            export NVM_DIR="$HOME/.nvm"
            [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
        fi
        nvm install --lts
        nvm use --lts
        print_step "Node.js installed via nvm"
    else
        print_error "Please install Node.js >= 18 and re-run this script."
        exit 1
    fi
}

# ---- Clone or update repo ----
clone_or_update() {
    if [ -d "$INSTALL_DIR" ] && [ -f "$INSTALL_DIR/package.json" ]; then
        print_step "Existing installation found at $INSTALL_DIR"
        echo ""
        read -rp "Upgrade to latest version? [y/N]: " upgrade
        if [[ "$upgrade" =~ ^[Yy]$ ]]; then
            cd "$INSTALL_DIR"
            print_step "Pulling latest changes..."
            git pull --ff-only origin main || {
                print_warn "Fast-forward pull failed — pulling with merge..."
                git pull origin main
            }
        else
            print_step "Keeping current version."
            cd "$INSTALL_DIR"
        fi
    else
        print_step "Cloning $PROJECT_NAME..."
        mkdir -p "$INSTALL_DIR"
        git clone "$REPO_URL" "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi
}

# ---- Install npm dependencies ----
install_deps() {
    if [ ! -d "node_modules" ]; then
        echo "Installing npm dependencies..."
        npm install
    else
        print_step "npm dependencies already installed"
    fi
}

# ---- Configure .env ----
setup_env() {
    if [ -f ".env" ]; then
        print_step ".env file already exists"
        return
    fi

    cp .env.example .env
    echo ""
    echo -e "${BOLD}Configure your bot:${NC}"

    read -rp "  Telegram Bot Token (from @BotFather): " bot_token
    if [ -n "$bot_token" ]; then
        sed -i.bak "s/your_bot_token_here/$bot_token/" .env
        rm -f .env.bak
    fi

    read -rp "  Your Telegram Chat ID (optional, press Enter to skip): " chat_id
    if [ -n "$chat_id" ]; then
        sed -i.bak "s/^ALLOWED_CHAT_ID=$/ALLOWED_CHAT_ID=$chat_id/" .env
        rm -f .env.bak
    fi

    read -rp "  Language [en/tr] (default: en): " user_lang
    if [ -n "$user_lang" ]; then
        sed -i.bak "s/^LANGUAGE=en$/LANGUAGE=$user_lang/" .env
        rm -f .env.bak
    fi

    print_step ".env configured"
}

# ---- Install PM2 (optional) ----
setup_pm2() {
    echo ""
    read -rp "Install PM2 for 24/7 operation? [y/N]: " pm2_choice
    if [[ "$pm2_choice" =~ ^[Yy]$ ]]; then
        if ! command -v pm2 &>/dev/null; then
            npm install -g pm2
        fi
        pm2 start src/index.js --name antigravity-bot
        pm2 save
        pm2 startup 2>/dev/null || true
        print_step "PM2 configured — bot will auto-start on reboot"
    else
        print_step "Skipped PM2 setup. Run manually: npm start"
    fi
}

# ---- Create IDE launcher script ----
setup_launcher() {
    local launcher_dir="$HOME/.local/bin"
    local launcher_path="$launcher_dir/antigravity-launcher.sh"
    local os_name
    os_name="$(uname -s)"

    if [ "$os_name" = "Darwin" ]; then
        mkdir -p "$launcher_dir"
        cat > "$launcher_path" << 'LAUNCHER_EOF'
#!/bin/bash
# Antigravity Launcher for macOS
PORT=${DEBUGGING_PORT:-9333}

cleanup_port() {
    local pids=$(lsof -t -i :"$PORT" 2>/dev/null)
    if [ -n "$pids" ]; then
        echo "[launcher] Cleaning port $PORT: $pids"
        echo "$pids" | xargs kill -9 2>/dev/null
        sleep 0.5
    fi
}

cleanup_port
open -a Antigravity --args --remote-debugging-port=$PORT "$@" &
wait
cleanup_port
LAUNCHER_EOF
        chmod +x "$launcher_path"
        print_step "macOS launcher created at $launcher_path"

    elif [ "$os_name" = "Linux" ]; then
        if [ ! -f "$launcher_path" ]; then
            mkdir -p "$launcher_dir"
            cat > "$launcher_path" << 'LAUNCHER_EOF'
#!/bin/bash
# Antigravity Launcher for Linux
PORT=${DEBUGGING_PORT:-9333}

cleanup_port() {
    local pids
    pids=$(lsof -t -i :"$PORT" 2>/dev/null | while read pid; do
        local cmd
        cmd=$(ps -p "$pid" -o comm= 2>/dev/null)
        if [[ "$cmd" != "antigravity" ]]; then
            echo "$pid"
        fi
    done)
    if [ -n "$pids" ]; then
        echo "[launcher] Cleaning port $PORT: $pids"
        echo "$pids" | xargs kill -9 2>/dev/null
        sleep 0.5
    fi
}

cleanup_port
/usr/share/antigravity/antigravity --remote-debugging-port=$PORT "$@" &
AG_PID=$!
wait $AG_PID
cleanup_port
LAUNCHER_EOF
            chmod +x "$launcher_path"
            print_step "Linux launcher created at $launcher_path"
        else
            print_step "Launcher already exists at $launcher_path"
        fi

        # Create desktop shortcut
        local desktop_file="$HOME/.local/share/applications/antigravity-bot.desktop"
        mkdir -p "$(dirname "$desktop_file")"
        cat > "$desktop_file" << EOF
[Desktop Entry]
Name=Antigravity Bot
Comment=Telegram bot for remote IDE control
Exec=bash -c "cd $INSTALL_DIR && npm start"
Icon=utilities-terminal
Terminal=true
Type=Application
Categories=Development;Utility;
EOF
        print_step "Desktop shortcut created"
    fi
}

# ---- Main ----
print_header

check_node

clone_or_update

install_deps
setup_env
setup_launcher
setup_pm2

echo ""
echo -e "${GREEN}${BOLD}══════════════════════════════════════${NC}"
echo -e "${GREEN}${BOLD}  ✅ Setup Complete!${NC}"
echo -e "${GREEN}${BOLD}══════════════════════════════════════${NC}"
echo ""
echo "Project location: $INSTALL_DIR"
echo ""
echo "Quick start:"
echo "  cd $INSTALL_DIR && npm start"
echo ""
echo "Make sure Antigravity IDE is launched with:"
echo "  antigravity --remote-debugging-port=9333"
echo ""
