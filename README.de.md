<div align="center">

# 🤖 Antigravity Telegram Suite

🌍 Sprachen: [English](README.md) | [Türkçe](README.tr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

**Steuern Sie Ihre [Antigravity IDE](https://antigravity.google/) fern über Telegram.**

Nachrichten senden, KI-Modelle wechseln, Workspaces verwalten, Screenshots machen — alles von Ihrem Handy aus.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)]()

</div>

---

## ✨ Funktionen

| Funktion | Beschreibung |
|---|---|
| 💬 **Headless Chat** | Nachrichten direkt über Telegram an den KI-Agenten senden |
| 📎 **Datei- & Bild-Upload** | Dateien/Bilder mit Beschreibungen an den Agenten weiterleiten |
| 📸 **IDE Screenshots** | IDE-Screenshots aus der Ferne aufnehmen und empfangen |
| 🤖 **Modellwechsel** | KI-Modelle (Gemini, Claude) über Inline-Buttons wechseln |
| 📂 **Datei-Explorer** | Projektdateien durchsuchen, navigieren und herunterladen |
| 🔄 **Workspace-Verwaltung** | Zwischen Projekten wechseln, ohne die Tastatur zu berühren |
| 💬 **Multi-Agent-Fokus** | Spezifischen Agenten direkt aus Telegram antworten oder den Fokus auf ein Projektfenster legen |
| ⚡ **Auto-Accept** | Automatisches Klicken von Run-, Accept-, Allow- und Continue-Buttons |
| 🔄 **Auto-Update** | Nach Updates suchen und diese mit einem Befehl selbst durchführen |
| 🌐 **Mehrsprachigkeit** | Benutzeroberfläche auf Englisch und Türkisch (erweiterbar) |
| ⌨️ **Tipp-Indikator** | Zeigt "schreibt..." an, anstatt Fortschrittsnachrichten zu spammen |
| 🖥️ **Plattformübergreifend** | Funktioniert unter Linux, macOS (Intel) und Windows |

## 🚀 Schnellstart

### Voraussetzungen

- [Node.js](https://nodejs.org/) >= 18
- [Antigravity IDE](https://antigravity.google/) installiert
- Ein Telegram Bot Token (erhältlich bei [@BotFather](https://t.me/BotFather))

### 1. Klonen & Installieren

```bash
git clone https://github.com/emreturkmencom/antigravity-telegram-suite.git
cd antigravity-telegram-suite
npm install
```

### 2. Konfigurieren

```bash
cp .env.example .env
```

Bearbeiten Sie die `.env` Datei mit Ihren Werten:

```env
BOT_TOKEN=ihr_telegram_bot_token
ALLOWED_CHAT_ID=ihre_chat_id
DEBUGGING_PORT=9333
LANGUAGE=de
```

> 💡 Senden Sie `/start` an Ihren Bot, um Ihre Chat-ID zu erhalten.

### 3. IDE mit CDP starten

Der Bot kommuniziert mit der IDE über das Chrome DevTools Protocol. Starten Sie Antigravity mit:

```bash
# Linux
antigravity --remote-debugging-port=9333

# macOS
open -a Antigravity --args --remote-debugging-port=9333

# Windows
Antigravity.exe --remote-debugging-port=9333
```

### 4. Den Bot starten

```bash
npm start
```

Für den 24/7-Betrieb mit PM2:

```bash
npm install -g pm2
pm2 start src/index.js --name antigravity-bot
pm2 save
pm2 startup
```

### Automatisches Setup (Optional)

```bash
# Linux & macOS
bash scripts/install.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

## 📱 Befehle

| Befehl | Beschreibung |
|---|---|
| *(beliebiger Text)* | Direkt an den KI-Agenten senden |
| `/latest` | Die letzte Antwort des Agenten abrufen |
| `/screenshot` | Einen IDE-Screenshot aufnehmen |
| `/status` | Systemstatus (IDE, CDP, Bot) |
| `/start_ide` | Die IDE aus der Ferne starten |
| `/close` | Die IDE vollständig schließen |
| `/new` | Eine neue Chat-Sitzung öffnen |
| `/model` | KI-Modell wechseln |
| `/workspace` | Projekt-Arbeitsbereich wechseln |
| `/window` | Bestimmtes IDE-Fenster auswählen (Multi-Fenster-Support) |
| `/file` | Projektdateien durchsuchen & herunterladen |
| `/quota` | KI-Credits und Modellnutzungs-Limits überprüfen |
| `/autoaccept` | Auto-Accept ein-/ausschalten |
| `/lang` | Sprache wechseln |
| `/stop` | Laufenden Agenten stoppen |
| `/agents` | Chat-Threads auflisten und wechseln |
| `/artifacts` | Artefakte des aktuellen Threads auflisten |
| `/update` | Nach Updates suchen |
| `/version` | Aktuelle Version anzeigen |
| `/menu` | Telegram-Befehlsmenü aktualisieren |

## 🏗️ Architektur

```
antigravity-telegram-suite/
├── src/
│   ├── index.js           # Hauptlogik des Bots & Telegram-Handler
│   ├── cdp_controller.js   # Kommunikation über Chrome DevTools Protocol
│   ├── autoaccept.js       # Auto-Accept-Button-Klicker via CDP
│   ├── updater.js          # Modul für das automatische Update
│   ├── ui_locators.js      # DOM-Element-Selektoren für IDE-Interaktion
│   ├── i18n.js             # Internationalisierungs-Modul
│   └── platform.js         # Betriebssystem-Abstraktion
├── locales/
│   ├── en.json             # Englische Strings
│   └── de.json             # Deutsche Strings
├── scripts/
│   ├── install.sh          # Installer für Linux/macOS
│   └── install.ps1         # Installer für Windows
├── .env.example            # Umgebungsvariablen-Template
└── package.json
```

### Wie es funktioniert

```
┌──────────┐     Telegram API     ┌──────────────┐     CDP (WebSocket)     ┌─────────────┐
│ Telegram │ ◄──────────────────► │ Antigravity  │ ◄────────────────────► │ Antigravity  │
│   App    │     Bot Befehle      │     Bot      │    DOM Interaktion     │     IDE      │
└──────────┘                      └──────────────┘                        └─────────────┘
```

1. Sie senden eine Nachricht über Telegram
2. Der Bot fügt den Text per CDP in das Chat-Eingabefeld der IDE ein
3. Der Bot überwacht die IDE auf Abschluss des Agenten ("schreibt..." wird angezeigt)
4. Nach Abschluss wird die Antwort extrahiert und an Telegram zurückgesendet
5. **Auto-Accept**: Wenn aktiviert, beobachtet ein MutationObserver Aktions-Buttons (Run, Accept, Allow, Continue) und klickt diese automatisch an — kein manueller Eingriff erforderlich

## 🌐 Eine Sprache hinzufügen

1. Kopieren Sie `locales/en.json` nach `locales/xx.json`
2. Übersetzen Sie alle String-Werte
3. Setzen Sie `LANGUAGE=xx` in Ihrer `.env`

## 🤝 Beitragen

1. Forken Sie das Repository
2. Erstellen Sie Ihren Feature-Branch (`git checkout -b feature/tolles-feature`)
3. Committen Sie Ihre Änderungen (`git commit -m 'Tolles Feature hinzugefügt'`)
4. Pushen Sie den Branch (`git push origin feature/tolles-feature`)
5. Öffnen Sie einen Pull Request

## 🙏 Danksagungen

- **[yvg](https://github.com/yvg/antigravity-telegram-suite)** — Für die großartige Multi-Fenster-Support-Funktion!
- **[achshar](https://github.com/achshar/antigravity-telegram-suite)** — Für die Agent Manager UI-Locator PR.
- **[acmavirus/antigravity-telegram-control](https://github.com/acmavirus/antigravity-telegram-control)** — Eine saubere Open-Source Telegram-Integration als Basis.
- **[yazanbaker94/AntiGravity-AutoAccept](https://github.com/yazanbaker94/AntiGravity-AutoAccept)** — Inspiration für das Auto-Accept-Modul.

## 📄 Lizenz

Dieses Projekt ist unter der MIT-Lizenz lizenziert — siehe [LICENSE](LICENSE) für Details.

---

<div align="center">
Mit ❤️ erstellt von [Emre Türkmen](https://emreturkmen.com) für Entwickler, die von der Couch aus programmieren.
</div>
