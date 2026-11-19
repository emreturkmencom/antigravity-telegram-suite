<div align="center">

# 🤖 Antigravity Telegram Suite

**Funciona tanto con la [Antigravity Standalone App](https://antigravity.google/) como con el [Antigravity IDE](https://antigravity.google/).**

🌍 Idiomas: [English](README.md) | [中文](README.zh.md) | [한국어](README.ko.md) | [Türkçe](README.tr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

Controla tu agente de IA Antigravity de forma remota por Telegram, **conecta Claude Code u otras aplicaciones a Antigravity** y **ejecuta múltiples agentes especialistas al mismo tiempo**.
Envía mensajes, cambia modelos de IA, administra espacios de trabajo, toma capturas de pantalla y orquesta flujos de trabajo multi-agente en paralelo desde tu teléfono o terminal.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)]()
[![Version](https://img.shields.io/badge/Version-3.9.6-orange.svg)]()

</div>

---

## 📢 Comunidad
- **Canal de Noticias:** [@agts_updates](https://t.me/agts_updates)
- **Grupo de Discusión:** [@agts_community](https://t.me/agts_community)

## ✨ Características

| Característica | Descripción |
|---|---|
| 👥 **Multiusuario** | Comparte el control del bot con tu equipo mediante IDs de chat separados por comas |
| 💬 **Headless Chat** | Envía mensajes directamente al agente de IA a través de Telegram |
| 📎 **Subida de Archivos e Imágenes** | Reenvía archivos/imágenes al agente con subtítulos |
| 📸 **Capturas de pantalla del IDE** | Captura y recibe capturas de pantalla del IDE de forma remota |
| 🤖 **Cambio de Modelo** | Cambia los modelos de IA (Gemini, Claude, GPT) con botones integrados |
| 📂 **Explorador de Archivos** | Explora, navega y descarga archivos del proyecto |
| 🔄 **Gestión del Espacio de Trabajo** | Cambia entre proyectos sin tocar el teclado |
| 🪟 **Soporte Multi-Ventana** | Dirige comandos a una ventana de IDE específica cuando hay varias abiertas |
| 💬 **Gestión de Hilos (Threads)** | Lista, cambia y gestiona hilos de chat (conversaciones de agentes) |
| ⚡ **Aceptación Automática (Auto-Accept)** | Haz clic automáticamente en los botones Run, Accept, Allow, Continue mediante un MutationObserver |
| 🚀 **Modo Turbo** | Orquestación multi-agente: Claude planifica → Gemini codifica → Claude revisa → Gemini corrige |
| 🎯 **Modo Goal** | Tareas autónomas de larga duración — el agente trabaja hasta completar el objetivo |
| 📋 **Modo Plan** | Genera planes de implementación antes de codificar |
| 🔔 **Notificaciones Proactivas** | TaskWatcher detecta mensajes no solicitados del agente (timers, sub-agentes) y los reenvía a Telegram |
| 🤔 **Reacciones en Mensajes** | Muestra 🤔 durante el procesamiento, lo elimina al terminar |
| 🔄 **Actualización Automática** | Comprueba si hay actualizaciones y actualiza el bot con un solo comando |
| 🌐 **Multi-Idioma** | 7 idiomas compatibles: Inglés, Chino, Coreano, Turco, Alemán, Español, Francés |
| ⌨️ **Indicador de Escritura** | Muestra "escribiendo..." en Telegram mientras el agente está trabajando |
| 🖥️ **Multi-Plataforma** | Funciona en Linux, macOS (Intel y Apple Silicon) y Windows |
| 🔀 **Soporte de Aplicación Dual** | Cambia sin problemas entre Antigravity IDE y Standalone Agent App |
| 📡 **Publicación en Telegraph** | Las listas de tareas, planes y recorridos se pueden publicar con URLs con slug criptográfico indescifrable de 128 bits (o mantenerse privados en el chat), con control total de activación y borrado |
| 🤝 **Conecta Claude Code y Agentes en Paralelo (`/wo`)** | Conecta **Claude Code**, herramientas CLI, cron jobs o apps locales a Antigravity — ejecuta **múltiples agentes especialistas al mismo tiempo** en ventanas aisladas del IDE, asigna un modelo de IA por agente y recibe resultados en disco y Telegram |
| 📊 **Tarjetas de Tabla en Modo Oscuro** | Convierte automáticamente tablas Markdown anchas en nítidas tarjetas PNG en modo oscuro con insignias de estado y variaciones coloreadas para una lectura perfecta en el móvil |

---

## 🚀 Inicio Rápido

### Requisitos Previos

- **Soporte de Doble Motor (IDE y Standalone):** Cambia sin problemas entre el Classic Monaco IDE y el Standalone Agent mediante el comando `/app`. Las arquitecturas de controladores aisladas garantizan cero conflictos y una gestión perfecta de los procesos en segundo plano al cambiar.
- [Node.js](https://nodejs.org/) >= 18
- [Antigravity IDE](https://antigravity.google/) y/o [Antigravity Standalone App](https://antigravity.google/) instalados
- Un token de bot de Telegram (consíguelo desde [@BotFather](https://t.me/BotFather))

### 1. Clonar e Instalar

```bash
git clone https://github.com/emreturkmencom/antigravity-telegram-suite.git
cd antigravity-telegram-suite
npm install
```

### 2. Configurar

```bash
cp .env.example .env
```

Edita `.env` con tus valores:

```env
# Telegram
BOT_TOKEN=tu_token_de_bot_de_telegram
ALLOWED_CHAT_ID=tu_chat_id

# Puertos de Depuración CDP (deben coincidir con el puerto usado al iniciar la aplicación)
AGENT_CDP_PORT=9333    # Puerto para la Standalone Antigravity App
IDE_CDP_PORT=9334      # Puerto para el Antigravity IDE

# Modelo de IA predeterminado al iniciar un nuevo chat
DEFAULT_MODEL=Gemini 3.1 Pro (High)

# Idioma: en | zh | ko | tr | de | es | fr
LANGUAGE=es

# Aplicación de destino preferida: 'agent' (Standalone) o 'ide' (IDE)
ANTIGRAVITY_PREFERRED_APP=ide

# Habilitar la auto-aceptación por defecto
AUTOACCEPT_DEFAULT=true

# Habilitar publicación de artefactos en Telegraph (predeterminado: true)
ENABLE_TELEGRAPH=true
```

> 💡 Envía `/start` a tu bot para obtener tu Chat ID.

### 3. Iniciar la App con CDP

El bot se comunica con Antigravity a través de Chrome DevTools Protocol (CDP). Debes iniciar la aplicación con un puerto de depuración.

**Si ejecutas ambas aplicaciones simultáneamente, usa puertos diferentes:**

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

> ⚠️ Los números de puerto deben coincidir con `AGENT_CDP_PORT` e `IDE_CDP_PORT` en tu archivo `.env`.

### 4. Iniciar el Bot

```bash
npm start
```

Para funcionamiento 24/7 con PM2:

```bash
npm install -g pm2
pm2 start src/index.js --name antigravity-bot
pm2 save
pm2 startup
```

### Configuración Automática (Opcional)

```bash
# Linux & macOS
bash scripts/install.sh

# Windows (PowerShell)
powershell -ExecutionPolicy Bypass -File scripts\install.ps1
```

---

## 📱 Comandos

### Comandos Principales

| Comando | Descripción |
|---|---|
| *(cualquier texto)* | Enviar directamente al agente de IA |
| `/latest` | Obtener la última respuesta del agente en texto |
| `/screenshot` | Tomar una captura de pantalla de la ventana del agente activo |
| `/status` | Mostrar el estado del sistema (IDE, conexión CDP, Bot) |
| `/stop` | Detener el agente que se está ejecutando actualmente |
| `/new` | Abrir una nueva sesión de chat |

### Modelo de IA y Agente

| Comando | Descripción |
|---|---|
| `/model` | Cambiar el modelo de IA (Gemini, Claude, etc.) |
| `/turbo` | Alternar **Modo Turbo** — orquestación multi-agente (ver abajo) |
| `/goal <tarea>` | **Modo Goal** — el agente trabaja autónomamente hasta terminar |
| `/plan <tarea>` | Genera un **plan de implementación** antes de codificar |
| `/schedule_task <tarea>` | Programar una tarea recurrente o única en el IDE |
| `/agents` | Gestor de chats (Top 5 fijados, Top 5 recientes con tiempo, máx. 10 por página de proyecto) |
| `/rename [título]` | Renombrar el chat activo (o cualquier chat desde `/agents`) |
| `/pin` / `/unpin` | Fijar o desfijar el chat activo (o cualquier chat desde `/agents`) |
| `/wo [desk] [orden]` | Abrir el panel **Work Orders** o enviar un trabajo a un escritorio especialista (soporta `--model "..."`) |
| `/wo_stop` | Detener las órdenes de trabajo en ejecución |
| `/quota` | Consultar los créditos de IA y los límites de uso de modelos |

### Gestión de App y Ventanas

| Comando | Descripción |
|---|---|
| `/start_ide` | Iniciar el Antigravity IDE remotamente |
| `/start_ag` | Iniciar la Standalone Antigravity Agent App |
| `/close_ide` | Cerrar el Antigravity IDE |
| `/close_ag` | Cerrar la Standalone Agent App |
| `/close` | Cerrar la aplicación activa actualmente |
| `/app` | Cambiar entre el IDE y la Standalone App (`ANTIGRAVITY_PREFERRED_APP`) |
| `/window` | Seleccionar una ventana específica cuando hay varias abiertas |
| `/workspace` | Cambiar el espacio de trabajo del proyecto |
| `/restart` | Reiniciar el proceso del bot (PM2) |

### Archivos y Utilidades

| Comando | Descripción |
|---|---|
| `/file` | Explorar y descargar archivos del proyecto |
| `/artifacts` | Enumerar y descargar artefactos del hilo actual |
| `/autoaccept` | Alternar la aceptación automática (on / off / estado) |
| `/telegraph` | Alternar publicación en Telegraph (on / off / estado y botones de borrado) |
| `/cleartelegraph` | Borrar páginas publicadas en Telegraph y reemplazarlas con avisos de eliminación |
| `/lang` | Cambiar el idioma de visualización |
| `/update` | Buscar actualizaciones y auto-actualizar el bot |
| `/version` | Mostrar la información de la versión actual |
| `/menu` | Actualizar el menú de comandos de Telegram |
| `/fix_shortcuts` | Reparar los accesos directos de escritorio para aplicaciones Antigravity |

---

## 🚀 Modo Turbo (Orquestación Multi-Agente)

El Modo Turbo ejecuta un flujo de trabajo de **Consejo de Agentes (Agents Council)** que coordina automáticamente múltiples modelos de IA:

```
┌─────────────────────────────────────────────────────────────────────┐
│                          PIPELINE MODO TURBO                        │
│                                                                     │
│  Fase 1: PLANIFICACIÓN    Claude Opus → Crea el plan de implementación │
│  Fase 2: CODIFICACIÓN     Gemini Pro  → Escribe el código              │
│  Fase 3: REVISIÓN         Claude Opus → Revisión de código y seguridad │
│  Fase 4: CORRECCIÓN       Gemini Pro  → Corrige los problemas (si los hay) │
│  Fase 5: RESUMEN          Gemini Pro  → Resumen ejecutivo para el usuario│
└─────────────────────────────────────────────────────────────────────┘
```

**Cómo utilizar:**
1. Habilita el Modo Turbo: `/turbo` → Selecciona "Activar" (Enable)
2. Envía tu solicitud como texto normal
3. El bot cambiará automáticamente de modelo y ejecutará todas las fases
4. Recibirás actualizaciones de fase en tiempo real y un resumen final

> 💡 El Modo Turbo requiere acceso a los modelos de Claude y Gemini en tu suscripción de Antigravity.

---

## 🎯 Modo Goal vs 🚀 Modo Turbo

| | Modo Goal (`/goal`) | Modo Turbo (`/turbo`) |
|---|---|---|
| **Cómo funciona** | El agente trabaja autónomamente en una sesión hasta terminar | El bot orquesta externamente un pipeline multi-modelo |
| **Modelos usados** | El modelo actualmente seleccionado | Claude (plan/revisión) + Gemini (código/corrección) — cambio automático |
| **Ventaja principal** | Simple, fiable, integrado en el IDE | Colaboración multi-modelo: diferentes modelos se verifican entre sí |
| **Uso de tokens** | Ventana de contexto única (eficiente) | Múltiples round-trips (más tokens) |
| **Progreso** | Reacción 🤔 → resultado final | Mensaje fijado con actualizaciones en tiempo real |
| **Mejor para** | Tareas largas con un solo modelo | Tareas complejas que se benefician de revisión multi-modelo |
| **Arquitectura** | Nativo del IDE (comando `/goal`) | Orquestación externa: CDP + `turbo_orchestrator.js` |

**Cuándo usar cuál:**
- **Tarea larga simple** (ej. "refactoriza este módulo") → `/goal`
- **Tarea compleja con revisión multi-modelo** (ej. "construye esta funcionalidad, revisa seguridad, corrige errores") → `/turbo`
- **Planificación** → `/plan` (genera plan, tú decides después)
- **Tareas recurrentes o delegación externa** (ej. triaje de comentarios, auditorías QA, tareas delegadas por Claude Code / Cron) → `/wo`

---

## 🤝 Work Orders — Conecta Claude Code y Apps Externas a Agentes Antigravity en Paralelo

Convierte Antigravity en un **pool de trabajadores multi-agente** que puedes dirigir desde **Telegram (`/wo`)**, **Claude Code**, cron jobs, pipelines CI o cualquier aplicación local — sin SDKs ni claves de API.

```text
┌────────────────────┐                           ┌────────────────────────────────────────┐
│  Claude Code / CLI │──┐                        │ 🪟 Ventana IDE 1: frontend (Gemini Pro)│
├────────────────────┤  │  suelta .md en inbox/  ├────────────────────────────────────────┤
│  Cron / Apps Local │──┼──────────────────────► │ 🪟 Ventana IDE 2: qa-audit (Flash Low) │
├────────────────────┤  │  o envía /wo en chat   ├────────────────────────────────────────┤
│  Telegram (/wo)    │──┘                        │ 🪟 Ventana IDE 3: security (Sonnet)    │
└────────────────────┘                           └───────────────────┬────────────────────┘
                                                                     │ results/<id>.md
                                                                     ▼
                                                   📲 Notificación Telegram + Salida en Disco
```

### ¿Por qué usarlo?

- 🧠 **Claude Code como Director, Antigravity como Trabajadores:** Mantén Claude Code (o Codex / Cursor / scripts) como tu arquitecto principal en la terminal y delega investigación, pruebas, refactorizaciones o QA a la cuota de modelos de Antigravity. Cualquier app que pueda escribir un archivo puede enviar trabajos.
- ⚡ **Trabaja con múltiples agentes al mismo tiempo (backend `ide` — predeterminado con `ANTIGRAVITY_PREFERRED_APP=ide`):** Cada **desk** especialista se abre en su propia ventana aislada de **Antigravity IDE 2.6+** para que varios agentes trabajen **simultáneamente en paralelo**, manteniendo tu chat principal de Telegram 100 % libre. Las ventanas inactivas se cierran solas tras **3 minutos** (`WORK_ORDERS_IDLE_CLOSE_MIN=3`) para ahorrar RAM.
- 🎯 **Modelo de IA por agente:** Asigna el modelo ideal a cada desk desde `/wo` → **🤖 Modelo** (ej. *Gemini Flash* para triaje rápido, *Gemini Pro / Argon* para código, *Claude* para auditorías) o cámbialo por orden con `--model`.
- 🗂 **Memoria persistente y aprobación humana:** Cada desk guarda sus reglas y aprendizajes en su propio `AGENT.md`, con botones opcionales de **Aprobar / Rechazar** en Telegram antes de ejecutar trabajos sensibles.
- 🧩 **También funciona en modo Standalone de ventana única (backend `standalone` — predeterminado con `ANTIGRAVITY_PREFERRED_APP=agent`, o ajustable con `WORK_ORDERS_BACKEND`):** Las órdenes esperan a que tu chat lleve `60s` inactivo, se ejecutan en cola y restauran automáticamente tu hilo de conversación y modelo de IA al finalizar.

### Ejemplo 1: Control desde Telegram (`/wo`)

```text
/wo                                                    # Abrir panel interactivo de Desks y Órdenes
/wo security-audit Revisa el middleware de auth        # Enviar orden de una línea a un desk
/wo qa --model "Gemini 3.8 Flash (Low)" Smoke test     # Cambiar el modelo de IA para una orden
/wo_stop                                               # Detener órdenes en ejecución
```

### Ejemplo 2: Conecta Claude Code (o cualquier App) en 10 segundos

Indica a Claude Code (o cualquier script) que deje un archivo Markdown en `~/Projects/.agts-work-orders/inbox/` (escribiendo primero un archivo temporal y renombrándolo) y lea el resultado en `results/<id>.md`:

```markdown
---
desk: code-review
model: Gemini 3.8 Flash (High)
approval: auto
timeout: 20
---
Revisa el git diff en /home/me/Projects/my-app y enumera casos límite o regresiones.
```

Al terminar, AGTS escribe `STATUS: done` con el informe completo en `results/<id>.md` **y** envía una notificación a tu Telegram.

📖 Guía completa, opciones `.env` y esquema YAML: **[docs/WORK_ORDERS.md](docs/WORK_ORDERS.md)**

---

## 🏗️ Arquitectura

```
antigravity-telegram-suite/
├── src/
│   ├── index.js              # Lógica principal del bot y manejadores de comandos de Telegram
│   ├── cdp_controller.js     # Comunicación con Chrome DevTools Protocol
│   ├── autoaccept.js         # Clic automático mediante CDP MutationObserver
│   ├── turbo_orchestrator.js # Orquestación Modo Turbo (Consejo de Agentes) multi-agente
│   ├── task_watcher.js       # Vigilante de notificaciones proactivas (transcript.jsonl)
│   ├── updater.js            # Módulo de auto-actualización (git pull + pm2 restart)
│   ├── ui_locators.js        # Localizadores de elementos DOM para interacción de UI
│   ├── i18n.js               # Módulo de internacionalización (i18n)
│   └── platform.js           # Abstracción de sistema operativo (iniciar, cerrar, rutas)
├── locales/
│   ├── en.json               # Inglés
│   ├── zh.json               # Chino (中文)
│   ├── ko.json               # Coreano (한국어)
│   ├── tr.json               # Turco
│   ├── de.json               # Alemán
│   ├── es.json               # Español
│   └── fr.json               # Francés
├── scripts/
│   ├── install.sh            # Instalador Linux/macOS
│   └── install.ps1           # Instalador Windows
├── .env.example              # Plantilla de variables de entorno
├── CHANGELOG.md              # Historial de versiones
└── package.json
```

### Cómo Funciona

```
┌──────────┐     API de Telegram  ┌──────────────┐     CDP (WebSocket)     ┌─────────────────┐
│ Telegram │ ◄──────────────────► │ Antigravity  │ ◄────────────────────► │ Antigravity IDE  │
│   App    │  Comandos del Bot    │     Bot      │   Interacción del DOM  │       o          │
└──────────┘                      └──────────────┘                        │ Standalone Agent │
                                                                          └─────────────────┘
```

1. Envías un mensaje a través de Telegram
2. El bot inyecta el texto en la entrada del chat del agente de IA a través de CDP
3. El bot monitoriza al agente hasta su finalización (se muestra indicador "escribiendo..." en Telegram)
4. Una vez completado, la respuesta se extrae y se envía de vuelta a Telegram
5. **Auto-Accept**: Cuando está activado, un MutationObserver vigila los botones de acción (Run, Accept, Allow, Continue) y hace clic en ellos automáticamente

### Arquitectura de Doble Aplicación

El bot admite **dos aplicaciones Antigravity** que se ejecutan simultáneamente:

| Aplicación | Puerto Predeterminado | Clave Config | Descripción |
|-----|-------------|------------|-------------|
| **Standalone Agent** | `9333` | `AGENT_CDP_PORT` | Aplicación ligera de Antigravity enfocada al chat |
| **Antigravity IDE** | `9334` | `IDE_CDP_PORT` | IDE completo con editor, terminal y extensiones |

Utiliza `/app` para cambiar el enfoque del bot entre las aplicaciones. La configuración `ANTIGRAVITY_PREFERRED_APP` en `.env` determina qué aplicación apunta el bot por defecto.

---

## 🌐 Añadir un Idioma

1. Copia `locales/en.json` a `locales/xx.json`
2. Traduce todos los valores de cadena
3. Configura `LANGUAGE=xx` en tu archivo `.env`

---

## ⚠️ Problemas Conocidos (Known Issues)

| Problema | Detalles |
|-------|---------|
| **Soporte Completo Standalone e IDE 2.6+** | Todos los comandos funcionan de forma nativa tanto con Antigravity Standalone App (2.29+) como con Antigravity IDE (2.6+ / 1.107.0+), incluyendo `/agents`, escritorios paralelos multi-ventana `/wo`, selección de modelo/esfuerzo, auto-aceptación y seguimiento de hilos. |
| **Auto-Actualización en IDE 2.0** | Si Antigravity IDE se auto-actualiza, los selectores del DOM pueden romperse hasta que el bot también sea actualizado. |
| **Acceso a Modelos Modo Turbo** | El Modo Turbo requiere que los modelos Claude y Gemini estén disponibles. Si un modelo no está disponible, la canalización fallará. |

---

## 🤝 Contribuir

1. Haz un fork del repositorio
2. Crea tu rama de características (`git checkout -b feature/amazing-feature`)
3. Haz commit a tus cambios (`git commit -m 'Añade una característica increíble'`)
4. Haz push a la rama (`git push origin feature/amazing-feature`)
5. Abre un Pull Request contra [`emreturkmencom/antigravity-telegram-suite`](https://github.com/emreturkmencom/antigravity-telegram-suite)

---

## 🙏 Agradecimientos

- **[ATX-AI-Dev](https://github.com/ATX-AI-Dev)** — PR #8: Standalone App support, Watchdog agent, and dynamic model fetching
- **[yvg](https://github.com/yvg/antigravity-telegram-suite)** — ¡Por la característica de Soporte Multi-Ventana!
- **[achshar](https://github.com/achshar/antigravity-telegram-suite)** — ¡Por los localizadores de UI del Agent Manager para la gestión de hilos!
- **[mine260309](https://github.com/mine260309)** — Traducciones i18n para mensajes hardcodeados
- **[acmavirus/antigravity-telegram-control](https://github.com/acmavirus/antigravity-telegram-control)** — Integración de Telegram de código abierto que sirvió de base para este proyecto
- **[yazanbaker94/AntiGravity-AutoAccept](https://github.com/yazanbaker94/AntiGravity-AutoAccept)** — Inspiración para el patrón de observador del DOM en el módulo de Auto-Aceptación
- **[vassoz](https://github.com/vassoz)** — PR #12: Correcciones de conexión CDP, detección automática de pantalla X11 y accesos directos de puertos dinámicos
- **[wade19990814-hue](https://github.com/wade19990814-hue)** — PR #14: Chinese (中文) localization
- **[ienground](https://github.com/ienground)** — PR #17: Korean (한국어) localization
- **[mo7amed-said-223](https://github.com/mo7amed-said-223)** — Issue #29: Compatibilidad con mensajes de voz de Telegram y transcripción de audio
- **[Forwead](https://github.com/Forwead)** — Issue #32: Optimización de latencia de respuesta y sincronización de línea base de TaskWatcher
- **[Blakey](https://github.com/Blakey)** — PR #33: Alternancia de privacidad de Telegraph, URLs con slug criptográfico indescifrable, comandos de bot y pruebas independientes
- **[0ALI0ZARGAR0](https://github.com/0ALI0ZARGAR0)** — PR #34: Chips de skills nativos, encadenamiento de comandos multi-slash y alternancia de menú de skills
- **[muhsinzyne](https://github.com/muhsinzyne)** — PR #45: Visor interactivo `/live` y `/latest` con actualización en línea y control de detención

## 🌟 Créditos e Inspiraciones

La orquestación multi-agente del **Modo Turbo** se inspiró en el repositorio [Agents-Council](https://github.com/interdesigncorp-lab/Agents-Council) desarrollado por Interdesigncorp Lab.

---

## 📄 Licencia

Este proyecto está bajo la Licencia MIT — consulta el archivo [LICENSE](LICENSE) para más detalles.

---

<div align="center">
Hecho con ❤️ por <a href="https://emreturkmen.com">Emre Türkmen</a> para desarrolladores remotos que programan desde su sofá.

**Oye Google, si queréis darme un trabajo podéis contactarme en [hello@emreturkmen.com](mailto:hello@emreturkmen.com) 😂**
</div>
