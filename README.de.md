<div align="center">

# 🤖 Antigravity Telegram Suite

**Funktioniert sowohl mit der [Antigravity Standalone App](https://antigravity.google/)\* als auch mit der [Antigravity IDE](https://antigravity.google/).**

🌍 Sprachen: [English](README.md) | [Türkçe](README.tr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

Steuere deinen Antigravity-KI-Agenten aus der Ferne über Telegram.
Sende Nachrichten, wechsle KI-Modelle, verwalte Arbeitsbereiche, nimm Screenshots auf und führe Multi-Agenten-Workflows aus — alles von deinem Telefon aus.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)]()
[![Version](https://img.shields.io/badge/Version-3.1.0-orange.svg)]()

\* *Einige Funktionen können in der Standalone-App eingeschränkt sein. Siehe [Known Issues (Bekannte Probleme)](#-known-issues).*

</div>

---

## ✨ Funktionen

| Funktion | Beschreibung |
|---|---|
| 👥 **Multi-User** | Teilen Sie die Bot-Steuerung mit Ihrem Team über kommagetrennte Chat-IDs |
| 💬 **Headless Chat** | Sende Nachrichten über Telegram direkt an den KI-Agenten |
| 📎 **Datei- & Bild-Upload** | Leite Dateien/Bilder mit Bildunterschriften an den Agenten weiter |
| 📸 **IDE-Screenshots** | Erfasse und empfange Screenshots aus der Ferne |
| 🤖 **Modellwechsel** | Wechsle KI-Modelle (Gemini, Claude, GPT) über Inline-Buttons |
| 📂 **Datei-Explorer** | Durchsuche, navigiere und lade Projektdateien herunter |
| 🔄 **Arbeitsbereich-Verwaltung** | Wechsle zwischen Projekten, ohne die Tastatur zu berühren |
| 🪟 **Multi-Window-Unterstützung** | Leite Befehle an ein bestimmtes IDE-Fenster weiter, wenn mehrere geöffnet sind |
| 💬 **Thread-Verwaltung** | Liste, wechsle und verwalte Chat-Threads (Agentengespräche) |
| ⚡ **Auto-Accept** | Klicke automatisch auf Run, Accept, Allow, Continue-Buttons über einen DOM MutationObserver |
| 🚀 **Turbo Modus** | Multi-Agenten-Orchestrierung: Claude plant → Gemini programmiert → Claude überprüft → Gemini korrigiert |
| 🔄 **Auto-Update** | Suche nach Updates und aktualisiere den Bot mit einem Befehl |
| 🌐 **Mehrsprachigkeit** | 5 unterstützte Sprachen: Englisch, Türkisch, Deutsch, Spanisch, Französisch |
| ⌨️ **Tipp-Indikator** | Zeigt in Telegram "tippt..." an, während der Agent arbeitet |
| 🖥️ **Plattformübergreifend** | Funktioniert unter Linux, macOS (Intel & Apple Silicon) und Windows |
| 🔀 **Dual-App-Unterstützung** | Nahtloser Wechsel zwischen Antigravity IDE und Standalone Agent App |

---

## 🚀 Schnellstart

### Voraussetzungen

- [Node.js](https://nodejs.org/) >= 18
- [Antigravity IDE](https://antigravity.google/) und/oder [Antigravity Standalone App](https://antigravity.google/) installiert
- Ein Telegram-Bot-Token (erhältlich bei [@BotFather](https://t.me/BotFather))

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

Bearbeite die `.env`-Datei mit deinen Werten:

```env
# Telegram
BOT_TOKEN=dein_telegram_bot_token
ALLOWED_CHAT_ID=deine_chat_id

# CDP-Debugging-Ports (müssen mit --remote-debugging-port beim Start übereinstimmen)
AGENT_CDP_PORT=9333    # Port für die Standalone Antigravity App
IDE_CDP_PORT=9334      # Port für die Antigravity IDE

# Standard-KI-Modell für neue Chats
DEFAULT_MODEL=Gemini 3.1 Pro (High)

# Sprache: en | tr | de | es | fr
LANGUAGE=de

# Bevorzugtes Anwendungsziel: 'agent' (Standalone) oder 'ide' (IDE)
ANTIGRAVITY_PREFERRED_APP=ide

# Auto-Accept standardmäßig aktivieren
AUTOACCEPT_DEFAULT=true
```

> 💡 Sende `/start` an deinen Bot, um deine Chat-ID zu erhalten.

### 3. App mit CDP starten

Der Bot kommuniziert mit Antigravity über das Chrome DevTools Protocol (CDP). Du musst die App mit einem Debugging-Port starten.

**Wenn du beide Apps gleichzeitig ausführst, verwende unterschiedliche Ports:**

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

> ⚠️ Die Portnummern müssen mit `AGENT_CDP_PORT` und `IDE_CDP_PORT` in deiner `.env`-Datei übereinstimmen.

### 4. Bot starten

```bash
npm start
```

Für einen 24/7-Betrieb mit PM2:

```bash
npm install -g pm2
pm2 start src/index.js --name antigravity-bot
pm2 save
pm2 startup
```

### Automatische Einrichtung (Optional)

```bash
# Linux & macOS
bash scripts/install.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

---

## 📱 Befehle

### Hauptbefehle

| Befehl | Beschreibung |
|---|---|
| *(jeder Text)* | Direkt an den KI-Agenten senden |
| `/latest` | Die letzte Antwort des Agenten als Text abrufen |
| `/screenshot` | Screenshot des aktiven Agenten-Fensters erstellen |
| `/status` | Systemstatus anzeigen (IDE, CDP-Verbindung, Bot) |
| `/stop` | Den aktuell laufenden Agenten stoppen |
| `/new` | Eine neue Chat-Sitzung starten |

### KI-Modell & Agent

| Befehl | Beschreibung |
|---|---|
| `/model` | KI-Modell wechseln (Gemini, Claude, usw.) |
| `/turbo` | **Turbo-Modus** umschalten — Multi-Agenten-Orchestrierung (siehe unten) |
| `/agents` | Chat-Threads auflisten und wechseln |
| `/quota` | KI-Guthaben und Modell-Nutzungslimits überprüfen |

### App- & Fensterverwaltung

| Befehl | Beschreibung |
|---|---|
| `/start_ide` | Antigravity IDE remote starten |
| `/start_ag` | Standalone Antigravity Agent App starten |
| `/close_ide` | Antigravity IDE schließen |
| `/close_ag` | Standalone Agent App schließen |
| `/close` | Die aktuell aktive App schließen |
| `/app` | Zwischen IDE und Standalone Agent wechseln (`ANTIGRAVITY_PREFERRED_APP`) |
| `/window` | Bestimmtes Fenster auswählen, wenn mehrere geöffnet sind |
| `/workspace` | Projekt-Arbeitsbereich wechseln |
| `/restart` | Den Bot-Prozess neu starten (PM2) |

### Dateien & Werkzeuge

| Befehl | Beschreibung |
|---|---|
| `/file` | Projektdateien durchsuchen und herunterladen |
| `/artifacts` | Artefakte aus dem aktuellen Thread auflisten und herunterladen |
| `/autoaccept` | Auto-Accept umschalten (ein / aus / status) |
| `/lang` | Anzeigesprache wechseln |
| `/update` | Nach Updates suchen und den Bot automatisch aktualisieren |
| `/version` | Aktuelle Versionsinfo anzeigen |
| `/menu` | Telegram-Befehlsmenü aktualisieren |
| `/fix_shortcuts` | Desktop-Verknüpfungen für Antigravity-Apps reparieren |

---

## 🚀 Turbo-Modus (Multi-Agenten-Orchestrierung)

Der Turbo-Modus führt einen **Agents Council**-Workflow aus, der mehrere KI-Modelle automatisch koordiniert:

```
┌─────────────────────────────────────────────────────────────────────┐
│                        TURBO-MODUS-PIPELINE                        │
│                                                                     │
│  Phase 1: PLANUNG          Claude Opus → Erstellt einen Umsetzungsplan │
│  Phase 2: PROGRAMMIERUNG   Gemini Pro  → Schreibt den Code          │
│  Phase 3: ÜBERPRÜFUNG      Claude Opus → Sicherheits- & Code-Review │
│  Phase 4: KORREKTUR (opt.) Gemini Pro  → Behebt gefundene Probleme  │
│  Phase 5: ZUSAMMENFASSUNG  Gemini Pro  → Zusammenfassung für Nutzer │
└─────────────────────────────────────────────────────────────────────┘
```

**Verwendung:**
1. Turbo-Modus aktivieren: `/turbo` → "Aktivieren" (Enable) wählen
2. Sende deine Anfrage als normalen Text
3. Der Bot wechselt automatisch die Modelle und führt alle Phasen aus
4. Du erhältst Echtzeit-Updates zu den Phasen und eine finale Zusammenfassung

> 💡 Der Turbo-Modus erfordert Zugriff auf sowohl Claude- als auch Gemini-Modelle in deinem Antigravity-Abonnement.

---

## 🏗️ Architektur

```
antigravity-telegram-suite/
├── src/
│   ├── index.js              # Haupt-Bot-Logik & Telegram-Befehls-Handler
│   ├── cdp_controller.js     # Chrome DevTools Protocol-Kommunikation
│   ├── autoaccept.js         # Auto-Accept-Button-Klicker via CDP MutationObserver
│   ├── turbo_orchestrator.js # Multi-Agenten-Turbo-Modus-Orchestrierung
│   ├── updater.js            # Auto-Update-Modul (git pull + pm2 restart)
│   ├── ui_locators.js        # DOM-Element-Selektoren für IDE/Agent-UI-Interaktion
│   ├── i18n.js               # Lokalisierungsmodul (i18n)
│   └── platform.js           # Plattformübergreifende OS-Abstraktion (Starten, Schließen, Pfade)
├── locales/
│   ├── en.json               # Englisch
│   ├── tr.json               # Türkisch
│   ├── de.json               # Deutsch
│   ├── es.json               # Spanisch
│   └── fr.json               # Französisch
├── scripts/
│   ├── install.sh            # Installer für Linux/macOS
│   └── install.ps1           # Installer für Windows
├── .env.example              # Umgebungsvariablen-Vorlage
├── CHANGELOG.md              # Versionsverlauf
└── package.json
```

### Wie es funktioniert

```
┌──────────┐     Telegram API     ┌──────────────┐     CDP (WebSocket)     ┌─────────────────┐
│ Telegram │ ◄──────────────────► │ Antigravity  │ ◄────────────────────► │ Antigravity IDE  │
│   App    │    Bot-Befehle       │     Bot      │    DOM-Interaktion     │       oder       │
└──────────┘                      └──────────────┘                        │ Standalone Agent │
                                                                          └─────────────────┘
```

1. Du sendest eine Nachricht über Telegram
2. Der Bot injiziert deinen Text über CDP in die Chat-Eingabe des KI-Agenten
3. Der Bot überwacht den Agenten auf Abschluss (Tipp-Indikator in Telegram wird angezeigt)
4. Sobald fertig, wird die Antwort extrahiert und an Telegram zurückgesendet
5. **Auto-Accept**: Wenn aktiviert, überwacht ein MutationObserver Aktions-Buttons (Run, Accept, Allow, Continue) und klickt diese automatisch an

### Dual-App-Architektur

Der Bot unterstützt **zwei gleichzeitig laufende Antigravity-Anwendungen**:

| App | Standard-Port | Config-Schlüssel | Beschreibung |
|-----|-------------|------------|-------------|
| **Standalone Agent** | `9333` | `AGENT_CDP_PORT` | Leichtgewichtige, auf Chat fokussierte Antigravity-App |
| **Antigravity IDE** | `9334` | `IDE_CDP_PORT` | Vollständige IDE mit Editor, Terminal und Erweiterungen |

Verwende `/app`, um den Fokus des Bots zwischen den Apps zu wechseln. Die Einstellung `ANTIGRAVITY_PREFERRED_APP` in der `.env`-Datei bestimmt, welche App der Bot standardmäßig anvisiert.

---

## 🌐 Eine Sprache hinzufügen

1. Kopiere `locales/en.json` nach `locales/xx.json`
2. Übersetze alle Zeichenfolgen
3. Setze `LANGUAGE=xx` in deiner `.env`

---

## ⚠️ Bekannte Probleme (Known Issues)

| Problem | Details |
|-------|---------|
| **Standalone App-Einschränkungen** | Einige Funktionen (Arbeitsbereichswechsel, Thread-Verwaltung) funktionieren möglicherweise nicht zuverlässig mit der Standalone Antigravity App. **Antigravity IDE wird vollständig unterstützt und empfohlen.** |
| **Auto-Update in IDE 2.0** | Wenn sich die Antigravity IDE automatisch aktualisiert, können DOM-Selektoren brechen, bis der Bot ebenfalls aktualisiert wird. |
| **Turbo-Modus-Modellzugriff** | Der Turbo-Modus erfordert, dass sowohl Claude- als auch Gemini-Modelle verfügbar sind. Wenn ein Modell nicht verfügbar ist, schlägt die Pipeline fehl. |

> 💡 Als Entwickler konzentriere ich mich lieber auf die IDE-Unterstützung. Die Standalone App-Integration wird "best-effort" (nach bestem Bemühen) bereitgestellt.

---

## 🤝 Mitwirken

1. Forke das Repository
2. Erstelle deinen Feature-Branch (`git checkout -b feature/amazing-feature`)
3. Committe deine Änderungen (`git commit -m 'Add amazing feature'`)
4. Pushe auf den Branch (`git push origin feature/amazing-feature`)
5. Öffne einen Pull Request

---

## 🙏 Danksagungen

- **[yvg](https://github.com/yvg/antigravity-telegram-suite)** — Für die Multi-Window-Unterstützung
- **[achshar](https://github.com/achshar/antigravity-telegram-suite)** — Für die Agent Manager UI Locators zur Thread-Verwaltung
- **[acmavirus/antigravity-telegram-control](https://github.com/acmavirus/antigravity-telegram-control)** — Die Open-Source-Telegram-Integration, die als Basis für dieses Projekt diente
- **[yazanbaker94/AntiGravity-AutoAccept](https://github.com/yazanbaker94/AntiGravity-AutoAccept)** — Inspiration für das DOM-Observer-Muster im Auto-Accept-Modul

## 🌟 Credits & Inspirationen

Die Multi-Agenten-**Turbo Modus**-Orchestrierung wurde vom Repository [Agents-Council](https://github.com/interdesigncorp-lab/Agents-Council) des Interdesigncorp Labs inspiriert.

---

## 📄 Lizenz

Dieses Projekt ist unter der MIT-Lizenz lizenziert — siehe die Datei [LICENSE](LICENSE) für Details.

---

<div align="center">
Mit ❤️ gemacht von <a href="https://emreturkmen.com">Emre Türkmen</a> für Remote-Entwickler, die vom Sofa aus programmieren.

**Hey Google, wenn ihr mir einen Job geben wollt, könnt ihr mich unter [hello@emreturkmen.com](mailto:hello@emreturkmen.com) kontaktieren 😂**
</div>
