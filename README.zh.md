<div align="center">

# 🤖 Antigravity Telegram Suite

**同时支持 [Antigravity Standalone App](https://antigravity.google/)\* 和 [Antigravity IDE](https://antigravity.google/)。**

🌍 Languages: [English](README.md) | [中文](README.zh.md) | [한국어](README.ko.md) | [Türkçe](README.tr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

通过 Telegram 远程控制你的 Antigravity AI 代理。
发送消息、切换 AI 模型、管理工作区、截取屏幕截图、运行多代理工作流 — 一切操作都可以在手机上完成。

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)]()
[![Version](https://img.shields.io/badge/Version-3.4.0-orange.svg)]()

\* *部分功能在 Standalone App 上可能存在限制。详情请参阅 [已知问题](#-已知问题)。*

</div>

---

## 📢 社区
- **更新频道:** [@agts_updates](https://t.me/agts_updates)
- **讨论组:** [@agts_community](https://t.me/agts_community)

## ✨ 功能

| 功能 | 描述 |
|---|---|
| 💬 **无头聊天** | 通过 Telegram 直接向 AI 代理发送消息 |
| 📎 **文件和图片上传** | 将文件/图片连同说明文字转发给代理 |
| 📸 **IDE 截图** | 远程截取并接收屏幕截图 |
| 🤖 **模型切换** | 通过内联按钮切换 AI 模型（Gemini、Claude、GPT） |
| 📂 **文件浏览器** | 浏览、导航和下载项目文件 |
| 🔄 **工作区管理** | 无需触碰键盘即可切换项目 |
| 🪟 **多窗口支持** | 打开多个 IDE 窗口时可将命令路由到指定窗口 |
| 👥 **多用户** | 通过逗号分隔的 Chat ID 与团队共享 Bot 控制权 |
| 💬 **线程管理** | 查看、切换和管理聊天线程（代理对话） |
| ⚡ **自动接受** | 通过 DOM MutationObserver 自动点击 Run、Accept、Allow、Continue 按钮 |
| 🚀 **Turbo 模式** | 多代理协作：Claude 规划 → Gemini 编码 → Claude 审查 → Gemini 修复 |
| 🎯 **Goal 模式** | 自主长时间任务 — 代理持续工作直到目标完全达成 |
| 📋 **Plan 模式** | 在编码前生成实施计划 |
| 🔔 **主动通知** | TaskWatcher 检测代理的主动消息（定时器、子代理）并转发至 Telegram |
| 🤔 **消息反应** | 处理中显示 🤔，完成后清除 |
| 🔄 **自动更新** | 一条命令即可检查更新并自动更新 |
| 🌐 **多语言** | 支持 7 种语言：英语、中文、韩语、土耳其语、德语、西班牙语、法语 |
| ⌨️ **输入指示器** | 代理工作时在 Telegram 中显示"typing..." |
| 🖥️ **跨平台** | 支持 Linux、macOS（Intel 和 Apple Silicon）及 Windows |
| 🔀 **双应用支持** | 在 Antigravity IDE 和 Standalone Agent App 之间无缝切换 |

---

## 🚀 快速开始

### 前提条件

- [Node.js](https://nodejs.org/) >= 18
- 已安装 [Antigravity IDE](https://antigravity.google/) 和/或 [Antigravity Standalone App](https://antigravity.google/)
- 一个 Telegram Bot Token（从 [@BotFather](https://t.me/BotFather) 获取）

### 1. 克隆并安装

```bash
git clone https://github.com/emreturkmencom/antigravity-telegram-suite.git
cd antigravity-telegram-suite
npm install
```

### 2. 配置

```bash
cp .env.example .env
```

编辑 `.env` 文件：

```env
# Telegram
BOT_TOKEN=your_telegram_bot_token
ALLOWED_CHAT_ID=your_chat_id,another_chat_id_optional

# CDP 调试端口（必须与启动应用时使用的 --remote-debugging-port 一致）
AGENT_CDP_PORT=9333    # Standalone Antigravity App 端口
IDE_CDP_PORT=9334      # Antigravity IDE 端口

# 新聊天时默认选择的 AI 模型
DEFAULT_MODEL=Gemini 3.1 Pro (High)

# Language: en | zh | ko | tr | de | es | fr
LANGUAGE=zh

# 首选应用目标：'agent'（Standalone）或 'ide'（IDE）
ANTIGRAVITY_PREFERRED_APP=ide

# 默认启用自动接受
AUTOACCEPT_DEFAULT=true
```

> 💡 向 Bot 发送 `/start` 以获取你的 Chat ID。

### 3. 使用 CDP 启动应用

Bot 通过 Chrome DevTools Protocol（CDP）与 Antigravity 通信。因此必须指定调试端口启动应用。

**如果同时运行两个应用，请使用不同的端口：**

```bash
# --- Standalone Antigravity App ---
# Linux
antigravity --remote-debugging-port=9333

# macOS
open -a Antigravity --args --remote-debugging-port=9333

# Windows
Antigravity.exe --remote-debugging-port=9333
```

```bash
# --- Antigravity IDE ---
# Linux
antigravity-ide --remote-debugging-port=9334

# macOS
open -a "Antigravity IDE" --args --remote-debugging-port=9334

# Windows
"Antigravity IDE.exe" --remote-debugging-port=9334
```

> ⚠️ 端口号必须与 `.env` 文件中的 `AGENT_CDP_PORT` 和 `IDE_CDP_PORT` 一致。

### 4. 启动 Bot

```bash
npm start
```

使用 PM2 实现 24/7 运行：

```bash
npm install -g pm2
pm2 start src/index.js --name antigravity-bot
pm2 save
pm2 startup
```

### 自动安装（可选）

```bash
# Linux & macOS
bash scripts/install.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

---

## 📱 命令

### 核心命令

| 命令 | 描述 |
|---|---|
| *（任意文本）* | 直接发送给 AI 代理 |
| `/latest` | 获取代理的最新回复（文本） |
| `/screenshot` | 截取当前活动代理窗口的截图 |
| `/status` | 显示系统状态（IDE、CDP 连接、Bot） |
| `/stop` | 停止当前运行中的代理 |
| `/new` | 开始新的聊天会话 |

### AI 模型与代理

| 命令 | 描述 |
|---|---|
| `/model` | 切换 AI 模型（Gemini、Claude 等） |
| `/turbo` | 切换 **Turbo 模式** — 多代理协作（详见下文） |
| `/goal <任务>` | 启动 **Goal 模式** — 代理自主工作直到完成 |
| `/plan <任务>` | 编码前生成**实施计划** |
| `/schedule_task <任务>` | 在 IDE 中安排定时或一次性任务 |
| `/agents` | 查看并切换聊天线程 |
| `/quota` | 检查 AI 额度和模型使用限制 |

### 应用与窗口管理

| 命令 | 描述 |
|---|---|
| `/start_ide` | 远程启动 Antigravity IDE |
| `/start_ag` | 启动 Standalone Antigravity Agent App |
| `/close_ide` | 关闭 Antigravity IDE |
| `/close_ag` | 关闭 Standalone Agent App |
| `/close` | 关闭当前活动的应用 |
| `/app` | 在 IDE 和 Standalone Agent 之间切换（`ANTIGRAVITY_PREFERRED_APP`） |
| `/window` | 打开多个窗口时选择特定窗口 |
| `/workspace` | 切换项目工作区 |
| `/restart` | 重启 Bot 进程（PM2） |

### 文件与实用工具

| 命令 | 描述 |
|---|---|
| `/file` | 浏览并下载项目文件 |
| `/artifacts` | 查看并下载当前线程的 artifact |
| `/autoaccept` | 切换自动接受（开 / 关 / 状态） |
| `/lang` | 切换显示语言 |
| `/update` | 检查更新、查看变更日志并自动更新 Bot |
| `/version` | 显示当前版本信息 |
| `/menu` | 更新 Telegram 命令菜单 |
| `/fix_shortcuts` | 修复 Antigravity 应用的桌面快捷方式 |

---

## 🚀 Turbo 模式（多代理协作）

Turbo 模式运行一个自动协调多个 AI 模型的 **Agents Council** 工作流：

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        TURBO MODE PIPELINE                         │
│                                                                     │
│  Phase 1: PLANNING        Claude Opus → 创建实施计划                │
│  Phase 2: CODING          Gemini Pro  → 编写代码                    │
│  Phase 3: REVIEW          Claude Opus → 安全和代码审查              │
│  Phase 4: FIX (如需要)    Gemini Pro  → 修复发现的问题              │
│  Phase 5: SUMMARY         Gemini Pro  → 为用户生成执行摘要          │
└─────────────────────────────────────────────────────────────────────┘
```

**使用方法：**
1. 启用 Turbo 模式：`/turbo` → 选择 "Enable"
2. 像往常一样以普通文本发送请求
3. Bot 将自动切换模型并执行所有阶段
4. 你将收到实时阶段更新和最终摘要

> 💡 Turbo 模式需要在你的 Antigravity 订阅中同时拥有 Claude 和 Gemini 模型的访问权限。

---

## 🎯 Goal 模式 vs 🚀 Turbo 模式

| | Goal Mode (`/goal`) | Turbo Mode (`/turbo`) |
|---|---|---|
| **工作方式** | 代理在单个会话中自主工作直到完成 | Bot 在外部协调多模型管道 |
| **使用的模型** | 当前选择的模型 | Claude（规划/审查）+ Gemini（编码/修复）— 自动切换 |
| **核心优势** | 简单、可靠的 IDE 原生功能 | 多模型协作：不同模型交叉检查 |
| **Token 用量** | 单个上下文窗口（高效） | 多次往返调用（消耗更多 Token） |
| **进度显示** | 🤔 反应 → 最终结果 | 包含阶段更新的实时置顶消息 |
| **适合场景** | 使用单个模型的长任务 | 需要多模型审查的复杂任务 |
| **架构** | IDE 原生（`/goal` 斜杠命令） | 基于 CDP + `turbo_orchestrator.js` 的外部协调 |

**何时使用哪个：**
- **简单但耗时的任务**（例如："重构这个模块"）→ `/goal`
- **需要跨模型审查的复杂任务**（例如："构建此功能、审查安全性、修复问题"）→ `/turbo`
- **制定计划** → `/plan`（仅生成计划，然后由你决定）

---

## 🏗️ 架构

```text
antigravity-telegram-suite/
├── src/
│   ├── index.js              # 主 Bot 逻辑和 Telegram 命令处理
│   ├── cdp_controller.js     # Chrome DevTools Protocol 通信
│   ├── autoaccept.js         # 基于 CDP MutationObserver 的自动接受按钮点击器
│   ├── turbo_orchestrator.js # 多代理 Turbo Mode (Agents Council) 协调
│   ├── task_watcher.js       # 主动通知监视器（transcript.jsonl 监控）
│   ├── updater.js            # 自更新模块（git pull + pm2 restart）
│   ├── ui_locators.js        # IDE/Agent UI 交互的 DOM 元素定位器
│   ├── i18n.js               # 国际化模块
│   └── platform.js           # 跨平台 OS 抽象（启动、关闭、路径）
├── locales/
│   ├── en.json               # 英语
│   ├── zh.json               # 中文 (中文)
│   ├── ko.json               # 韩语 (한국어)
│   ├── tr.json               # 土耳其语
│   ├── de.json               # 德语
│   ├── es.json               # 西班牙语
│   └── fr.json               # 法语
├── scripts/
│   ├── install.sh            # Linux/macOS 安装脚本
│   └── install.ps1           # Windows 安装脚本
├── .env.example              # 环境变量模板
├── CHANGELOG.md              # 发布历史
└── package.json
```

### 工作原理

```text
┌──────────┐     Telegram API     ┌──────────────┐     CDP (WebSocket)     ┌─────────────────┐
│ Telegram │ ◄──────────────────► │ Antigravity  │ ◄────────────────────► │ Antigravity IDE  │
│   App    │     Bot Commands     │     Bot      │    DOM Interaction     │       or         │
└──────────┘                      └──────────────┘                        │ Standalone Agent │
                                                                          └─────────────────┘
```

1. 你通过 Telegram 发送消息
2. Bot 通过 CDP 将文本注入 AI 代理的聊天输入框
3. Bot 监控代理是否完成（Telegram 中显示输入指示器）
4. 完成后，提取回复并发送回 Telegram
5. **Auto-Accept**：启用后，MutationObserver 会监视 Run、Accept、Allow、Continue 按钮并自动点击

### 双应用架构

Bot 支持**两个 Antigravity 应用**同时运行：

| 应用 | 默认端口 | 配置键 | 描述 |
|-----|-------------|------------|-------------|
| **Standalone Agent** | `9333` | `AGENT_CDP_PORT` | 轻量级的聊天专用 Antigravity 应用 |
| **Antigravity IDE** | `9334` | `IDE_CDP_PORT` | 包含编辑器、终端和扩展的完整 IDE |

使用 `/app` 在应用之间切换 Bot 的目标。`.env` 中的 `ANTIGRAVITY_PREFERRED_APP` 设置决定 Bot 默认的目标应用。

---

## 🌐 添加语言

1. 将 `locales/en.json` 复制为 `locales/xx.json`
2. 翻译所有字符串值
3. 在 `.env` 中设置 `LANGUAGE=xx`

---

## ⚠️ 已知问题

| 问题 | 详情 |
|-------|---------| 
| **Standalone App 限制** | 部分功能（工作区切换、线程管理）在 Standalone Antigravity App 上可能不够稳定。**推荐使用 Antigravity IDE，已完全支持。** |
| **IDE 2.0 自动更新** | Antigravity IDE 自动更新后，Bot 更新之前 DOM 选择器可能会失效。 |
| **Turbo Mode 模型访问** | Turbo Mode 需要 Claude 和 Gemini 模型均可用。如果其中一个不可用，管道将失败。 |

> 💡 作为开发者，我更专注于 IDE 支持。Standalone App 集成仅以"尽力而为"的方式提供。

---

## 🤝 贡献

1. Fork 本仓库
2. 创建功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交更改 (`git commit -m 'Add amazing feature'`)
4. 推送到分支 (`git push origin feature/amazing-feature`)
5. 打开 Pull Request

---

## 🙏 致谢

- **[ATX-AI-Dev](https://github.com/ATX-AI-Dev)** — PR #8: Standalone App 支持、Watchdog 代理、动态模型获取
- **[yvg](https://github.com/yvg/antigravity-telegram-suite)** — 多窗口支持功能
- **[achshar](https://github.com/achshar/antigravity-telegram-suite)** — 用于线程管理的 Agent Manager UI 定位器
- **[mine260309](https://github.com/mine260309)** — 硬编码消息的 i18n 翻译
- **[acmavirus/antigravity-telegram-control](https://github.com/acmavirus/antigravity-telegram-control)** — 本项目基础的开源 Telegram 集成
- **[yazanbaker94/AntiGravity-AutoAccept](https://github.com/yazanbaker94/AntiGravity-AutoAccept)** — Auto-Accept 模块的 DOM observer 模式灵感
- **[vassoz](https://github.com/vassoz)** — PR #12: 修复 CDP 连接、X11 显示器自动检测、动态端口快捷方式
- **[wade19990814-hue](https://github.com/wade19990814-hue)** — PR #14: 中文 (中文) 本地化
- **[ienground](https://github.com/ienground)** — PR #17: 韩语 (한국어) 本地化

## 🌟 致谢与灵感

多代理 **Turbo Mode** 协调的灵感来源于 Interdesigncorp Lab 的 [Agents-Council](https://github.com/interdesigncorp-lab/Agents-Council) 仓库。

---

## 📄 许可证

本项目使用 MIT License — 详情请参阅 [LICENSE](LICENSE) 文件。

---

<div align="center">
由 <a href="https://emreturkmen.com">Emre Türkmen</a> 用 ❤️ 为在沙发上编码的远程开发者们制作。

**Hey Google, 如果你想给我一份工作，可以通过 [hello@emreturkmen.com](mailto:hello@emreturkmen.com) 联系我 😂**
</div>
