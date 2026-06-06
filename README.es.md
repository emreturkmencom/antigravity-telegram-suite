<div align="center">

# 🤖 Antigravity Telegram Suite

**Funciona tanto con la [Antigravity Standalone App](https://antigravity.google/)\* como con el [Antigravity IDE](https://antigravity.google/).**

🌍 Idiomas: [English](README.md) | [Türkçe](README.tr.md) | [Deutsch](README.de.md) | [Español](README.es.md) | [Français](README.fr.md)

Controla tu agente de IA Antigravity de forma remota a través de Telegram.
Envía mensajes, cambia modelos de IA, administra espacios de trabajo, toma capturas de pantalla y ejecuta flujos de trabajo de múltiples agentes, todo desde tu teléfono.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18-green.svg)](https://nodejs.org)
[![Platform](https://img.shields.io/badge/Platform-Linux%20%7C%20macOS%20%7C%20Windows-lightgrey.svg)]()
[![Version](https://img.shields.io/badge/Version-3.4.0-orange.svg)]()

\* *Algunas funciones pueden tener limitaciones en la aplicación independiente. Consulta [Known Issues (Problemas conocidos)](#-problemas-conocidos-known-issues).*

</div>

---

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
| 🌐 **Multi-Idioma** | 5 idiomas compatibles: Inglés, Turco, Alemán, Español, Francés |
| ⌨️ **Indicador de Escritura** | Muestra "escribiendo..." en Telegram mientras el agente está trabajando |
| 🖥️ **Multi-Plataforma** | Funciona en Linux, macOS (Intel y Apple Silicon) y Windows |
| 🔀 **Soporte de Aplicación Dual** | Cambia sin problemas entre Antigravity IDE y Standalone Agent App |

---

## 🚀 Inicio Rápido

### Requisitos Previos

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

# Idioma: en | tr | de | es | fr
LANGUAGE=es

# Aplicación de destino preferida: 'agent' (Standalone) o 'ide' (IDE)
ANTIGRAVITY_PREFERRED_APP=ide

# Habilitar la auto-aceptación por defecto
AUTOACCEPT_DEFAULT=true
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
| `/agents` | Listar y cambiar entre hilos de chat |
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
| **Limitaciones de Standalone App** | Algunas funciones (cambio de espacio de trabajo, gestión de hilos) pueden no funcionar de manera fiable con la Standalone Antigravity App. **Antigravity IDE es totalmente compatible y se recomienda su uso.** |
| **Auto-Actualización en IDE 2.0** | Si Antigravity IDE se auto-actualiza, los selectores del DOM pueden romperse hasta que el bot también sea actualizado. |
| **Acceso a Modelos Modo Turbo** | El Modo Turbo requiere que los modelos Claude y Gemini estén disponibles. Si un modelo no está disponible, la canalización fallará. |

> 💡 Como desarrollador, prefiero centrarme en el soporte para el IDE. La integración de la Standalone App se proporciona en base a "mejor esfuerzo" (best-effort).

---

## 🤝 Contribuir

1. Haz un fork del repositorio
2. Crea tu rama de características (`git checkout -b feature/amazing-feature`)
3. Haz commit a tus cambios (`git commit -m 'Añade una característica increíble'`)
4. Haz push a la rama (`git push origin feature/amazing-feature`)
5. Abre un Pull Request

---

## 🙏 Agradecimientos

- **[yvg](https://github.com/yvg/antigravity-telegram-suite)** — ¡Por la característica de Soporte Multi-Ventana!
- **[achshar](https://github.com/achshar/antigravity-telegram-suite)** — ¡Por los localizadores de UI del Agent Manager para la gestión de hilos!
- **[mine260309](https://github.com/mine260309)** — Traducciones i18n para mensajes hardcodeados
- **[acmavirus/antigravity-telegram-control](https://github.com/acmavirus/antigravity-telegram-control)** — Integración de Telegram de código abierto que sirvió de base para este proyecto
- **[yazanbaker94/AntiGravity-AutoAccept](https://github.com/yazanbaker94/AntiGravity-AutoAccept)** — Inspiración para el patrón de observador del DOM en el módulo de Auto-Aceptación

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
