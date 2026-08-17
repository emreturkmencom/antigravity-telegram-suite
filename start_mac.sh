#!/usr/bin/env bash
set -e

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

echo "========================================================"
echo "      🚀 Antigravity Telegram Suite Launcher (macOS)   "
echo "========================================================"

# Check if .env has BOT_TOKEN configured
if [ ! -f .env ] || grep -q "BOT_TOKEN=your_bot_token_here" .env || grep -q "BOT_TOKEN=$" .env; then
  echo "⚠️  Please configure your BOT_TOKEN in .env before running:"
  echo "    1. Message @BotFather on Telegram to create a bot & copy the token."
  echo "    2. Message @userinfobot to get your Telegram user ID."
  echo "    3. Edit: $DIR/.env"
  exit 1
fi

APP_TARGET=$(grep "^ANTIGRAVITY_PREFERRED_APP=" .env | cut -d'=' -f2 | tr -d ' \r\n' || echo "agent")

if [ "$APP_TARGET" = "agent" ]; then
  PORT=9333
  APP_NAME="Antigravity"
else
  PORT=9334
  APP_NAME="Antigravity IDE"
fi

echo "Target Application: $APP_NAME (CDP Port: $PORT)"

echo "1. Checking if $APP_NAME is running on port $PORT..."
if lsof -i :"$PORT" >/dev/null 2>&1; then
  echo "   ✅ $APP_NAME is already listening on port $PORT."
else
  echo "   ℹ️  Starting $APP_NAME with remote debugging port ($PORT)..."
  if [ -d "/Applications/$APP_NAME.app" ]; then
    open -a "$APP_NAME" --args --remote-debugging-port=$PORT
  elif [ -d "$HOME/Applications/$APP_NAME.app" ]; then
    open -a "$HOME/Applications/$APP_NAME.app" --args --remote-debugging-port=$PORT
  else
    echo "   ⚠️ Application /Applications/$APP_NAME.app not found."
  fi
  sleep 3
fi

echo "2. Starting Antigravity Telegram Suite Bot..."
npm start
