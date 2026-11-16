<div align="center">

# 🤖 Antigravity Telegram Suite

**[Antigravity Standalone App](https://antigravity.google/)과 [Antigravity IDE](https://antigravity.google/) 모두에서 동작합니다.**

🌍 Languages: [English](README.md) | [中文](README.zh.md) | [한국어](README.ko.md) | [Türkçe](README.tr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

Telegram으로 Antigravity AI 에이전트를 원격 제어하고, **Claude Code나 외부 앱을 Antigravity에 연결**하며, **여러 전문 에이전트를 동시에 병렬 실행**하세요.
메시지 전송, AI 모델 전환, 워크스페이스 관리, 스크린샷 촬영, 병렬 멀티 에이전트 워크플로우 실행까지 — 모두 휴대폰이나 터미널에서 할 수 있습니다.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)]()
[![Version](https://img.shields.io/badge/Version-3.9.3-orange.svg)]()

</div>

---

## 📢 커뮤니티
- **업데이트 채널:** [@agts_updates](https://t.me/agts_updates)
- **토론 그룹:** [@agts_community](https://t.me/agts_community)

## ✨ 기능

| 기능 | 설명 |
|---|---|
| 💬 **헤드리스 채팅** | Telegram을 통해 AI 에이전트에 직접 메시지를 보냅니다 |
| 📎 **파일 및 이미지 업로드** | 캡션과 함께 파일/이미지를 에이전트에 전달합니다 |
| 📸 **IDE 스크린샷** | 원격으로 스크린샷을 캡처하고 받아봅니다 |
| 🤖 **모델 전환** | 인라인 버튼으로 AI 모델(Gemini, Claude, GPT)을 변경합니다 |
| 📂 **파일 탐색기** | 프로젝트 파일을 탐색, 이동, 다운로드합니다 |
| 🔄 **워크스페이스 관리** | 키보드를 만지지 않고 프로젝트를 전환합니다 |
| 🪟 **멀티 윈도우 지원** | 여러 IDE 창이 열려 있을 때 특정 창으로 명령을 라우팅합니다 |
| 👥 **멀티 유저** | 쉼표로 구분된 Chat ID를 통해 팀과 봇 제어를 공유합니다 |
| 💬 **스레드 관리** | 채팅 스레드(에이전트 대화)를 조회, 전환, 관리합니다 |
| ⚡ **자동 수락** | DOM MutationObserver를 통해 Run, Accept, Allow, Continue 버튼을 자동 클릭합니다 |
| 🚀 **터보 모드** | 멀티 에이전트 오케스트레이션: Claude가 계획 → Gemini가 구현 → Claude가 리뷰 → Gemini가 수정 |
| 🎯 **Goal 모드** | 장시간 작업을 자율 실행 — 목표가 완전히 달성될 때까지 에이전트가 작업합니다 |
| 📋 **Plan 모드** | 코딩 전에 구현 계획을 생성합니다 |
| 🔔 **능동 알림** | TaskWatcher가 비요청 에이전트 메시지(타이머, 서브 에이전트)를 감지해 Telegram으로 전달합니다 |
| 🤔 **메시지 리액션** | 처리 중에는 🤔를 표시하고, 완료되면 제거합니다 |
| 🔄 **자동 업데이트** | 업데이트를 확인하고 한 번의 명령으로 자체 업데이트합니다 |
| 🌐 **다국어 지원** | 7개 언어 지원: English, 中文, 한국어, Turkish, German, Spanish, French |
| ⌨️ **타이핑 표시기** | 에이전트가 작업 중일 때 Telegram에 "typing..."을 표시합니다 |
| 🖥️ **크로스 플랫폼** | Linux, macOS(Intel 및 Apple Silicon), Windows에서 동작합니다 |
| 🔀 **듀얼 앱 지원** | Antigravity IDE와 Standalone Agent App 사이를 매끄럽게 전환합니다 |
| 📡 **Telegraph 게시** | 작업 체크리스트, 계획 및 워크스루를 128비트 암호화 난수 슬러그 URL로 게시(또는 비공개 유지)할 수 있으며, 전체 전환 및 삭제 제어가 가능합니다 |
| 🤝 **Claude Code 연동 및 병렬 에이전트 (`/wo`)** | **Claude Code**, CLI 도구, cron 작업 또는 외부 앱을 Antigravity에 연결 — 격리된 IDE 창에서 **여러 전문 에이전트를 동시에 병렬 실행**하고, 에이전트별 AI 모델을 지정하며 결과를 디스크와 Telegram으로 받아봅니다 |

---

## 🚀 빠른 시작

### 준비물

- **듀얼 엔진 지원 (IDE & Standalone):** `/app` 명령을 통해 Classic Monaco IDE와 Standalone Agent 간을 원활하게 전환합니다. 격리된 드라이버 아키텍처는 충돌 제로를 보장하며 전환 시 완벽한 백그라운드 프로세스 관리를 제공합니다.
- [Node.js](https://nodejs.org/) >= 18
- [Antigravity IDE](https://antigravity.google/) 및/또는 [Antigravity Standalone App](https://antigravity.google/) 설치
- Telegram bot token ([@BotFather](https://t.me/BotFather)에서 발급)

### 1. 클론 및 설치

```bash
git clone https://github.com/emreturkmencom/antigravity-telegram-suite.git
cd antigravity-telegram-suite
npm install
```

### 2. 설정

```bash
cp .env.example .env
```

`.env` 파일을 열고 값들을 수정하세요:

```env
# Telegram
BOT_TOKEN=your_telegram_bot_token
ALLOWED_CHAT_ID=your_chat_id,another_chat_id_optional

# CDP 디버깅 포트 (실행 시 사용하는 --remote-debugging-port 값과 일치해야 함)
AGENT_CDP_PORT=9333    # Standalone Antigravity App용 포트
IDE_CDP_PORT=9334      # Antigravity IDE용 포트

# 새 채팅에서 기본으로 선택할 AI 모델
DEFAULT_MODEL=Gemini 3.1 Pro (High)

# Language: en | zh | ko | tr | de | es | fr
LANGUAGE=ko

# 선호 앱 대상: 'agent' (Standalone) 또는 'ide' (IDE)
ANTIGRAVITY_PREFERRED_APP=ide

# 기본적으로 auto-accept 활성화
AUTOACCEPT_DEFAULT=true

# Telegraph 아티팩트 게시 활성화 (기본값: true)
ENABLE_TELEGRAPH=true
```

> 💡 Chat ID를 확인하려면 봇에 `/start`를 보내세요.

### 3. CDP로 앱 실행

이 봇은 Chrome DevTools Protocol(CDP)을 통해 Antigravity와 통신합니다. 따라서 디버깅 포트를 지정해 앱을 실행해야 합니다.

**두 앱을 동시에 실행한다면 서로 다른 포트를 사용하세요:**

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

> ⚠️ 포트 번호는 `.env`의 `AGENT_CDP_PORT` 및 `IDE_CDP_PORT`와 반드시 일치해야 합니다.

### 4. 봇 실행

```bash
npm start
```

PM2로 24/7 운영하려면:

```bash
npm install -g pm2
pm2 start src/index.js --name antigravity-bot
pm2 save
pm2 startup
```

### 자동 설치 (선택)

```bash
# Linux & macOS
bash scripts/install.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

---

## 📱 명령어

### 기본 명령어

| 명령어 | 설명 |
|---|---|
| *(아무 텍스트나)* | AI 에이전트에 직접 전송 |
| `/latest` | 최신 에이전트 응답을 텍스트로 가져옵니다 |
| `/screenshot` | 현재 활성 에이전트 창의 스크린샷을 찍습니다 |
| `/status` | 시스템 상태(IDE, CDP 연결, Bot)를 표시합니다 |
| `/stop` | 현재 실행 중인 에이전트를 중지합니다 |
| `/new` | 새 채팅 세션을 엽니다 |

### AI 모델 및 에이전트

| 명령어 | 설명 |
|---|---|
| `/model` | AI 모델(Gemini, Claude 등)을 전환합니다 |
| `/turbo` | **터보 모드**를 토글합니다 — 멀티 에이전트 오케스트레이션 (아래 참고) |
| `/goal <task>` | **Goal 모드** 시작 — 완료될 때까지 에이전트가 자율적으로 작업합니다 |
| `/plan <task>` | 코딩 전에 **구현 계획**을 생성합니다 |
| `/schedule_task <task>` | IDE에서 반복 작업 또는 1회성 작업을 예약합니다 |
| `/agents` | 대화 스레드 관리 (상단 고정 5개, 시간 표시 최신 5개, 프로젝트당 최대 10개 페이지네이션) |
| `/rename [제목]` | 현재 대화 이름 변경 (또는 `/agents`에서 원하는 대화 이름 변경) |
| `/pin` / `/unpin` | 현재 대화 상단 고정 / 고정 해제 (또는 `/agents`에서 원하는 대화 고정 토글) |
| `/wo [데스크] [작업]` | **Work Orders(작업 지시)** 패널을 열거나 전문 데스크에 작업을 전달합니다 (`--model "..."` 지원) |
| `/wo_stop` | 현재 실행 중인 작업 지시를 중지합니다 |
| `/quota` | AI 크레딧과 모델 사용 한도를 확인합니다 |

### 앱 및 창 관리

| 명령어 | 설명 |
|---|---|
| `/start_ide` | Antigravity IDE를 원격으로 실행합니다 |
| `/start_ag` | Standalone Antigravity Agent App을 실행합니다 |
| `/close_ide` | Antigravity IDE를 종료합니다 |
| `/close_ag` | Standalone Agent App을 종료합니다 |
| `/close` | 현재 활성 앱을 종료합니다 |
| `/app` | IDE와 Standalone Agent 간 전환 (`ANTIGRAVITY_PREFERRED_APP`) |
| `/window` | 여러 창이 열려 있을 때 특정 창을 선택합니다 |
| `/workspace` | 프로젝트 워크스페이스를 전환합니다 |
| `/restart` | 봇 프로세스를 재시작합니다 (PM2) |

### 파일 및 유틸리티

| 명령어 | 설명 |
|---|---|
| `/file` | 프로젝트 파일을 탐색하고 다운로드합니다 |
| `/artifacts` | 현재 스레드의 artifact 목록을 보고 다운로드합니다 |
| `/autoaccept` | auto-accept를 토글합니다 (on / off / status) |
| `/telegraph` | Telegraph 아티팩트 게시를 토글합니다 (on / off / 상태 및 삭제 버튼) |
| `/cleartelegraph` | 게시된 Telegraph 페이지를 삭제하고 삭제 안내문으로 대체합니다 |
| `/lang` | 표시 언어를 전환합니다 |
| `/update` | 업데이트를 확인하고, changelog를 보고, 봇을 자동 업데이트합니다 |
| `/version` | 현재 버전 정보를 표시합니다 |
| `/menu` | Telegram 명령어 메뉴를 업데이트합니다 |
| `/fix_shortcuts` | Antigravity 앱의 데스크톱 바로가기를 복구합니다 |

---

## 🚀 터보 모드 (멀티 에이전트 오케스트레이션)

터보 모드는 여러 AI 모델을 자동으로 조율하는 **Agents Council** 워크플로우를 실행합니다:

```text
┌─────────────────────────────────────────────────────────────────────┐
│                        TURBO MODE PIPELINE                         │
│                                                                     │
│  Phase 1: PLANNING        Claude Opus → Creates implementation plan │
│  Phase 2: CODING          Gemini Pro  → Writes the code             │
│  Phase 3: REVIEW          Claude Opus → Security & code review      │
│  Phase 4: FIX (if needed) Gemini Pro  → Fixes issues found          │
│  Phase 5: SUMMARY         Gemini Pro  → Executive summary for user  │
└─────────────────────────────────────────────────────────────────────┘
```

**사용 방법:**
1. 터보 모드 활성화: `/turbo` → "Enable" 선택
2. 평소처럼 요청을 일반 텍스트로 전송
3. 봇이 자동으로 모델을 전환하며 모든 단계를 수행
4. 실시간 단계 업데이트와 최종 요약을 받게 됩니다

> 💡 터보 모드를 사용하려면 Antigravity 구독에서 Claude와 Gemini 모델 모두에 접근할 수 있어야 합니다.

---

## 🎯 Goal 모드 vs 🚀 Turbo 모드

| | Goal Mode (`/goal`) | Turbo Mode (`/turbo`) |
|---|---|---|
| **동작 방식** | 하나의 세션에서 완료될 때까지 에이전트가 자율 작업 | 봇이 외부에서 멀티 모델 파이프라인을 오케스트레이션 |
| **사용 모델** | 현재 선택된 모델 | Claude(계획/리뷰) + Gemini(구현/수정) — 자동 전환 |
| **핵심 장점** | 단순하고 안정적인 IDE 기본 기능 | 멀티 모델 협업으로 서로 교차 검증 |
| **토큰 사용량** | 단일 컨텍스트 윈도우(효율적) | 여러 번 왕복 호출(토큰 더 많이 사용) |
| **진행 표시** | 🤔 리액션 → 최종 결과 | 실시간 단계 업데이트가 포함된 고정 메시지 |
| **적합한 작업** | 단일 모델로 긴 작업 수행 | 멀티 모델 리뷰가 유리한 복잡한 작업 |
| **아키텍처** | IDE 네이티브 (`/goal` 슬래시 명령) | CDP + `turbo_orchestrator.js` 기반 외부 오케스트레이션 |

**언제 무엇을 쓸까:**
- **단순하지만 긴 작업** (예: "이 모듈 리팩터링") → `/goal`
- **교차 모델 리뷰가 필요한 복잡한 작업** (예: "이 기능 만들고, 보안 리뷰하고, 이슈 수정") → `/turbo`
- **계획 수립** → `/plan` (계획만 생성한 뒤 직접 결정)
- **반복되는 전문 업무 또는 외부 오케스트레이션** (예: 댓글 분류, QA 점검, Claude Code / Cron 작업 위임) → `/wo`

---

## 🤝 Work Orders — Claude Code 및 외부 앱을 병렬 Antigravity 에이전트에 연결

별도의 SDK나 API 키 없이 **Telegram (`/wo`)**, **Claude Code**, cron 작업, CI 파이프라인 또는 모든 로컬 앱에서 제어할 수 있는 **멀티 에이전트 워커 풀(Worker Pool)**로 Antigravity를 활용하세요.

```text
┌────────────────────┐                           ┌────────────────────────────────────────┐
│  Claude Code / CLI │──┐                        │ 🪟 IDE 창 1: frontend (Gemini Pro)     │
├────────────────────┤  │  inbox/에 .md 저장     ├────────────────────────────────────────┤
│  Cron / 로컬 앱    │──┼──────────────────────► │ 🪟 IDE 창 2: qa-audit (Flash Low)      │
├────────────────────┤  │  또는 채팅에서 /wo     ├────────────────────────────────────────┤
│  Telegram (/wo)    │──┘                        │ 🪟 IDE 창 3: security (Sonnet)         │
└────────────────────┘                           └───────────────────┬────────────────────┘
                                                                     │ results/<id>.md
                                                                     ▼
                                                   📲 Telegram 알림 + 디스크 결과 파일
```

### 왜 유용한가요?

- 🧠 **Claude Code는 매니저, Antigravity는 실행 워커:** 터미널에서 Claude Code(또는 Codex / Cursor / 스크립트)를 수석 아키텍트로 유지하면서 리서치, 테스트 작성, 리팩터링, QA 업무를 Antigravity 모델 쿼터로 위임하세요. 파일을 쓸 수 있는 모든 앱이 작업을 지시할 수 있습니다.
- ⚡ **여러 에이전트를 동시에 병렬 실행 (`ide` 백엔드 — `ANTIGRAVITY_PREFERRED_APP=ide`일 때 기본값):** 각 전문 **데스크(Desk)**가 격리된 **Antigravity IDE 2.6+** 창에서 열려 여러 에이전트가 **동시에 병렬**로 작업하며, 기본 Telegram 채팅은 전혀 차단되지 않습니다. 유휴 창은 RAM 절약을 위해 **3분** 후 자동으로 닫힙니다 (`WORK_ORDERS_IDLE_CLOSE_MIN=3`).
- 🎯 **에이전트별 맞춤형 AI 모델 지정:** `/wo` → **🤖 모델**에서 데스크마다 최적의 모델을 지정하거나(빠른 분류는 *Gemini Flash*, 코딩은 *Gemini Pro / Argon*, 감사는 *Claude*) `--model`로 작업별 오버라이드가 가능합니다.
- 🗂 **영구 도메인 메모리 및 승인 게이트:** 각 데스크는 자체 폴더와 `AGENT.md`에 규칙과 학습 내용을 기억하며, 민감한 작업 전 Telegram에서 원탭 **승인 / 거절**을 요구할 수 있습니다.
- 🧩 **단일 창 Standalone 모드도 완벽 지원 (`standalone` 백엔드 — `ANTIGRAVITY_PREFERRED_APP=agent`일 때 기본값, 또는 `WORK_ORDERS_BACKEND`로 지정):** 가벼운 Standalone 모드에서는 채팅이 유휴 상태(`60초`)가 될 때까지 기다린 뒤 순차 실행하고, 완료 후 이전 대화 스레드와 AI 모델을 자동 복원합니다.

### 예시 1: Telegram에서 제어 (`/wo`)

```text
/wo                                                    # 인터랙티브 데스크 및 작업 패널 열기
/wo security-audit 인증 미들웨어 우회 취약점 점검       # 한 줄로 전문 데스크에 작업 전송
/wo qa --model "Gemini 3.8 Flash (Low)" 스모크 테스트   # 단일 작업에 대해 AI 모델 지정
/wo_stop                                               # 실행 중인 작업 지시 중지
```

### 예시 2: 10초 만에 Claude Code(또는 외부 앱) 연결하기

Claude Code(또는 스크립트)가 `~/Projects/.agts-work-orders/inbox/`에 Markdown 파일을 저장하고(임시 파일 작성 후 이름 변경) `results/<id>.md`에서 결과를 읽도록 지시하기만 하면 됩니다:

```markdown
---
desk: code-review
model: Gemini 3.8 Flash (High)
approval: auto
timeout: 20
---
/home/me/Projects/my-app 경로의 git diff를 검토하고 엣지 케이스나 회귀 가능성을 정리해줘.
```

에이전트가 작업을 마치면 AGTS가 `STATUS: done`과 전체 보고서를 `results/<id>.md`에 기록하고 **동시에** Telegram으로 알림을 보냅니다.

📖 전체 설정, `.env` 옵션 및 YAML 스키마: **[docs/WORK_ORDERS.md](docs/WORK_ORDERS.md)**

---

## 🏗️ 아키텍처

```text
antigravity-telegram-suite/
├── src/
│   ├── index.js              # 메인 봇 로직 및 Telegram 명령어 핸들러
│   ├── cdp_controller.js     # Chrome DevTools Protocol 통신
│   ├── autoaccept.js         # CDP MutationObserver 기반 자동 수락 버튼 클릭기
│   ├── turbo_orchestrator.js # 멀티 에이전트 Turbo Mode (Agents Council) 오케스트레이션
│   ├── task_watcher.js       # 능동 알림 감시기 (transcript.jsonl 모니터)
│   ├── updater.js            # 자체 업데이트 모듈 (git pull + pm2 restart)
│   ├── ui_locators.js        # IDE/Agent UI 상호작용용 DOM 요소 locator
│   ├── i18n.js               # 국제화 모듈
│   └── platform.js           # 크로스 플랫폼 OS 추상화 (실행, 종료, 경로)
├── locales/
│   ├── en.json               # 영어
│   ├── zh.json               # 중국어 (中文)
│   ├── ko.json               # 한국어 (한국어)
│   ├── tr.json               # 터키어
│   ├── de.json               # 독일어
│   ├── es.json               # 스페인어
│   └── fr.json               # 프랑스어
├── scripts/
│   ├── install.sh            # Linux/macOS 설치 스크립트
│   └── install.ps1           # Windows 설치 스크립트
├── .env.example              # 환경 변수 템플릿
├── CHANGELOG.md              # 릴리스 이력
└── package.json
```

### 동작 방식

```text
┌──────────┐     Telegram API     ┌──────────────┐     CDP (WebSocket)     ┌─────────────────┐
│ Telegram │ ◄──────────────────► │ Antigravity  │ ◄────────────────────► │ Antigravity IDE  │
│   App    │     Bot Commands     │     Bot      │    DOM Interaction     │       or         │
└──────────┘                      └──────────────┘                        │ Standalone Agent │
                                                                          └─────────────────┘
```

1. 사용자가 Telegram으로 메시지를 전송합니다
2. 봇이 CDP를 통해 해당 텍스트를 AI 에이전트의 채팅 입력창에 주입합니다
3. 봇은 에이전트의 작업 완료를 모니터링합니다 (이 동안 Telegram에는 typing indicator가 표시됨)
4. 완료되면 응답을 추출해 Telegram으로 다시 전송합니다
5. **Auto-Accept**: 활성화되어 있으면 MutationObserver가 Run, Accept, Allow, Continue 버튼을 감시하고 자동으로 클릭합니다

### 듀얼 앱 아키텍처

이 봇은 **두 개의 Antigravity 애플리케이션**이 동시에 실행되는 구성을 지원합니다:

| 앱 | 기본 포트 | 설정 키 | 설명 |
|-----|-------------|------------|-------------|
| **Standalone Agent** | `9333` | `AGENT_CDP_PORT` | 경량 채팅 중심 Antigravity 앱 |
| **Antigravity IDE** | `9334` | `IDE_CDP_PORT` | 에디터, 터미널, 확장 기능을 포함한 전체 IDE |

`/app` 명령으로 봇의 대상 앱을 전환할 수 있습니다. `.env`의 `ANTIGRAVITY_PREFERRED_APP` 설정은 기본적으로 어느 앱을 대상으로 할지 결정합니다.

---

## 🌐 언어 추가

1. `locales/en.json`을 `locales/xx.json`으로 복사
2. 모든 문자열 값을 번역
3. `.env`에서 `LANGUAGE=xx`로 설정

---

## ⚠️ 알려진 이슈

| 이슈 | 상세 |
|-------|---------|
| **Standalone 및 IDE 2.6+ 완벽 지원** | `/agents`, `/wo` 멀티 윈도우 병렬 데스크, 모델 및 추론 강도 선택, 자동 수락, 대화 추적을 포함한 모든 명령어가 Antigravity Standalone App(2.29+)과 Antigravity IDE(2.6+ / 1.107.0+) 모두에서 기본 동작합니다. |
| **IDE 2.0 자동 업데이트** | Antigravity IDE가 자동 업데이트되면, 봇도 함께 업데이트되기 전까지 DOM selector가 깨질 수 있습니다. |
| **Turbo Mode 모델 접근성** | Turbo Mode는 Claude와 Gemini 모델이 모두 사용 가능해야 합니다. 하나라도 사용할 수 없으면 파이프라인이 실패합니다. |

---

## 🤝 기여하기

1. 저장소를 포크합니다
2. 기능 브랜치를 만듭니다 (`git checkout -b feature/amazing-feature`)
3. 변경 사항을 커밋합니다 (`git commit -m 'Add amazing feature'`)
4. 브랜치에 푸시합니다 (`git push origin feature/amazing-feature`)
5. [`emreturkmencom/antigravity-telegram-suite`](https://github.com/emreturkmencom/antigravity-telegram-suite)에 Pull Request를 엽니다

---

## 🙏 감사의 말

- **[ATX-AI-Dev](https://github.com/ATX-AI-Dev)** — PR #8: Standalone App 지원, Watchdog 에이전트, 동적 모델 조회
- **[yvg](https://github.com/yvg/antigravity-telegram-suite)** — Multi-Window Support 기능
- **[achshar](https://github.com/achshar/antigravity-telegram-suite)** — 스레드 관리를 위한 Agent Manager UI locator
- **[mine260309](https://github.com/mine260309)** — 하드코딩된 메시지용 i18n 번역
- **[acmavirus/antigravity-telegram-control](https://github.com/acmavirus/antigravity-telegram-control)** — 이 프로젝트의 기반이 된 오픈소스 Telegram 연동 프로젝트
- **[yazanbaker94/AntiGravity-AutoAccept](https://github.com/yazanbaker94/AntiGravity-AutoAccept)** — Auto-Accept 모듈의 DOM observer 패턴 영감
- **[vassoz](https://github.com/vassoz)** — PR #12: CDP 연결 수정, X11 디스플레이 자동 감지, 동적 포트 바로가기
- **[wade19990814-hue](https://github.com/wade19990814-hue)** — PR #14: Chinese (中文) localization
- **[ienground](https://github.com/ienground)** — PR #17: Korean (한국어) localization
- **[mo7amed-said-223](https://github.com/mo7amed-said-223)** — Issue #29: Telegram 음성 메시지 및 오디오 전사 지원
- **[Forwead](https://github.com/Forwead)** — Issue #32: 응답 지연 시간 최적화 및 TaskWatcher 기준선 동기화
- **[Blakey](https://github.com/Blakey)** — PR #33: Telegraph 개인정보 보호 토글, 추측 불가능한 암호화 슬러그 URL, 봇 명령어 및 독립형 테스트
- **[0ALI0ZARGAR0](https://github.com/0ALI0ZARGAR0)** — PR #34: 네이티브 스킬 칩, 멀티 슬래시 명령 연결 및 스킬 메뉴 토글

## 🌟 크레딧 및 영감

멀티 에이전트 **Turbo Mode** 오케스트레이션은 Interdesigncorp Lab의 [Agents-Council](https://github.com/interdesigncorp-lab/Agents-Council) 저장소에서 영감을 받았습니다.

---

## 📄 라이선스

이 프로젝트는 MIT License로 배포됩니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참고하세요.

---

<div align="center">
소파에서 코딩하는 원격 개발자들을 위해 <a href="https://emreturkmen.com">Emre Türkmen</a>이 ❤️를 담아 만들었습니다.

**Hey Google, 저에게 일을 주고 싶다면 [hello@emreturkmen.com](mailto:hello@emreturkmen.com) 으로 연락 주세요 😂**
</div>
